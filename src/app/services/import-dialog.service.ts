import { Injectable, inject, signal, type Signal } from '@angular/core';
import { CanvasLockService } from './canvas-lock.service';
import { ToastService } from '../components/toast/toast';

/**
 * Cross-component glue for the single import dialog hosted in the app shell.
 * Both the toolbar (Scratch Canvas) and the Sidebar (Project rows) request
 * opening through this service; the shell reacts to the counter.
 */
@Injectable({ providedIn: 'root' })
export class ImportDialogService {
  private readonly canvasLock = inject(CanvasLockService);
  private readonly toastService = inject(ToastService);
  private readonly _openRequests = signal(0);

  /** Monotonic counter; each increment is one open request. */
  readonly openRequests: Signal<number> = this._openRequests.asReadonly();

  requestOpen(): void {
    // Graph-replacing Import would bypass Canvas Lock — refuse with a hint.
    // The Sidebar's project-row path navigates first, so this single seam
    // covers the toolbar, the Sidebar, and the Palette entry alike.
    if (this.canvasLock.locked()) {
      this.toastService.show('Unlock the Canvas to import');
      return;
    }
    this._openRequests.update(n => n + 1);
  }
}
