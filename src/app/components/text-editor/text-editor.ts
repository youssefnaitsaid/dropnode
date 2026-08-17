import {
  Component,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBold,
  lucideItalic,
  lucideList,
  lucideLink,
  lucideHighlighter,
  lucideEllipsis,
} from '@ng-icons/lucide';
import { EditorState, AllSelection, Selection, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { MarkType } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { wrapInList, liftListItem, splitListItem } from 'prosemirror-schema-list';
import { Text, TextSize, textEquals, isTextEmpty } from '../../models/text';
import { textSchema } from './text-schema';
import { textToDoc, docToText } from './text-doc';

/**
 * The size the S/M/L row reads for a selection. A caret keeps typing-into
 * semantics (stored marks, else the marks at the caret). A non-empty range
 * follows the shared-value rule every other styling control uses (ADR-0015):
 * active only when every character in the range has one size — a mixed range
 * lights nothing. Head-position marks can't serve ranges: an AllSelection's
 * head sits past the last block's closing boundary, where no marks exist.
 */
export function sizeOfSelection(state: EditorState): TextSize | 'M' | undefined {
  const { selection } = state;
  if (selection.empty) {
    const size = textSchema.marks['size'].isInSet(state.storedMarks ?? selection.$from.marks());
    return (size?.attrs['level'] as TextSize) ?? 'M';
  }
  const sizeType = textSchema.marks['size'];
  let shared: TextSize | 'M' | undefined;
  let mixed = false;
  state.doc.nodesBetween(selection.from, selection.to, node => {
    if (!node.isText) return;
    const size = sizeType.isInSet(node.marks);
    const level = (size?.attrs['level'] as TextSize) ?? 'M';
    if (shared === undefined) shared = level;
    else if (shared !== level) mixed = true;
  });
  return mixed ? undefined : (shared ?? 'M');
}

/**
 * The Text editor: a ProseMirror view (ADR-0010) plus the Formatting Toolbar
 * in a CDK overlay floating above the edit target (flipping below when
 * clipped). Mounted only for the single Text being edited.
 *
 * Contract: Enter = new line / next bullet; blur or Ctrl+Enter commits;
 * Escape cancels; Ctrl+Z/Y are ProseMirror-internal while editing. `commit`
 * emits only when the content changed — the parent maps empty-Text semantics.
 */
@Component({
  selector: 'app-text-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [OverlayModule, NgIcon],
  providers: [
    provideIcons({ lucideBold, lucideItalic, lucideList, lucideLink, lucideHighlighter, lucideEllipsis }),
  ],
  template: `
    <div
      class="text-editor-host"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (mousedown)="$event.stopPropagation()"
      (dblclick)="$event.stopPropagation()"
      (contextmenu)="$event.stopPropagation()"
    >
      <div #pmHost class="pm-host"></div>
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="true"
      [cdkConnectedOverlayPositions]="toolbarPositions"
    >
      <div
        class="formatting-toolbar"
        role="toolbar"
        aria-label="Formatting"
        (mousedown)="onToolbarMouseDown($event)"
        (contextmenu)="$event.stopPropagation()"
      >
        <button
          type="button" class="ft-btn" [class.active]="boldActive()"
          title="Bold (Ctrl+B)" aria-label="Bold" (click)="toggleBold()"
        ><ng-icon name="lucideBold" /></button>
        <button
          type="button" class="ft-btn" [class.active]="italicActive()"
          title="Italic (Ctrl+I)" aria-label="Italic" (click)="toggleItalic()"
        ><ng-icon name="lucideItalic" /></button>

        <!-- Secondary formatting behind an overflow: bold/italic cover the
             common label edit; bullets, links, highlight, and size stay one
             tap away (critique: full toolbar per edit session is heavy) -->
        <button
          type="button" class="ft-btn" [class.active]="showMore()"
          title="More formatting" aria-label="More formatting"
          [attr.aria-expanded]="showMore()"
          (click)="toggleMore()"
        ><ng-icon name="lucideEllipsis" /></button>

        @if (showMore()) {
          <button
            type="button" class="ft-btn" [class.active]="bulletsActive()"
            title="Bulleted list" aria-label="Bulleted list" (click)="toggleBullets()"
          ><ng-icon name="lucideList" /></button>
          <button
            type="button" class="ft-btn" [class.active]="linkActive()"
            title="Link" aria-label="Link" (click)="onLinkButton()"
          ><ng-icon name="lucideLink" /></button>
          <button
            type="button" class="ft-btn" [class.active]="highlightActive()"
            title="Highlight" aria-label="Highlight" (click)="toggleHighlight()"
          ><ng-icon name="lucideHighlighter" /></button>

          <span class="ft-separator"></span>

          <button
            type="button" class="ft-btn ft-size" [class.active]="sizeActive() === 'S'"
            title="Small text" aria-label="Small text" (click)="applySize('S')"
          >S</button>
          <button
            type="button" class="ft-btn ft-size" [class.active]="sizeActive() === 'M'"
            title="Medium text (default)" aria-label="Medium text" (click)="applySize('M')"
          >M</button>
          <button
            type="button" class="ft-btn ft-size" [class.active]="sizeActive() === 'L'"
            title="Large text" aria-label="Large text" (click)="applySize('L')"
          >L</button>
        }

        @if (linkInputOpen()) {
          <input
            #linkInput
            class="ft-link-input"
            type="text"
            placeholder="https://…"
            (keydown.enter)="applyLink(linkInput.value)"
            (keydown.escape)="closeLinkInput()"
            (blur)="onLinkInputBlur($event)"
          />
        }
      </div>
    </ng-template>
  `,
  styles: [`
    app-text-editor {
      display: block;
      width: 100%;
    }
    app-text-editor .pm-host .ProseMirror {
      outline: none;
      white-space: pre-wrap;
      overflow-wrap: normal;
      line-height: 1.4;
      cursor: text;
      caret-color: var(--dn-accent);
    }
    app-text-editor .pm-host .ProseMirror p {
      margin: 0;
      min-height: 1.4em;
    }
    app-text-editor .pm-host .ProseMirror ul {
      margin: 0;
      padding-left: 1.3em;
      text-align: left;
      list-style: disc;
    }
    app-text-editor .pm-host .ProseMirror strong { font-weight: 700; }
    app-text-editor .pm-host .ProseMirror mark {
      background: var(--dn-highlight);
      border-radius: 2px;
      padding: 0 1px;
      color: inherit;
    }
    app-text-editor .pm-host .ProseMirror a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    app-text-editor .pm-host .ProseMirror span[data-size='S'] { font-size: var(--tv-size-s, 11px); }
    app-text-editor .pm-host .ProseMirror span[data-size='L'] { font-size: var(--tv-size-l, 18px); }

    .formatting-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px;
      background: var(--dn-chip);
      border: 1px solid color-mix(in srgb, var(--dn-accent) 45%, transparent);
      border-radius: 8px;
      box-shadow: var(--dn-shadow-chip);
    }
    .formatting-toolbar .ft-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--dn-chip-ink);
      font-size: 13px;
      cursor: pointer;
    }
    .formatting-toolbar .ft-btn:hover { background: color-mix(in srgb, var(--dn-accent) 20%, transparent); }
    .formatting-toolbar .ft-btn.active {
      background: var(--dn-accent);
      color: var(--dn-accent-ink);
    }
    .formatting-toolbar .ft-size { font-weight: 600; }
    .formatting-toolbar .ft-separator {
      width: 1px;
      height: 16px;
      margin: 0 3px;
      background: color-mix(in srgb, var(--dn-chip-ink) 25%, transparent);
    }
    .formatting-toolbar .ft-link-input {
      margin-left: 4px;
      width: 170px;
      height: 26px;
      padding: 0 8px;
      border: 1px solid var(--dn-accent);
      border-radius: 6px;
      background: var(--dn-chip-input);
      color: var(--dn-chip-ink);
      font-size: 12px;
      outline: none;
    }
  `],
})
export class TextEditorComponent implements AfterViewInit, OnDestroy {
  text = input.required<Text>();

  // Emitted once per edit session: commit only when content changed
  commit = output<Text>();
  cancelled = output<void>();

  // Above the target, centered; flips below when clipped by the viewport top
  toolbarPositions: ConnectedPosition[] = [
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  ];

  boldActive = signal(false);
  italicActive = signal(false);
  highlightActive = signal(false);
  linkActive = signal(false);
  bulletsActive = signal(false);
  /** Secondary formatting (bullets/link/highlight/size) behind the overflow. */
  showMore = signal(false);
  // undefined = a mixed-size selection — no size button highlights
  sizeActive = signal<'S' | 'M' | 'L' | undefined>('M');
  linkInputOpen = signal(false);

  toggleMore(): void {
    this.showMore.update((v) => !v);
  }

  private pmHost = viewChild.required<ElementRef<HTMLDivElement>>('pmHost');
  private linkInputRef = viewChild<ElementRef<HTMLInputElement>>('linkInput');

  private view: EditorView | null = null;
  private finished = false;

  constructor() {
    // Focus the URL input when it opens (autofocus doesn't fire dynamically)
    effect(() => {
      this.linkInputRef()?.nativeElement.focus();
    });
  }

  ngAfterViewInit(): void {
    const doc = textSchema.nodeFromJSON(textToDoc(this.text()));
    const state = EditorState.create({
      doc,
      // Pre-select existing Text so typing replaces it; for empty Text just
      // place the caret (nothing to select)
      selection: isTextEmpty(this.text()) ? Selection.atEnd(doc) : new AllSelection(doc),
      plugins: [
        history(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Z': redo,
          'Mod-b': toggleMark(textSchema.marks['bold']),
          'Mod-i': toggleMark(textSchema.marks['italic']),
          'Mod-Enter': () => {
            this.finish();
            return true;
          },
          'Escape': () => {
            this.cancel();
            return true;
          },
          'Enter': splitListItem(textSchema.nodes['list_item']),
        }),
        keymap(baseKeymap),
        this.blurPlugin(),
      ],
    });

    this.view = new EditorView(this.pmHost().nativeElement, {
      state,
      dispatchTransaction: tr => {
        if (!this.view) return;
        this.view.updateState(this.view.state.apply(tr));
        this.refreshToolbarState();
      },
    });
    this.view.focus();
    this.refreshToolbarState();
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  // ── Commit / cancel ──────────────────────────────────────────────

  private blurPlugin(): Plugin {
    return new Plugin({
      props: {
        handleDOMEvents: {
          blur: (_view, event) => {
            // Focus moving into the Formatting Toolbar (URL input) is not a
            // commit — the edit session is still alive
            const related = (event as FocusEvent).relatedTarget as HTMLElement | null;
            if (related?.closest('.formatting-toolbar')) return false;
            this.finish();
            return false;
          },
        },
      },
    });
  }

  private finish(): void {
    if (this.finished || !this.view) return;
    this.finished = true;
    const newText = docToText(this.view.state.doc.toJSON());
    // Unchanged content commits nothing — no History entry
    if (!textEquals(newText, this.text())) {
      this.commit.emit(newText);
    } else {
      this.cancelled.emit();
    }
  }

  private cancel(): void {
    if (this.finished) return;
    this.finished = true;
    this.cancelled.emit();
  }

  // ── Formatting Toolbar ───────────────────────────────────────────

  onToolbarMouseDown(event: MouseEvent): void {
    event.stopPropagation();
    // Keep focus (and the selection) in the editor — except for the URL input
    if (!(event.target as HTMLElement).closest('.ft-link-input')) {
      event.preventDefault();
    }
  }

  toggleBold(): void {
    this.runCommand(toggleMark(textSchema.marks['bold']));
  }

  toggleItalic(): void {
    this.runCommand(toggleMark(textSchema.marks['italic']));
  }

  toggleHighlight(): void {
    this.runCommand(toggleMark(textSchema.marks['highlight']));
  }

  toggleBullets(): void {
    this.runCommand(
      this.bulletsActive()
        ? liftListItem(textSchema.nodes['list_item'])
        : wrapInList(textSchema.nodes['bullet_list']),
    );
  }

  applySize(level: 'S' | 'M' | 'L'): void {
    if (!this.view) return;
    const { state } = this.view;
    const type = textSchema.marks['size'];
    const { from, to, empty } = state.selection;
    let tr = state.tr;
    if (empty) {
      tr = tr.removeStoredMark(type);
      if (level !== 'M') tr = tr.addStoredMark(type.create({ level }));
    } else {
      tr = tr.removeMark(from, to, type);
      if (level !== 'M') tr = tr.addMark(from, to, type.create({ level }));
    }
    this.view.dispatch(tr);
    this.view.focus();
  }

  onLinkButton(): void {
    if (this.linkActive()) {
      // Toggle off: unlink the selection
      if (!this.view) return;
      const { state } = this.view;
      const { from, to } = state.selection;
      this.view.dispatch(state.tr.removeMark(from, to, textSchema.marks['link']));
      this.view.focus();
      return;
    }
    if (this.view?.state.selection.empty) return;
    this.linkInputOpen.set(true);
  }

  applyLink(rawUrl: string): void {
    const trimmed = rawUrl.trim();
    this.linkInputOpen.set(false);
    if (!this.view || trimmed === '') {
      this.view?.focus();
      return;
    }
    // Bare domains get https://; anything non-http(s) is normalized too
    const url = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const { state } = this.view;
    const { from, to } = state.selection;
    const type = textSchema.marks['link'];
    this.view.dispatch(
      state.tr.removeMark(from, to, type).addMark(from, to, type.create({ href: url })),
    );
    this.view.focus();
  }

  closeLinkInput(): void {
    this.linkInputOpen.set(false);
    this.view?.focus();
  }

  // If focus leaves the URL input for somewhere outside the toolbar and the
  // editor (e.g. a click on the canvas), the session must still commit — the
  // PM view already blurred earlier and won't fire its own blur again.
  onLinkInputBlur(event: FocusEvent): void {
    this.linkInputOpen.set(false);
    const next = event.relatedTarget as HTMLElement | null;
    const stayingInEditor =
      next?.closest('.formatting-toolbar') || next?.closest('.text-editor-host');
    if (!stayingInEditor) {
      this.finish();
    }
  }

  private runCommand(
    command: (state: EditorState, dispatch: (tr: any) => void) => boolean,
  ): void {
    if (!this.view) return;
    command(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  // ── Toolbar pressed-state from the current selection ─────────────

  private refreshToolbarState(): void {
    if (!this.view) return;
    const state = this.view.state;
    this.boldActive.set(this.isMarkActive(state, textSchema.marks['bold']));
    this.italicActive.set(this.isMarkActive(state, textSchema.marks['italic']));
    this.highlightActive.set(this.isMarkActive(state, textSchema.marks['highlight']));
    this.linkActive.set(this.isMarkActive(state, textSchema.marks['link']));
    this.bulletsActive.set(this.isInBulletList(state));
    this.sizeActive.set(sizeOfSelection(state));
  }

  private isMarkActive(state: EditorState, type: MarkType): boolean {
    const { from, to, empty, $from } = state.selection;
    if (empty) {
      return !!type.isInSet(state.storedMarks ?? $from.marks());
    }
    return state.doc.rangeHasMark(from, to, type);
  }

  private isInBulletList(state: EditorState): boolean {
    const $from = state.selection.$from;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === textSchema.nodes['bullet_list']) return true;
    }
    return false;
  }
}
