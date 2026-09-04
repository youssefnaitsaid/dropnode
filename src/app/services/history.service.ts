import { Injectable, signal, type Signal } from '@angular/core';
import { Command } from '../models/command';
import { NodeRect } from '../models/node-shape';

/** One row of the History Panel: an undoable Command or an Import marker. */
export interface HistoryEntry {
  readonly kind: 'command' | 'import';
  readonly description: string;
}

/** Fixed wording for the non-undoable Import separator row. */
export const HISTORY_IMPORT_DESCRIPTION =
  'Import replaced graph — earlier entries may reference stale ids';

type HistoryRecord = { kind: 'command'; command: Command } | { kind: 'import' };

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private records: HistoryRecord[] = [];
  /** Done count: entries below this index are done, at/above are undone. */
  private doneCount = 0;

  private readonly _entries = signal<readonly HistoryEntry[]>([]);
  private readonly _currentIndex = signal(0);

  /** Ordered rows oldest-first, including non-undoable Import separators. */
  readonly entries: Signal<readonly HistoryEntry[]> = this._entries.asReadonly();
  /** Divider position in entries (rows below are done, at/above are undone). */
  readonly currentIndex: Signal<number> = this._currentIndex.asReadonly();

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  execute(command: Command): void {
    command.execute();
    this.records = this.records.slice(0, this.doneCount);
    this.records.push({ kind: 'command', command });
    this.doneCount = this.records.length;
    this.sync();
  }

  undo(): void {
    const index = this.lastDoneCommandIndex();
    if (index === null) return;
    this.commandAt(index).undo();
    this.doneCount = index;
    this.sync();
  }

  redo(): void {
    const index = this.firstUndoneCommandIndex();
    if (index === null) return;
    this.commandAt(index).execute();
    this.doneCount = index + 1;
    while (this.doneCount < this.records.length && this.records[this.doneCount].kind === 'import') {
      this.doneCount += 1;
    }
    this.sync();
  }

  /**
   * Step the divider to target, undoing/redoing each Command skipped over
   * (Import separators are passed through, never run). Out-of-range or
   * current-position targets are silent no-ops.
   */
  jumpTo(target: number): void {
    if (!Number.isInteger(target) || target < 0 || target > this.records.length) return;
    if (target === this.doneCount) return;
    if (target < this.doneCount) {
      while (this.doneCount > target) {
        const index = this.lastDoneCommandIndex();
        if (index === null || index < target) {
          this.doneCount = target;
          break;
        }
        this.commandAt(index).undo();
        this.doneCount = index;
      }
    } else {
      while (this.doneCount < target) {
        const index = this.firstUndoneCommandIndex();
        if (index === null || index >= target) {
          this.doneCount = target;
          break;
        }
        this.commandAt(index).execute();
        this.doneCount = index + 1;
      }
    }
    this.sync();
  }

  /** Record a non-undoable Import separator at the current position. */
  recordImportSeparator(): void {
    this.records = [
      ...this.records.slice(0, this.doneCount),
      { kind: 'import' },
      ...this.records.slice(this.doneCount),
    ];
    this.doneCount += 1;
    this.sync();
  }

  pushWithoutExecute(command: Command): void {
    this.records = this.records.slice(0, this.doneCount);
    this.records.push({ kind: 'command', command });
    this.doneCount = this.records.length;
    this.sync();
  }

  /** Let the latest shape Command capture its DOM-measured growth. */
  recordAutoResize(nodeId: string, rect: NodeRect): void {
    const index = this.lastDoneCommandIndex();
    if (index === null) return;
    this.commandAt(index).recordAutoResize?.(nodeId, rect);
  }

  clear(): void {
    this.records = [];
    this.doneCount = 0;
    this.sync();
  }

  /** The Command at a known-command index (callers scan by kind first). */
  private commandAt(index: number): Command {
    return (this.records[index] as { kind: 'command'; command: Command }).command;
  }

  private lastDoneCommandIndex(): number | null {
    for (let i = this.doneCount - 1; i >= 0; i--) {
      if (this.records[i].kind === 'command') return i;
    }
    return null;
  }

  private firstUndoneCommandIndex(): number | null {
    for (let i = this.doneCount; i < this.records.length; i++) {
      if (this.records[i].kind === 'command') return i;
    }
    return null;
  }

  private sync(): void {
    this._entries.set(
      this.records.map((entry): HistoryEntry =>
        entry.kind === 'command'
          ? { kind: 'command', description: entry.command.description }
          : { kind: 'import', description: HISTORY_IMPORT_DESCRIPTION },
      ),
    );
    this._currentIndex.set(this.doneCount);
    this.canUndo.set(this.lastDoneCommandIndex() !== null);
    this.canRedo.set(this.firstUndoneCommandIndex() !== null);
  }
}
