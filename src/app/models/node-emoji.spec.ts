import {
  NODE_EMOJIS,
  NODE_EMOJI_VALUES,
  isNodeEmoji,
  nodeEmojiName,
} from './node-emoji';

// Glyphs built from code points so the assertions never depend on how an
// editor normalized a pasted literal (variation selectors stay exact).
const WARNING = String.fromCodePoint(0x26a0, 0xfe0f);
const BARE_WARNING = String.fromCodePoint(0x26a0);
const FAVORITE = String.fromCodePoint(0x2764, 0xfe0f);
const START = String.fromCodePoint(0x25b6, 0xfe0f);

describe('node emoji', () => {
  it('exposes the frozen curated set of 48 in category order', () => {
    expect(NODE_EMOJIS).toHaveLength(48);
    expect(NODE_EMOJIS.map(entry => entry.name)).toEqual([
      'Done', 'In progress', 'Blocked', 'Waiting', 'Backlog',
      'Urgent', 'Quick', 'Important', 'Goal', 'Milestone',
      'Start', 'Finish', 'Decision', 'Input', 'Output',
      'Idea', 'Question', 'Problem', 'Research', 'Insight',
      'Memo', 'Spec', 'Metrics', 'Reference',
      'Approved', 'Rejected', 'Feedback', 'Warning', 'New', 'Favorite',
      'Code', 'Bug', 'Experiment', 'Launch', 'Tooling', 'Service',
      'Database', 'Web', 'Cloud', 'Security', 'Messaging', 'Module',
      'Person', 'Team', 'Cost', 'Deadline', 'Scheduled', 'Reminder',
    ]);
  });

  it('holds the exact stored characters including variation selectors', () => {
    const byName = new Map(NODE_EMOJIS.map(entry => [entry.name, entry.emoji]));
    expect(byName.get('Done')).toBe('✅');
    expect(byName.get('Warning')).toBe(WARNING);
    expect(byName.get('New')).toBe('✨');
    expect(byName.get('Favorite')).toBe(FAVORITE);
    expect(byName.get('Start')).toBe(START);
    expect(byName.get('Idea')).toBe('💡');
    // The warning glyph carries its variation selector exactly as stored
    expect(byName.get('Warning')!.charCodeAt(1)).toBe(0xfe0f);
  });

  it('carries no duplicate glyphs or names', () => {
    expect(new Set(NODE_EMOJI_VALUES).size).toBe(48);
    expect(new Set(NODE_EMOJIS.map(entry => entry.name)).size).toBe(48);
  });

  it('accepts only exact members of the set', () => {
    expect(NODE_EMOJI_VALUES.every(value => isNodeEmoji(value))).toBe(true);
    expect(isNodeEmoji('💡')).toBe(true);
    expect(isNodeEmoji(WARNING)).toBe(true);
    expect(isNodeEmoji('🎉')).toBe(false);
    expect(isNodeEmoji('🔴')).toBe(false);
    expect(isNodeEmoji('📌')).toBe(false);
    expect(isNodeEmoji('')).toBe(false);
    expect(isNodeEmoji(undefined)).toBe(false);
    expect(isNodeEmoji(null)).toBe(false);
    expect(isNodeEmoji(42)).toBe(false);
    // A bare codepoint without its stored variation selector is off-set
    expect(isNodeEmoji(BARE_WARNING)).toBe(false);
  });

  it('resolves the stable curated name for aria-labels and entry labels', () => {
    expect(nodeEmojiName('✨')).toBe('New');
    expect(nodeEmojiName('💡')).toBe('Idea');
    expect(nodeEmojiName(WARNING)).toBe('Warning');
    expect(nodeEmojiName('🎉')).toBeUndefined();
  });
});
