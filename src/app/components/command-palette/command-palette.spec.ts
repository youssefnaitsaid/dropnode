import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CommandPaletteComponent } from './command-palette';
import { CommandPaletteService } from '../../services/command-palette.service';
import { CollectionService } from '../../services/collection.service';

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let component: CommandPaletteComponent;
  let palette: CommandPaletteService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
    palette = TestBed.inject(CommandPaletteService);
    fixture.detectChanges();
  });

  afterEach(() => {
    palette.close(false);
    document.body.innerHTML = '';
  });

  it('opens as an accessible dialog and resets the query', async () => {
    component.query.set('stale search');
    palette.open(null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = document.body.querySelector('[role="dialog"]');
    const input = document.body.querySelector('#command-palette-search') as HTMLInputElement | null;
    expect(dialog).not.toBeNull();
    expect(input?.getAttribute('role')).toBe('combobox');
    expect(component.query()).toBe('');
  });

  it('resets the active result when the query changes and handles wraparound', () => {
    palette.open(null);
    fixture.detectChanges();

    component.activeIndex.set(0);
    component.onQueryChange({ target: { value: 'zoom' } } as unknown as Event);
    expect(component.activeIndex()).toBe(0);

    const count = component.availableEntries().length;
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.activeIndex()).toBe(count - 1);
  });

  it('keeps the palette open for no results and closes on Escape', () => {
    palette.open(null);
    fixture.detectChanges();
    component.onQueryChange({ target: { value: 'nothing matches this' } } as unknown as Event);
    expect(component.filteredEntries()).toHaveLength(0);
    expect(palette.isOpen()).toBe(true);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(palette.isOpen()).toBe(false);
  });

  it('moves to the Collection picker for Save as Project and backs out with Escape', () => {
    const entry = component.filteredEntries().find(item => item.id === 'save-as-project');
    expect(entry).toBeDefined();

    // The entry is unavailable until a Collection exists; this still verifies
    // the nested adapter when the registry marks it executable.
    const collectionService = TestBed.inject(CollectionService);
    collectionService.createCollection('Work');
    fixture.detectChanges();
    const available = component.filteredEntries().find(item => item.id === 'save-as-project')!;
    palette.open(null);
    fixture.detectChanges();
    component.execute(available);
    expect(palette.step()).toBe('collections');

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(palette.step()).toBe('commands');
    expect(palette.isOpen()).toBe(true);
  });
});
