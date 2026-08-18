/**
 * Playwright script to capture README screenshots of the dropnode editor.
 * Usage: node scripts/take-screenshots.mjs
 * Requires the dev server running on http://localhost:4200.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'readme');
const SAMPLE_GRAPH = join(__dirname, 'sample-graph.json');
const BASE_URL = 'http://localhost:4200';
const WIDTH = 1440;
const HEIGHT = 900;

/** gzip + base64url-encode (matches the app's share-link format). */
function compressGraph(json) {
  const gz = gzipSync(Buffer.from(json, 'utf-8'));
  return 'gz:' + gz.toString('base64url');
}

async function waitForNodes(page, timeout = 30000) {
  await page.waitForFunction(() => {
    return document.querySelectorAll('app-node').length > 0;
  }, { timeout });
  await page.waitForTimeout(1500);
}

async function importViaClipboard(page, graphJson) {
  // Use import dialog: click Import, paste JSON, confirm
  const importBtn = page.locator('button[aria-label="Import"]');
  await importBtn.click();
  await page.waitForTimeout(800);

  // Switch to Paste JSON tab
  const pasteTab = page.locator('button:has-text("Paste JSON")');
  await pasteTab.click();
  await page.waitForTimeout(300);

  // Fill textarea
  const textarea = page.locator('textarea');
  await textarea.fill(graphJson);
  await page.waitForTimeout(300);

  // Check if Import button is enabled
  const importConfirmBtn = page.locator('[role="dialog"] button:has-text("Import")');
  const isDisabled = await importConfirmBtn.getAttribute('disabled');
  console.log('  Import confirm disabled:', isDisabled);

  // Click Import
  await importConfirmBtn.click();
  await page.waitForTimeout(2000);

  // Check for error message
  const errorEl = page.locator('[role="alert"]');
  if (await errorEl.isVisible({ timeout: 500 }).catch(() => false)) {
    const errorText = await errorEl.textContent();
    console.log('  Import error:', errorText);
  }

  // Check if dialog closed
  const dialogStillOpen = await page.locator('[aria-label="Import Graph"]').isVisible({ timeout: 500 }).catch(() => false);
  console.log('  Dialog still open:', dialogStillOpen);
}

async function main() {
  const graphJson = readFileSync(SAMPLE_GRAPH, 'utf-8');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [browser]', msg.text());
  });

  // ── Strategy: use URL data param with proper wait ────────────────
  const dataParam = compressGraph(graphJson);
  const url = `${BASE_URL}/?data=${encodeURIComponent(dataParam)}`;

  console.log('Navigating to editor with sample graph via URL...');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);  // Give Angular extra time to bootstrap and load

  // Check page state
  const nodeCount = await page.evaluate(() => document.querySelectorAll('app-node').length);
  const hasToolbar = await page.evaluate(() => !!document.querySelector('app-toolbar'));
  const hasSidebar = await page.evaluate(() => !!document.querySelector('app-sidebar'));
  console.log('After 5s wait - nodes:', nodeCount, 'toolbar:', hasToolbar, 'sidebar:', hasSidebar);

  if (nodeCount === 0) {
    console.log('Nodes not loaded from URL, trying import dialog...');
    // Navigate to clean page first
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await importViaClipboard(page, graphJson);

    const nodeCount2 = await page.evaluate(() => document.querySelectorAll('app-node').length);
    console.log('After import dialog - nodes:', nodeCount2);
  }

  // Wait for nodes
  try {
    await waitForNodes(page, 15000);
  } catch {
    console.log('ERROR: Could not find any app-node elements. Taking screenshot of current state for debug.');
    await page.screenshot({ path: join(ASSETS_DIR, 'debug-page.png') });
    await browser.close();
    process.exit(1);
  }

  // ── 1. Main editor screenshot ────────────────────────────────────
  console.log('Capturing dropnode-editor.png ...');
  await page.screenshot({
    path: join(ASSETS_DIR, 'dropnode-editor.png'),
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  // ── 2. Tidy-up BEFORE (messy graph) ──────────────────────────────
  console.log('Creating messy graph for tidy-up-before...');
  const messyGraphObj = JSON.parse(graphJson);
  const messyNodes = messyGraphObj.nodes.map((node) => {
    if (node.kind === 'group') {
      return { ...node, x: 50 + Math.floor(Math.random() * 800), y: 50 + Math.floor(Math.random() * 500) };
    }
    return {
      ...node,
      x: 80 + Math.floor(Math.random() * 1000),
      y: 60 + Math.floor(Math.random() * 650),
    };
  });
  const messyJson = JSON.stringify({ ...messyGraphObj, nodes: messyNodes });
  const messyDataParam = compressGraph(messyJson);
  await page.goto(`${BASE_URL}/?data=${encodeURIComponent(messyDataParam)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await waitForNodes(page, 15000);

  console.log('Capturing tidy-up-before.png ...');
  await page.screenshot({
    path: join(ASSETS_DIR, 'tidy-up-before.png'),
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  // ── 3. Tidy-up AFTER ─────────────────────────────────────────────
  console.log('Running Tidy up...');
  const tidyBtn = page.locator('button[aria-label="Tidy up"]');
  await tidyBtn.click();
  await page.waitForTimeout(1500);

  console.log('Capturing tidy-up-after.png ...');
  await page.screenshot({
    path: join(ASSETS_DIR, 'tidy-up-after.png'),
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  // ── 4. Command Palette ───────────────────────────────────────────
  console.log('Loading clean graph for command palette...');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await waitForNodes(page, 15000);

  console.log('Opening command palette...');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  await page.keyboard.type('tidy');
  await page.waitForTimeout(600);

  console.log('Capturing command-palette.png ...');
  await page.screenshot({
    path: join(ASSETS_DIR, 'command-palette.png'),
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ── 5. Present Mode ──────────────────────────────────────────────
  console.log('Entering Present Mode...');
  await page.waitForTimeout(1000);
  const presentBtn = page.locator('button[aria-label="Present"]');
  await presentBtn.click({ force: true, timeout: 5000 });
  await page.waitForTimeout(3000);

  console.log('Capturing present-mode.png ...');
  await page.screenshot({
    path: join(ASSETS_DIR, 'present-mode.png'),
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
