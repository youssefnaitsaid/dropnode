import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMoveDiagonal2 } from '@ng-icons/lucide';
import {
  lucideAlignCenterHorizontal,
  lucideAlignCenterVertical,
  lucideAlignEndHorizontal,
  lucideAlignEndVertical,
  lucideAlignHorizontalSpaceBetween,
  lucideAlignStartHorizontal,
  lucideAlignStartVertical,
  lucideAlignVerticalSpaceBetween,
  lucideArrowLeft,
  lucideArrowRight,
  lucideBraces,
  lucideCircle,
  lucideClipboardPaste,
  lucideCommand,
  lucideCopy,
  lucideCopyPlus,
  lucideDiamond,
  lucideDownload,
  lucideEraser,
  lucideFileJson,
  lucideFocus,
  lucideFolderPlus,
  lucideGroup,
  lucideImageDown,
  lucideLibrary,
  lucideLink,
  lucideMap,
  lucideMaximize,
  lucideMessageCircle,
  lucideMinus,
  lucideNetwork,
  lucidePanelLeft,
  lucidePencil,
  lucidePill,
  lucidePlay,
  lucidePresentation,
  lucideRedo2,
  lucideSave,
  lucideScissors,
  lucideSearch,
  lucideSquare,
  lucideSquareCheckBig,
  lucideSquarePlus,
  lucideSquareX,
  lucideTrash2,
  lucideUndo2,
  lucideUpload,
  lucideZoomIn,
  lucideZoomOut,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCommandImports } from '@spartan-ng/helm/command';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { CommandPaletteService } from '../../services/command-palette.service';
import { CollectionService } from '../../services/collection.service';
import { PaletteEntryRegistry } from '../../services/palette-entry-registry.service';
import { PaletteCategory, PaletteEntry } from '../../models/palette';

interface PaletteGroup {
  category: PaletteCategory;
  entries: PaletteEntry[];
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmInput, HlmCommandImports, HlmDialogImports],
  providers: [provideIcons({
    lucideAlignCenterHorizontal,
    lucideAlignCenterVertical,
    lucideAlignEndHorizontal,
    lucideAlignEndVertical,
    lucideAlignHorizontalSpaceBetween,
    lucideAlignStartHorizontal,
    lucideAlignStartVertical,
    lucideAlignVerticalSpaceBetween,
    lucideArrowLeft,
    lucideArrowRight,
    lucideBraces,
    lucideCircle,
    lucideClipboardPaste,
    lucideCommand,
    lucideCopy,
    lucideCopyPlus,
    lucideDiamond,
    lucideDownload,
    lucideEraser,
    lucideFileJson,
    lucideFocus,
    lucideFolderPlus,
    lucideGroup,
    lucideImageDown,
    lucideLibrary,
    lucideLink,
    lucideMap,
    lucideMaximize,
    lucideMessageCircle,
    lucideMinus,
    lucideMoveDiagonal2,
    lucideNetwork,
    lucidePanelLeft,
    lucidePencil,
    lucidePill,
    lucidePlay,
    lucidePresentation,
    lucideRedo2,
    lucideSave,
    lucideScissors,
    lucideSearch,
    lucideSquare,
    lucideSquareCheckBig,
    lucideSquarePlus,
    lucideSquareX,
    lucideTrash2,
    lucideUndo2,
    lucideUpload,
    lucideZoomIn,
    lucideZoomOut,
  })],
  template: `
    <hlm-dialog
      [state]="palette.isOpen() ? 'open' : 'closed'"
      [closeOnOutsidePointerEvents]="true"
      (closed)="onDialogClosed()"
    >
      <hlm-dialog-content
        *hlmDialogPortal
        class="palette-content w-[min(720px,calc(100vw-2rem))] max-w-none overflow-hidden border-primary/35 bg-card p-0 shadow-2xl"
        [showCloseButton]="false"
      >
        <hlm-dialog-header class="sr-only">
          <h2 hlmDialogTitle>Command Palette</h2>
          <p hlmDialogDescription>Search for a command to run.</p>
        </hlm-dialog-header>

        <div
          data-command-palette-content
          class="palette-shell"
          (keydown)="onKeydown($event)"
        >
          <div class="palette-header">
            @if (palette.step() === 'collections') {
              <button
                hlmBtn
                variant="ghost"
                size="icon-sm"
                class="palette-back"
                (click)="backToCommands()"
                aria-label="Back to commands"
                title="Back to commands"
              >
                <ng-icon name="lucideArrowLeft" />
              </button>
            } @else {
              <span class="palette-mark" aria-hidden="true">
                <ng-icon name="lucideCommand" />
              </span>
            }
            <span class="palette-input-icon" aria-hidden="true">
              <ng-icon name="lucideSearch" />
            </span>
            <input
              #searchInput
              hlmInput
              id="command-palette-search"
              class="palette-input"
              [value]="query()"
              [placeholder]="palette.step() === 'collections' ? 'Choose a Collection…' : 'Search commands…'"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              [attr.aria-controls]="palette.step() === 'collections' ? 'command-palette-collections' : 'command-palette-results'"
              [attr.aria-activedescendant]="activeDescendant()"
              (input)="onQueryChange($event)"
            />
            <kbd class="palette-dismiss-hint">Esc</kbd>
          </div>

          @if (palette.step() === 'collections') {
            <div hlmCommand [filter]="alwaysShow" class="palette-command">
              <div
                id="command-palette-collections"
                class="palette-list"
                role="listbox"
                aria-label="Collections"
              >
                @for (collection of filteredCollections(); track collection.id; let index = $index) {
                  <button
                    hlmCommandItem
                    type="button"
                    class="palette-item"
                    [class.palette-active]="collectionIndex() === index"
                    [attr.id]="collectionOptionId(collection.id)"
                    [attr.aria-selected]="collectionIndex() === index"
                    [value]="collection.id"
                    (mouseenter)="collectionIndex.set(index)"
                    [attr.data-selected]="collectionIndex() === index ? '' : null"
                    (click)="selectCollection(collection.id)"
                  >
                    <ng-icon class="palette-item-icon" name="lucideLibrary" aria-hidden="true" />
                    <span class="palette-item-copy">
                      <span class="palette-item-label">{{ collection.name }}</span>
                      <span class="palette-item-meta">Collection</span>
                    </span>
                    @if (collectionIndex() === index) {
                      <span class="palette-enter-hint">Enter</span>
                    }
                  </button>
                } @empty {
                  <div class="palette-empty" role="status">
                    <strong>No Collections match</strong>
                    <span>Try a different name or press Escape to go back.</span>
                  </div>
                }
              </div>
            </div>
            <div class="palette-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>Enter</kbd> choose</span>
              <span><kbd>Esc</kbd> back</span>
            </div>
          } @else {
            <div
              hlmCommand
              [filter]="alwaysShow"
              class="palette-command"
            >
              <div
                id="command-palette-results"
                hlmCommandList
                class="palette-list"
                aria-label="Commands"
              >
                @for (group of groupedEntries(); track group.category) {
                  <div hlmCommandGroup>
                    <div hlmCommandGroupLabel class="palette-category">{{ group.category }}</div>
                    @for (entry of group.entries; track entry.id) {
                      <button
                        hlmCommandItem
                        type="button"
                        class="palette-item"
                        [class.palette-active]="isActive(entry)"
                        [class.palette-unavailable]="!entry.available"
                        [disabled]="!entry.available"
                        [value]="entry.id"
                        [attr.id]="optionId(entry.id)"
                        [attr.aria-disabled]="!entry.available"
                        [attr.aria-selected]="isActive(entry) ? 'true' : 'false'"
                        [attr.data-selected]="isActive(entry) ? '' : null"
                        [attr.data-palette-active]="isActive(entry) ? '' : null"
                        (mouseenter)="activate(entry)"
                        (click)="execute(entry)"
                      >
                        @if (entry.swatch) {
                          <span class="palette-swatch" [style.background]="entry.swatch" aria-hidden="true"></span>
                        } @else if (entry.linePreview) {
                          <span class="palette-line-preview" aria-hidden="true">
                            <svg viewBox="0 0 20 20" width="16" height="16">
                              <path
                                d="M2 10 H18"
                                fill="none"
                                stroke="currentColor"
                                [attr.stroke-width]="entry.linePreview.width ?? 2"
                                stroke-linecap="round"
                                [attr.stroke-dasharray]="entry.linePreview.dash ?? null"
                              />
                            </svg>
                          </span>
                        } @else if (entry.icon) {
                          <ng-icon class="palette-item-icon" [name]="entry.icon" aria-hidden="true" />
                        }
                        <span class="palette-item-copy">
                          <span class="palette-item-label">{{ entry.label }}</span>
                          @if (!entry.available) {
                            <span class="palette-item-meta palette-disabled-reason">{{ entry.disabledReason }}</span>
                          }
                        </span>
                        @if (entry.shortcut) {
                          <span class="palette-shortcut">{{ entry.shortcut }}</span>
                        }
                      </button>
                    }
                  </div>
                } @empty {
                  <div class="palette-empty" role="status">
                    <strong>No commands match “{{ query() }}”</strong>
                    <span>Try a label, alias, or category.</span>
                  </div>
                }
              </div>
            </div>
            <div class="palette-footer">
              <span [attr.aria-live]="'polite'">{{ resultAnnouncement() }}</span>
              <span class="palette-footer-keys"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span class="palette-footer-keys"><kbd>Enter</kbd> run</span>
              <span class="palette-footer-keys"><kbd>[</kbd><kbd>]</kbd> Connections</span>
              <span class="palette-footer-keys"><kbd>Esc</kbd> close</span>
            </div>
          }
        </div>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
  styles: [`
    :host {
      display: contents;
    }

    /* The panel keeps its 1px border-primary/35 hairline from the template;
       the 3px left accent edge is gone — a colored side border above 1px is
       the tell of assembled UIs, and the active item's inset bar (below) is
       the only side accent that carries meaning. */
    .palette-shell {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: color-mix(in srgb, var(--card) 96%, var(--primary) 4%);
    }

    .palette-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, var(--primary) 18%);
    }

    .palette-mark,
    .palette-back {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      color: var(--primary);
    }

    .palette-mark {
      width: 28px;
      height: 28px;
      border: 1px solid color-mix(in srgb, var(--primary) 55%, var(--border));
      border-radius: 8px;
      background: color-mix(in srgb, var(--primary) 15%, var(--card));
    }

    .palette-input-icon {
      display: inline-flex;
      color: var(--muted-foreground);
    }

    .palette-input {
      min-width: 0;
      flex: 1;
      height: 32px;
      border: 0;
      background: transparent;
      box-shadow: none;
      font-size: 15px;
    }

    /* The field is borderless by design, but a focused search box still needs
       a visible indicator (WCAG 2.4.7): a soft primary ring replaces the
       default outline without adding a box. */
    .palette-input:focus {
      outline: none;
    }
    .palette-input:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent);
      border-radius: 6px;
    }

    .palette-dismiss-hint,
    .palette-footer kbd,
    .palette-shortcut,
    .palette-enter-hint {
      border: 1px solid var(--border);
      border-bottom-color: color-mix(in srgb, var(--border) 70%, var(--foreground));
      border-radius: 5px;
      background: var(--muted);
      color: var(--muted-foreground);
      font-family: inherit;
      font-size: 10px;
      line-height: 1;
      letter-spacing: 0.03em;
      padding: 4px 6px;
      white-space: nowrap;
    }

    .palette-list {
      max-height: min(58vh, 520px);
      padding: 6px;
    }

    .palette-command {
      min-height: 0;
      background: transparent;
    }

    .palette-category {
      padding: 9px 9px 5px;
      color: var(--muted-foreground);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .palette-item {
      min-height: 46px;
      border: 1px solid transparent;
      border-radius: 8px;
      gap: 10px;
      padding: 8px 9px;
      text-align: left;
    }

    .palette-item.palette-active,
    .palette-item[data-palette-active] {
      border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
      background: color-mix(in srgb, var(--primary) 14%, var(--muted));
      box-shadow: inset 3px 0 var(--primary);
    }

    .palette-swatch {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      border-radius: 5px;
      border: 2px solid color-mix(in srgb, var(--foreground) 20%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
    }

    .palette-item-icon,
    .palette-line-preview {
      display: inline-flex;
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      align-items: center;
      justify-content: center;
      color: var(--muted-foreground);
    }

    .palette-item-icon {
      font-size: 16px;
    }

    .palette-item-copy {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-direction: column;
      gap: 2px;
    }

    .palette-item-label {
      overflow: hidden;
      color: var(--foreground);
      font-size: 13px;
      font-weight: 550;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .palette-item-meta {
      overflow: hidden;
      color: var(--muted-foreground);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .palette-disabled-reason {
      color: color-mix(in srgb, var(--destructive) 72%, var(--muted-foreground));
    }

    .palette-unavailable {
      cursor: not-allowed;
      opacity: 0.62;
    }

    .palette-shortcut,
    .palette-enter-hint {
      margin-left: auto;
    }

    .palette-empty {
      display: flex;
      min-height: 150px;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 6px;
      padding: 24px;
      color: var(--muted-foreground);
      text-align: center;
    }

    .palette-empty strong {
      color: var(--foreground);
      font-size: 13px;
    }

    .palette-empty span {
      font-size: 12px;
    }

    .palette-footer {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 36px;
      padding: 7px 14px;
      border-top: 1px solid var(--border);
      color: var(--muted-foreground);
      font-size: 10px;
    }

    .palette-footer > :first-child {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .palette-footer-keys {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    @media (max-width: 640px) {
      .palette-footer-keys:nth-last-child(-n + 2) {
        display: none;
      }
    }
  `],
})
export class CommandPaletteComponent {
  protected readonly palette = inject(CommandPaletteService);
  protected readonly registry = inject(PaletteEntryRegistry);
  protected readonly collectionService = inject(CollectionService);

  readonly query = signal('');
  readonly activeIndex = signal(0);
  readonly collectionIndex = signal(0);

  readonly filteredEntries = computed(() => this.registry.search(this.query()));
  readonly availableEntries = computed(() => this.filteredEntries().filter(entry => entry.available));
  readonly groupedEntries = computed<PaletteGroup[]>(() => {
    const groups = new Map<PaletteCategory, PaletteEntry[]>();
    for (const entry of this.filteredEntries()) {
      const entries = groups.get(entry.category) ?? [];
      entries.push(entry);
      groups.set(entry.category, entries);
    }
    return [...groups.entries()].map(([category, entries]) => ({ category, entries }));
  });
  readonly filteredCollections = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.collectionService.collections().filter(collection =>
      !query || collection.name.toLocaleLowerCase().includes(query),
    );
  });
  readonly activeEntry = computed(() => this.availableEntries()[this.activeIndex()] ?? null);
  readonly activeCollection = computed(() => this.filteredCollections()[this.collectionIndex()] ?? null);
  readonly activeDescendant = computed(() => {
    if (this.palette.step() === 'collections') {
      const collection = this.activeCollection();
      return collection ? this.collectionOptionId(collection.id) : null;
    }
    const entry = this.activeEntry();
    return entry ? this.optionId(entry.id) : null;
  });
  readonly resultAnnouncement = computed(() => {
    const count = this.filteredEntries().length;
    const available = this.availableEntries().length;
    if (count === 0) return 'No commands found';
    return `${count} ${count === 1 ? 'command' : 'commands'} found, ${available} available`;
  });

  protected readonly alwaysShow = (): boolean => true;
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    effect(() => {
      const open = this.palette.isOpen();
      const step = this.palette.step();
      if (!open) return;
      this.query.set('');
      this.activeIndex.set(0);
      this.collectionIndex.set(0);
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
      void step;
    });
  }

  onDialogClosed(): void {
    if (this.palette.isOpen()) this.palette.close();
  }

  onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
    this.collectionIndex.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key.toLocaleLowerCase() === 'k') return;

    if (event.key === 'Tab') {
      this.trapFocus(event);
      return;
    }

    if (this.palette.step() === 'collections') {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          this.moveCollection(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          this.moveCollection(-1);
          return;
        case 'Home':
          event.preventDefault();
          event.stopPropagation();
          this.collectionIndex.set(0);
          return;
        case 'End':
          event.preventDefault();
          event.stopPropagation();
          this.collectionIndex.set(Math.max(0, this.filteredCollections().length - 1));
          return;
        case 'Enter':
          event.preventDefault();
          event.stopPropagation();
          this.selectCollection(this.activeCollection()?.id);
          return;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          this.backToCommands();
          return;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.moveEntry(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.moveEntry(-1);
        break;
      case 'Home':
        event.preventDefault();
        event.stopPropagation();
        this.activeIndex.set(0);
        break;
      case 'End':
        event.preventDefault();
        event.stopPropagation();
        this.activeIndex.set(Math.max(0, this.availableEntries().length - 1));
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        const active = this.activeEntry();
        if (active) this.execute(active);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.palette.close();
        break;
    }
  }

  isActive(entry: PaletteEntry): boolean {
    return this.activeEntry()?.id === entry.id;
  }

  activate(entry: PaletteEntry): void {
    if (!entry.available) return;
    const index = this.availableEntries().findIndex(item => item.id === entry.id);
    if (index >= 0) this.activeIndex.set(index);
  }

  execute(entry: PaletteEntry): void {
    const wasCommandsStep = this.palette.step() === 'commands';
    if (!this.registry.execute(entry.id)) return;
    if (wasCommandsStep && this.palette.step() === 'collections') {
      this.query.set('');
      this.collectionIndex.set(0);
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
      return;
    }
    // Command execution may open an editor, dialog, or route. Let that target
    // keep focus instead of restoring the palette opener over it.
    this.palette.close(false);
  }

  backToCommands(): void {
    this.palette.backToCommands();
    this.query.set('');
    this.activeIndex.set(0);
    this.collectionIndex.set(0);
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }

  selectCollection(collectionId: string | undefined): void {
    if (!collectionId) return;
    this.registry.saveScratchAsProject(collectionId);
    this.palette.close(false);
  }

  optionId(entryId: string): string {
    return `command-palette-option-${entryId}`;
  }

  collectionOptionId(collectionId: string): string {
    return `command-palette-collection-${collectionId}`;
  }

  private moveEntry(delta: number): void {
    const count = this.availableEntries().length;
    if (count === 0) return;
    this.activeIndex.update(index => (index + delta + count) % count);
  }

  private moveCollection(delta: number): void {
    const count = this.filteredCollections().length;
    if (count === 0) return;
    this.collectionIndex.update(index => (index + delta + count) % count);
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-command-palette-content]')
      : null;
    if (!root) return;
    const focusable = [...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) return;
    const current = document.activeElement;
    const index = focusable.indexOf(current as HTMLElement);
    if (event.shiftKey && (index <= 0 || index < 0)) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && (index === focusable.length - 1 || index < 0)) {
      event.preventDefault();
      focusable[0]?.focus();
    }
  }
}
