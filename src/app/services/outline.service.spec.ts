import { describe, it, expect, beforeEach } from 'vitest';
import { OutlineService, OUTLINE_HIDDEN_STORAGE_KEY } from './outline.service';

describe('OutlineService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is visible by default', () => {
    expect(new OutlineService().hidden()).toBe(false);
  });

  it('treats missing or malformed stored state as visible', () => {
    localStorage.setItem(OUTLINE_HIDDEN_STORAGE_KEY, 'maybe');
    expect(new OutlineService().hidden()).toBe(false);
  });

  it('toggles visibility and persists it', () => {
    const service = new OutlineService();
    service.toggle();
    expect(service.hidden()).toBe(true);
    expect(localStorage.getItem(OUTLINE_HIDDEN_STORAGE_KEY)).toBe('true');
    expect(new OutlineService().hidden()).toBe(true);
  });

  it('starts with no collapsed Groups and an empty filter', () => {
    const service = new OutlineService();
    expect(service.collapsedIds()).toEqual([]);
    expect(service.filter()).toBe('');
    expect(service.isCollapsed('g1')).toBe(false);
  });

  it('toggles Group collapse without touching visibility or filter', () => {
    const service = new OutlineService();
    service.setFilter('flow');
    service.toggleCollapsed('g1');
    expect(service.isCollapsed('g1')).toBe(true);
    service.toggleCollapsed('g1');
    expect(service.isCollapsed('g1')).toBe(false);
    expect(service.hidden()).toBe(false);
    expect(service.filter()).toBe('flow');
  });

  it('clears collapse on graph switches while keeping the filter text', () => {
    const service = new OutlineService();
    service.toggleCollapsed('g1');
    service.setFilter('flow');
    service.clearCollapsed();
    expect(service.collapsedIds()).toEqual([]);
    expect(service.filter()).toBe('flow');
  });
});
