import { describe, it, expect, beforeEach } from 'vitest';
import { MinimapService, MINIMAP_HIDDEN_STORAGE_KEY } from './minimap.service';

describe('MinimapService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is visible by default', () => {
    expect(new MinimapService().hidden()).toBe(false);
  });

  it('toggles visibility and persists it', () => {
    const service = new MinimapService();
    service.toggle();
    expect(service.hidden()).toBe(true);
    expect(localStorage.getItem(MINIMAP_HIDDEN_STORAGE_KEY)).toBe('true');

    service.toggle();
    expect(service.hidden()).toBe(false);
    expect(localStorage.getItem(MINIMAP_HIDDEN_STORAGE_KEY)).toBe('false');
  });

  it('restores the stored preference', () => {
    localStorage.setItem(MINIMAP_HIDDEN_STORAGE_KEY, 'true');
    expect(new MinimapService().hidden()).toBe(true);
  });

  it('ignores malformed stored values (treated as visible)', () => {
    localStorage.setItem(MINIMAP_HIDDEN_STORAGE_KEY, 'garbage');
    expect(new MinimapService().hidden()).toBe(false);
  });
});
