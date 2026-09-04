import { TestBed } from '@angular/core/testing';
import { HistoryPanelService, HISTORY_PANEL_HIDDEN_STORAGE_KEY } from './history-panel.service';

describe('HistoryPanelService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is hidden by default when nothing is stored', () => {
    const service = TestBed.inject(HistoryPanelService);
    expect(service.hidden()).toBe(true);
  });

  it('toggles visibility and persists the preference', () => {
    const service = TestBed.inject(HistoryPanelService);
    service.toggle();
    expect(service.hidden()).toBe(false);
    expect(localStorage.getItem(HISTORY_PANEL_HIDDEN_STORAGE_KEY)).toBe('false');

    service.toggle();
    expect(service.hidden()).toBe(true);
    expect(localStorage.getItem(HISTORY_PANEL_HIDDEN_STORAGE_KEY)).toBe('true');
  });
});
