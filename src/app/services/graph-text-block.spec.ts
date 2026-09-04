import { TestBed } from '@angular/core/testing';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ContextMenuService } from './context-menu.service';
import { CreateTextBlockCommand } from './commands';
import { textFromString } from '../models/text';

describe('GraphService Text Blocks', () => {
  let service: GraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GraphService);
  });

  describe('createTextBlock', () => {
    it('creates a Text Block with kind annotation, single-run Text, and default dimensions', () => {
      const block = service.createTextBlock('New Text Block', 100, 200);

      expect(block.id).toMatch(/^node_\d+_\d+$/);
      expect(block.kind).toBe('annotation');
      expect(block.text).toEqual(textFromString('New Text Block'));
      expect(block.label).toBeUndefined();
      expect(block.x).toBe(100);
      expect(block.y).toBe(200);
      expect(block.width).toBe(160);
      expect(block.height).toBe(48);
      expect(service.nodes().find(n => n.id === block.id)?.kind).toBe('annotation');
    });
  });

  describe('Text Block styling parity', () => {
    it('applies Shape to a Text Block', () => {
      const block = service.createTextBlock('Shaped', 0, 0);
      service.setNodeShape(block.id, 'pill');

      expect(service.nodes().find(n => n.id === block.id)?.shape).toBe('pill');
    });

    it('applies Emoji to a Text Block', () => {
      const block = service.createTextBlock('Noted', 0, 0);
      service.setNodeEmoji(block.id, '💡');

      expect(service.nodes().find(n => n.id === block.id)?.emoji).toBe('💡');
    });
  });

  describe('connection ban', () => {
    it('refuses a Connection sourced from a Text Block', () => {
      const block = service.createTextBlock('Doc', 0, 0);
      const node = service.createNode('Node', 300, 0);

      expect(service.connectionViolation(block.id, 'right', node.id, 'left')).toBe('text-block');
      expect(service.createConnection(block.id, 'right', node.id, 'left')).toBeNull();
      expect(service.connections().length).toBe(0);
    });

    it('refuses a Connection targeted at a Text Block', () => {
      const node = service.createNode('Node', 0, 0);
      const block = service.createTextBlock('Doc', 300, 0);

      expect(service.connectionViolation(node.id, 'right', block.id, 'left')).toBe('text-block');
      expect(service.createConnection(node.id, 'right', block.id, 'left')).toBeNull();
      expect(service.connections().length).toBe(0);
    });

    it('exposes no Handle positions for a Text Block', () => {
      const block = service.createTextBlock('Doc', 0, 0);

      expect(service.getHandlePosition(block.id, 'top')).toBeNull();
      expect(service.getHandlePosition(block.id, 'right')).toBeNull();
    });
  });

  describe('Import validation', () => {
    it('accepts a Text Block carrying Text, Shape, Palette color, and Emoji', () => {
      const block = service.createTextBlock('Doc', 10, 20);
      service.setNodeShape(block.id, 'pill');
      service.setNodeEmoji(block.id, '💡');
      service.setNodeColor(block.id, '#B3EBF2');
      const payload = service.exportGraph();

      const fresh = TestBed.inject(GraphService);
      expect(fresh.validateGraphState(payload).valid).toBe(true);
      expect(fresh.importGraph(payload).success).toBe(true);
      const imported = fresh.nodes().find(n => n.id === block.id);
      expect(imported?.kind).toBe('annotation');
      expect(imported?.shape).toBe('pill');
      expect(imported?.emoji).toBe('💡');
    });

    it('rejects an unknown kind value', () => {
      const node = service.createNode('Node', 0, 0);
      const payload = service.exportGraph();
      (payload.nodes[0] as unknown as Record<string, unknown>)['kind'] = 'sticker';

      expect(service.validateGraphState(payload).valid).toBe(false);
      expect(node.id).toBeTruthy();
    });

    it('rejects a Text Block carrying the Group-only label field', () => {
      const block = service.createTextBlock('Doc', 0, 0);
      const payload = service.exportGraph();
      (payload.nodes[0] as unknown as Record<string, unknown>)['label'] = 'Docs';

      const result = service.validateGraphState(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(`Invalid node ${block.id}: a Text Block cannot carry label`);
    });

    it('rejects a Text Block with neither Text nor legacy label', () => {
      const block = service.createTextBlock('Doc', 0, 0);
      const payload = service.exportGraph();
      delete (payload.nodes[0] as unknown as Record<string, unknown>)['text'];

      expect(service.validateGraphState(payload).valid).toBe(false);
      expect(block.id).toBeTruthy();
    });

    it('rejects a Connection touching a Text Block wholesale', () => {
      const node = service.createNode('Node', 0, 0);
      const block = service.createTextBlock('Doc', 300, 0);
      const payload = service.exportGraph();
      payload.connections.push({
        id: 'conn_1_1',
        sourceNodeId: node.id,
        sourceHandle: 'right',
        targetNodeId: block.id,
        targetHandle: 'left',
      });
      const before = service.nodes().length;

      const result = service.validateGraphState(payload);
      expect(result.valid).toBe(false);
      expect(service.nodes().length).toBe(before);
      expect(service.connections().length).toBe(0);
    });
  });

  describe('CreateTextBlockCommand', () => {
    it('executes and undoes as one step', () => {
      const cmd = new CreateTextBlockCommand(service, 'New Text Block', 140, 96);

      cmd.execute();
      expect(service.nodes().length).toBe(1);
      expect(service.nodes()[0].kind).toBe('annotation');
      expect(service.nodes()[0].text).toEqual(textFromString('New Text Block'));

      cmd.undo();
      expect(service.nodes().length).toBe(0);
    });

    it('parents the spawn into a Group like a Node child', () => {
      const group = service.createGroup('G', 0, 0);
      const cmd = new CreateTextBlockCommand(service, 'New Text Block', 140, 96, group.id);

      cmd.execute();

      expect(service.nodes().find(n => n.parentId === group.id)?.kind).toBe('annotation');
    });
  });

  describe('ContextMenuService.addTextBlock', () => {    it('creates a Text Block centered on the right-click point as one undo step', () => {
      const menus = TestBed.inject(ContextMenuService);
      const history = TestBed.inject(HistoryService);

      menus.openFor({ kind: 'canvas' }, 200, 120);
      menus.addTextBlock();

      expect(service.nodes().length).toBe(1);
      const block = service.nodes()[0];
      expect(block.kind).toBe('annotation');
      expect(block.text).toEqual(textFromString('New Text Block'));
      expect(block.x).toBe(140);
      expect(block.y).toBe(96);
      expect(block.parentId).toBeUndefined();

      history.undo();
      expect(service.nodes().length).toBe(0);
    });

    it('creates a child of the Group when the target is a Group', () => {
      const menus = TestBed.inject(ContextMenuService);
      const group = service.createGroup('G', 0, 0);

      menus.openFor({ kind: 'node', nodeId: group.id }, 200, 120);
      menus.addTextBlock();

      const child = service.nodes().find(n => n.parentId === group.id);
      expect(child?.kind).toBe('annotation');
      expect(child?.text).toEqual(textFromString('New Text Block'));
    });
  });

  describe('Text Block parity', () => {
    it('deleting a Text Block cascade-deletes its Node-anchored Pins', () => {
      const block = service.createTextBlock('Doc', 0, 0);
      const pin = service.createPin(
        { kind: 'node', nodeId: block.id, offsetX: 10, offsetY: 10 },
        'pointing at docs',
      )!;
      expect(service.pins().length).toBe(1);

      service.deleteNode(block.id);

      expect(service.pins().length).toBe(0);
      expect(pin.id).toBeTruthy();
    });

    it('joins and releases Group membership like a regular Node child', () => {
      const group = service.createGroup('G', 0, 0, 400, 300);
      const block = service.createTextBlock('Doc', 20, 20);

      service.setNodeParent(block.id, group.id);
      expect(service.childrenOf(group.id).map(n => n.id)).toContain(block.id);

      service.setNodeParent(block.id, null);
      expect(service.childrenOf(group.id)).toHaveLength(0);
    });

    it('counts toward a Group resize clamp like any child', () => {
      const group = service.createGroup('G', 0, 0, 400, 300);
      const block = service.createTextBlock('Doc', 20, 120);
      service.setNodeParent(block.id, group.id);

      const applied = service.resizeNode(group.id, { x: 0, y: 0, width: 100, height: 100 });

      // Child right edge 180 + 16 padding forces the width back open
      expect(applied.width).toBeGreaterThanOrEqual(180 + 16);
      expect(applied.height).toBeGreaterThanOrEqual(120 + 48 + 16);
    });
  });
});
