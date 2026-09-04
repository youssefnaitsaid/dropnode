import { Injectable, inject, signal } from '@angular/core';
import { GraphService } from './graph.service';
import { ToastService } from '../components/toast/toast';

/**
 * Owns Canvas Lock — the read-only explore state that stops editing without
 * leaving the Canvas. Entering clears the Selection; every gesture and
 * chrome guard pairs it with Present Mode (`active() || locked()`), while
 * pure-Viewport paths (pan, zoom, Minimap recenter) and Text-link navigation
 * stay live. Transient UI state: never Graph State, never History, never
 * serialized — Project switches and reloads land unlocked.
 */
@Injectable({ providedIn: 'root' })
export class CanvasLockService {
  private readonly graphService = inject(GraphService);
  private readonly toastService = inject(ToastService);

  /** True while the Canvas is frozen for read-only exploration. */
  readonly locked = signal(false);

  /** Freeze editing: drop the Selection and announce. Already locked: no-op. */
  lock(): void {
    if (this.locked()) return;
    this.graphService.clearSelection();
    this.locked.set(true);
    this.toastService.show('Canvas locked — explore only');
  }

  /** Resume editing. Project switches pass `{ silent: true }` — no toast. */
  unlock(options?: { silent?: boolean }): void {
    if (!this.locked()) return;
    this.locked.set(false);
    if (!options?.silent) this.toastService.show('Canvas unlocked');
  }

  toggle(): void {
    if (this.locked()) this.unlock();
    else this.lock();
  }
}
