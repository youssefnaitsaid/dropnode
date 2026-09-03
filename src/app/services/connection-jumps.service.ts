import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — whether Connection Jumps render. Defaults to off. */
export const CONNECTION_JUMPS_ENABLED_STORAGE_KEY = 'dropnode:connection-jumps-enabled';

/**
 * Owns the Connection Jump toggle (ADR-0032) and persists it to localStorage.
 * The Minimap toggle's exact pattern: a transient UI preference — never Graph
 * State, never a Command, never in History. Hidden crossings still exist;
 * only the gap rendering changes.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionJumpsService {
  private readonly _enabled = signal<boolean>(this.readStoredState());

  /** True when Connection Jumps render. Defaults to off. */
  readonly enabled: Signal<boolean> = this._enabled.asReadonly();

  toggle(): void {
    this._enabled.update(enabled => !enabled);
    this.persist(this._enabled());
  }

  /** Read the stored preference; anything but an explicit opt-in means off. */
  private readStoredState(): boolean {
    try {
      return localStorage.getItem(CONNECTION_JUMPS_ENABLED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private persist(enabled: boolean): void {
    try {
      localStorage.setItem(CONNECTION_JUMPS_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      // Storage unavailable (private mode / SSR) — state still works in-memory.
    }
  }
}
