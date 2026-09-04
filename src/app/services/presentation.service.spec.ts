import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { PresentationService } from './presentation.service';
import { CanvasLockService } from './canvas-lock.service';
import { GraphService } from './graph.service';
import { frameViewport } from '../models/bounds';

// The visible canvas region handed to enter() — the framing math is
// view-size-relative, so tests pass an explicit one.
const W = 1200;
const H = 800;

describe('PresentationService', () => {
  let service: PresentationService;
  let graphService: GraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PresentationService);
    graphService = TestBed.inject(GraphService);
  });

  describe('availability', () => {
    it('cannot present a graph with no Groups — enter is a silent no-op', () => {
      graphService.createNode('Loose', 0, 0);
      expect(service.canPresent()).toBe(false);
      service.enter(W, H);
      expect(service.active()).toBe(false);
    });

    it('a single childless Group is enough to present', () => {
      graphService.createGroup('Title card', 0, 0);
      expect(service.canPresent()).toBe(true);
    });
  });

  describe('enter', () => {
    it('activates at Step 1 of the reading order and targets its frame at the 2x cap', () => {
      graphService.createGroup('Second', 0, 600, 320, 200);
      const first = graphService.createGroup('First', 0, 0, 320, 200);
      service.enter(W, H);

      expect(service.active()).toBe(true);
      expect(service.stepIndex()).toBe(0);
      expect(service.stepCount()).toBe(2);
      expect(service.targetViewport()).toEqual(
        frameViewport({ x: first.x, y: first.y, width: 320, height: 200 }, W, H, 2),
      );
    });

    it('clears the Selection', () => {
      const group = graphService.createGroup('G', 0, 0);
      const node = graphService.createNode('N', 500, 500);
      graphService.setSelection([node.id], []);
      service.enter(W, H);
      expect(graphService.selectedNodeIds()).toEqual([]);
      expect(graphService.selectedConnectionIds()).toEqual([]);
      expect(group.kind).toBe('group');
    });

    it('entering while already active is a no-op', () => {
      graphService.createGroup('A', 0, 0);
      graphService.createGroup('B', 0, 600);
      service.enter(W, H);
      service.next();
      service.enter(W, H);
      expect(service.stepIndex()).toBe(1);
    });
  });

  describe('Step framing', () => {
    it('frames the Group unioned with its children, covering an overhanging child', () => {
      const group = graphService.createGroup('G', 100, 100, 320, 200);
      // A child overhanging the Group's right edge (ADR-0018 allows this)
      const child = graphService.createNode('C', 380, 150, 160, 48);
      graphService.setNodeParent(child.id, group.id);

      service.enter(W, H);
      // Union: x 100..540, y 100..300
      expect(service.targetViewport()).toEqual(
        frameViewport({ x: 100, y: 100, width: 440, height: 200 }, W, H, 2),
      );
    });

    it('ignores Connections between children — no bezier union (Zoom-to-selection contract)', () => {
      const group = graphService.createGroup('G', 0, 0, 600, 400);
      const a = graphService.createNode('A', 20, 20);
      const b = graphService.createNode('B', 400, 300);
      graphService.setNodeParent(a.id, group.id);
      graphService.setNodeParent(b.id, group.id);
      graphService.createConnection(a.id, 'top', b.id, 'bottom');

      service.enter(W, H);
      expect(service.targetViewport()).toEqual(
        frameViewport({ x: 0, y: 0, width: 600, height: 400 }, W, H, 2),
      );
    });
  });

  describe('navigation', () => {
    function threeGroups(): void {
      graphService.createGroup('C', 0, 1000, 320, 200);
      graphService.createGroup('B', 500, 0, 320, 200);
      graphService.createGroup('A', 0, 0, 320, 200);
    }

    it('next advances through the reading order, retargeting the frame', () => {
      threeGroups();
      service.enter(W, H);
      service.next();
      expect(service.stepIndex()).toBe(1);
      expect(service.targetViewport()).toEqual(
        frameViewport({ x: 500, y: 0, width: 320, height: 200 }, W, H, 2),
      );
    });

    it('previous goes back', () => {
      threeGroups();
      service.enter(W, H);
      service.next();
      service.previous();
      expect(service.stepIndex()).toBe(0);
    });

    it('advancing past the last Step is a hard no-op — no wrap, no exit', () => {
      threeGroups();
      service.enter(W, H);
      service.next();
      service.next();
      const lastTarget = service.targetViewport();
      service.next();
      expect(service.active()).toBe(true);
      expect(service.stepIndex()).toBe(2);
      expect(service.targetViewport()).toEqual(lastTarget);
    });

    it('backing before the first Step is a hard no-op', () => {
      threeGroups();
      service.enter(W, H);
      service.previous();
      expect(service.stepIndex()).toBe(0);
      expect(service.active()).toBe(true);
    });

    it('navigation while inactive does nothing', () => {
      threeGroups();
      service.next();
      expect(service.active()).toBe(false);
      expect(service.targetViewport()).toBeNull();
    });
  });

  describe('exit', () => {
    it('restores the exact pre-Present Viewport instantly and deactivates', () => {      graphService.createGroup('G', 2000, 2000);
      graphService.setViewport({ panX: -42, panY: 17, zoom: 1.3 });
      service.enter(W, H);
      service.exit();
      expect(service.active()).toBe(false);
      expect(graphService.viewportState()).toEqual({ panX: -42, panY: 17, zoom: 1.3 });
      expect(service.targetViewport()).toBeNull();
    });

    it('restores the snapshot even after free-roam moved the Viewport mid-tour', () => {
      graphService.createGroup('G', 0, 0);
      graphService.setViewport({ panX: 5, panY: 5, zoom: 2 });
      service.enter(W, H);
      // Free-roam wheel zoom / pan writes the normal Viewport signal
      graphService.setViewport({ panX: 999, panY: -999, zoom: 0.5 });
      service.exit();
      expect(graphService.viewportState()).toEqual({ panX: 5, panY: 5, zoom: 2 });
    });

    it('exit while inactive is a silent no-op', () => {
      graphService.setViewport({ panX: 1, panY: 2, zoom: 3 });
      service.exit();
      expect(graphService.viewportState()).toEqual({ panX: 1, panY: 2, zoom: 3 });
    });
  });

  describe('Canvas Lock stacking', () => {
    it('enters while locked and returns to locked on exit', () => {
      graphService.createGroup('G', 0, 0);
      const canvasLock = TestBed.inject(CanvasLockService);
      canvasLock.lock();
      try {
        service.enter(W, H);
        expect(service.active()).toBe(true);
        expect(canvasLock.locked()).toBe(true);
        service.exit();
        expect(service.active()).toBe(false);
        expect(canvasLock.locked()).toBe(true);
      } finally {
        canvasLock.unlock({ silent: true });
      }
    });
  });

  describe('connection-following order', () => {
    it('starts from the selected Group and follows outgoing Connections', () => {
      const a = graphService.createGroup('A', 0, 0);
      const b = graphService.createGroup('B', 500, 0);
      const c = graphService.createGroup('C', 0, 500);
      graphService.createConnection(a.id, 'right', c.id, 'left');
      graphService.createConnection(c.id, 'right', b.id, 'left');
      graphService.setSelection([a.id], []);
      service.enter(W, H, 'connection-following');
      expect(service.active()).toBe(true);
      expect(service.steps().map(g => g.id)).toEqual([a.id, c.id, b.id]);
      expect(graphService.selectedNodeIds()).toEqual([]);
    });

    it('starts from a non-first selected Group, appending the rest in reading order', () => {
      const a = graphService.createGroup('A', 0, 0);
      const b = graphService.createGroup('B', 500, 0);
      const c = graphService.createGroup('C', 0, 500);
      graphService.createConnection(c.id, 'right', b.id, 'left');
      graphService.setSelection([c.id], []);
      service.enter(W, H, 'connection-following');
      expect(service.steps().map(g => g.id)).toEqual([c.id, b.id, a.id]);
    });

    it('falls back to the reading-order first Group when nothing is selected', () => {
      const a = graphService.createGroup('A', 0, 0);
      const b = graphService.createGroup('B', 500, 0);
      const c = graphService.createGroup('C', 0, 500);
      graphService.createConnection(a.id, 'right', c.id, 'left');
      graphService.createConnection(c.id, 'right', b.id, 'left');
      service.enter(W, H, 'connection-following');
      expect(service.steps().map(g => g.id)).toEqual([a.id, c.id, b.id]);
    });

    it('falls back when a loose Node is selected', () => {
      const a = graphService.createGroup('A', 0, 0);
      const b = graphService.createGroup('B', 500, 0);
      const loose = graphService.createNode('L', 250, 250);
      graphService.createConnection(a.id, 'right', b.id, 'left');
      graphService.setSelection([loose.id], []);
      service.enter(W, H, 'connection-following');
      expect(service.steps().map(g => g.id)).toEqual([a.id, b.id]);
    });

    it('navigates the following order and keeps the same total as reading order', () => {
      const a = graphService.createGroup('A', 0, 0);
      const b = graphService.createGroup('B', 500, 0);
      const c = graphService.createGroup('C', 0, 500);
      graphService.createConnection(a.id, 'right', c.id, 'left');
      graphService.createConnection(c.id, 'right', b.id, 'left');
      graphService.setSelection([a.id], []);
      service.enter(W, H, 'connection-following');
      expect(service.stepCount()).toBe(3);
      service.next();
      expect(service.stepIndex()).toBe(1);
      expect(service.steps()[service.stepIndex()].id).toBe(c.id);
      service.next();
      expect(service.steps()[service.stepIndex()].id).toBe(b.id);
      service.next();
      expect(service.stepIndex()).toBe(2);
      service.exit();
      service.enter(W, H);
      expect(service.steps().map(g => g.id)).toEqual([a.id, b.id, c.id]);
    });

    it('follows child-wired Connections at the Group level', () => {
      const a = graphService.createGroup('A', 0, 0);
      const b = graphService.createGroup('B', 500, 0);
      const a1 = graphService.createNode('a1', 10, 10);
      const b1 = graphService.createNode('b1', 510, 10);
      graphService.setNodeParent(a1.id, a.id);
      graphService.setNodeParent(b1.id, b.id);
      graphService.createConnection(a1.id, 'right', b1.id, 'left');
      graphService.setSelection([a.id], []);
      service.enter(W, H, 'connection-following');
      expect(service.steps().map(g => g.id)).toEqual([a.id, b.id]);
    });
  });
});
