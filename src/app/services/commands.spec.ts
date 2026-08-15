import { TestBed } from '@angular/core/testing';
import { GraphService } from './graph.service';
import { NODE_PALETTE } from '../models/node';
import { Text, textFromString } from '../models/text';
import {
  CreateNodeCommand,
  MoveNodeCommand,
  RenameNodeCommand,
  DeleteNodeCommand,
  CreateConnectionCommand,
  DeleteConnectionCommand,
  CreateGroupCommand,
  ChangeParentCommand,
  MoveGroupCommand,
  ResizeNodeCommand,
  SetNodeColorCommand,
  CompoundCommand,
  SetNodeTextCommand,
  SetConnectionTextCommand,
  MoveConnectionTextCommand,
  AddConnectionReroutePointCommand,
  MoveConnectionReroutePointCommand,
  RemoveConnectionReroutePointCommand,
  SetConnectionColorCommand,
  SetConnectionArrowheadCommand,
  SetConnectionStrokePatternCommand,
  SetConnectionStrokeWeightCommand,
  InsertElementsCommand,
  QuickAddNodeCommand,
  buildDeleteSelectionCommand,
  buildSetNodesColorCommand,
  buildSetConnectionsColorCommand,
  buildSetConnectionsArrowheadCommand,
  buildSetConnectionsStrokePatternCommand,
  buildSetConnectionsStrokeWeightCommand,
  buildAlignSelectionCommand,
  buildDistributeSelectionCommand,
  buildTidyUpCommand,
} from './commands';

describe('Commands', () => {
  let graphService: GraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    graphService = TestBed.inject(GraphService);
  });

  describe('CreateNodeCommand', () => {
    it('execute creates node', () => {
      const cmd = new CreateNodeCommand(graphService, 'Test Node', 100, 200);

      expect(graphService.nodes().length).toBe(0);
      cmd.execute();

      expect(graphService.nodes().length).toBe(1);
      const node = graphService.nodes()[0];
      expect(node.text).toEqual(textFromString('Test Node'));
      expect(node.x).toBe(100);
      expect(node.y).toBe(200);
    });

    it('undo removes node', () => {
      const cmd = new CreateNodeCommand(graphService, 'Test', 0, 0);
      cmd.execute();

      expect(graphService.nodes().length).toBe(1);
      const nodeId = graphService.nodes()[0].id;

      cmd.undo();
      expect(graphService.nodes().length).toBe(0);
    });

    it('getNode returns the created node', () => {
      const cmd = new CreateNodeCommand(graphService, 'Test', 0, 0);
      expect(cmd.getNode()).toBeNull();

      cmd.execute();
      const node = cmd.getNode();
      expect(node).not.toBeNull();
      expect(node!.text).toEqual(textFromString('Test'));
    });
  });

  describe('MoveNodeCommand', () => {
    it('execute moves node', () => {
      const node = graphService.createNode('Test', 0, 0);
      const cmd = new MoveNodeCommand(graphService, node.id, 100, 200);

      cmd.execute();
      const updated = graphService.nodes().find(n => n.id === node.id);
      expect(updated?.x).toBe(100);
      expect(updated?.y).toBe(200);
    });

    it('undo restores original position', () => {
      const node = graphService.createNode('Test', 50, 75);
      const cmd = new MoveNodeCommand(graphService, node.id, 200, 300);

      cmd.execute();
      expect(graphService.nodes().find(n => n.id === node.id)?.x).toBe(200);

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === node.id)?.x).toBe(50);
      expect(graphService.nodes().find(n => n.id === node.id)?.y).toBe(75);
    });

    it('accepts explicit original position', () => {
      const node = graphService.createNode('Test', 0, 0);
      graphService.updateNodePosition(node.id, 100, 100);

      const cmd = new MoveNodeCommand(graphService, node.id, 200, 200, 0, 0);
      cmd.execute();
      expect(graphService.nodes().find(n => n.id === node.id)?.x).toBe(200);

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === node.id)?.x).toBe(0);
    });
  });

  describe('RenameNodeCommand', () => {
    it('execute renames a Group Label', () => {
      const group = graphService.createGroup('Old Label', 0, 0);
      const cmd = new RenameNodeCommand(graphService, group.id, 'New Label');

      cmd.execute();
      expect(graphService.nodes().find(n => n.id === group.id)?.label).toBe('New Label');
    });

    it('undo restores original Group Label', () => {
      const group = graphService.createGroup('Original', 0, 0);
      const cmd = new RenameNodeCommand(graphService, group.id, 'Modified');

      cmd.execute();
      expect(graphService.nodes().find(n => n.id === group.id)?.label).toBe('Modified');

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === group.id)?.label).toBe('Original');
    });
  });

  describe('SetNodeTextCommand', () => {
    const richText: Text = [
      { kind: 'paragraph', runs: [{ text: 'Title', size: 'L' }] },
      { kind: 'bullets', items: [[{ text: 'a', bold: true }], [{ text: 'b' }]] },
    ];

    it('execute replaces the node Text', () => {
      const node = graphService.createNode('Old', 0, 0);
      const cmd = new SetNodeTextCommand(graphService, node.id, richText);

      cmd.execute();
      expect(graphService.nodes().find(n => n.id === node.id)?.text).toEqual(richText);
    });

    it('undo restores the exact previous Text including formatting', () => {
      const node = graphService.createNode('N', 0, 0);
      const original: Text = [{ kind: 'paragraph', runs: [{ text: 'keep', highlight: true }] }];
      graphService.setNodeText(node.id, original);

      const cmd = new SetNodeTextCommand(graphService, node.id, richText);
      cmd.execute();
      cmd.undo();

      expect(graphService.nodes().find(n => n.id === node.id)?.text).toEqual(original);
    });

    it('redo (execute after undo) re-applies the new Text', () => {
      const node = graphService.createNode('N', 0, 0);
      const cmd = new SetNodeTextCommand(graphService, node.id, richText);

      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === node.id)?.text).toEqual(richText);
    });
  });

  describe('DeleteNodeCommand', () => {
    it('execute deletes node and connections', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      graphService.createConnection(node1.id, 'right', node2.id, 'left');

      expect(graphService.nodes().length).toBe(2);
      expect(graphService.connections().length).toBe(1);

      const cmd = new DeleteNodeCommand(graphService, node1.id);
      cmd.execute();

      expect(graphService.nodes().length).toBe(1);
      expect(graphService.connections().length).toBe(0);
    });

    it('undo restores node and connections', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      graphService.createConnection(node1.id, 'right', node2.id, 'left');

      const cmd = new DeleteNodeCommand(graphService, node1.id);
      cmd.execute();

      expect(graphService.nodes().length).toBe(1);
      expect(graphService.connections().length).toBe(0);

      cmd.undo();
      expect(graphService.nodes().length).toBe(2);
      expect(graphService.connections().length).toBe(1);

      const restored = graphService.nodes().find(n => n.id === node1.id);
      expect(restored?.text).toEqual(textFromString('Node 1'));
      expect(restored?.x).toBe(0);
      expect(restored?.y).toBe(0);
    });
  });

  describe('CreateConnectionCommand', () => {
    it('execute creates connection', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);

      const cmd = new CreateConnectionCommand(graphService, node1.id, 'right', node2.id, 'left');
      cmd.execute();

      expect(graphService.connections().length).toBe(1);
      const conn = graphService.connections()[0];
      expect(conn.sourceNodeId).toBe(node1.id);
      expect(conn.targetNodeId).toBe(node2.id);
    });

    it('undo removes connection', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);

      const cmd = new CreateConnectionCommand(graphService, node1.id, 'right', node2.id, 'left');
      cmd.execute();
      expect(graphService.connections().length).toBe(1);

      cmd.undo();
      expect(graphService.connections().length).toBe(0);
    });

    it('getConnection returns the created connection', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);

      const cmd = new CreateConnectionCommand(graphService, node1.id, 'right', node2.id, 'left');
      expect(cmd.getConnection()).toBeNull();

      cmd.execute();
      const conn = cmd.getConnection();
      expect(conn).not.toBeNull();
      expect(conn!.sourceNodeId).toBe(node1.id);
    });
  });

  describe('DeleteConnectionCommand', () => {
    it('execute removes connection', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');

      expect(graphService.connections().length).toBe(1);

      const cmd = new DeleteConnectionCommand(graphService, conn!.id);
      cmd.execute();

      expect(graphService.connections().length).toBe(0);
    });

    it('undo restores connection', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');

      const cmd = new DeleteConnectionCommand(graphService, conn!.id);
      cmd.execute();
      expect(graphService.connections().length).toBe(0);

      cmd.undo();
      expect(graphService.connections().length).toBe(1);

      const restored = graphService.connections()[0];
      expect(restored.id).toBe(conn!.id);
      expect(restored.sourceNodeId).toBe(node1.id);
      expect(restored.targetNodeId).toBe(node2.id);
    });

    it('undo preserves the Connection Text', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');
      graphService.setConnectionText(conn!.id, textFromString('depends on'));

      const cmd = new DeleteConnectionCommand(graphService, conn!.id);
      cmd.execute();
      cmd.undo();

      expect(graphService.connections()[0].text).toEqual(textFromString('depends on'));
    });
  });

  describe('SetConnectionTextCommand', () => {
    const richText: Text = [{ kind: 'paragraph', runs: [{ text: 'new', italic: true }] }];

    it('execute sets the Text', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');

      const cmd = new SetConnectionTextCommand(graphService, conn!.id, richText);
      cmd.execute();

      expect(graphService.connections()[0].text).toEqual(richText);
    });

    it('undo restores the exact previous Text', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');
      const original: Text = [{ kind: 'paragraph', runs: [{ text: 'old', bold: true }] }];
      graphService.setConnectionText(conn!.id, original);

      const cmd = new SetConnectionTextCommand(graphService, conn!.id, richText);
      cmd.execute();
      expect(graphService.connections()[0].text).toEqual(richText);

      cmd.undo();
      expect(graphService.connections()[0].text).toEqual(original);
    });

    it('undo restores "no Text" when the Connection had none', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');

      const cmd = new SetConnectionTextCommand(graphService, conn!.id, richText);
      cmd.execute();
      cmd.undo();

      expect('text' in graphService.connections()[0]).toBe(false);
    });

    it('redo (execute after undo) re-applies the Text', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');
      graphService.setConnectionText(conn!.id, textFromString('old'));

      const cmd = new SetConnectionTextCommand(graphService, conn!.id, richText);
      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.connections()[0].text).toEqual(richText);
    });

    it('execute with null removes the Text; undo restores it', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');
      graphService.setConnectionText(conn!.id, textFromString('depends on'));

      const cmd = new SetConnectionTextCommand(graphService, conn!.id, null);
      cmd.execute();
      expect('text' in graphService.connections()[0]).toBe(false);

      cmd.undo();
      expect(graphService.connections()[0].text).toEqual(textFromString('depends on'));
    });

    it('undoing a clear restores the Text at its exact previous position', () => {
      const node1 = graphService.createNode('Node 1', 0, 0);
      const node2 = graphService.createNode('Node 2', 100, 0);
      const conn = graphService.createConnection(node1.id, 'right', node2.id, 'left');
      graphService.setConnectionText(conn!.id, textFromString('depends on'));
      graphService.setConnectionTextPosition(conn!.id, 0.8);

      const cmd = new SetConnectionTextCommand(graphService, conn!.id, null);
      cmd.execute();
      expect('textPosition' in graphService.connections()[0]).toBe(false);

      cmd.undo();
      expect(graphService.connections()[0].text).toEqual(textFromString('depends on'));
      expect(graphService.connections()[0].textPosition).toBe(0.8);
    });
  });

  describe('MoveConnectionTextCommand', () => {
    function makeAnnotatedConn() {
      const n1 = graphService.createNode('N1', 0, 0);
      const n2 = graphService.createNode('N2', 100, 0);
      const conn = graphService.createConnection(n1.id, 'right', n2.id, 'left')!;
      graphService.setConnectionText(conn.id, textFromString('depends on'));
      return conn;
    }

    it('execute moves the Text; undo restores the midpoint default (absent)', () => {
      const conn = makeAnnotatedConn();

      const cmd = new MoveConnectionTextCommand(graphService, conn.id, 0.8);
      cmd.execute();
      expect(graphService.connections()[0].textPosition).toBe(0.8);

      cmd.undo();
      expect('textPosition' in graphService.connections()[0]).toBe(false);
    });

    it('undo restores the exact previous stored position', () => {
      const conn = makeAnnotatedConn();
      graphService.setConnectionTextPosition(conn.id, 0.3);

      const cmd = new MoveConnectionTextCommand(graphService, conn.id, 0.8);
      cmd.execute();
      cmd.undo();

      expect(graphService.connections()[0].textPosition).toBe(0.3);
    });

    it('a move ending snapped at the midpoint stores nothing; undo restores the old position', () => {
      const conn = makeAnnotatedConn();
      graphService.setConnectionTextPosition(conn.id, 0.3);

      const cmd = new MoveConnectionTextCommand(graphService, conn.id, 0.5);
      cmd.execute();
      expect('textPosition' in graphService.connections()[0]).toBe(false);

      cmd.undo();
      expect(graphService.connections()[0].textPosition).toBe(0.3);
    });

    it('redo (execute after undo) re-applies the move', () => {
      const conn = makeAnnotatedConn();

      const cmd = new MoveConnectionTextCommand(graphService, conn.id, 0.8);
      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.connections()[0].textPosition).toBe(0.8);
    });

    it('accepts an explicit original position for drags applied transiently before the push', () => {
      const conn = makeAnnotatedConn();
      // Transient drag already moved the Text; the command is pushed without execute
      graphService.setConnectionTextPosition(conn.id, 0.8);

      const cmd = new MoveConnectionTextCommand(graphService, conn.id, 0.8, 0.3);
      cmd.undo();

      expect(graphService.connections()[0].textPosition).toBe(0.3);
    });
  });

  describe('Reroute Point Commands', () => {
    function makeConnection() {
      const n1 = graphService.createNode('N1', 0, 0);
      const n2 = graphService.createNode('N2', 300, 0);
      const conn = graphService.createConnection(n1.id, 'right', n2.id, 'left')!;
      graphService.setConnectionReroutePoints(conn.id, [{ x: 100, y: 120 }, { x: 220, y: -20 }]);
      return conn;
    }

    it('adds, undoes, and redoes a point at the requested route index', () => {
      const conn = makeConnection();
      const cmd = new AddConnectionReroutePointCommand(graphService, conn.id, { x: 160, y: 80 }, 1);

      cmd.execute();
      expect(graphService.connections()[0].reroutePoints).toEqual([
        { x: 100, y: 120 }, { x: 160, y: 80 }, { x: 220, y: -20 },
      ]);
      cmd.undo();
      expect(graphService.connections()[0].reroutePoints).toEqual([
        { x: 100, y: 120 }, { x: 220, y: -20 },
      ]);
      cmd.execute();
      expect(graphService.connections()[0].reroutePoints?.length).toBe(3);
    });

    it('moves one point and restores the full prior route on undo', () => {
      const conn = makeConnection();
      const original = graphService.connections()[0].reroutePoints!;
      const cmd = new MoveConnectionReroutePointCommand(
        graphService, conn.id, 1, { x: 250, y: 50 }, original,
      );

      graphService.setConnectionReroutePoints(conn.id, [{ x: 100, y: 120 }, { x: 250, y: 50 }]);
      cmd.undo();
      expect(graphService.connections()[0].reroutePoints).toEqual(original);
      cmd.execute();
      expect(graphService.connections()[0].reroutePoints?.[1]).toEqual({ x: 250, y: 50 });
    });

    it('removes a point and undo restores its route order', () => {
      const conn = makeConnection();
      const cmd = new RemoveConnectionReroutePointCommand(graphService, conn.id, 0);

      cmd.execute();
      expect(graphService.connections()[0].reroutePoints).toEqual([{ x: 220, y: -20 }]);
      cmd.undo();
      expect(graphService.connections()[0].reroutePoints).toEqual([
        { x: 100, y: 120 }, { x: 220, y: -20 },
      ]);
    });
  });

  describe('SetConnectionColorCommand', () => {
    function makeConn() {
      const n1 = graphService.createNode('N1', 0, 0);
      const n2 = graphService.createNode('N2', 100, 0);
      return graphService.createConnection(n1.id, 'right', n2.id, 'left')!;
    }

    it('execute applies the color, undo restores the previous one', () => {
      const conn = makeConn();
      graphService.setConnectionColor(conn.id, NODE_PALETTE[1]);

      const cmd = new SetConnectionColorCommand(graphService, conn.id, NODE_PALETTE[3]);
      cmd.execute();
      expect(graphService.connections()[0].color).toBe(NODE_PALETTE[3]);

      cmd.undo();
      expect(graphService.connections()[0].color).toBe(NODE_PALETTE[1]);
    });

    it('undo removes the color when there was none', () => {
      const conn = makeConn();

      const cmd = new SetConnectionColorCommand(graphService, conn.id, NODE_PALETTE[0]);
      cmd.execute();
      cmd.undo();

      expect(graphService.connections()[0].color).toBeUndefined();
    });

    it('redo (execute after undo) re-applies the color', () => {
      const conn = makeConn();

      const cmd = new SetConnectionColorCommand(graphService, conn.id, NODE_PALETTE[2]);
      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.connections()[0].color).toBe(NODE_PALETTE[2]);
    });
  });

  describe('SetConnectionArrowheadCommand', () => {
    function makeConn() {
      const n1 = graphService.createNode('N1', 0, 0);
      const n2 = graphService.createNode('N2', 100, 0);
      return graphService.createConnection(n1.id, 'right', n2.id, 'left')!;
    }

    it('execute sets the end Arrowhead, undo restores the default', () => {
      const conn = makeConn();

      const cmd = new SetConnectionArrowheadCommand(graphService, conn.id, 'end', 'triangle');
      cmd.execute();
      expect(graphService.connections()[0].endArrowhead).toBe('triangle');

      cmd.undo();
      // The end default is 'arrow', so undo removes the field
      expect('endArrowhead' in graphService.connections()[0]).toBe(false);
    });

    it('undo restores a previously stored non-default value', () => {
      const conn = makeConn();
      graphService.setConnectionArrowhead(conn.id, 'start', 'arrow');

      const cmd = new SetConnectionArrowheadCommand(graphService, conn.id, 'start', 'triangle');
      cmd.execute();
      expect(graphService.connections()[0].startArrowhead).toBe('triangle');

      cmd.undo();
      expect(graphService.connections()[0].startArrowhead).toBe('arrow');
    });

    it('setting the end to explicit none is undoable back to the arrow default', () => {
      const conn = makeConn();

      const cmd = new SetConnectionArrowheadCommand(graphService, conn.id, 'end', 'none');
      cmd.execute();
      expect(graphService.connections()[0].endArrowhead).toBe('none');

      cmd.undo();
      expect('endArrowhead' in graphService.connections()[0]).toBe(false);
    });
  });

  describe('SetConnectionStrokePatternCommand / SetConnectionStrokeWeightCommand', () => {
    function makeConn() {
      const n1 = graphService.createNode('N1', 0, 0);
      const n2 = graphService.createNode('N2', 100, 0);
      return graphService.createConnection(n1.id, 'right', n2.id, 'left')!;
    }

    it('execute sets the Stroke Pattern, undo removes the field back to the solid default', () => {
      const conn = makeConn();

      const cmd = new SetConnectionStrokePatternCommand(graphService, conn.id, 'dashed');
      cmd.execute();
      expect(graphService.connections()[0].strokePattern).toBe('dashed');

      cmd.undo();
      expect('strokePattern' in graphService.connections()[0]).toBe(false);
    });

    it('undo restores a previously stored non-default pattern', () => {
      const conn = makeConn();
      graphService.setConnectionStrokePattern(conn.id, 'dotted');

      const cmd = new SetConnectionStrokePatternCommand(graphService, conn.id, 'dashed');
      cmd.execute();
      expect(graphService.connections()[0].strokePattern).toBe('dashed');

      cmd.undo();
      expect(graphService.connections()[0].strokePattern).toBe('dotted');
    });

    it('redo (execute after undo) re-applies the pattern', () => {
      const conn = makeConn();

      const cmd = new SetConnectionStrokePatternCommand(graphService, conn.id, 'dotted');
      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.connections()[0].strokePattern).toBe('dotted');
    });

    it('execute sets the Stroke Weight, undo removes the field back to the normal default', () => {
      const conn = makeConn();

      const cmd = new SetConnectionStrokeWeightCommand(graphService, conn.id, 'thick');
      cmd.execute();
      expect(graphService.connections()[0].strokeWeight).toBe('thick');

      cmd.undo();
      expect('strokeWeight' in graphService.connections()[0]).toBe(false);
    });

    it('undo restores a previously stored non-default weight', () => {
      const conn = makeConn();
      graphService.setConnectionStrokeWeight(conn.id, 'thin');

      const cmd = new SetConnectionStrokeWeightCommand(graphService, conn.id, 'thick');
      cmd.execute();
      expect(graphService.connections()[0].strokeWeight).toBe('thick');

      cmd.undo();
      expect(graphService.connections()[0].strokeWeight).toBe('thin');
    });
  });

  describe('Integration', () => {
    it('Create node → Move node → Undo move → Undo create → verify empty graph', () => {
      // Create node
      const createCmd = new CreateNodeCommand(graphService, 'Test', 0, 0);
      createCmd.execute();
      expect(graphService.nodes().length).toBe(1);
      const nodeId = graphService.nodes()[0].id;

      // Move node
      const moveCmd = new MoveNodeCommand(graphService, nodeId, 100, 100);
      moveCmd.execute();
      expect(graphService.nodes().find(n => n.id === nodeId)?.x).toBe(100);

      // Undo move
      moveCmd.undo();
      expect(graphService.nodes().find(n => n.id === nodeId)?.x).toBe(0);

      // Undo create
      createCmd.undo();
      expect(graphService.nodes().length).toBe(0);
      expect(graphService.connections().length).toBe(0);
    });

    it('Complex workflow: create multiple nodes and connections, delete, undo all', () => {
      // Create nodes
      const create1 = new CreateNodeCommand(graphService, 'Node 1', 0, 0);
      const create2 = new CreateNodeCommand(graphService, 'Node 2', 100, 0);
      create1.execute();
      create2.execute();

      const node1Id = graphService.nodes()[0].id;
      const node2Id = graphService.nodes()[1].id;

      // Create connection
      const createConn = new CreateConnectionCommand(graphService, node1Id, 'right', node2Id, 'left');
      createConn.execute();
      expect(graphService.connections().length).toBe(1);

      // Delete node 1 (should remove connection too)
      const deleteNode = new DeleteNodeCommand(graphService, node1Id);
      deleteNode.execute();
      expect(graphService.nodes().length).toBe(1);
      expect(graphService.connections().length).toBe(0);

      // Undo delete
      deleteNode.undo();
      expect(graphService.nodes().length).toBe(2);
      expect(graphService.connections().length).toBe(1);

      // Undo connection
      createConn.undo();
      expect(graphService.connections().length).toBe(0);

      // Undo creates
      create2.undo();
      create1.undo();
      expect(graphService.nodes().length).toBe(0);
    });
  });

  describe('CreateGroupCommand', () => {
    it('execute creates a Group, undo removes it', () => {
      const cmd = new CreateGroupCommand(graphService, 'New Group', 100, 100);

      cmd.execute();
      expect(graphService.nodes().length).toBe(1);
      expect(graphService.nodes()[0].kind).toBe('group');

      cmd.undo();
      expect(graphService.nodes().length).toBe(0);
    });
  });

  describe('CreateNodeCommand with parent', () => {
    it('creates the node already parented to the Group', () => {
      const group = graphService.createGroup('G', 0, 0);
      const cmd = new CreateNodeCommand(graphService, 'Child', 50, 50, group.id);

      cmd.execute();
      const child = graphService.nodes().find(n => n.parentId === group.id);
      expect(child).toBeDefined();
      expect(child?.text).toEqual(textFromString('Child'));
      expect(child?.parentId).toBe(group.id);

      cmd.undo();
      expect(graphService.nodes().length).toBe(1);
    });
  });

  describe('ChangeParentCommand', () => {
    it('execute joins the Group, undo restores no parent', () => {
      const group = graphService.createGroup('G', 0, 0);
      const node = graphService.createNode('N', 50, 50);
      const cmd = new ChangeParentCommand(graphService, node.id, group.id);

      cmd.execute();
      expect(graphService.nodes().find(n => n.id === node.id)?.parentId).toBe(group.id);

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === node.id)?.parentId).toBeUndefined();
    });

    it('undo restores the previous Group', () => {
      const g1 = graphService.createGroup('G1', 0, 0);
      const g2 = graphService.createGroup('G2', 800, 0);
      const node = graphService.createNode('N', 50, 50);
      graphService.setNodeParent(node.id, g1.id);

      const cmd = new ChangeParentCommand(graphService, node.id, g2.id);
      cmd.execute();
      expect(graphService.nodes().find(n => n.id === node.id)?.parentId).toBe(g2.id);

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === node.id)?.parentId).toBe(g1.id);
    });
  });

  describe('MoveGroupCommand', () => {
    it('execute moves Group and children rigidly, undo restores both', () => {
      const group = graphService.createGroup('G', 100, 100);
      const child = graphService.createNode('C', 150, 150);
      graphService.setNodeParent(child.id, group.id);

      const cmd = new MoveGroupCommand(graphService, group.id, 300, 250, 100, 100);
      cmd.execute();
      expect(graphService.nodes().find(n => n.id === child.id)).toMatchObject({ x: 350, y: 300 });

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === group.id)).toMatchObject({ x: 100, y: 100 });
      expect(graphService.nodes().find(n => n.id === child.id)).toMatchObject({ x: 150, y: 150 });
    });
  });

  describe('ResizeNodeCommand', () => {
    it('execute applies the new rect, undo restores the original', () => {
      const node = graphService.createNode('N', 10, 20);
      const cmd = new ResizeNodeCommand(
        graphService, node.id,
        { x: 10, y: 20, width: 300, height: 90 },
        { x: 10, y: 20, width: 160, height: 48 },
      );

      cmd.execute();
      expect(graphService.nodes()[0]).toMatchObject({ width: 300, height: 90 });

      cmd.undo();
      expect(graphService.nodes()[0]).toMatchObject({ x: 10, y: 20, width: 160, height: 48 });
    });
  });

  describe('SetNodeColorCommand', () => {
    it('execute applies the color, undo restores the previous one', () => {
      const node = graphService.createNode('N', 0, 0);
      graphService.setNodeColor(node.id, NODE_PALETTE[1]);

      const cmd = new SetNodeColorCommand(graphService, node.id, NODE_PALETTE[3]);
      cmd.execute();
      expect(graphService.nodes()[0].color).toBe(NODE_PALETTE[3]);

      cmd.undo();
      expect(graphService.nodes()[0].color).toBe(NODE_PALETTE[1]);
    });

    it('undo removes the color when there was none', () => {
      const node = graphService.createNode('N', 0, 0);

      const cmd = new SetNodeColorCommand(graphService, node.id, NODE_PALETTE[0]);
      cmd.execute();
      cmd.undo();

      expect(graphService.nodes()[0].color).toBeUndefined();
    });
  });

  describe('CompoundCommand', () => {
    it('sever-on-entry: one undo restores position, membership, and Connections with original ids', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const node = graphService.createNode('N', 900, 900);
      const conn = graphService.createConnection(node.id, 'left', group.id, 'right')!;

      // Drop the connected node into the Group: move + sever + join as one step.
      // The move already happened transiently; the other parts are executed
      // before the compound is pushed without re-execution (canvas drop flow).
      graphService.updateNodePosition(node.id, 100, 100);
      const severPart = new DeleteConnectionCommand(graphService, conn.id);
      const parentPart = new ChangeParentCommand(graphService, node.id, group.id);
      const compound = new CompoundCommand('Move Node', [
        new MoveNodeCommand(graphService, node.id, 100, 100, 900, 900),
        severPart,
        parentPart,
      ]);
      severPart.execute();
      parentPart.execute();
      // State now matches the compound's outcome; undo must reverse all of it
      compound.undo();

      const restored = graphService.nodes().find(n => n.id === node.id);
      expect(restored).toMatchObject({ x: 900, y: 900 });
      expect(restored?.parentId).toBeUndefined();
      expect(graphService.connections().map(c => c.id)).toEqual([conn.id]);
    });

    it('redo after undo re-applies every part', () => {
      const group = graphService.createGroup('G', 0, 0, 400, 300);
      const node = graphService.createNode('N', 900, 900);
      const conn = graphService.createConnection(node.id, 'left', group.id, 'right')!;

      const compound = new CompoundCommand('Move Node', [
        new MoveNodeCommand(graphService, node.id, 100, 100),
        new DeleteConnectionCommand(graphService, conn.id),
        new ChangeParentCommand(graphService, node.id, group.id),
      ]);
      compound.execute();
      compound.undo();
      compound.execute();

      const moved = graphService.nodes().find(n => n.id === node.id);
      expect(moved).toMatchObject({ x: 100, y: 100 });
      expect(moved?.parentId).toBe(group.id);
      expect(graphService.connections().length).toBe(0);
    });
  });

  describe('DeleteNodeCommand with Groups', () => {
    it('undo of a Group deletion restores membership of released children', () => {
      const group = graphService.createGroup('G', 0, 0);
      const child = graphService.createNode('C', 50, 50);
      graphService.setNodeParent(child.id, group.id);

      const cmd = new DeleteNodeCommand(graphService, group.id);
      cmd.execute();
      expect(graphService.nodes().find(n => n.id === child.id)?.parentId).toBeUndefined();

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === group.id)).toBeDefined();
      expect(graphService.nodes().find(n => n.id === child.id)?.parentId).toBe(group.id);
    });
  });

  // Serves Paste, Duplicate, and Alt+drag: inserts a prepared set of elements
  // (ids already generated) and undo removes exactly that set.
  describe('InsertElementsCommand', () => {
    it('execute inserts the prepared nodes and connections and selects all of them', () => {
      const existing = graphService.createNode('Existing', 0, 0);
      const nodes = [
        { id: 'node_x_101', text: textFromString('A'), x: 10, y: 20, width: 160, height: 48 },
        { id: 'node_x_102', text: textFromString('B'), x: 300, y: 20, width: 160, height: 48 },
      ];
      const connections = [{
        id: 'conn_x_103',
        sourceNodeId: 'node_x_101', sourceHandle: 'right' as const,
        targetNodeId: 'node_x_102', targetHandle: 'left' as const,
      }];

      const cmd = new InsertElementsCommand(graphService, 'Paste', nodes, connections);
      cmd.execute();

      expect(graphService.nodes().map(n => n.id)).toEqual([existing.id, 'node_x_101', 'node_x_102']);
      expect(graphService.connections().map(c => c.id)).toEqual(['conn_x_103']);
      // The new copies become the whole Selection (ADR-0015)
      expect(graphService.selectedNodeIds()).toEqual(['node_x_101', 'node_x_102']);
      expect(graphService.selectedConnectionIds()).toEqual(['conn_x_103']);
    });

    it('undo removes exactly the inserted set and clears its selection', () => {
      const existing = graphService.createNode('Existing', 0, 0);
      const nodes = [{ id: 'node_x_201', text: textFromString('A'), x: 0, y: 0, width: 160, height: 48 }];

      const cmd = new InsertElementsCommand(graphService, 'Paste', nodes, []);
      cmd.execute();
      cmd.undo();

      expect(graphService.nodes().map(n => n.id)).toEqual([existing.id]);
      expect(graphService.selectedNodeId()).toBeNull();
    });

    it('redo re-inserts the identical elements with the same ids', () => {
      const nodes = [{ id: 'node_x_301', text: textFromString('A'), x: 5, y: 6, width: 160, height: 48 }];
      const cmd = new InsertElementsCommand(graphService, 'Duplicate', nodes, []);

      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.nodes().map(n => n.id)).toEqual(['node_x_301']);
      expect(graphService.nodes()[0]).toMatchObject({ x: 5, y: 6 });
    });

    it('undo works without a prior execute (push-without-execute pattern for Alt+drag)', () => {
      // The elements were created transiently during the drag, outside the command
      const spawned = graphService.createNode('Copy', 40, 40);
      const cmd = new InsertElementsCommand(
        graphService, 'Duplicate',
        [graphService.nodes().find(n => n.id === spawned.id)!], [],
      );

      cmd.undo();

      expect(graphService.nodes().length).toBe(0);
    });

    it('leaves unrelated selection untouched on undo', () => {
      const other = graphService.createNode('Other', 0, 0);
      const cmd = new InsertElementsCommand(
        graphService, 'Paste',
        [{ id: 'node_x_401', text: textFromString('A'), x: 0, y: 0, width: 160, height: 48 }],
        [],
      );
      cmd.execute();
      graphService.selectNode(other.id);

      cmd.undo();

      expect(graphService.selectedNodeId()).toBe(other.id);
    });
  });

  // Quick-add: dropping a connection drag in empty space spawns a connected
  // Node anchored by its incoming Handle at the drop point, one undo step.
  describe('QuickAddNodeCommand', () => {
    it('execute spawns a New Node connected from the source Handle to the opposite Handle', () => {
      const source = graphService.createNode('Source', 0, 0);
      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 400, 300);

      cmd.execute();

      expect(graphService.nodes().length).toBe(2);
      const spawned = graphService.nodes()[1];
      expect(spawned.text).toEqual(textFromString('New Node'));
      expect(spawned.width).toBe(160);
      expect(spawned.height).toBe(48);
      expect(graphService.connections()).toMatchObject([{
        sourceNodeId: source.id, sourceHandle: 'right',
        targetNodeId: spawned.id, targetHandle: 'left',
      }]);
      expect(cmd.getNodeId()).toBe(spawned.id);
    });

    it('anchors the spawned Node so its incoming Handle sits exactly at the drop point', () => {
      const source = graphService.createNode('Source', 0, 0);
      // Worked examples for a 160x48 node: left handle at (x, y+24),
      // right at (x+160, y+24), top at (x+80, y), bottom at (x+80, y+48)
      const cases = [
        { sourceHandle: 'right', targetHandle: 'left', dropX: 400, dropY: 300, expected: { x: 400, y: 276 } },
        { sourceHandle: 'left', targetHandle: 'right', dropX: -200, dropY: 300, expected: { x: -360, y: 276 } },
        { sourceHandle: 'bottom', targetHandle: 'top', dropX: 400, dropY: 300, expected: { x: 320, y: 300 } },
        { sourceHandle: 'top', targetHandle: 'bottom', dropX: 400, dropY: -100, expected: { x: 320, y: -148 } },
      ] as const;

      for (const { sourceHandle, targetHandle, dropX, dropY, expected } of cases) {
        const cmd = new QuickAddNodeCommand(graphService, source.id, sourceHandle, dropX, dropY);
        cmd.execute();
        const spawned = graphService.nodes()[graphService.nodes().length - 1];
        expect({ x: spawned.x, y: spawned.y }).toEqual(expected);
        expect(graphService.connections()[graphService.connections().length - 1]).toMatchObject({
          sourceHandle, targetNodeId: spawned.id, targetHandle,
        });
      }
    });

    it('execute selects the spawned Node', () => {
      const source = graphService.createNode('Source', 0, 0);
      graphService.selectNode(source.id);

      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 400, 300);
      cmd.execute();

      expect(graphService.selectedNodeId()).toBe(cmd.getNodeId());
    });

    it('undo removes the spawned Node and its Connection as one step and clears its selection', () => {
      const source = graphService.createNode('Source', 0, 0);
      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 400, 300);
      cmd.execute();

      cmd.undo();

      expect(graphService.nodes().map(n => n.id)).toEqual([source.id]);
      expect(graphService.connections().length).toBe(0);
      expect(graphService.selectedNodeId()).toBeNull();
    });

    it('undo leaves an unrelated selection untouched', () => {
      const source = graphService.createNode('Source', 0, 0);
      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 400, 300);
      cmd.execute();
      graphService.selectNode(source.id);

      cmd.undo();

      expect(graphService.selectedNodeId()).toBe(source.id);
    });

    it('redo re-spawns the Node and Connection and re-selects the Node', () => {
      const source = graphService.createNode('Source', 0, 0);
      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 400, 300);

      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(graphService.nodes().length).toBe(2);
      expect(graphService.connections().length).toBe(1);
      expect(graphService.selectedNodeId()).toBe(cmd.getNodeId());
    });

    it('a drop inside a Group parents the spawned Node into it', () => {
      const source = graphService.createNode('Source', 0, 0);
      const group = graphService.createGroup('Group', 400, 100); // 320x200 bounds

      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 450, 200);
      cmd.execute();

      const spawned = graphService.nodes().find(n => n.id === cmd.getNodeId());
      expect(spawned?.parentId).toBe(group.id);
      expect(graphService.connections().length).toBe(1);
    });

    it('undo removes a Group-parented spawn and its Connection in one step', () => {
      const source = graphService.createNode('Source', 0, 0);
      const group = graphService.createGroup('Group', 400, 100);
      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 450, 200);
      cmd.execute();

      cmd.undo();

      expect(graphService.nodes().map(n => n.id)).toEqual([source.id, group.id]);
      expect(graphService.connections().length).toBe(0);
    });

    it('the topmost-rendered Group claims an overlapping drop point', () => {
      const source = graphService.createNode('Source', 0, 0);
      graphService.createGroup('Under', 400, 100);
      const top = graphService.createGroup('Over', 500, 150); // later in the array

      const cmd = new QuickAddNodeCommand(graphService, source.id, 'right', 550, 200);
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === cmd.getNodeId())?.parentId).toBe(top.id);
    });

    it('dragging from a Group into its own bounds spawns unparented but still connected', () => {
      const group = graphService.createGroup('Group', 400, 100);

      const cmd = new QuickAddNodeCommand(graphService, group.id, 'bottom', 450, 200);
      cmd.execute();

      const spawned = graphService.nodes().find(n => n.id === cmd.getNodeId());
      expect(spawned?.parentId).toBeUndefined();
      expect(graphService.connections()).toMatchObject([{
        sourceNodeId: group.id, sourceHandle: 'bottom',
        targetNodeId: spawned!.id, targetHandle: 'top',
      }]);
    });

    it('dragging from a child dropped inside its Group parents and connects', () => {
      const group = graphService.createGroup('Group', 400, 100);
      const child = graphService.createNode('Child', 420, 120);
      graphService.setNodeParent(child.id, group.id);

      const cmd = new QuickAddNodeCommand(graphService, child.id, 'right', 600, 250);
      cmd.execute();

      const spawned = graphService.nodes().find(n => n.id === cmd.getNodeId());
      expect(spawned?.parentId).toBe(group.id);
      expect(graphService.connections()).toMatchObject([{
        sourceNodeId: child.id, targetNodeId: spawned!.id,
      }]);
    });
  });

  // Selection-scale factories (ADR-0015): one compound Command per bulk
  // operation, null when nothing would change.
  describe('buildDeleteSelectionCommand', () => {
    it('deletes Nodes and explicitly selected Connections as one undo step, restoring original ids', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c = graphService.createNode('C', 600, 0);
      const ab = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      const bc = graphService.createConnection(b.id, 'right', c.id, 'left')!;

      // b and the b→c Connection are selected; a and c stay
      const cmd = buildDeleteSelectionCommand(graphService, [b.id], [bc.id])!;
      cmd.execute();

      expect(graphService.nodes().map(n => n.id)).toEqual([a.id, c.id]);
      // b's cascade removed ab; bc was deleted explicitly first
      expect(graphService.connections()).toEqual([]);

      cmd.undo();
      expect(graphService.nodes().map(n => n.id).sort()).toEqual([a.id, b.id, c.id].sort());
      expect(graphService.connections().map(cn => cn.id).sort()).toEqual([ab.id, bc.id].sort());
    });

    it('removes a selected Group WITH its children (multi-delete divergence from single Delete)', () => {
      const group = graphService.createGroup('G', 0, 0);
      const child = graphService.createNode('C', 40, 40);
      graphService.setNodeParent(child.id, group.id);
      const loose = graphService.createNode('L', 600, 0);

      const cmd = buildDeleteSelectionCommand(graphService, [group.id, loose.id], [])!;
      cmd.execute();

      expect(graphService.nodes()).toEqual([]);

      cmd.undo();
      expect(graphService.nodes().map(n => n.id).sort()).toEqual([group.id, child.id, loose.id].sort());
      expect(graphService.nodes().find(n => n.id === child.id)?.parentId).toBe(group.id);
    });

    it('returns null for an empty Selection', () => {
      expect(buildDeleteSelectionCommand(graphService, [], [])).toBeNull();
    });
  });

  describe('buildSetNodesColorCommand', () => {
    it('recolors all given Nodes as one undo step, skipping ones already carrying the color', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      graphService.setNodeColor(b.id, NODE_PALETTE[0]);

      const cmd = buildSetNodesColorCommand(graphService, [a.id, b.id], NODE_PALETTE[0])!;
      cmd.execute();

      expect(graphService.nodes().map(n => n.color)).toEqual([NODE_PALETTE[0], NODE_PALETTE[0]]);

      cmd.undo();
      // a reverts to default; b keeps its pre-existing color (it was a no-op part)
      expect(graphService.nodes().find(n => n.id === a.id)?.color).toBeUndefined();
      expect(graphService.nodes().find(n => n.id === b.id)?.color).toBe(NODE_PALETTE[0]);
    });

    it('returns null when every Node already carries the color', () => {
      const a = graphService.createNode('A', 0, 0);
      graphService.setNodeColor(a.id, NODE_PALETTE[1]);

      expect(buildSetNodesColorCommand(graphService, [a.id], NODE_PALETTE[1])).toBeNull();
    });
  });

  describe('buildSetConnectionsColorCommand', () => {
    it('recolors all given Connections as one undo step', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      const c2 = graphService.createConnection(a.id, 'top', b.id, 'top')!;

      const cmd = buildSetConnectionsColorCommand(graphService, [c1.id, c2.id], NODE_PALETTE[2])!;
      cmd.execute();
      expect(graphService.connections().map(cn => cn.color)).toEqual([NODE_PALETTE[2], NODE_PALETTE[2]]);

      cmd.undo();
      expect(graphService.connections().map(cn => cn.color)).toEqual([undefined, undefined]);
    });

    it('returns null when nothing would change', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;

      expect(buildSetConnectionsColorCommand(graphService, [c1.id], null)).toBeNull();
    });
  });

  describe('buildSetConnectionsArrowheadCommand', () => {
    it('restyles one end of all given Connections as one undo step, skipping no-ops', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      const c2 = graphService.createConnection(a.id, 'top', b.id, 'top')!;
      graphService.setConnectionArrowhead(c2.id, 'end', 'triangle');

      const cmd = buildSetConnectionsArrowheadCommand(graphService, [c1.id, c2.id], 'end', 'triangle')!;
      cmd.execute();
      expect(graphService.connections().map(cn => cn.endArrowhead)).toEqual(['triangle', 'triangle']);

      cmd.undo();
      // c1 reverts to its default end arrow (absent field); c2 keeps triangle
      expect(graphService.connections().find(cn => cn.id === c1.id)?.endArrowhead).toBeUndefined();
      expect(graphService.connections().find(cn => cn.id === c2.id)?.endArrowhead).toBe('triangle');
    });

    it('returns null when every Connection already shows the type', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;

      // 'arrow' is the effective default at the end — already showing
      expect(buildSetConnectionsArrowheadCommand(graphService, [c1.id], 'end', 'arrow')).toBeNull();
    });
  });

  describe('buildSetConnectionsStrokePatternCommand / buildSetConnectionsStrokeWeightCommand', () => {
    it('restyles the pattern of all given Connections as one undo step, skipping no-ops', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      const c2 = graphService.createConnection(a.id, 'top', b.id, 'top')!;
      graphService.setConnectionStrokePattern(c2.id, 'dashed');

      const cmd = buildSetConnectionsStrokePatternCommand(graphService, [c1.id, c2.id], 'dashed')!;
      cmd.execute();
      expect(graphService.connections().map(cn => cn.strokePattern)).toEqual(['dashed', 'dashed']);

      cmd.undo();
      // c1 reverts to its solid default (absent field); c2 keeps dashed
      expect(graphService.connections().find(cn => cn.id === c1.id)?.strokePattern).toBeUndefined();
      expect(graphService.connections().find(cn => cn.id === c2.id)?.strokePattern).toBe('dashed');
    });

    it('returns null when every Connection already shows the pattern', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;

      // 'solid' is the effective default — already showing
      expect(buildSetConnectionsStrokePatternCommand(graphService, [c1.id], 'solid')).toBeNull();
    });

    it('restyles the weight of all given Connections as one undo step, skipping no-ops', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;
      const c2 = graphService.createConnection(a.id, 'top', b.id, 'top')!;
      graphService.setConnectionStrokeWeight(c2.id, 'thick');

      const cmd = buildSetConnectionsStrokeWeightCommand(graphService, [c1.id, c2.id], 'thick')!;
      cmd.execute();
      expect(graphService.connections().map(cn => cn.strokeWeight)).toEqual(['thick', 'thick']);

      cmd.undo();
      expect(graphService.connections().find(cn => cn.id === c1.id)?.strokeWeight).toBeUndefined();
      expect(graphService.connections().find(cn => cn.id === c2.id)?.strokeWeight).toBe('thick');
    });

    it('returns null when every Connection already shows the weight', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);
      const c1 = graphService.createConnection(a.id, 'right', b.id, 'left')!;

      expect(buildSetConnectionsStrokeWeightCommand(graphService, [c1.id], 'normal')).toBeNull();
    });
  });

  describe('buildAlignSelectionCommand', () => {
    it('aligns loose Nodes to the union left as one undo step, skipping the extreme', () => {
      // Default 160x48 Nodes: union left is b's 50; only a moves
      const a = graphService.createNode('A', 100, 100);
      const b = graphService.createNode('B', 50, 200);

      const cmd = buildAlignSelectionCommand(graphService, [a.id, b.id], 'left')!;
      expect(cmd.description).toBe('Align left');
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === a.id)).toMatchObject({ x: 50, y: 100 });
      expect(graphService.nodes().find(n => n.id === b.id)).toMatchObject({ x: 50, y: 200 });

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === a.id)).toMatchObject({ x: 100, y: 100 });
    });

    it('moves a Group rigidly with its children and restores both on undo', () => {
      const group = graphService.createGroup('G', 200, 300); // 320x200
      const child = graphService.createNode('C', 250, 350);
      graphService.setNodeParent(child.id, group.id);
      const loose = graphService.createNode('L', 0, 0);

      // Union top is loose's 0 → the Group shifts up by 300, child riding along
      const cmd = buildAlignSelectionCommand(graphService, [group.id, loose.id], 'top')!;
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === group.id)).toMatchObject({ x: 200, y: 0 });
      expect(graphService.nodes().find(n => n.id === child.id)).toMatchObject({ x: 250, y: 50 });
      expect(graphService.nodes().find(n => n.id === loose.id)).toMatchObject({ x: 0, y: 0 });

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === group.id)).toMatchObject({ x: 200, y: 300 });
      expect(graphService.nodes().find(n => n.id === child.id)).toMatchObject({ x: 250, y: 350 });
    });

    it('excludes children of a selected Group from the participants', () => {
      const group = graphService.createGroup('G', 0, 0); // leftmost already
      const child = graphService.createNode('C', 10, 10);
      graphService.setNodeParent(child.id, group.id);
      const loose = graphService.createNode('L', 400, 300);

      // The child id rides along in the Selection but is not a root: it must
      // neither move on its own nor drag the union box with it
      const cmd = buildAlignSelectionCommand(graphService, [group.id, child.id, loose.id], 'left')!;
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === child.id)).toMatchObject({ x: 10, y: 10 });
      expect(graphService.nodes().find(n => n.id === loose.id)).toMatchObject({ x: 0, y: 300 });
    });

    it('returns null when every root is already aligned', () => {
      const a = graphService.createNode('A', 40, 0);
      const b = graphService.createNode('B', 40, 100);

      expect(buildAlignSelectionCommand(graphService, [a.id, b.id], 'left')).toBeNull();
    });

    it('returns null for fewer than two roots', () => {
      const a = graphService.createNode('A', 0, 0);

      expect(buildAlignSelectionCommand(graphService, [a.id], 'left')).toBeNull();
      expect(buildAlignSelectionCommand(graphService, [], 'left')).toBeNull();
    });
  });

  describe('buildDistributeSelectionCommand', () => {
    it('equalizes horizontal gaps as one undo step, anchoring the extremes', () => {
      // Default 160-wide Nodes at 0/190/500: anchors a and b, gap
      // (500 − 160 − 160) / 2 = 90 → c moves to 160 + 90 = 250
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 500, 0);
      const c = graphService.createNode('C', 190, 0);

      const cmd = buildDistributeSelectionCommand(graphService, [a.id, b.id, c.id], 'horizontal')!;
      expect(cmd.description).toBe('Distribute horizontally');
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === c.id)).toMatchObject({ x: 250, y: 0 });
      expect(graphService.nodes().find(n => n.id === a.id)).toMatchObject({ x: 0 });
      expect(graphService.nodes().find(n => n.id === b.id)).toMatchObject({ x: 500 });

      cmd.undo();
      expect(graphService.nodes().find(n => n.id === c.id)).toMatchObject({ x: 190, y: 0 });
    });

    it('returns null for fewer than three roots', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 300, 0);

      expect(buildDistributeSelectionCommand(graphService, [a.id, b.id], 'horizontal')).toBeNull();
    });

    it('returns null when the gaps are already equal', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 200, 0);
      const c = graphService.createNode('C', 400, 0);

      expect(buildDistributeSelectionCommand(graphService, [a.id, b.id, c.id], 'horizontal')).toBeNull();
    });
  });

  // Behavior-only, through execute()/undo() (spec #26, ADR-0019): the layout
  // geometry itself is the tidy-layout module's spec — here we assert the
  // Command applies and restores positions, Group rects, and Handle fields.
  describe('buildTidyUpCommand', () => {
    it('execute moves Nodes into the layered flow and re-picks Handles as one step', () => {
      // Chain a→b drawn vertically with top→top Handles: tidy lays it
      // left-to-right (b one layer right of a) and turns the Handles to face
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 10, 300);
      const conn = graphService.createConnection(a.id, 'top', b.id, 'top')!;

      const cmd = buildTidyUpCommand(graphService)!;
      expect(cmd.description).toBe('Tidy up');
      cmd.execute();

      expect(graphService.nodes().find(n => n.id === a.id)).toMatchObject({ x: 0, y: 0 });
      expect(graphService.nodes().find(n => n.id === b.id)).toMatchObject({ x: 280, y: 0 });
      expect(graphService.connections().find(c => c.id === conn.id)).toMatchObject({
        sourceHandle: 'right',
        targetHandle: 'left',
      });
    });

    it('execute resizes a Group to exact fit around its tidied children', () => {
      const group = graphService.createGroup('G', 500, 500);
      const child = graphService.createNode('C', 510, 510);
      graphService.setNodeParent(child.id, group.id);

      buildTidyUpCommand(graphService)!.execute();

      // Old bounds top-left is (500,500); the lone child sits at the content
      // origin (16 in, below the 28-unit label strip + 16 padding), and the
      // Group wraps it exactly: 160+32 x 28+48+32
      expect(graphService.nodes().find(n => n.id === group.id)).toMatchObject({
        x: 500, y: 500, width: 192, height: 108,
      });
      expect(graphService.nodes().find(n => n.id === child.id)).toMatchObject({ x: 516, y: 544 });
    });

    it('undo restores positions, Group rects, and Handles exactly, ids untouched', () => {
      const a = graphService.createNode('A', 40, 700);
      const b = graphService.createNode('B', 10, 300);
      graphService.createConnection(a.id, 'bottom', b.id, 'bottom');
      const group = graphService.createGroup('G', 900, 0);
      const child = graphService.createNode('C', 950, 60);
      graphService.setNodeParent(child.id, group.id);
      const nodesBefore = structuredClone(graphService.nodes());
      const connsBefore = structuredClone(graphService.connections());

      const cmd = buildTidyUpCommand(graphService)!;
      cmd.execute();
      expect(graphService.nodes()).not.toEqual(nodesBefore);
      cmd.undo();

      expect(graphService.nodes()).toEqual(nodesBefore);
      expect(graphService.connections()).toEqual(connsBefore);
    });

    it('redo reapplies the identical tidy', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 10, 300);
      graphService.createConnection(a.id, 'top', b.id, 'top');

      const cmd = buildTidyUpCommand(graphService)!;
      cmd.execute();
      const tidied = structuredClone(graphService.nodes());
      const tidiedConns = structuredClone(graphService.connections());
      cmd.undo();
      cmd.execute();

      expect(graphService.nodes()).toEqual(tidied);
      expect(graphService.connections()).toEqual(tidiedConns);
    });

    it('returns null for an empty graph and for an already-tidy graph', () => {
      expect(buildTidyUpCommand(graphService)).toBeNull();

      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 10, 300);
      graphService.createConnection(a.id, 'top', b.id, 'top');
      buildTidyUpCommand(graphService)!.execute();

      expect(buildTidyUpCommand(graphService)).toBeNull();
    });

    it('re-picking Handles preserves Arrowheads, color, and Text untouched', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 10, 300);
      const conn = graphService.createConnection(a.id, 'top', b.id, 'top')!;
      graphService.setConnectionArrowhead(conn.id, 'start', 'triangle');
      graphService.setConnectionArrowhead(conn.id, 'end', 'none');
      graphService.setConnectionColor(conn.id, NODE_PALETTE[2]);
      graphService.setConnectionText(conn.id, textFromString('label'));

      buildTidyUpCommand(graphService)!.execute();

      // Handles turn to face the flow; every other Connection field rides along
      expect(graphService.connections().find(c => c.id === conn.id)).toMatchObject({
        sourceHandle: 'right',
        targetHandle: 'left',
        startArrowhead: 'triangle',
        endArrowhead: 'none',
        color: NODE_PALETTE[2],
        text: textFromString('label'),
      });
    });

    it('neither execute nor undo touches the Selection', () => {
      const a = graphService.createNode('A', 0, 0);
      const b = graphService.createNode('B', 10, 300);
      const conn = graphService.createConnection(a.id, 'top', b.id, 'top')!;
      graphService.setSelection([a.id], [conn.id]);

      const cmd = buildTidyUpCommand(graphService)!;
      cmd.execute();
      expect(graphService.selectedNodeIds()).toEqual([a.id]);
      expect(graphService.selectedConnectionIds()).toEqual([conn.id]);

      cmd.undo();
      expect(graphService.selectedNodeIds()).toEqual([a.id]);
      expect(graphService.selectedConnectionIds()).toEqual([conn.id]);
    });
  });
});
