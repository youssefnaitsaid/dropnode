import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — whether Pins are hidden. */
export const PIN_HIDDEN_STORAGE_KEY = 'dropnode:pins-hidden';

/**
 * Owns the Pins' visibility and persists it to localStorage. The Minimap
 * toggle's exact pattern: a transient UI preference — never Graph State,
 * never a Command, never in History. Hiding is cosmetic; hidden Pins still
 * exist, serialize, and ride the Clipboard.
 */
@Injectable({ providedIn: 'root' })
export class PinVisibilityService {
  private readonly _hidden = signal<boolean>(this.readStoredState());

  /** True when the user has hidden the Pins. Defaults to visible. */
  readonly hidden: Signal<boolean> = this._hidden.asReadonly();

  toggle(): void {
    this._hidden.update(hidden => !hidden);
    this.persist(this._hidden());
  }

  /** Read the stored preference; any missing or malformed value means visible. */
  private readStoredState(): boolean {
    try {
      return localStorage.getItem(PIN_HIDDEN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private persist(hidden: boolean): void {
    try {
      localStorage.setItem(PIN_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // Storage unavailable (private mode / SSR) — state still works in-memory.
    }
  }
}
