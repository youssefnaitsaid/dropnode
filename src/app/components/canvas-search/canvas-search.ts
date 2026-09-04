import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { CanvasSearchService } from '../../services/canvas-search.service';
import { CanvasSearchHit } from '../../models/canvas-search';

/**
 * Canvas Search overlay (grilled spec, issue #64): a keyboard-first dialog
 * searching Text, Group Labels, and Pin strings Canvas-wide. Thin glue —
 * state, matching, and activation live in CanvasSearchService; this shell
 * only renders rows and forwards keys. Opens via Ctrl+F or its Palette
 * Entry, never stacked over another modal (the service owns the guard).
 */
@Component({
  selector: 'app-canvas-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (search.isOpen()) {
      <div class="canvas-search-backdrop" (mousedown)="onBackdrop($event)">
        <div
          class="canvas-search"
          role="dialog"
          aria-modal="true"
          aria-label="Search Canvas"
          (mousedown)="$event.stopPropagation()"
        >
          <input
            #queryInput
            id="canvas-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="canvas-search-list"
            [attr.aria-expanded]="search.totalCount() > 0"
            [attr.aria-activedescendant]="search.activeHit() ? optionId(search.activeHit()!.id) : null"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search Text, Labels, and Pins…"
            [value]="search.query()"
            (input)="onQueryInput($event)"
            (keydown)="onKeydown($event)"
          />
          @if (search.query().trim() === '') {
            <p class="canvas-search-hint">Type to search Text, Labels, and Pins across the Canvas</p>
          } @else if (search.totalCount() === 0) {
            <p class="canvas-search-hint">No matches for &ldquo;{{ search.query().trim() }}&rdquo;</p>
          } @else {
            <p class="canvas-search-count" role="status" aria-live="polite">
              {{ search.totalCount() }} {{ search.totalCount() === 1 ? 'hit' : 'hits' }}
            </p>
            <div class="canvas-search-list" role="listbox" id="canvas-search-list">
              @for (hit of search.visibleResults(); track hit.id; let i = $index) {
                <div
                  class="canvas-search-row"
                  [class.active]="i === search.activeIndex()"
                  role="option"
                  [id]="optionId(hit.id)"
                  [attr.aria-selected]="i === search.activeIndex()"
                  (click)="onPick(hit.id)"
                  (mousemove)="onHover(i)"
                >
                  <span class="canvas-search-kind">{{ kindLabel(hit) }}</span>
                  <span class="canvas-search-snippet">{{ snippetBefore(hit) }}<mark>{{ snippetMatch(hit) }}</mark>{{ snippetAfter(hit) }}</span>
                  @if (hit.context) {
                    <span class="canvas-search-context">{{ hit.context }}</span>
                  }
                </div>
              }
            </div>
            @if (search.hasMore()) {
              <p class="canvas-search-hint">+{{ search.totalCount() - search.visibleResults().length }} more — keep typing</p>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .canvas-search-backdrop {
      position: fixed;
      inset: 0;
      z-index: var(--dn-z-toast);
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 12vh;
      background: transparent;
      pointer-events: auto;
    }
    .canvas-search {
      width: min(560px, calc(100vw - 2rem));
      max-height: min(60vh, 480px);
      overflow: auto;
      border-radius: 8px;
      background: var(--dn-chip);
      color: var(--dn-chip-ink);
      border: 1px solid color-mix(in srgb, var(--dn-chip-ink) 15%, transparent);
      box-shadow: var(--dn-shadow-pop);
      padding: 8px;
    }
    #canvas-search-input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--dn-chip-ink) 20%, transparent);
      background: var(--dn-chip-input);
      color: var(--dn-chip-ink);
      font-size: 14px;
      outline: none;
    }
    #canvas-search-input:focus-visible {
      border-color: var(--dn-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--dn-accent) 40%, transparent);
    }
    .canvas-search-hint {
      margin: 0;
      padding: 12px;
      font-size: 13px;
      color: color-mix(in srgb, var(--dn-chip-ink) 65%, transparent);
    }
    .canvas-search-count {
      margin: 0;
      padding: 8px 12px 4px;
      font-size: 12px;
      font-weight: 600;
      color: color-mix(in srgb, var(--dn-chip-ink) 65%, transparent);
    }
    .canvas-search-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px;
    }
    .canvas-search-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
    }
    .canvas-search-row.active {
      background: color-mix(in srgb, var(--dn-accent) 18%, transparent);
    }
    .canvas-search-kind {
      flex: none;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: color-mix(in srgb, var(--dn-chip-ink) 60%, transparent);
    }
    .canvas-search-snippet {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .canvas-search-snippet mark {
      background: var(--dn-accent);
      color: var(--dn-accent-ink);
      border-radius: 2px;
      padding: 0 1px;
    }
    .canvas-search-context {
      flex: none;
      max-width: 40%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      color: color-mix(in srgb, var(--dn-chip-ink) 60%, transparent);
    }
  `],
})
export class CanvasSearchComponent {
  protected readonly search = inject(CanvasSearchService);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  constructor() {
    // Consume Palette-Entry open requests (the shell's dialog pattern):
    // untracked so the effect answers only to the counter. The request path
    // skips the DOM modal guard (see openFromRequest): the closing Palette's
    // dialog detaches asynchronously, after this effect runs.
    effect(() => {
      if (this.search.openRequests() === 0) return;
      untracked(() => this.search.openFromRequest());
    });
    effect(() => {
      if (!this.search.isOpen()) return;
      const element = this.input()?.nativeElement;
      if (element) {
        element.focus();
        element.select();
      }
    });
  }

  optionId(id: string): string {
    return `canvas-search-option-${id}`;
  }

  kindLabel(hit: CanvasSearchHit): string {
    switch (hit.kind) {
      case 'node': return 'Node';
      case 'text-block': return 'Text Block';
      case 'connection': return 'Connection';
      case 'group': return 'Group';
      case 'pin': return 'Pin';
    }
  }

  snippetBefore(hit: CanvasSearchHit): string {
    return hit.snippet.slice(0, hit.matchStart);
  }

  snippetMatch(hit: CanvasSearchHit): string {
    return hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength);
  }

  snippetAfter(hit: CanvasSearchHit): string {
    return hit.snippet.slice(hit.matchStart + hit.matchLength);
  }

  onQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.search.setQuery(value);
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.search.moveActive(1);
        this.scrollActiveIntoView();
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.search.moveActive(-1);
        this.scrollActiveIntoView();
        return;
      case 'Enter':
        event.preventDefault();
        this.search.activateCurrent();
        return;
      case 'Escape':
        event.preventDefault();
        this.search.close();
        return;
    }
  }

  onHover(index: number): void {
    if (this.search.activeIndex() !== index) this.search.activeIndex.set(index);
  }

  onPick(id: string): void {
    const hit = this.search.visibleResults().find(h => h.id === id);
    if (hit) this.search.activate(hit);
  }

  onBackdrop(event: MouseEvent): void {
    event.stopPropagation();
    this.search.close();
  }

  private scrollActiveIntoView(): void {
    const hit = this.search.activeHit();
    if (!hit || typeof document === 'undefined') return;
    const element = document.getElementById(this.optionId(hit.id));
    // jsdom (and some embeds) have no scrollIntoView — navigation still works.
    if (typeof element?.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }
}
