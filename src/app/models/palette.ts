export type PaletteCategory =
  | 'History'
  | 'Selection'
  | 'Nodes & Groups'
  | 'Connections'
  | 'Viewport'
  | 'Project'
  | 'Application';

export const PALETTE_CATEGORY_ORDER: readonly PaletteCategory[] = [
  'History',
  'Selection',
  'Nodes & Groups',
  'Connections',
  'Viewport',
  'Project',
  'Application',
];

/** A user-facing intent exposed by the Command Palette. */
export interface PaletteEntry {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly category: PaletteCategory;
  readonly shortcut?: string;
  readonly swatch?: string;
  /** Lucide icon name for the leading glyph when no swatch or preview applies. */
  readonly icon?: string;
  /** Line-style preview (stroke patterns and weights) drawn instead of an icon. */
  readonly linePreview?: { readonly dash?: string; readonly width?: number };
  /** Emoji glyph drawn as the leading visual for per-value Emoji entries. */
  readonly emoji?: string;
  /** Optional ordering group within a category; equal groups use the label. */
  readonly sortOrder?: number;
  readonly available: boolean;
  readonly disabledReason?: string;
  readonly execute: () => void;
}

interface RankedEntry {
  readonly entry: PaletteEntry;
  readonly score: number;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function subsequenceScore(candidate: string, query: string): number | null {
  const compactCandidate = candidate.replace(/\s/g, '');
  const compactQuery = query.replace(/\s/g, '');
  let queryIndex = 0;
  let gapCount = 0;
  let lastMatch = -1;

  for (let index = 0; index < compactCandidate.length && queryIndex < compactQuery.length; index++) {
    if (compactCandidate[index] === compactQuery[queryIndex]) {
      if (lastMatch >= 0) gapCount += index - lastMatch - 1;
      lastMatch = index;
      queryIndex++;
    }
  }

  if (queryIndex !== compactQuery.length) return null;
  return 60 + gapCount + compactCandidate.length / 100;
}

function candidateScore(candidate: string, query: string): number | null {
  const normalizedCandidate = normalize(candidate);
  if (!normalizedCandidate) return null;
  if (normalizedCandidate === query) return 0;
  if (normalizedCandidate.startsWith(query)) return 10 + normalizedCandidate.length / 100;

  const wordStarts = normalizedCandidate.split(/\s+/).some(word => word.startsWith(query));
  if (wordStarts) return 20 + normalizedCandidate.length / 100;

  if (normalizedCandidate.includes(query)) return 30 + normalizedCandidate.length / 100;
  return subsequenceScore(normalizedCandidate, query);
}

function bestScore(entry: PaletteEntry, query: string): number | null {
  const labelScore = candidateScore(entry.label, query);
  const aliasScores = entry.aliases
    .map(alias => candidateScore(alias, query))
    .filter((score): score is number => score !== null);
  const categoryScore = candidateScore(entry.category, query);
  const scores = [labelScore, ...aliasScores, categoryScore]
    .filter((score): score is number => score !== null);
  return scores.length > 0 ? Math.min(...scores) : null;
}

function categoryIndex(category: PaletteCategory): number {
  return PALETTE_CATEGORY_ORDER.indexOf(category);
}

function sortOrderDifference(a: PaletteEntry, b: PaletteEntry): number {
  if (a.sortOrder === undefined || b.sortOrder === undefined) return 0;
  return a.sortOrder - b.sortOrder;
}

function compareEntries(a: RankedEntry, b: RankedEntry): number {
  if (a.score !== b.score) return a.score - b.score;
  const categoryDifference = categoryIndex(a.entry.category) - categoryIndex(b.entry.category);
  if (categoryDifference !== 0) return categoryDifference;
  if (a.entry.available !== b.entry.available) return a.entry.available ? -1 : 1;
  const sortOrderDifferenceValue = sortOrderDifference(a.entry, b.entry);
  if (sortOrderDifferenceValue !== 0) return sortOrderDifferenceValue;
  const labelDifference = a.entry.label.localeCompare(b.entry.label);
  return labelDifference !== 0 ? labelDifference : a.entry.id.localeCompare(b.entry.id);
}

/**
 * Search and order Palette Entries without knowing anything about Angular or
 * the editor. Sections always follow PALETTE_CATEGORY_ORDER — History first —
 * and unavailable entries stay discoverable, following the available entries
 * within their section at the same ranking level.
 */
export function searchPaletteEntries(
  entries: readonly PaletteEntry[],
  rawQuery: string,
): PaletteEntry[] {
  const query = normalize(rawQuery);
  if (!query) {
    return [...entries].sort((a, b) => {
      const categoryDifference = categoryIndex(a.category) - categoryIndex(b.category);
      if (categoryDifference !== 0) return categoryDifference;
      if (a.available !== b.available) return a.available ? -1 : 1;
      const sortOrderDifferenceValue = sortOrderDifference(a, b);
      if (sortOrderDifferenceValue !== 0) return sortOrderDifferenceValue;
      const labelDifference = a.label.localeCompare(b.label);
      return labelDifference !== 0 ? labelDifference : a.id.localeCompare(b.id);
    });
  }

  return entries
    .map(entry => ({ entry, score: bestScore(entry, query) }))
    .filter((match): match is RankedEntry => match.score !== null)
    .sort(compareEntries)
    .map(match => match.entry);
}
