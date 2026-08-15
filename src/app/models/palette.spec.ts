import { PaletteEntry, searchPaletteEntries } from './palette';

function entry(
  id: string,
  label: string,
  category: PaletteEntry['category'],
  options: Partial<PaletteEntry> = {},
): PaletteEntry {
  return {
    id,
    label,
    aliases: [],
    category,
    available: true,
    execute: () => {},
    ...options,
  };
}

describe('palette search', () => {
  it('orders an empty query by availability, category, then label', () => {
    const entries = [
      entry('viewport-zoom', 'Zoom In', 'Viewport'),
      entry('history-redo', 'Redo', 'History'),
      entry('selection-clear', 'Clear Selection', 'Selection', {
        available: false,
        disabledReason: 'Nothing is selected',
      }),
      entry('history-undo', 'Undo', 'History'),
    ];

    expect(searchPaletteEntries(entries, '').map(item => item.id)).toEqual([
      'history-redo',
      'history-undo',
      'viewport-zoom',
      'selection-clear',
    ]);
  });

  it('ranks exact labels before prefixes and broad fuzzy matches', () => {
    const entries = [
      entry('zoom-fit', 'Zoom to Fit', 'Viewport'),
      entry('zoom-in', 'Zoom In', 'Viewport'),
      entry('tidy', 'Tidy up', 'Viewport'),
    ];

    expect(searchPaletteEntries(entries, 'zoom to fit').map(item => item.id)).toEqual(['zoom-fit']);
    expect(searchPaletteEntries(entries, 'zoom').map(item => item.id)).toEqual([
      'zoom-in',
      'zoom-fit',
    ]);
    expect(searchPaletteEntries(entries, 'zfit').map(item => item.id)).toContain('zoom-fit');
  });

  it('searches hidden aliases and categories without changing canonical labels', () => {
    const entries = [
      entry('fit', 'Zoom to Fit', 'Viewport', { aliases: ['frame canvas'] }),
      entry('all', 'Select All', 'Selection'),
    ];

    expect(searchPaletteEntries(entries, 'frame').map(item => item.id)).toEqual(['fit']);
    expect(searchPaletteEntries(entries, 'viewport').map(item => item.id)).toEqual(['fit']);
    expect(entries[0].label).toBe('Zoom to Fit');
  });

  it('keeps an unavailable matching entry visible after available matches', () => {
    const entries = [
      entry('undo', 'Undo', 'History'),
      entry('delete', 'Delete', 'Selection', {
        available: false,
        disabledReason: 'Nothing is selected',
      }),
    ];

    expect(searchPaletteEntries(entries, 'delete').map(item => item.id)).toEqual(['delete']);
    expect(searchPaletteEntries(entries, 'd').map(item => item.id)).toEqual(['undo', 'delete']);
  });
});
