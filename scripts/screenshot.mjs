// Regenerates the README screenshots. Requires the dev server on :4200:
//
//   npm start        (in dropnode/)
//   node scripts/screenshot.mjs
//
// Uses the system Chrome via Playwright's channel option — no browser download needed.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'readme');
const base = 'http://localhost:4200';

const dataUrl = (file) => {
  const graph = readFileSync(join(__dirname, file), 'utf8');
  return `${base}/?data=${encodeURIComponent(graph)}`;
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

// --- Hero: the full editor with a styled, grouped graph ---------------------
await page.goto(dataUrl('sample-graph.json'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500); // app boot + Zoom to fit
await page.screenshot({ path: join(outDir, 'dropnode-editor.png') });

// --- Command Palette: Ctrl+K, then a fuzzy query ----------------------------
await page.keyboard.press('Control+k');
await page.waitForTimeout(600);
await page.keyboard.type('tidy');
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, 'command-palette.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// --- Present Mode: frames the first Group -----------------------------------
await page.getByRole('button', { name: 'Present' }).click();
await page.waitForTimeout(900); // 500ms entrance animation
await page.screenshot({ path: join(outDir, 'present-mode.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// --- Tidy up: before / after ------------------------------------------------
await page.goto(dataUrl('messy-graph.json'), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(outDir, 'tidy-up-before.png') });
await page.getByRole('button', { name: 'Tidy up' }).click();
await page.waitForTimeout(1200); // layout + Zoom to fit
await page.screenshot({ path: join(outDir, 'tidy-up-after.png') });

await browser.close();
console.log('Screenshots written to', outDir);
