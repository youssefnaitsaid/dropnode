import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { GraphService } from '../../services/graph.service';
import { OutlineService } from '../../services/outline.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import {
  buildOutlineRows,
  filterOutlineRows,
  outlineStructureKey,
  type OutlineRow,
} from '../../models/outline';

/**
 * The Outline: a toggleable overlay listing every Group (with children),
 * loose Node, and loose Text Block as a read-only mirror of Graph State.
 * A single Selection model — picking a row selects and frames it on the
 * Canvas, never a second model. Rows derive from a structural projection so
 * per-frame drag writes never re-render the list (see outlineStructureKey).
 */
@Component({
  selector: 'app-outline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="outline-panel" aria-label="Outline">
      <header class="outline-header">
        <h2 class="outline-title">Outline</h2>
        <button
          type="button"
          class="outline-close"
          aria-label="Close Outline panel"
          (click)="outline.toggle()"
        >
          ×
        </button>
      </header>
      <div class="outline-filter-wrap">
        <input
          type="search"
          class="outline-filter"
          aria-label="Filter Outline"
          placeholder="Filter…"
          [value]="outline.filter()"
          (input)="outline.setFilter($any($event.target).value)"
          (keydown.escape)="outline.setFilter('')"
          (keydown.enter)="frameFirstHit()"
        />
      </div>
      @if (visibleRows().length === 0) {
        <p class="outline-empty">
          {{ outline.filter().trim() ? 'No matching elements' : 'Nothing on the Canvas yet' }}
        </p>
      } @else {
        <ul class="outline-list">
          @for (row of visibleRows(); track row.id) {
            <li class="outline-item" [class.outline-child]="!!row.parentId">
              @if (row.kind === 'group') {
                <button
                  type="button"
                  class="outline-chevron"
                  [attr.aria-label]="(isCollapsed(row.id) ? 'Expand ' : 'Collapse ') + (row.name || 'Group')"
                  [attr.aria-expanded]="!isCollapsed(row.id)"
                  (click)="outline.toggleCollapsed(row.id); $event.stopPropagation()"
                >
                  <span aria-hidden="true">{{ isCollapsed(row.id) ? '▸' : '▾' }}</span>
                </button>
              }
              <button
                type="button"
                class="outline-row"
                [class.outline-active]="graph.isNodeSelected(row.id)"
                [attr.data-node-id]="row.id"
                [attr.aria-label]="row.name + (row.kind === 'text-block' ? ', Text' : '')"
                (click)="pick(row, $event)"
                (dblclick)="openEditor(row)"
                (keydown)="onRowKeydown($event)"
              >
                @if (row.emoji) {
                  <span class="outline-emoji" aria-hidden="true">{{ row.emoji }}</span>
                }
                <span class="outline-name">{{ row.name || 'Untitled' }}</span>
                @if (row.kind === 'text-block') {
                  <span class="outline-badge">Text</span>
                }
                @if (row.kind === 'group') {
                  <span class="outline-child-count" aria-hidden="true">{{ row.childCount }}</span>
                }
                <span class="outline-counts" aria-hidden="true">{{ countsLabel(row) }}</span>
              </button>
            </li>
          }
        </ul>
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
    .outline-panel {
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
    .outline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .outline-title {
      margin: 0;
      font-size: 12px;
      font-weight: 600;
    }
    .outline-close {
      border: 0;
      background: transparent;
      color: var(--card-foreground);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      border-radius: 6px;
      padding: 2px 8px;
    }
    .outline-close:hover {
      background: var(--muted);
    }
    .outline-filter-wrap {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .outline-filter {
      width: 100%;
      box-sizing: border-box;
      background: var(--background);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 12px;
      padding: 6px 8px;
    }
    .outline-filter:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 1px;
    }
    .outline-empty {
      margin: 0;
      padding: 12px;
      font-size: 12px;
      color: var(--card-foreground);
      opacity: 0.7;
    }
    .outline-list {
      margin: 0;
      padding: 4px;
      list-style: none;
      overflow-y: auto;
    }
    .outline-item {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .outline-child {
      padding-left: 16px;
    }
    .outline-chevron {
      flex: 0 0 auto;
      border: 0;
      background: transparent;
      color: var(--card-foreground);
      font-size: 10px;
      cursor: pointer;
      border-radius: 6px;
      padding: 6px 4px;
    }
    .outline-chevron:hover {
      background: var(--muted);
    }
    .outline-row {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      border: 0;
      background: transparent;
      color: var(--card-foreground);
      font-size: 12px;
      text-align: left;
      cursor: pointer;
      border-radius: 6px;
      padding: 6px 8px;
    }
    .outline-row:hover {
      background: var(--muted);
    }
    .outline-row:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }
    .outline-active {
      background: var(--muted);
    }
    .outline-emoji {
      flex: 0 0 auto;
      font-size: var(--dn-emoji-size);
    }
    .outline-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .outline-badge {
      flex: 0 0 auto;
      font-size: 10px;
      font-weight: 600;
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 0 6px;
    }
    .outline-child-count {
      flex: 0 0 auto;
      font-size: 11px;
      opacity: 0.7;
    }
    .outline-counts {
      flex: 0 0 auto;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      opacity: 0.7;
    }
  `],
})
export class OutlineComponent {
  protected graph = inject(GraphService);
  protected outline = inject(OutlineService);
  private contextMenu = inject(ContextMenuService);
  private canvasLock = inject(CanvasLockService);
  private viewport = inject(CanvasViewportService);

  /**
   * Rows rebuilt only when the outline's structural inputs change. Nodes and
   * Connections are replaced wholesale on every drag frame, so the manual
   * key check keeps position and size writes from churning row identity.
   */
  private structureCache: { key: string; rows: OutlineRow[] } | null = null;

  private structureRows = computed<OutlineRow[]>(() => {
    const key = outlineStructureKey(this.graph.nodes(), this.graph.connections());
    const cached = this.structureCache;
    if (cached && cached.key === key) return cached.rows;
    const rows = buildOutlineRows(this.graph.nodes(), this.graph.connections());
    this.structureCache = { key, rows };
    return rows;
  });

  /** Filtered rows with collapse applied — blank filters respect collapse. */
  readonly visibleRows = computed<OutlineRow[]>(() => {
    const query = this.outline.filter();
    const filtered = filterOutlineRows(this.structureRows(), query);
    if (query.trim()) return filtered;
    const collapsed = new Set(this.outline.collapsedIds());
    if (collapsed.size === 0) return filtered;
    return filtered.filter(row => !row.parentId || !collapsed.has(row.parentId));
  });

  protected isCollapsed(groupId: string): boolean {
    // While filtering, matching children force their Group visibly expanded.
    if (this.outline.filter().trim()) return false;
    return this.outline.isCollapsed(groupId);
  }

  protected countsLabel(row: OutlineRow): string {
    if (row.kind === 'text-block') return '—';
    return `${row.inCount}→${row.outCount}`;
  }

  protected pick(row: OutlineRow, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.graph.toggleNodeSelection(row.id);
      return;
    }
    const size = this.viewport.visibleSize();
    if (this.canvasLock.locked()) {
      this.graph.zoomToElements([row.id], [], size.width, size.height);
      return;
    }
    this.graph.setSelection([row.id], []);
    this.graph.zoomToSelection(size.width, size.height);
  }

  protected openEditor(row: OutlineRow): void {
    if (this.canvasLock.locked()) return;
    this.graph.setSelection([row.id], []);
    if (row.kind === 'group') this.contextMenu.requestRename(row.id);
    else this.contextMenu.requestEditText(row.id);
  }

  /** Filter Enter frames the first visible hit, mirroring row picking. */
  protected frameFirstHit(): void {
    const first = this.visibleRows()[0];
    if (!first) return;
    const size = this.viewport.visibleSize();
    if (this.canvasLock.locked()) {
      this.graph.zoomToElements([first.id], [], size.width, size.height);
      return;
    }
    this.graph.setSelection([first.id], []);
    this.graph.zoomToSelection(size.width, size.height);
  }

  /** Arrow keys walk rows; Enter activates natively through the button. */
  protected onRowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const list = (event.currentTarget as HTMLElement | null)?.closest('ul');
    const rows = list ? Array.from(list.querySelectorAll<HTMLButtonElement>('.outline-row')) : [];
    const at = rows.indexOf(event.currentTarget as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? rows[at + 1] : rows[at - 1];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }
}
