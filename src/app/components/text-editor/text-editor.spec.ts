import { describe, it, expect } from 'vitest';
import { EditorState, AllSelection, TextSelection, Selection } from 'prosemirror-state';
import { sizeOfSelection } from './text-editor';
import { textSchema } from './text-schema';

const sizeMark = (level: 'S' | 'L') => textSchema.marks['size'].create({ level });

function paragraphDoc(runs: { text: string; size?: 'S' | 'L' }[]) {
  return textSchema.node('doc', null, [
    textSchema.node('paragraph', null, runs.map(r => textSchema.text(r.text, r.size ? [sizeMark(r.size)] : []))),
  ]);
}

describe('sizeOfSelection — S/M/L toolbar active state', () => {
  it('reads a uniformly sized Text under the open-state AllSelection (double-click edit)', () => {
    for (const level of ['L', 'S'] as const) {
      const doc = paragraphDoc([{ text: 'hello world', size: level }]);
      const state = EditorState.create({ doc, selection: new AllSelection(doc) });
      expect(sizeOfSelection(state)).toBe(level);
    }
  });

  it('reads M for a Text with no size marks', () => {
    const doc = paragraphDoc([{ text: 'hello world' }]);
    const state = EditorState.create({ doc, selection: new AllSelection(doc) });
    expect(sizeOfSelection(state)).toBe('M');
  });

  it('reads a partial selection inside sized text', () => {
    const doc = paragraphDoc([{ text: 'hello world', size: 'L' }]);
    const inside = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 6) });
    expect(sizeOfSelection(inside)).toBe('L');
  });

  it('reads a partial selection extending to the end of the text', () => {
    const doc = paragraphDoc([{ text: 'hello world', size: 'L' }]);
    const toEnd = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 12) });
    expect(sizeOfSelection(toEnd)).toBe('L');
  });

  it('lights nothing when the selection spans two sizes', () => {
    const doc = paragraphDoc([{ text: 'big', size: 'L' }, { text: 'small', size: 'S' }]);
    const all = EditorState.create({ doc, selection: new AllSelection(doc) });
    expect(sizeOfSelection(all)).toBeUndefined();
    const partialSpan = EditorState.create({ doc, selection: TextSelection.create(doc, 2, 6) });
    expect(sizeOfSelection(partialSpan)).toBeUndefined();
  });

  it('lights nothing when the selection spans sized and default-M text', () => {
    const doc = paragraphDoc([{ text: 'plain' }, { text: 'big', size: 'L' }]);
    const state = EditorState.create({ doc, selection: new AllSelection(doc) });
    expect(sizeOfSelection(state)).toBeUndefined();
  });

  it('follows stored marks for a bare caret (typing-into semantics)', () => {
    const doc = paragraphDoc([]);
    const state = EditorState.create({ doc, selection: Selection.atEnd(doc) });
    const withStored = state.apply(state.tr.addStoredMark(sizeMark('S')));
    expect(sizeOfSelection(withStored)).toBe('S');
  });

  it('reads the caret position marks when nothing is stored', () => {
    const doc = paragraphDoc([{ text: 'hello world', size: 'L' }]);
    const inText = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
    expect(sizeOfSelection(inText)).toBe('L');
    // A caret at the end of L text still reads L — typing continues at that
    // size. Selection.atEnd lands inside the block, unlike AllSelection's
    // head, which sits past the block's closing boundary.
    const atEnd = EditorState.create({ doc, selection: Selection.atEnd(doc) });
    expect(sizeOfSelection(atEnd)).toBe('L');
    const plain = paragraphDoc([{ text: 'hello world' }]);
    const plainCaret = EditorState.create({ doc: plain, selection: Selection.atEnd(plain) });
    expect(sizeOfSelection(plainCaret)).toBe('M');
  });
});
