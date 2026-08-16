import { TestBed } from '@angular/core/testing';
import { ContextMenuService } from './context-menu.service';
import { ClipboardService } from './clipboard.service';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ExportDialogService } from './export-dialog.service';
import { textFromString } from '../models/text';

describe('ContextMenuService', () => {
  let service: ContextMenuService;
  let clipboardService: ClipboardService;
  let graphService: GraphService;
  let historyService: HistoryService;
  let exportDialogService: ExportDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContextMenuService);
    clipboardService = TestBed.inject(ClipboardService);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    exportDialogService = TestBed.inject(ExportDialogService);
  });

  describe('openFor selection rules', () => {
    it('right-click on a node selects it before the menu opens', () => {
      const node = graphService.createNode('A', 0, 0);

      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);

      expect(graphService.selectedNodeId()).toBe(node.id);
    });

    it('right-click on a Group selects it (Groups are nodes)', () => {
      const group = graphService.createGroup('G', 0, 0);

      service.openFor({ kind: 'node', nodeId: group.id }, 10, 10);

      expect(graphService.selectedNodeId()).toBe(group.id);
    });

    it('right-click on a connection selects it and deselects any node', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.selectNode(a.id);

      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);

      expect(graphService.selectedConnectionId()).toBe(conn.id);
      expect(graphService.selectedNodeId()).toBeNull();
    });

    it('right-click on empty Canvas clears the selection', () => {
      const node = graphService.createNode('A', 0, 0);
      graphService.selectNode(node.id);

      service.openFor({ kind: 'canvas' }, 10, 10);

      expect(graphService.selectedNodeId()).toBeNull();
      expect(graphService.selectedConnectionId()).toBeNull();
    });

    it('opening a menu never touches History', () => {
      const node = graphService.createNode('A', 0, 0);

      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);
      service.openFor({ kind: 'canvas' }, 10, 10);

      expect(historyService.canUndo()).toBe(false);
    });

    it('exposes the kind of the last-opened target for the menu template', () => {
      const node = graphService.createNode('A', 0, 0);

      service.openFor({ kind: 'canvas' }, 0, 0);
      expect(service.menuKind()).toBe('canvas');

      service.openFor({ kind: 'node', nodeId: node.id }, 0, 0);
      expect(service.menuKind()).toBe('node');
    });

    it('reports whether the node target is a Group (drives the "Add node" item)', () => {
      const node = graphService.createNode('A', 0, 0);
      const group = graphService.createGroup('G', 0, 0);

      service.openFor({ kind: 'node', nodeId: group.id }, 0, 0);
      expect(service.targetIsGroup()).toBe(true);

      service.openFor({ kind: 'node', nodeId: node.id }, 0, 0);
      expect(service.targetIsGroup()).toBe(false);

      service.openFor({ kind: 'canvas' }, 0, 0);
      expect(service.targetIsGroup()).toBe(false);
    });
  });

  describe('addNode', () => {
    it('creates a "New Node" centered on the right-click point as one undo step', () => {
      service.openFor({ kind: 'canvas' }, 200, 120);
      service.addNode();

      expect(graphService.nodes().length).toBe(1);
      const node = graphService.nodes()[0];
      expect(node.text).toEqual(textFromString('New Node'));
      // 160x48 node centered on the point → point minus 60/24
      expect(node.x).toBe(140);
      expect(node.y).toBe(96);
      expect(node.width).toBe(160);
      expect(node.height).toBe(48);
      expect(node.parentId).toBeUndefined();

      historyService.undo();
      expect(graphService.nodes().length).toBe(0);
    });

    it('creates a child of the Group when the target is a Group', () => {
      const group = graphService.createGroup('G', 0, 0);
      service.openFor({ kind: 'node', nodeId: group.id }, 200, 120);
      service.addNode();

      const child = graphService.nodes().find(n => n.parentId === group.id);
      expect(child).toBeTruthy();
      expect(child!.text).toEqual(textFromString('New Node'));
      expect(child!.x).toBe(140);
      expect(child!.y).toBe(96);
    });
  });

  describe('addGroup', () => {
    it('creates a "New Group" centered on the right-click point as one undo step', () => {
      service.openFor({ kind: 'canvas' }, 400, 300);
      service.addGroup();

      expect(graphService.nodes().length).toBe(1);
      const group = graphService.nodes()[0];
      expect(group.label).toBe('New Group');
      expect(group.kind).toBe('group');
      // 320x200 group centered on the point → point minus 160/100
      expect(group.x).toBe(240);
      expect(group.y).toBe(200);
      expect(group.width).toBe(320);
      expect(group.height).toBe(200);

      historyService.undo();
      expect(graphService.nodes().length).toBe(0);
    });
  });

  describe('deleteTarget', () => {
    it('deletes a Node and cascades its Connections as one undo step', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      graphService.createConnection(a.id, 'right', b.id, 'left');
      service.openFor({ kind: 'node', nodeId: a.id }, 10, 10);

      service.deleteTarget();

      expect(graphService.nodes().find(n => n.id === a.id)).toBeUndefined();
      expect(graphService.connections().length).toBe(0);

      historyService.undo();
      expect(graphService.nodes().find(n => n.id === a.id)).toBeTruthy();
      expect(graphService.connections().length).toBe(1);
    });

    it('deletes only the Connection when the target is a Connection', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);

      service.deleteTarget();

      expect(graphService.connections().length).toBe(0);
      expect(graphService.nodes().length).toBe(2);
    });
  });

  describe('scoped PNG export', () => {
    it('forwards a single Node as frozen root ids without touching History', () => {
      const node = graphService.createNode('A', 0, 0);

      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);
      service.exportPng();

      expect(exportDialogService.openRequests()).toBe(1);
      expect(exportDialogService.projectId()).toBeUndefined();
      expect(exportDialogService.scopeRootIds()).toEqual([node.id]);
      expect(historyService.canUndo()).toBe(false);
    });

    it('freezes all node roots when right-clicking a member of a multi-Selection', () => {
      const first = graphService.createNode('A', 0, 0);
      const second = graphService.createNode('B', 300, 0);
      const later = graphService.createNode('C', 600, 0);
      graphService.setSelection([first.id, second.id], []);

      service.openFor({ kind: 'node', nodeId: first.id }, 10, 10);
      graphService.setSelection([later.id], []);
      service.exportPng();

      expect(exportDialogService.scopeRootIds()).toEqual([first.id, second.id]);
      expect(exportDialogService.scope()?.isMultiSelection).toBe(true);
    });

    it('does not open a scoped export for a lone Connection or empty Canvas', () => {
      const first = graphService.createNode('A', 0, 0);
      const second = graphService.createNode('B', 300, 0);
      const connection = graphService.createConnection(first.id, 'right', second.id, 'left')!;

      service.openFor({ kind: 'connection', connectionId: connection.id }, 10, 10);
      service.exportPng();
      service.openFor({ kind: 'canvas' }, 10, 10);
      service.exportPng();

      expect(exportDialogService.openRequests()).toBe(0);
    });
  });

  describe('rename / editText requests', () => {
    it('rename exposes the Group id to edit and never touches History', () => {
      const group = graphService.createGroup('G', 0, 0);
      service.openFor({ kind: 'node', nodeId: group.id }, 10, 10);

      service.rename();

      expect(service.renameRequest()).toBe(group.id);
      expect(historyService.canUndo()).toBe(false);
    });

    it('rename is a no-op for a regular node (nodes carry Text, not a Label)', () => {
      const node = graphService.createNode('A', 0, 0);
      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);

      service.rename();

      expect(service.renameRequest()).toBeNull();
    });

    it('a rename request is cleared once consumed', () => {
      const group = graphService.createGroup('G', 0, 0);
      service.openFor({ kind: 'node', nodeId: group.id }, 10, 10);
      service.rename();

      service.clearRenameRequest();

      expect(service.renameRequest()).toBeNull();
    });

    it('editText on a regular node exposes the node id and never touches History', () => {
      const node = graphService.createNode('A', 0, 0);
      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);

      service.editText();

      expect(service.editTextRequest()).toBe(node.id);
      expect(service.connectionTextRequest()).toBeNull();
      expect(historyService.canUndo()).toBe(false);
    });

    it('editText on a Group is a no-op (Groups are renamed, not text-edited)', () => {
      const group = graphService.createGroup('G', 0, 0);
      service.openFor({ kind: 'node', nodeId: group.id }, 10, 10);

      service.editText();

      expect(service.editTextRequest()).toBeNull();
    });

    it('an editText request is cleared once consumed', () => {
      const node = graphService.createNode('A', 0, 0);
      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);
      service.editText();

      service.clearEditTextRequest();

      expect(service.editTextRequest()).toBeNull();
    });

    it('editText on a Connection exposes the connection id and never touches History', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);

      service.editText();

      expect(service.connectionTextRequest()).toBe(conn.id);
      expect(service.editTextRequest()).toBeNull();
      expect(historyService.canUndo()).toBe(false);
    });

    it('a connection editText request is cleared once consumed', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);
      service.editText();

      service.clearConnectionTextRequest();

      expect(service.connectionTextRequest()).toBeNull();
    });
  });

  describe('clipboard actions', () => {
    it('copyTarget fills the Clipboard and exposes canPaste for the menu', () => {
      const node = graphService.createNode('A', 0, 0);
      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);

      expect(service.canPaste()).toBe(false);
      service.copyTarget();

      expect(service.canPaste()).toBe(true);
      expect(graphService.nodes().length).toBe(1);
      expect(historyService.canUndo()).toBe(false);
    });

    it('cutTarget removes the target as one undo step', () => {
      const node = graphService.createNode('A', 0, 0);
      service.openFor({ kind: 'node', nodeId: node.id }, 10, 10);

      service.cutTarget();

      expect(graphService.nodes().length).toBe(0);
      expect(service.canPaste()).toBe(true);
      historyService.undo();
      expect(graphService.nodes().length).toBe(1);
    });

    it('copy/cut/duplicate are silent no-ops for connection and canvas targets', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;

      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);
      service.copyTarget();
      service.cutTarget();
      service.duplicateTarget();
      service.openFor({ kind: 'canvas' }, 10, 10);
      service.copyTarget();
      service.cutTarget();
      service.duplicateTarget();

      expect(service.canPaste()).toBe(false);
      expect(graphService.nodes().length).toBe(2);
      expect(graphService.connections().length).toBe(1);
      expect(historyService.canUndo()).toBe(false);
    });

    it('pasteHere centers the copy on the right-click point', () => {
      const node = graphService.createNode('A', 0, 0);
      service.openFor({ kind: 'node', nodeId: node.id }, 0, 0);
      service.copyTarget();

      service.openFor({ kind: 'canvas' }, 400, 300);
      service.pasteHere();

      const pasted = graphService.nodes().find(n => n.id !== node.id)!;
      // 160x48 centered on the point
      expect(pasted.x).toBe(320);
      expect(pasted.y).toBe(276);
      expect(pasted.parentId).toBeUndefined();
    });

    it('pasteHere on a Group parents the pasted node into that Group', () => {
      const node = graphService.createNode('A', 900, 900);
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      service.openFor({ kind: 'node', nodeId: node.id }, 0, 0);
      service.copyTarget();

      service.openFor({ kind: 'node', nodeId: group.id }, 100, 100);
      service.pasteHere();

      const pasted = graphService.nodes().find(n => n.id !== node.id && n.id !== group.id)!;
      expect(pasted.parentId).toBe(group.id);
    });

    it('pasteHere with an empty Clipboard is a silent no-op', () => {
      service.openFor({ kind: 'canvas' }, 100, 100);
      service.pasteHere();

      expect(graphService.nodes().length).toBe(0);
      expect(historyService.canUndo()).toBe(false);
    });

    it('duplicateTarget staggers the copy +24,+24 without touching the Clipboard', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 500, 500);
      service.openFor({ kind: 'node', nodeId: a.id }, 0, 0);
      service.copyTarget();

      service.openFor({ kind: 'node', nodeId: b.id }, 500, 500);
      service.duplicateTarget();

      const copy = graphService.nodes().find(n => n.x === 524)!;
      expect(copy.y).toBe(524);
      expect(graphService.selectedNodeId()).toBe(copy.id);
      // Clipboard still holds A
      expect(clipboardService.canPaste()).toBe(true);
    });
  });

  // Selection-aware menu (ADR-0015): right-clicking a member keeps the set
  // and offers the multi menu; a non-member collapses to a single target.
  describe('multi-Selection menu', () => {
    function makeSet() {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c = graphService.createNode('C', 600, 0);
      graphService.setSelection([a.id, b.id], []);
      return { a, b, c };
    }

    it('right-click on a Selection member keeps the whole Selection and shows the multi menu', () => {
      const { a, b } = makeSet();

      service.openFor({ kind: 'node', nodeId: a.id }, 10, 10);

      expect(graphService.selectedNodeIds()).toEqual([a.id, b.id]);
      expect(service.menuKind()).toBe('multi');
    });

    it('right-click on a non-member collapses the Selection to it and shows the single menu', () => {
      const { c } = makeSet();

      service.openFor({ kind: 'node', nodeId: c.id }, 10, 10);

      expect(graphService.selectedNodeIds()).toEqual([c.id]);
      expect(service.menuKind()).toBe('node');
    });

    it('right-click on a selected Connection member of a mixed set keeps it and shows the multi menu', () => {
      const { a, b } = makeSet();
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.setSelection([a.id], [conn.id]);

      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);

      expect(graphService.selectedConnectionIds()).toEqual([conn.id]);
      expect(graphService.selectedNodeIds()).toEqual([a.id]);
      expect(service.menuKind()).toBe('multi');
    });

    it('a single-element Selection still shows the single-target menu', () => {
      const { a } = makeSet();
      graphService.selectNode(a.id);

      service.openFor({ kind: 'node', nodeId: a.id }, 10, 10);

      expect(service.menuKind()).toBe('node');
    });

    it('deleteSelection removes the whole set as one undo step', () => {
      const { a, b, c } = makeSet();
      service.openFor({ kind: 'node', nodeId: a.id }, 10, 10);

      service.deleteSelection();

      expect(graphService.nodes().map(n => n.id)).toEqual([c.id]);
      historyService.undo();
      expect(graphService.nodes().map(n => n.id).sort()).toEqual([a.id, b.id, c.id].sort());
    });

    it('copySelection + pasteHere yields copies of the whole set', () => {
      const { a, b } = makeSet();
      service.openFor({ kind: 'node', nodeId: a.id }, 10, 10);

      service.copySelection();
      service.openFor({ kind: 'canvas' }, 2000, 2000);
      service.pasteHere();

      expect(graphService.nodes().length).toBe(5);
      expect(graphService.selectedNodeIds().length).toBe(2);
      expect(graphService.isNodeSelected(a.id)).toBe(false);
      expect(graphService.isNodeSelected(b.id)).toBe(false);
    });

    it('cutSelection with no Node in the Selection is a silent no-op', () => {
      const { a, b } = makeSet();
      const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      graphService.setSelection([], [conn.id]);
      service.openFor({ kind: 'connection', connectionId: conn.id }, 10, 10);

      service.cutSelection();

      expect(graphService.connections().length).toBe(1);
      expect(historyService.canUndo()).toBe(false);
    });
  });

  describe('pins', () => {
    it('right-clicking a Pin keeps the Selection and shows the pin menu', () => {
      const node = graphService.createNode('A', 0, 0);
      const pin = graphService.createPin({ kind: 'canvas', x: 5, y: 5 }, 'Note')!;
      graphService.selectNode(node.id);

      service.openFor({ kind: 'pin', pinId: pin.id }, 5, 5);

      expect(service.menuKind()).toBe('pin');
      expect(graphService.selectedNodeId()).toBe(node.id);
    });

    it('addPin from the empty Canvas requests a ghost canvas anchor at the right-click point', () => {
      service.openFor({ kind: 'canvas' }, 120, 80);

      service.addPin();

      expect(service.pinCreateRequest()).toEqual({ kind: 'canvas', x: 120, y: 80 });
      expect(graphService.pins().length).toBe(0);
      expect(historyService.canUndo()).toBe(false);
    });

    it('addPin from a Node target requests a node anchor offset from the Node top-left', () => {
      const node = graphService.createNode('A', 100, 200);

      service.openFor({ kind: 'node', nodeId: node.id }, 150, 230);
      service.addPin();

      expect(service.pinCreateRequest()).toEqual({
        kind: 'node', nodeId: node.id, offsetX: 50, offsetY: 30,
      });
    });

    it('addPin from a Group target anchors to the Group', () => {
      const group = graphService.createGroup('G', 0, 0);

      service.openFor({ kind: 'node', nodeId: group.id }, 10, 10);
      service.addPin();

      expect(service.pinCreateRequest()).toEqual({
        kind: 'node', nodeId: group.id, offsetX: 10, offsetY: 10,
      });
    });

    it('editPin requests the pin editor for the target Pin', () => {
      const pin = graphService.createPin({ kind: 'canvas', x: 0, y: 0 }, 'Note')!;
      service.openFor({ kind: 'pin', pinId: pin.id }, 0, 0);

      service.editPin();

      expect(service.pinEditRequest()).toBe(pin.id);
    });

    it('deletePin removes the Pin as one undoable Command', () => {
      const pin = graphService.createPin({ kind: 'canvas', x: 0, y: 0 }, 'Note')!;
      service.openFor({ kind: 'pin', pinId: pin.id }, 0, 0);

      service.deletePin();

      expect(graphService.pins().length).toBe(0);
      expect(historyService.canUndo()).toBe(true);
      historyService.undo();
      expect(graphService.pins().length).toBe(1);
    });

    it('clearPinCreateRequest and clearPinEditRequest reset the signals', () => {
      const pin = graphService.createPin({ kind: 'canvas', x: 0, y: 0 }, 'Note')!;

      service.requestCreatePin({ kind: 'canvas', x: 1, y: 2 });
      service.openFor({ kind: 'pin', pinId: pin.id }, 0, 0);
      service.editPin();

      service.clearPinCreateRequest();
      service.clearPinEditRequest();

      expect(service.pinCreateRequest()).toBeNull();
      expect(service.pinEditRequest()).toBeNull();
    });
  });
});
