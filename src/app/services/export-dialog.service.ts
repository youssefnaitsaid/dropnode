import { computed, Injectable, signal, type Signal } from '@angular/core';
import {
  ExportScopeInput, ExportScopeRequest, normalizeExportScopeRequest,
} from '../models/export-image';

export type ExportFormat = 'png' | 'json';

/**
 * Cross-component glue for the single "Export as…" dialog hosted in the app
 * shell. The toolbar (Scratch Canvas) and the Sidebar row of the currently
 * open Project request opening through this service; a projectId names the
 * downloaded file after the Project (the snapshot is always the on-screen graph).
 */
@Injectable({ providedIn: 'root' })
export class ExportDialogService {
  private readonly _openRequests = signal(0);
  private readonly _projectId = signal<string | undefined>(undefined);
  private readonly _scope = signal<Required<ExportScopeRequest> | undefined>(undefined);
  private readonly _format = signal<ExportFormat>('png');

  /** Monotonic counter; each increment is one open request. */
  readonly openRequests: Signal<number> = this._openRequests.asReadonly();
  /** The Project the current request came from, if any. */
  readonly projectId: Signal<string | undefined> = this._projectId.asReadonly();
  /** Frozen Export Scope request captured when a Context Menu opened. */
  readonly scope: Signal<Required<ExportScopeRequest> | undefined> = this._scope.asReadonly();
  /** Frozen Export Scope roots captured when a Context Menu opened. */
  readonly scopeRootIds: Signal<readonly string[] | undefined> = computed(() => this._scope()?.rootIds);
  /** Format requested by a direct palette entry; scoped requests always use PNG. */
  readonly format: Signal<ExportFormat> = this._format.asReadonly();

  requestOpen(projectId?: string, scopeInput?: ExportScopeInput, format: ExportFormat = 'png'): void {
    this._projectId.set(projectId);
    this._scope.set(scopeInput === undefined ? undefined : normalizeExportScopeRequest(scopeInput));
    this._format.set(format);
    this._openRequests.update(n => n + 1);
  }
}
