import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyboardConnectionService } from './keyboard-connection.service';
import { GraphService } from './graph.service';
import { CanvasToolService } from './canvas-tool.service';

describe('KeyboardConnectionService Pan mode', () => {
  let service: KeyboardConnectionService;
  let graph: GraphService;
  let tool: CanvasToolService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({});
    service = TestBed.inject(KeyboardConnectionService);
    graph = TestBed.inject(GraphService);
    tool = TestBed.inject(CanvasToolService);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function hitFor(connectionId: string): void {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection-hit');
    path.setAttribute('data-connection-id', connectionId);
    document.body.appendChild(path);
  }

  it('cycles onto Connections in Select but selects nothing in Pan', () => {
    const a = graph.createNode('A', 0, 0);
    const b = graph.createNode('B', 320, 0);
    const conn = graph.createConnection(a.id, 'right', b.id, 'left')!;
    hitFor(conn.id);
    service.cycleConnections(1, false);
    expect(graph.selectedConnectionIds()).toEqual([conn.id]);
    graph.clearSelection();
    tool.pan();
    service.cycleConnections(1, false);
    expect(graph.selectedConnectionIds()).toEqual([]);
    service.cycleConnections(1, true);
    expect(graph.selectedConnectionIds()).toEqual([]);
  });
});
