import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { HistoryService } from '../../services/history.service';
import { HistoryPanelService } from '../../services/history-panel.service';
import { CanvasLockService } from '../../services/canvas-lock.service';

/**
 * The History Panel: a toggleable overlay listing History entries by their
 * Command descriptions, oldest on top with a Now divider and dimmed redo
 * rows below. Picking a Command row undoes/redoes sequentially to that
 * point; Import separators are markers, never clickable. Pure view over
 * HistoryService — all ordering lives there.
 */
@Component({
  selector: 'app-history-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    <section class="history-panel" aria-label="History">
      <header class="history-header">
        <h2 class="history-title">History</h2>
        <button
          type="button"
          class="history-close"
          aria-label="Close History panel"
          (click)="close()"
        >
          ×
        </button>
      </header>
      @if (canvasLock.locked()) {
        <p class="history-locked">Unlock the Canvas to step through History</p>
      }
      @if (historyService.entries().length === 0) {
        <p class="history-empty">No history yet</p>
      } @else {
        <ol class="history-list" #list>
          @for (entry of historyService.entries(); track $index) {
            @if ($index === historyService.currentIndex()) {
              <li class="history-now" data-testid="history-now" role="separator" aria-label="Current position">
                <span aria-hidden="true">Now</span>
              </li>
            }
            @if (entry.kind === 'import') {
              <li class="history-import">{{ entry.description }}</li>
            } @else {
              <li>
                <button
                  type="button"
                  class="history-row"
                  [class.history-redo]="$index >= historyService.currentIndex()"
                  [disabled]="canvasLock.locked()"
                  [attr.aria-label]="($index + 1) + ' of ' + historyService.entries().length + ': ' + entry.description"
                  (click)="jumpToRow($index)"
                >
                  {{ entry.description }}
                </button>
              </li>
            }
          }
          @if (historyService.currentIndex() === historyService.entries().length) {
            <li class="history-now" data-testid="history-now" role="separator" aria-label="Current position">
              <span aria-hidden="true">Now</span>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [`
    :host {
      position: absolute;
      top: 64px;
      right: max(16px, env(safe-area-inset-right));
      bottom: 180px;
      width: 260px;
      z-index: var(--dn-z-overlay);
      pointer-events: none;
    }
    .history-panel {
      display: flex;
      flex-direction: column;
      max-height: 100%;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--card-foreground);
      box-shadow: var(--dn-shadow-pop);
      pointer-events: auto;
      overflow: hidden;
    }
    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .history-title {
      margin: 0;
      font-size: 12px;
      font-weight: 600;
    }
    .history-close {
      border: 0;
      background: transparent;
      color: var(--card-foreground);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      border-radius: 6px;
      padding: 2px 8px;
    }
    .history-close:hover {
      background: var(--muted);
    }
    .history-locked,
    .history-empty {
      margin: 0;
      padding: 12px;
      font-size: 12px;
    }
    .history-list {
      margin: 0;
      padding: 4px;
      list-style: none;
      overflow-y: auto;
    }
    .history-now {
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--card-foreground);
      opacity: 0.7;
    }
    .history-import {
      padding: 6px 8px;
      font-size: 11px;
      font-style: italic;
      opacity: 0.8;
    }
    .history-row {
      display: block;
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 12px;
      background: transparent;
      color: var(--card-foreground);
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .history-row:hover:not(:disabled) {
      background: var(--muted);
    }
    .history-row:disabled {
      cursor: default;
    }
    .history-redo {
      opacity: 0.55;
    }
    .history-row:focus-visible,
    .history-close:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 1px;
    }
    @media (prefers-reduced-motion: reduce) {
      .history-row {
        transition: none;
      }
    }
  `],
})
export class HistoryPanelComponent {
  protected historyService = inject(HistoryService);
  private panelService = inject(HistoryPanelService);
  protected canvasLock = inject(CanvasLockService);

  private listRef = viewChild<ElementRef<HTMLOListElement>>('list');

  constructor() {
    effect(() => {
      this.historyService.entries();
      this.historyService.currentIndex();
      const list = this.listRef()?.nativeElement;
      list?.querySelector('.history-now')?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  /**
   * Picking a row lands before it on the done side (the clicked entry ends
   * up undone) and after it on the redo side (the clicked entry is redone).
   */
  protected jumpToRow(index: number): void {
    if (this.canvasLock.locked()) return;
    const target = index < this.historyService.currentIndex() ? index : index + 1;
    this.historyService.jumpTo(target);
  }

  protected close(): void {
    if (!this.panelService.hidden()) this.panelService.toggle();
  }

  protected onEscape(): void {
    this.close();
    (document.querySelector('.canvas-container') as HTMLElement | null)?.focus?.();
  }
}
