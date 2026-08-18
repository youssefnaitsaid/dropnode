import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:4200';
const ASSETS = resolve(import.meta.dirname, '..', 'assets', 'readme');

async function capture() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // 1. Load sample graph via URL (without reroute points)
  const sampleGraph = JSON.parse(
    readFileSync(resolve(import.meta.dirname, 'sample-graph.json'), 'utf-8')
  );
  // Remove reroute points from connections as requested
  for (const conn of sampleGraph.connections) {
    delete conn.reroutePoints;
  }
  const encoded = encodeURIComponent(JSON.stringify(sampleGraph));
  await page.goto(`${BASE}/?data=${encoded}`);
  await page.waitForTimeout(2000); // let render settle

  // Take the main editor screenshot
  await page.screenshot({
    path: resolve(ASSETS, 'dropnode-editor.png'),
    fullPage: false,
  });
  console.log('✓ dropnode-editor.png');

  // 2. Tidy-up: before (messy graph)
  // Create a messy graph by loading a custom payload
  const messyNodes = [];
  const messyConns = [];
  // Scatter nodes around
  const labels = ['Trigger', 'Parse', 'Validate', 'Process', 'Review', 'Deploy', 'Notify', 'Log'];
  const colors = ['#FF746C', '#B3EBF2', '#EDE8D0', '#50C878', '#D3D3FF', '#D3D3D3', '#F2A3E8', '#FFDBBB'];
  const shapes = ['pill', 'rectangle', 'rectangle', 'rectangle', 'diamond', 'pill', 'rectangle', 'rectangle'];
  const positions = [
    [100, 80], [500, 400], [200, 500], [700, 100],
    [400, 300], [800, 500], [150, 200], [600, 350]
  ];
  
  for (let i = 0; i < labels.length; i++) {
    messyNodes.push({
      id: `mn${i + 1}`,
      text: [{ kind: 'paragraph', runs: [{ text: labels[i] }] }],
      shape: shapes[i],
      color: colors[i],
      x: positions[i][0],
      y: positions[i][1],
      width: 160,
      height: 48,
    });
  }
  // Messy connections (non-sequential)
  messyConns.push(
    { id: 'mc1', sourceNodeId: 'mn1', sourceHandle: 'right', targetNodeId: 'mn3', targetHandle: 'left' },
    { id: 'mc2', sourceNodeId: 'mn2', sourceHandle: 'bottom', targetNodeId: 'mn5', targetHandle: 'top', color: '#86dced', strokePattern: 'dashed' },
    { id: 'mc3', sourceNodeId: 'mn3', sourceHandle: 'right', targetNodeId: 'mn4', targetHandle: 'left', color: '#ffe08a' },
    { id: 'mc4', sourceNodeId: 'mn5', sourceHandle: 'right', targetNodeId: 'mn6', targetHandle: 'left', color: '#9fb4ff' },
    { id: 'mc5', sourceNodeId: 'mn6', sourceHandle: 'bottom', targetNodeId: 'mn7', targetHandle: 'top' },
    { id: 'mc6', sourceNodeId: 'mn4', sourceHandle: 'bottom', targetNodeId: 'mn8', targetHandle: 'left', color: '#c8b6ff', strokePattern: 'dotted' },
    { id: 'mc7', sourceNodeId: 'mn8', sourceHandle: 'right', targetNodeId: 'mn7', targetHandle: 'right', color: '#9fe0a3' },
  );

  const messyGraph = { nodes: messyNodes, connections: messyConns };
  const messyEncoded = encodeURIComponent(JSON.stringify(messyGraph));
  await page.goto(`${BASE}/?data=${messyEncoded}`);
  await page.waitForTimeout(2000);
  
  await page.screenshot({
    path: resolve(ASSETS, 'tidy-up-before.png'),
    fullPage: false,
  });
  console.log('✓ tidy-up-before.png');

  // 3. Tidy-up: after (click tidy up button)
  // Find and click the tidy up button in the toolbar
  const tidyButton = page.locator('button[aria-label*="Tidy"], button:has-text("Tidy")').first();
  if (await tidyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tidyButton.click();
    await page.waitForTimeout(1500);
  } else {
    // Try via command palette
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    await page.keyboard.type('Tidy up');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }
  
  await page.screenshot({
    path: resolve(ASSETS, 'tidy-up-after.png'),
    fullPage: false,
  });
  console.log('✓ tidy-up-after.png');

  // 4. Command palette - open it and search "tidy"
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  await page.keyboard.type('tidy');
  await page.waitForTimeout(800);
  
  await page.screenshot({
    path: resolve(ASSETS, 'command-palette.png'),
    fullPage: false,
  });
  console.log('✓ command-palette.png');
  
  // Close command palette
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 5. Present mode
  // Reload the sample graph (has groups)
  const presentGraph = JSON.parse(
    readFileSync(resolve(import.meta.dirname, 'sample-graph.json'), 'utf-8')
  );
  for (const conn of presentGraph.connections) {
    delete conn.reroutePoints;
  }
  const presentEncoded = encodeURIComponent(JSON.stringify(presentGraph));
  await page.goto(`${BASE}/?data=${presentEncoded}`);
  await page.waitForTimeout(2500);

  // Try the Present button first, fall back to command palette
  const presentButton = page.locator('button[aria-label="Present"]').first();
  const isDisabled = await presentButton.getAttribute('disabled').catch(() => null);
  const isDataDisabled = await presentButton.getAttribute('data-disabled').catch(() => null);
  
  if (!isDisabled && !isDataDisabled) {
    await presentButton.click();
    await page.waitForTimeout(1500);
  } else {
    // Use command palette to enter Present mode
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(600);
    await page.keyboard.type('Present');
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  await page.screenshot({
    path: resolve(ASSETS, 'present-mode.png'),
    fullPage: false,
  });
  console.log('✓ present-mode.png');

  await browser.close();
  console.log('\nAll screenshots captured!');
}

capture().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
