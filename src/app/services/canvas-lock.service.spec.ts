import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasLockService } from './canvas-lock.service';
import { GraphService } from './graph.service';
import { ToastService } from '../components/toast/toast';

describe('CanvasLockService', () => {
  let lock: CanvasLockService;
  let graph: GraphService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    lock = TestBed.inject(CanvasLockService);
    graph = TestBed.inject(GraphService);
    toast = TestBed.inject(ToastService);
  });

  it('starts unlocked with no toast', () => {
    expect(lock.locked()).toBe(false);
    expect(toast.message()).toBeNull();
  });

  it('lock clears the Selection and announces the freeze', () => {
    const node = graph.createNode('N', 0, 0);
    graph.setSelection([node.id], []);
    lock.lock();
    expect(lock.locked()).toBe(true);
    expect(graph.selectedNodeIds()).toEqual([]);
    expect(toast.message()).toBe('Canvas locked — explore only');
  });

  it('locking twice announces once', () => {
    lock.lock();
    toast.dismiss();
    lock.lock();
    expect(lock.locked()).toBe(true);
    expect(toast.message()).toBeNull();
  });

  it('unlock announces the resume', () => {
    lock.lock();
    lock.unlock();
    expect(lock.locked()).toBe(false);
    expect(toast.message()).toBe('Canvas unlocked');
  });

  it('silent unlock (Project switch) announces nothing', () => {
    lock.lock();
    toast.dismiss();
    lock.unlock({ silent: true });
    expect(lock.locked()).toBe(false);
    expect(toast.message()).toBeNull();
  });

  it('unlocking while unlocked is a silent no-op', () => {
    lock.unlock();
    expect(lock.locked()).toBe(false);
    expect(toast.message()).toBeNull();
  });

  it('toggle flips both ways with announcements', () => {
    lock.toggle();
    expect(lock.locked()).toBe(true);
    expect(toast.message()).toBe('Canvas locked — explore only');
    lock.toggle();
    expect(lock.locked()).toBe(false);
    expect(toast.message()).toBe('Canvas unlocked');
  });
});
