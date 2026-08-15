import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PaletteEntryRegistry } from './palette-entry-registry.service';
import { GraphService } from './graph.service';
import { HistoryService } from './history.service';
import { ContextMenuService } from './context-menu.service';
import { ExportDialogService } from './export-dialog.service';

@Component({ standalone: true, template: '' })
class TestRoute {}

describe('PaletteEntryRegistry', () => {
  let registry: PaletteEntryRegistry;
  let graphService: GraphService;
  let historyService: HistoryService;
  let contextMenuService: ContextMenuService;
  let exportDialogService: ExportDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'p/:projectId', component: TestRoute }])] });
    registry = TestBed.inject(PaletteEntryRegistry);
    graphService = TestBed.inject(GraphService);
    historyService = TestBed.inject(HistoryService);
    contextMenuService = TestBed.inject(ContextMenuService);
    exportDialogService = TestBed.inject(ExportDialogService);
  });

  function find(id: string) {
    return registry.entries().find(entry => entry.id === id)!;
  }

  it('exposes canonical intent-level entries with aliases and categories', () => {
    const fit = find('zoom-to-fit');
    const rose = find('node-color-rose');

    expect(fit.label).toBe('Zoom to Fit');
    expect(fit.category).toBe('Viewport');
    expect(fit.aliases).toContain('frame canvas');
    expect(fit.shortcut).toBe('Shift+1');
    expect(rose.label).toBe('Set selected Nodes to Rose');
    expect(rose.swatch).toBe('#ff8fa3');
  });

  it('keeps prerequisite-dependent entries visible but unavailable', () => {
    const clear = find('clear-selection');
    const paste = find('paste');
    const align = find('align-left');

    expect(clear.available).toBe(false);
    expect(clear.disabledReason).toBe('Nothing is selected');
    expect(paste.available).toBe(false);
    expect(paste.disabledReason).toBe('Clipboard is empty');
    expect(align.available).toBe(false);
    expect(registry.execute('clear-selection')).toBe(false);
    expect(historyService.canUndo()).toBe(false);
  });

  it('executes Add Node through History and requests the existing Text editor', () => {
    expect(registry.execute('add-node')).toBe(true);

    expect(graphService.nodes()).toHaveLength(1);
    expect(graphService.nodes()[0].text?.[0]?.runs[0]?.text).toBe('New Node');
    expect(historyService.canUndo()).toBe(true);
    expect(contextMenuService.editTextRequest()).toBe(graphService.nodes()[0].id);
  });

  it('executes styling through the existing Command factories', () => {
    const node = graphService.createNode('A', 0, 0);
    graphService.selectNode(node.id);

    expect(registry.execute('node-color-rose')).toBe(true);
    expect(graphService.nodes()[0].color).toBe('#ff8fa3');
    expect(historyService.canUndo()).toBe(true);
  });

  it('re-checks live selection at execution time', () => {
    const node = graphService.createNode('A', 0, 0);
    const entry = find('delete');
    expect(entry.available).toBe(false);

    graphService.selectNode(node.id);
    expect(registry.execute(entry.id)).toBe(true);
    expect(graphService.nodes()).toHaveLength(0);
  });

  it('opens direct export entries through the existing dialog with a format', () => {
    expect(registry.execute('export-json')).toBe(true);
    expect(exportDialogService.format()).toBe('json');
    expect(exportDialogService.openRequests()).toBe(1);
  });

  it('uses route-aware current Project labels', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/p/project-1');
    expect(find('export-json').label).toBe('Export current Project as JSON');
    expect(find('save-as-project').available).toBe(false);
  });
});
