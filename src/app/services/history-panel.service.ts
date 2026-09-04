import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — whether the History Panel is hidden. */
export const HISTORY_PANEL_HIDDEN_STORAGE_KEY = 'dropnode:history-hidden';

/**
 * Owns the History Panel's visibility and persists it to localStorage. The
 * Minimap toggle's exact pattern: a transient UI preference — never Graph
 * State, never a Command, never in History. Visible by default; the page
 * mounts the panel only while History has entries, so it appears with the
 * first Command and vanishes with it.
 */
@Injectable({ providedIn: 'root' })
export class HistoryPanelService {
  private readonly _hidden = signal<boolean>(this.readStoredState());

  /** True when the user has hidden the History Panel. Defaults to visible. */
  readonly hidden: Signal<boolean> = this._hidden.asReadonly();

  toggle(): void {
    this._hidden.update(hidden => !hidden);
    this.persist(this._hidden());
  }

  /** Read the stored preference; any missing or malformed value means visible. */
  private readStoredState(): boolean {
    try {
      return localStorage.getItem(HISTORY_PANEL_HIDDEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
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
