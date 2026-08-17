import { Injectable, signal, type Signal } from '@angular/core';

/**
 * Cross-component glue for the single Connect dialog hosted in the app shell.
 * The "Connect Nodes…" Palette Entry requests opening through this service;
 * the shell reacts to the counter, mirroring ImportDialogService.
 */
@Injectable({ providedIn: 'root' })
export class ConnectDialogService {
  private readonly _openRequests = signal(0);

  /** Monotonic counter; each increment is one open request. */
  readonly openRequests: Signal<number> = this._openRequests.asReadonly();

  requestOpen(): void {
    this._openRequests.update(n => n + 1);
  }
}
