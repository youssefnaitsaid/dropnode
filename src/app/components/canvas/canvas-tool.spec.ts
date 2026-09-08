import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasComponent } from './canvas';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { CanvasToolService } from '../../services/canvas-tool.service';

describe('CanvasComponent tool modes', () => {
  let fixture: ComponentFixture<CanvasComponent>;
  let component: CanvasComponent;
  let graph: GraphService;
  let history: HistoryService;
  let menus: ContextMenuService;
  let tool: CanvasToolService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CanvasComponent] });
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    graph = TestBed.inject(GraphService);
    history = TestBed.inject(HistoryService);
    menus = TestBed.inject(ContextMenuService);
    tool = TestBed.inject(CanvasToolService);
    fixture.detectChanges();
  });

  it('pans on empty left-drag in Pan mode instead of arming a Marquee', () => {
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    tool.pan();

    component.onCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
    expect(component['isPanning']).toBe(true);

    component.onMouseMove(new MouseEvent('mousemove', { clientX: 130, clientY: 120 }));
    expect(graph.viewportState().panX).toBe(30);
    expect(graph.viewportState().panY).toBe(20);
    component.onMouseUp(new MouseEvent('mouseup', { clientX: 130, clientY: 120 }));
    expect(component['isPanning']).toBe(false);
    expect(graph.selectedNodeId()).toBe(node.id);
  });

  it('pans from a Node press in Pan mode instead of dragging the Node', () => {
    const node = graph.createNode('N', 0, 0);
    fixture.detectChanges();
    tool.pan();

    component.onNodeStartMove({ nodeId: node.id, event: new MouseEvent('mousedown', { button: 0 }) });
    expect(component['isPanning']).toBe(true);
    expect(component['isDraggingNode']).toBe(false);
    expect(graph.nodes()[0].x).toBe(0);
  });

  it('never starts a Connection drag in Pan mode', () => {
    const a = graph.createNode('A', 0, 0);
    tool.pan();
    component.onHandleDragStart({ nodeId: a.id, handle: 'right', event: new MouseEvent('mousedown', { button: 0 }) });
    expect(component['isDraggingConnection']).toBe(false);
  });

  it('places a Canvas-anchored Pin on empty click while armed, then reverts to Select', () => {
    tool.armPin();
    component.onCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 50, clientY: 60 }));
    const request = menus.pinCreateRequest();
    expect(request).toEqual({ kind: 'canvas', x: 50, y: 60 });
    expect(tool.tool()).toBe('select');
    expect(history.canUndo()).toBe(false);
    expect(graph.pins().length).toBe(0);
  });

  it('places a Node-anchored Pin when the armed click lands on a Node', () => {
    const node = graph.createNode('N', 40, 40);
    fixture.detectChanges();
    tool.armPin();
    component.onNodeStartMove({
      nodeId: node.id,
      event: new MouseEvent('mousedown', { button: 0, clientX: 60, clientY: 70 }),
    });
    const request = menus.pinCreateRequest();
    expect(request).toEqual({ kind: 'node', nodeId: node.id, offsetX: 20, offsetY: 30 });
    expect(tool.tool()).toBe('select');
    expect(component['isDraggingNode']).toBe(false);
  });

  it('cancels Pin arming on right-click without opening a menu', () => {
    tool.armPin();
    const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 });
    component.onContextMenu(event);
    expect(tool.tool()).toBe('select');
    expect(menus.pinCreateRequest()).toBeNull();
    expect(menus.menuKind()).toBeNull();
  });

  it('places a Node centered on the armed click with its Text editor requested', () => {
    tool.armNode();
    component.onCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 200, clientY: 200 }));
    expect(graph.nodes().length).toBe(1);
    const node = graph.nodes()[0];
    expect(node.x).toBe(120);
    expect(node.y).toBe(176);
    expect(node.width).toBe(160);
    expect(node.height).toBe(48);
    expect(history.canUndo()).toBe(true);
    expect(menus.editTextRequest()).toBe(node.id);
    expect(tool.tool()).toBe('select');
  });

  it('places a Group centered on the armed click with its Label editor requested', () => {
    tool.armGroup();
    component.onCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 200, clientY: 200 }));
    expect(graph.nodes().length).toBe(1);
    const group = graph.nodes()[0];
    expect(group.kind).toBe('group');
    expect(group.x).toBe(40);
    expect(group.y).toBe(100);
    expect(menus.renameRequest()).toBe(group.id);
    expect(history.canUndo()).toBe(true);
    expect(tool.tool()).toBe('select');
  });

  it('places a Text Block centered on the armed click with its Text editor requested', () => {
    tool.armTextBlock();
    component.onCanvasMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 200, clientY: 200 }));
    expect(graph.nodes().length).toBe(1);
    const block = graph.nodes()[0];
    expect(block.kind).toBe('annotation');
    expect(block.x).toBe(120);
    expect(block.y).toBe(176);
    expect(menus.editTextRequest()).toBe(block.id);
    expect(tool.tool()).toBe('select');
  });

  it('parents an armed Node into the Group it lands on', () => {
    const group = graph.createGroup('G', 0, 0);
    fixture.detectChanges();
    tool.armNode();
    component.onNodeStartMove({
      nodeId: group.id,
      event: new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }),
    });
    expect(graph.nodes().length).toBe(2);
    const child = graph.nodes().find(n => n.id !== group.id)!;
    expect(child.parentId).toBe(group.id);
    expect(child.x).toBe(20);
    expect(child.y).toBe(76);
    expect(tool.tool()).toBe('select');
  });

  it('never nests an armed Group even when landing on a Group', () => {
    const group = graph.createGroup('G', 0, 0);
    fixture.detectChanges();
    tool.armGroup();
    component.onNodeStartMove({
      nodeId: group.id,
      event: new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }),
    });
    const spawn = graph.nodes().find(n => n.id !== group.id)!;
    expect(spawn.kind).toBe('group');
    expect(spawn.parentId).toBeUndefined();
    expect(tool.tool()).toBe('select');
  });

  it('cancels an armed Node on right-click without creating anything', () => {
    tool.armNode();
    const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 });
    component.onContextMenu(event);
    expect(tool.tool()).toBe('select');
    expect(graph.nodes().length).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(menus.menuKind()).toBeNull();
  });

  it('shows a placement cursor while any add is armed', () => {
    const container = fixture.nativeElement.querySelector('.canvas-container') as HTMLElement;
    expect(container.classList.contains('armed')).toBe(false);
    tool.armNode();
    fixture.detectChanges();
    expect(container.classList.contains('armed')).toBe(true);
    tool.reset();
    fixture.detectChanges();
    expect(container.classList.contains('armed')).toBe(false);
  });
});
