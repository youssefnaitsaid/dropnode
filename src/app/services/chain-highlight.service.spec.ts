import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphService } from './graph.service';
import { ContextMenuService } from './context-menu.service';
import { ChainHighlightService } from './chain-highlight.service';

describe('ChainHighlightService', () => {
  let graphService: GraphService;
  let contextMenuService: ContextMenuService;
  let chainService: ChainHighlightService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    graphService = TestBed.inject(GraphService);
    contextMenuService = TestBed.inject(ContextMenuService);
    chainService = TestBed.inject(ChainHighlightService);
    graphService.clearGraph();
    chainService.clearHovered();
    contextMenuService.clear();
  });

  function setupChain(): { aId: string; bId: string; gId: string; connId: string } {
    const a = graphService.createNode('A', 0, 0);
    const b = graphService.createNode('B', 300, 0);
    const g = graphService.createGroup('G', 600, 0);
    const conn = graphService.createConnection(a.id, 'right', b.id, 'left')!;
    graphService.createConnection(b.id, 'right', g.id, 'left');
    return { aId: a.id, bId: b.id, gId: g.id, connId: conn.id };
  }

  it('highlights weakly-connected component on hover', () => {
    const { aId } = setupChain();
    chainService.setHovered(aId);
    expect(chainService.hasHighlight()).toBe(true);
    expect(chainService.litNodeIds().size).toBe(3);
    expect(chainService.shouldDim()).toBe(true);
  });

  it('suppresses highlight while context menu is open (canvas)', () => {
    const { aId } = setupChain();
    chainService.setHovered(aId);
    expect(chainService.hasHighlight()).toBe(true);

    contextMenuService.openFor({ kind: 'canvas' }, 10, 10);

    expect(contextMenuService.menuKind()).toBe('canvas');
    expect(chainService.isSuppressed()).toBe(true);
    expect(chainService.hasHighlight()).toBe(false);
  });

  it('resumes highlight after context menu closes (canvas)', () => {
    const { aId } = setupChain();
    chainService.setHovered(aId);
    contextMenuService.openFor({ kind: 'canvas' }, 10, 10);
    expect(chainService.isSuppressed()).toBe(true);

    contextMenuService.clear();

    expect(contextMenuService.menuKind()).toBeNull();
    expect(chainService.isSuppressed()).toBe(false);
    expect(chainService.hasHighlight()).toBe(true);
    expect(chainService.litNodeIds().has(aId)).toBe(true);
  });

  it('resumes highlight after context menu closes (node)', () => {
    const { aId } = setupChain();
    chainService.setHovered(aId);
    contextMenuService.openFor({ kind: 'node', nodeId: aId }, 10, 10);
    expect(chainService.isSuppressed()).toBe(true);

    contextMenuService.clear();

    expect(chainService.isSuppressed()).toBe(false);
    expect(chainService.hasHighlight()).toBe(true);
  });

  it('resumes highlight after context menu closes (group)', () => {
    const { gId, aId } = setupChain();
    chainService.setHovered(gId);
    // Group is part of chain, so hovering group should highlight
    expect(chainService.hasHighlight()).toBe(true);

    contextMenuService.openFor({ kind: 'node', nodeId: gId }, 10, 10);
    expect(chainService.isSuppressed()).toBe(true);

    contextMenuService.clear();

    // Hovering same group again should resume; also hovering another member should work
    chainService.setHovered(aId);
    expect(chainService.hasHighlight()).toBe(true);
  });

  it('resumes highlight after context menu closes (connection)', () => {
    const { aId, connId } = setupChain();
    chainService.setHovered(aId);
    contextMenuService.openFor({ kind: 'connection', connectionId: connId }, 10, 10);
    expect(chainService.isSuppressed()).toBe(true);

    contextMenuService.clear();

    expect(chainService.isSuppressed()).toBe(false);
    expect(chainService.hasHighlight()).toBe(true);
  });

  it('does not stay suppressed after multiple open/close cycles', () => {
    const { aId } = setupChain();
    for (let i = 0; i < 3; i++) {
      chainService.setHovered(aId);
      expect(chainService.hasHighlight()).toBe(true);
      contextMenuService.openFor({ kind: 'canvas' }, 10, 10);
      expect(chainService.hasHighlight()).toBe(false);
      contextMenuService.clear();
      expect(chainService.hasHighlight()).toBe(true);
    }
  });
});
