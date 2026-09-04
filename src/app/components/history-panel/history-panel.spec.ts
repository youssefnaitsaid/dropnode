import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistoryService } from '../../services/history.service';
import { HistoryPanelService } from '../../services/history-panel.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { HistoryPanelComponent } from './history-panel';

describe('HistoryPanelComponent', () => {
  let fixture: ComponentFixture<HistoryPanelComponent>;
  let historyService: HistoryService;

  const named = (description: string) => ({
    description,
    execute: () => {},
    undo: () => {},
  });

  function rows(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.history-row'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HistoryPanelComponent] });
    fixture = TestBed.createComponent(HistoryPanelComponent);
    historyService = TestBed.inject(HistoryService);
    fixture.detectChanges();
  });

  it('shows an empty state when there is no History', () => {
    expect(fixture.nativeElement.textContent).toContain('No history yet');
  });

  it('lists Commands oldest-first with the divider at the end', () => {
    historyService.execute(named('First'));
    historyService.execute(named('Second'));
    fixture.detectChanges();

    expect(rows().map(row => row.textContent?.trim())).toEqual(['First', 'Second']);
    const dividers = fixture.nativeElement.querySelectorAll('[data-testid="history-now"]');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].nextElementSibling).toBeNull();
  });

  it('dims redo rows below the divider and names rows for screen readers', () => {
    historyService.execute(named('First'));
    historyService.execute(named('Second'));
    historyService.undo();
    fixture.detectChanges();

    const [first, second] = rows();
    expect(first.classList.contains('history-redo')).toBe(false);
    expect(second.classList.contains('history-redo')).toBe(true);
    expect(second.getAttribute('aria-label')).toBe('2 of 2: Second');
  });

  it('clicking a row lands before it, leaving the clicked entry undone', () => {
    const undone: string[] = [];
    historyService.execute({ description: 'First', execute: () => {}, undo: () => { undone.push('First'); } });
    historyService.execute({ description: 'Second', execute: () => {}, undo: () => { undone.push('Second'); } });
    fixture.detectChanges();

    rows()[0].click();
    fixture.detectChanges();

    expect(undone).toEqual(['Second', 'First']);
    expect(historyService.currentIndex()).toBe(0);
  });

  it('clicking a redo row redoes only the entries before it', () => {
    const executed: string[] = [];
    const track = (description: string) => ({
      description,
      execute: () => { executed.push(description); },
      undo: () => {},
    });
    historyService.execute(track('First'));
    historyService.execute(track('Second'));
    historyService.undo();
    historyService.undo();
    executed.length = 0;
    fixture.detectChanges();

    rows()[1].click();
    fixture.detectChanges();

    expect(executed).toEqual(['First']);
    expect(historyService.currentIndex()).toBe(1);
    expect(rows()[1].classList.contains('history-redo')).toBe(true);
  });

  it('renders the Import separator as a non-clickable marker', () => {
    historyService.execute(named('Before'));
    historyService.recordImportSeparator();
    fixture.detectChanges();

    const marker = fixture.nativeElement.querySelector('.history-import') as HTMLElement;
    expect(marker?.textContent).toContain('Import replaced graph');
    expect(marker?.closest('button')).toBeNull();
    expect(marker?.tagName).toBe('LI');
  });

  it('disables rows with an unlock hint while the Canvas is locked', () => {
    historyService.execute(named('First'));
    TestBed.inject(CanvasLockService).lock();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Unlock the Canvas to step through History');
    for (const row of rows()) expect(row.disabled).toBe(true);

    rows()[0].click();
    fixture.detectChanges();
    expect(historyService.currentIndex()).toBe(1);
  });

  it('closes the panel from its close button', () => {
    const panel = TestBed.inject(HistoryPanelService);
    panel.toggle();
    fixture.detectChanges();
    expect(panel.hidden()).toBe(false);

    (fixture.nativeElement.querySelector('.history-close') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(panel.hidden()).toBe(true);
  });

  it('closes the panel on Escape even when focus is outside it', () => {
    const panel = TestBed.inject(HistoryPanelService);
    panel.toggle();
    fixture.detectChanges();
    expect(panel.hidden()).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel.hidden()).toBe(true);
  });
});
