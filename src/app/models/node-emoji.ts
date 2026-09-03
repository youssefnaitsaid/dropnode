/**
 * The curated Node Emoji set (ADR-0030, CONTEXT.md: Emoji).
 *
 * Every regular Node may carry one optional Emoji — a pictograph from this
 * fixed set of 48, each with a stable human-readable name. The names carry
 * the intended semantics ("New" for the sparkles, "Quick" for the bolt)
 * where Unicode glyph names mislead, so tooltips, aria-labels, and Command
 * Palette entry labels all use them verbatim.
 *
 * Stored strings carry their variation selectors exactly as written;
 * validation is exact string membership, so no Unicode grapheme parsing
 * enters the codebase. Entries built from code points (rather than pasted
 * literals) pin the selector-sensitive glyphs deterministically.
 *
 * Frozen compatibility commitment: removing a glyph would strand saved
 * payloads the way dropping a palette color would. Do not reorder, rename,
 * or grow this table without a migration plan.
 */

export interface NodeEmojiEntry {
  readonly emoji: string;
  readonly name: string;
}

const cp = (...points: number[]): string => String.fromCodePoint(...points);

export const NODE_EMOJIS: readonly NodeEmojiEntry[] = [
  // Status & priority
  { emoji: '✅', name: 'Done' },
  { emoji: '🚧', name: 'In progress' },
  { emoji: cp(0x26d4, 0xfe0f), name: 'Blocked' },
  { emoji: '⏳', name: 'Waiting' },
  { emoji: '💤', name: 'Backlog' },
  { emoji: '🔥', name: 'Urgent' },
  { emoji: cp(0x26a1), name: 'Quick' },
  { emoji: '⭐', name: 'Important' },
  { emoji: '🎯', name: 'Goal' },
  { emoji: '🚩', name: 'Milestone' },
  // Flowchart kit
  { emoji: cp(0x25b6, 0xfe0f), name: 'Start' },
  { emoji: '🏁', name: 'Finish' },
  { emoji: '🔀', name: 'Decision' },
  { emoji: '📥', name: 'Input' },
  { emoji: '📤', name: 'Output' },
  // Thinking & notes
  { emoji: '💡', name: 'Idea' },
  { emoji: cp(0x2753, 0xfe0f), name: 'Question' },
  { emoji: cp(0x2757, 0xfe0f), name: 'Problem' },
  { emoji: '🔍', name: 'Research' },
  { emoji: '🧠', name: 'Insight' },
  { emoji: '📝', name: 'Memo' },
  { emoji: '📄', name: 'Spec' },
  { emoji: '📊', name: 'Metrics' },
  { emoji: '📖', name: 'Reference' },
  // Judgment & marks
  { emoji: '👍', name: 'Approved' },
  { emoji: '👎', name: 'Rejected' },
  { emoji: '💬', name: 'Feedback' },
  { emoji: cp(0x26a0, 0xfe0f), name: 'Warning' },
  { emoji: '✨', name: 'New' },
  { emoji: cp(0x2764, 0xfe0f), name: 'Favorite' },
  // Engineering & architecture
  { emoji: '💻', name: 'Code' },
  { emoji: '🐛', name: 'Bug' },
  { emoji: '🧪', name: 'Experiment' },
  { emoji: '🚀', name: 'Launch' },
  { emoji: cp(0x1f6e0, 0xfe0f), name: 'Tooling' },
  { emoji: cp(0x2699, 0xfe0f), name: 'Service' },
  { emoji: cp(0x1f5c4, 0xfe0f), name: 'Database' },
  { emoji: '🌐', name: 'Web' },
  { emoji: cp(0x2601, 0xfe0f), name: 'Cloud' },
  { emoji: '🔒', name: 'Security' },
  { emoji: '📡', name: 'Messaging' },
  { emoji: '🧩', name: 'Module' },
  // People, time & cost
  { emoji: '👤', name: 'Person' },
  { emoji: '👥', name: 'Team' },
  { emoji: '💰', name: 'Cost' },
  { emoji: '⏰', name: 'Deadline' },
  { emoji: '📅', name: 'Scheduled' },
  { emoji: '🔔', name: 'Reminder' },
];

/** The stored glyph strings in picker order. */
export const NODE_EMOJI_VALUES: readonly string[] = NODE_EMOJIS.map(entry => entry.emoji);

/** Exact string membership against the closed set — no parsing, no ranges. */
export function isNodeEmoji(value: unknown): value is string {
  return typeof value === 'string' && (NODE_EMOJI_VALUES as readonly string[]).includes(value);
}

/** The stable curated name for a stored glyph, or undefined when off-set. */
export function nodeEmojiName(emoji: string): string | undefined {
  return NODE_EMOJIS.find(entry => entry.emoji === emoji)?.name;
}
