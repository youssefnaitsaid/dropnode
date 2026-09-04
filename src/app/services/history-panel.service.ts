import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — whether the History Panel is hidden. */
export const HISTORY_PANEL_HIDDEN_STORAGE_KEY = 'dropnode:history-hidden';

/**
 * Owns the History Panel's visibility and persists it to localStorage. The
 * Minimap toggle's exact pattern: a transient UI preference — never Graph
 * State, never a Command, never in History. Hidden by default so the Canvas
 * stays uncluttered until asked for.
 */
@Injectable({ providedIn: 'root' })
export class HistoryPanelService {
  private readonly _hidden = signal<boolean>(this.readStoredState());

  /** True when the user has hidden the History Panel. Defaults to hidden. */
  readonly hidden: Signal<boolean> = this._hidden.asReadonly();

  toggle(): void {
    this._hidden.update(hidden => !hidden);
    this.persist(this._hidden());
  }

  /** Read the stored preference; any missing or malformed value means hidden. */
  private readStoredState(): boolean {
    try {
      const stored = localStorage.getItem(HISTORY_PANEL_HIDDEN_STORAGE_KEY);
      if (stored === null) return true;
      return stored === 'true';
    } catch {
      return true;
    }
  }

  private persist(hidden: boolean): void {
    try {
      localStorage.setItem(HISTORY_PANEL_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // Storage unavailable (private mode / SSR) — state still works in-memory.
    }
  }
}
