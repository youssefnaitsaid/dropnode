import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CanvasSearchComponent } from './canvas-search';
import { CommandPaletteComponent } from '../command-palette/command-palette';
import { CanvasSearchService } from '../../services/canvas-search.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import { PaletteEntryRegistry } from '../../services/palette-entry-registry.service';
import { GraphService } from '../../services/graph.service';

describe('CanvasSearchComponent', () => {
  let fixture: ComponentFixture<CanvasSearchComponent>;
  let component: CanvasSearchComponent;
  let search: CanvasSearchService;
  let graph: GraphService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [CanvasSearchComponent],
    });
    fixture = TestBed.createComponent(CanvasSearchComponent);
    component = fixture.componentInstance;
    search = TestBed.inject(CanvasSearchService);
    graph = TestBed.inject(GraphService);
    fixture.detectChanges();
  });

  afterEach(() => {
    search.close(false);
    document.body.innerHTML = '';
  });

  function openWith(query: string): void {
    graph.createNode('Checkout redesign', 0, 0, 100, 100);
    graph.createNode('Other', 900, 900, 100, 100);
    search.open(null);
    fixture.detectChanges();
    component.onQueryInput({ target: { value: query } } as unknown as Event);
    fixture.detectChanges();
  }

  it('opens as an accessible dialog and resets the query', () => {
    search.setQuery('stale search');
    search.open(null);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const input = fixture.nativeElement.querySelector('#canvas-search-input') as HTMLInputElement | null;
    expect(dialog).not.toBeNull();
    expect(input?.getAttribute('role')).toBe('combobox');
    expect(search.query()).toBe('');
  });

  it('shows a hint for an empty query and an explicit line for no hits', () => {
    graph.createNode('Checkout', 0, 0);
    search.open(null);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Type to search');
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(0);

    component.onQueryInput({ target: { value: 'nothing matches this' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matches for');
  });

  it('filters rows live with a hit count and an emphasized match', () => {
    openWith('checkout');

    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(options.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('1 hit');
    expect(options[0].querySelector('mark')?.textContent).toBe('Checkout');
    expect(options[0].textContent).toContain('Node');
  });

  it('moves the highlight with arrows, wrapping at both ends', () => {
    graph.createNode('alpha one', 0, 0);
    graph.createNode('alpha two', 500, 0);
    search.open(null);
    fixture.detectChanges();
    component.onQueryInput({ target: { value: 'alpha' } } as unknown as Event);
    fixture.detectChanges();

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(search.activeIndex()).toBe(1);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(search.activeIndex()).toBe(0);
  });

  it('activates with Enter and closes with Escape', () => {
    openWith('checkout');

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(graph.selectedNodeIds()).toHaveLength(1);
    expect(search.isOpen()).toBe(false);

    search.open(null);
    fixture.detectChanges();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(search.isOpen()).toBe(false);
  });

  it('activates the clicked row', () => {
    openWith('checkout');

    component.onPick(search.visibleResults()[0].id);

    expect(graph.selectedNodeIds()).toHaveLength(1);
    expect(search.isOpen()).toBe(false);
  });

  it('caps the rendered rows with a keep-typing tail', () => {
    for (let i = 0; i < 55; i++) graph.createNode(`alpha ${i}`, i * 200, 0);
    search.open(null);
    fixture.detectChanges();
    component.onQueryInput({ target: { value: 'alpha' } } as unknown as Event);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(50);
    expect(fixture.nativeElement.textContent).toContain('keep typing');
  });

  it('opens a requested search once the modal guard clears', async () => {
    search.requestOpen();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(search.isOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('opens a requested search without waiting on dialog teardown', async () => {
    // The closing Palette's dialog detaches asynchronously, after effects
    // run — so the request path skips the DOM modal guard by contract.
    const closingPalette = document.createElement('div');
    closingPalette.setAttribute('role', 'dialog');
    document.body.appendChild(closingPalette);

    search.requestOpen();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(search.isOpen()).toBe(true);
  });
});

describe('CanvasSearchComponent Palette handoff', () => {
  let paletteFixture: ComponentFixture<CommandPaletteComponent>;
  let searchFixture: ComponentFixture<CanvasSearchComponent>;
  let palette: CommandPaletteService;
  let search: CanvasSearchService;
  let registry: PaletteEntryRegistry;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [CommandPaletteComponent, CanvasSearchComponent],
      providers: [provideRouter([])],
    });
    paletteFixture = TestBed.createComponent(CommandPaletteComponent);
    searchFixture = TestBed.createComponent(CanvasSearchComponent);
    palette = TestBed.inject(CommandPaletteService);
    search = TestBed.inject(CanvasSearchService);
    registry = TestBed.inject(PaletteEntryRegistry);
    paletteFixture.detectChanges();
    searchFixture.detectChanges();
  });

  afterEach(() => {
    search.close(false);
    palette.close(false);
    document.body.innerHTML = '';
  });

  it('hands off from the open Command Palette to the search overlay', async () => {
    palette.open(null);
    paletteFixture.detectChanges();
    await paletteFixture.whenStable();
    paletteFixture.detectChanges();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    // What picking "Search Canvas Text…" does: the entry requests, then the
    // Palette closes itself exactly like CommandPaletteComponent.execute.
    const entry = registry.entries().find(item => item.id === 'search-canvas-text')!;
    expect(registry.execute(entry.id)).toBe(true);
    palette.close(false);
    paletteFixture.detectChanges();
    searchFixture.detectChanges();
    await paletteFixture.whenStable();
    paletteFixture.detectChanges();
    searchFixture.detectChanges();

    expect(palette.isOpen()).toBe(false);
    expect(search.isOpen()).toBe(true);
  });
});
