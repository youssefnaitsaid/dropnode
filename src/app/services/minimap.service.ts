import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — whether the Minimap is hidden. */
export const MINIMAP_HIDDEN_STORAGE_KEY = 'dropnode:minimap-hidden';

/**
 * Owns the Minimap's visibility and persists it to localStorage. Like the
 * Sidebar's collapsed state, this is a transient UI preference — never Graph
 * State, never a Command, never in History.
 */
@Injectable({ providedIn: 'root' })
export class MinimapService {
  private readonly _hidden = signal<boolean>(this.readStoredState());

  /** True when the user has hidden the Minimap. Defaults to visible. */
  readonly hidden: Signal<boolean> = this._hidden.asReadonly();

  toggle(): void {
    this._hidden.update(hidden => !hidden);
    this.persist(this._hidden());
  }

  /** Read the stored preference; any missing or malformed value means visible. */
  private readStoredState(): boolean {
    try {
      return localStorage.getItem(MINIMAP_HIDDEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private persist(hidden: boolean): void {
    try {
      localStorage.setItem(MINIMAP_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // Storage unavailable (private mode / SSR) — state still works in-memory.
    }
  }
}
