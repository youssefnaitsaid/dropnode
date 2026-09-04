import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — whether the Outline is hidden. */
export const OUTLINE_HIDDEN_STORAGE_KEY = 'dropnode:outline-hidden';

/**
 * Owns the Outline's visibility, per-Group collapse, and filter text. Like
 * the Minimap toggle, visibility is a transient UI preference — never Graph
 * State, never a Command, never in History. Visible by default; collapse and
 * filter live in memory only.
 */
@Injectable({ providedIn: 'root' })
export class OutlineService {
  private readonly _hidden = signal<boolean>(this.readStoredState());
  private readonly _collapsedIds = signal<readonly string[]>([]);
  private readonly _filter = signal<string>('');

  /** True when the user has hidden the Outline. Defaults to visible. */
  readonly hidden: Signal<boolean> = this._hidden.asReadonly();
  /** Ids of collapsed Groups. Cleared on graph switches, never persisted. */
  readonly collapsedIds: Signal<readonly string[]> = this._collapsedIds.asReadonly();
  /** Live filter text. Kept across graph switches, never persisted. */
  readonly filter: Signal<string> = this._filter.asReadonly();

  toggle(): void {
    this._hidden.update(hidden => !hidden);
    this.persist(this._hidden());
  }

  isCollapsed(groupId: string): boolean {
    return this._collapsedIds().includes(groupId);
  }

  toggleCollapsed(groupId: string): void {
    this._collapsedIds.update(ids =>
      ids.includes(groupId) ? ids.filter(id => id !== groupId) : [...ids, groupId],
    );
  }

  /** Drop all collapse state — Import and Project switches land expanded. */
  clearCollapsed(): void {
    this._collapsedIds.set([]);
  }

  setFilter(query: string): void {
    this._filter.set(query);
  }

  /** Read the stored preference; any missing or malformed value means visible. */
  private readStoredState(): boolean {
    try {
      return localStorage.getItem(OUTLINE_HIDDEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private persist(hidden: boolean): void {
    try {
      localStorage.setItem(OUTLINE_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // Storage unavailable (private mode / SSR) — state still works in-memory.
    }
  }
}
