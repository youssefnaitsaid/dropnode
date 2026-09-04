import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';

describe('ClipboardService', () => {
  let service: ClipboardService;
  let graphService: GraphService;
  let historyService: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClipboardService);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
  });

  describe('copy', () => {
    it('starts empty: canPaste is false', () => {
      expect(service.canPaste()).toBe(false);
    });

    it('copying a Node fills the Clipboard, mutates nothing, touches no History', () => {
      const node = graphService.createNode('A', 10, 20);
      graphService.selectNode(node.id);

      service.copy(node.id);

      expect(service.canPaste()).toBe(true);
      expect(graphService.nodes().length).toBe(1);
      expect(historyService.canUndo()).toBe(false);
      // Copy keeps the original selected
      expect(graphService.selectedNodeId()).toBe(node.id);
    });

    it('preserves a regular Node Shape through Paste and Duplicate', () => {
      const node = graphService.createNode('Pill', 10, 20);
      graphService.setNodeShape(node.id, 'pill');

      service.copy(node.id);
      service.pasteAt(400, 300);
      service.duplicate(node.id);

      const copies = graphService.nodes().filter(item => item.id !== node.id);
      expect(copies).toHaveLength(2);
      expect(copies.every(item => item.shape === 'pill')).toBe(true);
    });

    it('carries a regular Node Emoji through Paste and Duplicate', () => {
      const node = graphService.createNode('Idea', 10, 20);
      graphService.setNodeEmoji(node.id, '💡');

      service.copy(node.id);
      service.pasteAt(400, 300);
      service.duplicate(node.id);

      const copies = graphService.nodes().filter(item => item.id !== node.id);
      expect(copies).toHaveLength(2);
      expect(copies.every(item => item.emoji === '💡')).toBe(true);
    });

    it('carries a Text Block kind and Text through Paste and Duplicate', () => {
      const block = graphService.createTextBlock('Parked doc', 10, 20);

      service.copy(block.id);
      service.pasteAt(400, 300);
      service.duplicate(block.id);

      const copies = graphService.nodes().filter(item => item.id !== block.id);
      expect(copies).toHaveLength(2);
      expect(copies.every(item => item.kind === 'annotation')).toBe(true);
      expect(copies.every(item => item.text !== undefined)).toBe(true);
      expect(new Set(copies.map(item => item.id)).size).toBe(2);
    });

    it('copying a Group captures the Group, its children, and only internal Connections', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const childA = graphService.createNode('A', 20, 20);
      const childB = graphService.createNode('B', 200, 20);
      const outsider = graphService.createNode('Out', 900, 900);
      graphService.setNodeParent(childA.id, group.id);
      graphService.setNodeParent(childB.id, group.id);
      graphService.createConnection(childA.id, 'right', childB.id, 'left');
      graphService.createConnection(childA.id, 'bottom', outsider.id, 'top');

      service.copy(group.id);
      service.pasteAt(2000, 2000);

      // 3 originals + outsider + pasted group + 2 pasted children
      expect(graphService.nodes().length).toBe(7);
      // Only the internal connection was captured; the outward one was not
      expect(graphService.connections().length).toBe(3);
    });

    it('the Clipboard snapshot is isolated from later edits to the original', () => {
      const node = graphService.createNode('Before', 0, 0);
      service.copy(node.id);
      graphService.updateNodePosition(node.id, 500, 500);

      service.pasteAt(0, 0);

      const pasted = graphService.nodes().find(n => n.id !== node.id)!;
      // Pasted from the snapshot taken at copy time, centered on (0,0)
      expect(pasted.x).toBe(-80);
      expect(pasted.y).toBe(-24);
    });

    it('copying a Connection target is impossible by design: copy of unknown id is a silent no-op', () => {
      service.copy('nonexistent');
      expect(service.canPaste()).toBe(false);
    });
  });

  describe('cut', () => {
    it('cutting a Node fills the Clipboard and deletes the Node with its Connections as one undo step', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      graphService.createConnection(a.id, 'right', b.id, 'left');
      graphService.selectNode(a.id);

      service.cut(a.id);

      expect(service.canPaste()).toBe(true);
      expect(graphService.nodes().map(n => n.id)).toEqual([b.id]);
      expect(graphService.connections().length).toBe(0);
      expect(graphService.selectedNodeId()).toBeNull();

      historyService.undo();
      expect(graphService.nodes().find(n => n.id === a.id)).toBeTruthy();
      expect(graphService.connections().length).toBe(1);
      // The Clipboard still holds the copy after undoing the cut
      expect(service.canPaste()).toBe(true);
    });

    it('cutting a Group removes the Group, its children, and every touching Connection as one undo step', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      const outsider = graphService.createNode('Out', 900, 900);
      graphService.setNodeParent(child.id, group.id);
      graphService.createConnection(child.id, 'right', outsider.id, 'left');

      service.cut(group.id);

      // Unlike Delete (which releases children), Cut removes them too
      expect(graphService.nodes().map(n => n.id)).toEqual([outsider.id]);
      expect(graphService.connections().length).toBe(0);

      historyService.undo();
      expect(graphService.nodes().length).toBe(3);
      expect(graphService.nodes().find(n => n.id === child.id)?.parentId).toBe(group.id);
      expect(graphService.connections().length).toBe(1);
    });

    it('cut of an unknown id is a silent no-op', () => {
      service.cut('nonexistent');
      expect(service.canPaste()).toBe(false);
      expect(historyService.canUndo()).toBe(false);
    });

    it('cut carries the Emoji to the Clipboard and back on paste', () => {
      const node = graphService.createNode('Idea', 0, 0);
      graphService.setNodeEmoji(node.id, '💡');

      service.cut(node.id);
      service.pasteAt(400, 300);

      const pasted = graphService.nodes().find(item => item.id !== node.id)!;
      expect(pasted.emoji).toBe('💡');
    });
  });

  describe('paste', () => {
    it('paste with an empty Clipboard is a silent no-op', () => {
      service.pasteAt(100, 100);
      service.pasteAtCursor();
      expect(graphService.nodes().length).toBe(0);
      expect(historyService.canUndo()).toBe(false);
    });

    it('pasted elements get fresh node_/conn_ ids and remapped references', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      graphService.setNodeParent(child.id, group.id);
      service.copy(group.id);

      service.pasteAt(1000, 1000);

      const pastedGroup = graphService.nodes().find(n => n.kind === 'group' && n.id !== group.id)!;
      const pastedChild = graphService.nodes().find(n => n.parentId === pastedGroup.id)!;
      expect(pastedGroup.id).toMatch(/^node_\d+_\d+$/);
      expect(pastedGroup.id).not.toBe(group.id);
      expect(pastedChild.id).not.toBe(child.id);
      // The child rode along rigidly: same offset as its Group
      expect(pastedChild.x - pastedGroup.x).toBe(child.x - group.x);
      expect(pastedChild.y - pastedGroup.y).toBe(child.y - group.y);
    });

    it('pasting the same entry twice yields two independent copies', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);

      service.pasteAt(500, 0);
      service.pasteAt(500, 500);

      expect(graphService.nodes().length).toBe(3);
      const ids = graphService.nodes().map(n => n.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('paste selects the new copy (the Group node for group pastes)', () => {
      const group = graphService.createGroup('G', 0, 0);
      service.copy(group.id);

      service.pasteAt(1000, 1000);

      const pastedGroup = graphService.nodes().find(n => n.kind === 'group' && n.id !== group.id)!;
      expect(graphService.selectedNodeId()).toBe(pastedGroup.id);
    });

    it('a copied child Node pastes parentless on the Canvas', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      graphService.setNodeParent(child.id, group.id);
      service.copy(child.id);

      service.pasteAt(1000, 1000);

      const pasted = graphService.nodes().find(n => n.id !== group.id && n.id !== child.id)!;
      expect(pasted.parentId).toBeUndefined();
    });

    it('paste with a target Group parents pasted regular nodes into it', () => {
      const node = graphService.createNode('A', 900, 900);
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      service.copy(node.id);

      service.pasteAt(100, 100, group.id);

      const pasted = graphService.nodes().find(n => n.id !== node.id && n.id !== group.id)!;
      expect(pasted.parentId).toBe(group.id);
    });

    it('a pasted Group never nests, even when pasted via a Group target', () => {
      const inner = graphService.createGroup('Inner', 900, 900);
      const target = graphService.createGroup('Target', 0, 0, 400, 300);
      service.copy(inner.id);

      service.pasteAt(100, 100, target.id);

      const pasted = graphService.nodes().find(
        n => n.kind === 'group' && n.id !== inner.id && n.id !== target.id,
      )!;
      expect(pasted.parentId).toBeUndefined();
    });

    it('undoing a paste removes the copy; redo restores it with the same ids', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);
      service.pasteAt(500, 500);
      const pastedId = graphService.nodes().find(n => n.id !== node.id)!.id;

      historyService.undo();
      expect(graphService.nodes().map(n => n.id)).toEqual([node.id]);

      historyService.redo();
      expect(graphService.nodes().map(n => n.id)).toEqual([node.id, pastedId]);
    });

    it('Ctrl+V pastes centered on the tracked cursor position', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);
      service.setCursorPosition(400, 300);

      service.pasteAtCursor();

      const pasted = graphService.nodes().find(n => n.id !== node.id)!;
      // 160x48 centered on (400,300)
      expect(pasted.x).toBe(320);
      expect(pasted.y).toBe(276);
    });

    it('falls back to a supplied visible Canvas center before the first cursor move', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);

      service.pasteAtCursor({ x: 400, y: 300 });

      const pasted = graphService.nodes().find(n => n.id !== node.id)!;
      expect(pasted.x).toBe(320);
      expect(pasted.y).toBe(276);
    });

    it('repeated cursor pastes without mouse movement cascade by +24,+24', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);
      service.setCursorPosition(400, 300);

      service.pasteAtCursor();
      service.pasteAtCursor();
      service.pasteAtCursor();

      const pasted = graphService.nodes().filter(n => n.id !== node.id);
      expect(pasted.map(n => n.x)).toEqual([320, 344, 368]);
      expect(pasted.map(n => n.y)).toEqual([276, 300, 324]);
    });

    it('moving the cursor resets the paste cascade', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);
      service.setCursorPosition(400, 300);
      service.pasteAtCursor();

      service.setCursorPosition(800, 300);
      service.pasteAtCursor();

      const pasted = graphService.nodes().filter(n => n.id !== node.id);
      expect(pasted[1].x).toBe(720);
      expect(pasted[1].y).toBe(276);
    });

    it('a registered cursor resolver supplies the paste position lazily', () => {
      const node = graphService.createNode('A', 0, 0);
      service.copy(node.id);
      service.registerCursorResolver(() => ({ x: 400, y: 300 }));

      service.pasteAtCursor();

      const pasted = graphService.nodes().find(n => n.id !== node.id)!;
      expect(pasted.x).toBe(320);
      expect(pasted.y).toBe(276);
    });
  });

  describe('duplicate', () => {
    it('duplicates a Node at +24,+24, selected, as one undo step', () => {
      const node = graphService.createNode('A', 100, 100);
      service.duplicate(node.id);

      const copy = graphService.nodes().find(n => n.id !== node.id)!;
      expect(copy.x).toBe(124);
      expect(copy.y).toBe(124);
      expect(graphService.selectedNodeId()).toBe(copy.id);

      historyService.undo();
      expect(graphService.nodes().map(n => n.id)).toEqual([node.id]);
    });

    it('duplicating a child Node produces a sibling in the same Group', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      graphService.setNodeParent(child.id, group.id);

      service.duplicate(child.id);

      const copy = graphService.nodes().find(n => n.id !== group.id && n.id !== child.id)!;
      expect(copy.parentId).toBe(group.id);
    });

    it('duplicating a Group copies children and internal Connections rigidly', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const a = graphService.createNode('A', 20, 20);
      const b = graphService.createNode('B', 200, 20);
      graphService.setNodeParent(a.id, group.id);
      graphService.setNodeParent(b.id, group.id);
      graphService.createConnection(a.id, 'right', b.id, 'left');

      service.duplicate(group.id);

      expect(graphService.nodes().length).toBe(6);
      expect(graphService.connections().length).toBe(2);
      const copyGroup = graphService.nodes().find(n => n.kind === 'group' && n.id !== group.id)!;
      expect(copyGroup.x).toBe(24);
      expect(graphService.nodes().filter(n => n.parentId === copyGroup.id).length).toBe(2);
    });

    it('duplicate never touches the Clipboard', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 300);
      service.copy(a.id);

      service.duplicate(b.id);
      service.setCursorPosition(600, 600);
      service.pasteAtCursor();

      // The paste reproduced A (copied), not B (duplicated)
      const pastedAtCursor = graphService.nodes().find(n => n.x === 520)!;
      expect(pastedAtCursor.text).toEqual(graphService.nodes().find(n => n.id === a.id)!.text);
    });

    it('duplicate of an unknown id is a silent no-op', () => {
      service.duplicate('nonexistent');
      expect(graphService.nodes().length).toBe(0);
      expect(historyService.canUndo()).toBe(false);
    });
  });

  describe('Alt+drag spawn', () => {
    it('spawnDuplicate creates the copy at the source position, selected, without touching History yet', () => {
      const node = graphService.createNode('A', 100, 100);

      const spawn = service.spawnDuplicate(node.id)!;

      expect(spawn.isGroup).toBe(false);
      const copy = graphService.nodes().find(n => n.id === spawn.primaryId)!;
      expect(copy.x).toBe(100);
      expect(copy.y).toBe(100);
      expect(graphService.selectedNodeId()).toBe(spawn.primaryId);
      expect(historyService.canUndo()).toBe(false);
    });

    it('commitSpawnedDuplicate records one undo step reflecting the dropped state', () => {
      const node = graphService.createNode('A', 100, 100);
      const spawn = service.spawnDuplicate(node.id)!;
      // The drag moved the copy transiently
      graphService.updateNodePosition(spawn.primaryId, 500, 500);

      service.commitSpawnedDuplicate();

      expect(historyService.canUndo()).toBe(true);
      historyService.undo();
      expect(graphService.nodes().map(n => n.id)).toEqual([node.id]);

      historyService.redo();
      const copy = graphService.nodes().find(n => n.id === spawn.primaryId)!;
      // Redo restores the copy at its dropped position, not the spawn position
      expect(copy.x).toBe(500);
      expect(copy.y).toBe(500);
    });

    it('cancelSpawnedDuplicate removes the copy, restores the source selection, and leaves History untouched', () => {
      const node = graphService.createNode('A', 100, 100);
      service.spawnDuplicate(node.id);

      service.cancelSpawnedDuplicate();

      expect(graphService.nodes().map(n => n.id)).toEqual([node.id]);
      // An aborted Alt+drag behaves like a plain click: the source stays selected
      expect(graphService.selectedNodeId()).toBe(node.id);
      expect(historyService.canUndo()).toBe(false);
    });

    it('spawning a Group duplicates its children too, dragged rigidly by the copy Group', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      graphService.setNodeParent(child.id, group.id);

      const spawn = service.spawnDuplicate(group.id)!;

      expect(spawn.isGroup).toBe(true);
      const copyChildren = graphService.nodes().filter(n => n.parentId === spawn.primaryId);
      expect(copyChildren.length).toBe(1);
      graphService.moveGroup(spawn.primaryId, 1000, 1000);
      service.commitSpawnedDuplicate();

      historyService.undo();
      expect(graphService.nodes().length).toBe(2);
    });

    it('translates copied Connection Reroute Points during an Alt+drag', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const connection = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.setConnectionReroutePoints(connection.id, [{ x: 180, y: 120 }]);

      const spawn = service.spawnDuplicate([a.id, b.id], a.id)!;
      service.moveSpawnedDuplicate(50, 70);

      const copied = graphService.connections().find(c => c.id !== connection.id)!;
      expect(copied.reroutePoints).toEqual([{ x: 230, y: 190 }]);
      service.cancelSpawnedDuplicate();
      expect(spawn.rootIds.length).toBe(2);
    });

    it('translates copied Connection Reroute Points by the pasted fragment delta', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const connection = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.setConnectionReroutePoints(connection.id, [{ x: 180, y: 120 }]);
      service.copy([a.id, b.id]);

      service.pasteAt(1000, 1000);

      const pasted = graphService.connections().find(c => c.id !== connection.id)!;
      expect(pasted.reroutePoints).toEqual([{ x: 950, y: 1096 }]);
    });

    it('carries the Route Style through copy/paste', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const connection = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.setConnectionRouteStyle(connection.id, 'orthogonal');
      service.copy([a.id, b.id]);

      service.pasteAt(1000, 1000);

      const pasted = graphService.connections().find(c => c.id !== connection.id)!;
      expect(pasted.routeStyle).toBe('orthogonal');
    });
  });

  // Multi-Selection Clipboard (ADR-0015): the entry generalizes to a set;
  // it stays single-entry and in-memory (ADR-0011).
  describe('Selection sets', () => {
    it('copies a set of Nodes plus only Connections with BOTH endpoints inside; danglers are dropped', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const out = graphService.createNode('Out', 900, 0);
      const inner = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.createConnection(b.id, 'right', out.id, 'left'); // dangler

      service.copy([a.id, b.id]);
      service.pasteAt(2000, 2000);

      // 3 originals + 2 pasted; only the internal Connection was duplicated
      expect(graphService.nodes().length).toBe(5);
      expect(graphService.connections().length).toBe(3);
      const pastedConn = graphService.connections().find(
        c => c.id !== inner.id && !c.targetNodeId.includes(out.id),
      );
      expect(pastedConn).toBeDefined();
    });

    it('paste selects everything pasted and recenters the set bounding box on the point', () => {
      const a = graphService.createNode('A', 0, 0); // bbox 0..160
      const b = graphService.createNode('B', 340, 0); // bbox 340..500, so center x = 250
      service.copy([a.id, b.id]);

      service.pasteAt(1000, 1000);

      const pasted = graphService.nodes().filter(n => n.id !== a.id && n.id !== b.id);
      expect(pasted.length).toBe(2);
      // Set center (250, 24) lands on (1000, 1000): every node shifts +750, +976
      expect(pasted.map(n => n.x).sort((x, y) => x - y)).toEqual([750, 1090]);
      expect(graphService.selectedNodeIds().sort()).toEqual(pasted.map(n => n.id).sort());
    });

    it('a Group root in a set copy still brings its children', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      graphService.setNodeParent(child.id, group.id);
      const loose = graphService.createNode('L', 600, 0);

      service.copy([group.id, loose.id]);
      service.pasteAt(2000, 2000);

      expect(graphService.nodes().length).toBe(6);
      const pastedGroup = graphService.nodes().find(n => n.kind === 'group' && n.id !== group.id)!;
      expect(graphService.nodes().filter(n => n.parentId === pastedGroup.id).length).toBe(1);
    });

    it('cut removes the whole set (a Group WITH children) plus explicitly selected danglers, one undo step', () => {
      const a = graphService.createNode('A', 0, 0);
      const group = graphService.createGroup('G', 300, 0, 400, 300);
      const child = graphService.createNode('C', 320, 20);
      graphService.setNodeParent(child.id, group.id);
      const out = graphService.createNode('Out', 900, 0);
      const dangler = graphService.createConnection(a.id, 'right', out.id, 'left')!;

      service.cut([a.id, group.id], [dangler.id]);

      expect(graphService.nodes().map(n => n.id)).toEqual([out.id]);
      expect(graphService.connections()).toEqual([]);

      historyService.undo();
      expect(graphService.nodes().length).toBe(4);
      expect(graphService.connections().map(c => c.id)).toEqual([dangler.id]);
      expect(graphService.nodes().find(n => n.id === child.id)?.parentId).toBe(group.id);
    });

    it('duplicating a set keeps each root a sibling (original parentId preserved)', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const child = graphService.createNode('C', 20, 20);
      graphService.setNodeParent(child.id, group.id);

      // Duplicate the child alone: the copy stays inside the Group
      service.duplicate([child.id]);

      const copy = graphService.nodes().find(n => n.id !== group.id && n.id !== child.id)!;
      expect(copy.parentId).toBe(group.id);
      expect(copy.x).toBe(44);
    });

    it('spawnDuplicate copies the whole set and reports the copy of the grabbed Node', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      graphService.setSelection([a.id, b.id], []);

      const spawn = service.spawnDuplicate([a.id, b.id], b.id)!;

      expect(spawn.rootIds.length).toBe(2);
      expect(graphService.nodes().length).toBe(4);
      // primaryId is the copy of the grabbed node, at b's position
      const primary = graphService.nodes().find(n => n.id === spawn.primaryId)!;
      expect(primary.x).toBe(300);
      // the copies became the Selection
      expect(graphService.selectedNodeIds().sort()).toEqual([...spawn.rootIds].sort());

      service.cancelSpawnedDuplicate();
      expect(graphService.nodes().length).toBe(2);
      // an aborted spawn restores the source Selection
      expect(graphService.selectedNodeIds().sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('Pins ride the Clipboard with their anchored Nodes', () => {
    it('copy captures Pins anchored to captured Nodes and never Canvas-anchored Pins', () => {
      const a = graphService.createNode('A', 0, 0);
      const group = graphService.createGroup('G', 300, 0);
      const child = graphService.createNode('Child', 320, 20);
      graphService.setNodeParent(child.id, group.id);
      graphService.createPin({ kind: 'node', nodeId: a.id, offsetX: 1, offsetY: 2 }, 'On A');
      graphService.createPin({ kind: 'node', nodeId: child.id, offsetX: 0, offsetY: 0 }, 'On child');
      graphService.createPin({ kind: 'canvas', x: 9, y: 9 }, 'Loose');

      service.copy(group.id);

      service.pasteAt(1000, 1000);

      // The pasted Group's child kept its Pin; A's and the loose one did not ride
      const pastedChild = graphService.nodes().find(n => n.parentId !== undefined && n.id !== child.id)!;
      const pastedPins = graphService.pins().filter(p => p.message === 'On child');
      expect(pastedPins.length).toBe(2);
      expect(graphService.pins().filter(p => p.message === 'On A').length).toBe(1);
      expect(graphService.pins().filter(p => p.message === 'Loose').length).toBe(1);
      expect(graphService.pins().find(p => p.id === pastedPins[1].id)!.anchor)
        .toEqual({ kind: 'node', nodeId: pastedChild.id, offsetX: 0, offsetY: 0 });
    });

    it('paste regenerates Pin ids and remaps the anchor nodeId', () => {
      const a = graphService.createNode('A', 0, 0);
      const pin = graphService.createPin({ kind: 'node', nodeId: a.id, offsetX: 4, offsetY: 5 }, 'Rider')!;

      service.copy(a.id);
      service.pasteAt(500, 500);

      const pastedPin = graphService.pins().find(p => p.id !== pin.id)!;
      expect(pastedPin.id).toMatch(/^pin_\d+_\d+$/);
      expect(pastedPin.anchor.kind).toBe('node');
      if (pastedPin.anchor.kind === 'node') {
        const pastedNode = graphService.nodes().find(n => n.id === pastedPin.anchor.nodeId)!;
        expect(pastedNode.id).not.toBe(a.id);
        expect(graphService.pinPoint(pastedPin.id)).toEqual({ x: pastedNode.x + 4, y: pastedNode.y + 5 });
      }
    });

    it('cut and paste moves the anchored Pins with their Nodes', () => {
      const a = graphService.createNode('A', 0, 0);
      graphService.createPin({ kind: 'node', nodeId: a.id, offsetX: 0, offsetY: 0 }, 'Moves along');
      graphService.createPin({ kind: 'canvas', x: 50, y: 50 }, 'Stays behind');

      service.cut(a.id);
      expect(graphService.pins().map(p => p.message)).toEqual(['Stays behind']);

      service.pasteAt(800, 800);
      const messages = graphService.pins().map(p => p.message).sort();
      expect(messages).toEqual(['Moves along', 'Stays behind']);
    });

    it('duplicate carries anchored Pins as independent copies', () => {
      const a = graphService.createNode('A', 0, 0);
      const pin = graphService.createPin({ kind: 'node', nodeId: a.id, offsetX: 0, offsetY: 0 }, 'Rider')!;

      service.duplicate(a.id);

      const pins = graphService.pins();
      expect(pins.length).toBe(2);
      expect(pins.every(p => p.message === 'Rider')).toBe(true);
      expect(new Set(pins.map(p => p.id)).size).toBe(2);
      const copy = pins.find(p => p.id !== pin.id)!;
      expect((copy.anchor as { nodeId: string }).nodeId).not.toBe(a.id);
    });

    it('undoing a paste removes the pasted Pins', () => {
      const a = graphService.createNode('A', 0, 0);
      graphService.createPin({ kind: 'node', nodeId: a.id, offsetX: 0, offsetY: 0 }, 'Rider')!;

      service.copy(a.id);
      service.pasteAt(500, 500);
      expect(graphService.pins().length).toBe(2);

      historyService.undo();
      expect(graphService.pins().length).toBe(1);
    });

    it('a Node anchored outside the captured set never rides', () => {
      const a = graphService.createNode('A', 0, 0);
      const outside = graphService.createNode('B', 500, 0);
      graphService.createPin({ kind: 'node', nodeId: outside.id, offsetX: 0, offsetY: 0 }, 'Stranger');

      service.copy(a.id);
      service.pasteAt(100, 100);

      expect(graphService.pins().filter(p => p.message === 'Stranger').length).toBe(1);
    });
  });
});
