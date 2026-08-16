import { describe, it, expect, beforeEach } from 'vitest';
import { PinVisibilityService, PIN_HIDDEN_STORAGE_KEY } from './pin-visibility.service';

describe('PinVisibilityService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is visible by default', () => {
    expect(new PinVisibilityService().hidden()).toBe(false);
  });

  it('toggles visibility and persists it', () => {
    const service = new PinVisibilityService();
    service.toggle();
    expect(service.hidden()).toBe(true);
    expect(localStorage.getItem(PIN_HIDDEN_STORAGE_KEY)).toBe('true');

    service.toggle();
    expect(service.hidden()).toBe(false);
    expect(localStorage.getItem(PIN_HIDDEN_STORAGE_KEY)).toBe('false');
  });

  it('restores the stored preference', () => {
    localStorage.setItem(PIN_HIDDEN_STORAGE_KEY, 'true');
    expect(new PinVisibilityService().hidden()).toBe(true);
  });

  it('ignores malformed stored values (treated as visible)', () => {
    localStorage.setItem(PIN_HIDDEN_STORAGE_KEY, 'garbage');
    expect(new PinVisibilityService().hidden()).toBe(false);
  });
});
