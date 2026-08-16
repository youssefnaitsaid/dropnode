import { Injectable, signal } from '@angular/core';
import { Command } from '../models/command';
import { NodeRect } from '../models/node-shape';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    this.updateSignals();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.updateSignals();
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
    this.updateSignals();
  }

  pushWithoutExecute(command: Command): void {
    this.undoStack.push(command);
    this.redoStack = [];
    this.updateSignals();
  }

  /** Let the latest shape Command capture its DOM-measured growth. */
  recordAutoResize(nodeId: string, rect: NodeRect): void {
    const command = this.undoStack[this.undoStack.length - 1];
    command?.recordAutoResize?.(nodeId, rect);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateSignals();
  }

  private updateSignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }
}
