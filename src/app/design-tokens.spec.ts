import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DN_TOKENS } from './design-tokens';

// The TS mirror must stay in sync with the --dn-* custom properties in
// src/styles.scss (DESIGN.md "Token sources"). This spec reads the
// stylesheet from disk (vitest's cwd is the project root) and asserts
// each mirrored value matches.
const STYLES = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf-8');

function cssVar(name: string): string {
  const match = STYLES.match(new RegExp(`--${name}:\\s*([^;]+);`));
  expect(match, `--${name} is not defined in src/styles.scss`).toBeTruthy();
  return match![1].trim();
}

describe('design tokens stay in sync with styles.scss', () => {
  const cases: [token: keyof typeof DN_TOKENS, cssName: string][] = [
    ['canvas', 'dn-canvas'],
    ['paper', 'dn-paper'],
    ['ink', 'dn-ink'],
    ['accent', 'dn-accent'],
    ['accentInk', 'dn-accent-ink'],
    ['danger', 'dn-danger'],
    ['highlight', 'dn-highlight'],
    ['chip', 'dn-chip'],
    ['chipInk', 'dn-chip-ink'],
    ['groupEdge', 'dn-group-edge'],
  ];

  it.each(cases)('DN_TOKENS.%s === --%s', (token, cssName) => {
    expect(DN_TOKENS[token]).toBe(cssVar(cssName));
  });

  it('keeps the chrome --primary unified with the canvas accent', () => {
    // DESIGN.md: one purple everywhere. The dark-theme chrome primary is a
    // literal copy of --dn-accent, not a drifted near-match.
    const darkBlock = STYLES.slice(STYLES.indexOf(':root.dark'));
    expect(darkBlock).toContain(`--primary: ${DN_TOKENS.accent};`);
  });
});
