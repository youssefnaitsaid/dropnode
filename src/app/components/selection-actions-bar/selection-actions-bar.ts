import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  computed,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideUndo2,
  lucideRedo2,
  lucideTrash2,
  lucideCopyPlus,
  lucideEllipsisVertical,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { ClipboardService } from '../../services/clipboard.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { PresentationService } from '../../services/presentation.service';
import { CanvasToolService } from '../../services/canvas-tool.service';
import { AlignPopoverComponent } from '../align-popover/align-popover';

/**
 * The Selection Actions Bar: Undo/Redo/Delete/Duplicate plus the More
 * trigger that opens the Align Popover above it. Always mounted so the
 * bottom stack never jumps; every control disables down to its rule while
 * the Canvas is locked or presenting. The popover closes on toggle,
 * Escape, outside press, Selection change, and after Delete/Duplicate.
 */
@Component({
  selector: 'app-selection-actions-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, AlignPopoverComponent],
  providers: [
    provideIcons({
      lucideUndo2,
      lucideRedo2,
      lucideTrash2,
      lucideCopyPlus,
      lucideEllipsisVertical,
    }),
  ],
  template: `
    <div class="actions-stack">
      @if (popoverOpen()) {
        <app-align-popover />
      }
      <div class="actions-bar" role="toolbar" aria-label="Selection actions">
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="undo()"
          [disabled]="undoDisabled()"
          title="Undo (Ctrl+Z)" aria-label="Undo"
        >
          <ng-icon name="lucideUndo2" />
        </button>
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="redo()"
          [disabled]="redoDisabled()"
          title="Redo (Ctrl+Shift+Z)" aria-label="Redo"
        >
          <ng-icon name="lucideRedo2" />
        </button>
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="remove()"
          [disabled]="deleteDisabled()"
          title="Delete" aria-label="Delete"
        >
          <ng-icon name="lucideTrash2" />
        </button>
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="duplicate()"
          [disabled]="duplicateDisabled()"
          title="Duplicate (Ctrl+D)" aria-label="Duplicate"
        >
          <ng-icon name="lucideCopyPlus" />
        </button>
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="toggleMore()"
          [disabled]="moreDisabled()"
          [class.tool-active]="popoverOpen()"
          [attr.aria-expanded]="popoverOpen()"
          title="More options" aria-label="More options"
        >
          <ng-icon name="lucideEllipsisVertical" />
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .actions-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .actions-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--dn-shadow-chip);
    }
    .actions-bar button:hover {
      color: var(--card-foreground) !important;
    }
    .tool-active {
      background: var(--primary) !important;
      color: var(--primary-foreground) !important;
    }
  `],
})
export class SelectionActionsBarComponent {
  private readonly graph = inject(GraphService);
  private readonly history = inject(HistoryService);
  private readonly menus = inject(ContextMenuService);
  private readonly clipboard = inject(ClipboardService);
  private readonly lock = inject(CanvasLockService);
  private readonly presenting = inject(PresentationService);
  private readonly tool = inject(CanvasToolService);
  private readonly host = inject(ElementRef);

  /** Align Popover visibility: owned here, above the bar. */
  readonly popoverOpen = signal(false);

  readonly undoDisabled = computed(() => !this.history.canUndo() || this.lock.locked() || this.presenting.active());
  readonly redoDisabled = computed(() => !this.history.canRedo() || this.lock.locked() || this.presenting.active());
  readonly deleteDisabled = computed(
    () => this.graph.selectionSize() === 0 || this.lock.locked() || this.presenting.active(),
  );
  readonly duplicateDisabled = computed(
    () => this.graph.selectedNodeIds().length === 0 || this.lock.locked() || this.presenting.active(),
  );
  readonly moreDisabled = computed(
    () => this.graph.selectedNodeIds().length < 2 || this.lock.locked() || this.presenting.active(),
  );

  constructor() {
    // A new Selection — or a tool switch — retires the popover: it belongs
    // to the Selection and mode that opened it. Both reads resubscribe.
    effect(() => {
      this.graph.selectionSize();
      this.tool.tool();
      this.popoverOpen.set(false);
    });
  }

  undo(): void {
    if (this.undoDisabled()) return;
    this.history.undo();
    this.graph.clearSelection();
  }

  redo(): void {
    if (this.redoDisabled()) return;
    this.history.redo();
    this.graph.clearSelection();
  }

  remove(): void {
    if (this.deleteDisabled()) return;
    this.popoverOpen.set(false);
    this.menus.deleteSelection();
    this.graph.clearSelection();
  }

  duplicate(): void {
    if (this.duplicateDisabled()) return;
    this.popoverOpen.set(false);
    this.clipboard.duplicate(this.graph.selectedNodeIds());
    this.graph.clearSelection();
  }

  toggleMore(): void {
    if (this.moreDisabled()) return;
    this.popoverOpen.update(open => !open);
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.popoverOpen()) this.popoverOpen.set(false);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: MouseEvent): void {
    if (!this.popoverOpen()) return;
    const root = this.host.nativeElement as HTMLElement;
    const target = event.target as Node | null;
    if (target && !root.contains(target)) this.popoverOpen.set(false);
  }
}
