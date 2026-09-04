import { Directive, inject, HostListener } from '@angular/core';
import { GraphService } from '../services/graph.service';
import { HistoryService } from '../services/history.service';
import { SidebarService } from '../services/sidebar.service';
import { ClipboardService } from '../services/clipboard.service';
import { PresentationService } from '../services/presentation.service';
import { CanvasLockService } from '../services/canvas-lock.service';
import { CommandPaletteService } from '../services/command-palette.service';
import { CanvasSearchService } from '../services/canvas-search.service';
import { KeyboardScopeService } from '../services/keyboard-scope.service';
import { CanvasViewportService } from '../services/canvas-viewport.service';
import { KeyboardConnectionService } from '../services/keyboard-connection.service';
import { ResizeModeService } from '../services/resize-mode.service';
import {
  DeleteConnectionCommand, DeleteNodeCompoundCommand, RemoveConnectionReroutePointCommand,
  buildDeleteSelectionCommand,
} from '../services/commands';

@Directive({
  selector: '[appKeyboardShortcuts]',
  standalone: true,
})
export class KeyboardShortcuts {
  private graphService = inject(GraphService);
  private historyService = inject(HistoryService);
  private sidebarService = inject(SidebarService);
  private clipboardService = inject(ClipboardService);
  private presentationService = inject(PresentationService);
  private canvasLock = inject(CanvasLockService);
  private commandPaletteService = inject(CommandPaletteService);
  private canvasSearchService = inject(CanvasSearchService);
  private keyboardScope = inject(KeyboardScopeService);
  private canvasViewport = inject(CanvasViewportService);
  private keyboardConnection = inject(KeyboardConnectionService);
  private resizeMode = inject(ResizeModeService);

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // The Palette owns the whole shell while open. Ctrl+K is its symmetric
    // toggle even though focus is inside the search input.
    if (this.commandPaletteService.isOpen()) {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.commandPaletteService.close();
      }
      return;
    }

    // Canvas Search owns the shell while open (its input owns Enter, Escape,
    // and arrows); every global shortcut below is dead until it closes.
    if (this.canvasSearchService.isOpen()) {
      return;
    }

    // Don't handle shortcuts when typing in an input or contenteditable.
    if (this.keyboardScope.isTypingTarget(event.target)) return;

    // Present Mode is a third keyboard context beside "canvas" and "editing
    // Text": only Step navigation and Escape live — every global shortcut
    // below is dead until the tour ends. Auto-repeat is ignored so a held
    // key advances one Step, not a blur of them.
    if (this.presentationService.active()) {
      if (event.repeat) return;
      if (
        event.key === 'ArrowRight' || event.key === 'ArrowDown' ||
        event.key === 'PageDown' || event.key === 'Enter' || event.code === 'Space'
      ) {
        event.preventDefault();
        this.presentationService.next();
      } else if (
        event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp'
      ) {
        event.preventDefault();
        this.presentationService.previous();
      } else if (event.key === 'Escape') {
        this.presentationService.exit();
      }
      return;
    }

    // Canvas Lock is the Viewport-only keyboard context beside Present
    // Mode: Ctrl+K (Palette), Ctrl+F (Canvas Search), arrows (pan), and
    // Shift+1 (Zoom to fit) fall through to their handlers below — every
    // other global shortcut, including Escape (which never unlocks), is dead
    // until unlocked.
    if (this.canvasLock.locked()) {
      const paletteKey = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey &&
        event.key.toLowerCase() === 'k';
      const searchKey = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey &&
        event.key.toLowerCase() === 'f';
      const fitKey = event.shiftKey && !event.ctrlKey && !event.altKey && event.code === 'Digit1';
      const panKey = !event.ctrlKey && !event.altKey && !event.metaKey && event.key.startsWith('Arrow');
      if (!paletteKey && !searchKey && !fitKey && !panKey) return;
    }

    // Ctrl+K is the only Command Palette opener in this version. It stays
    // behind the same modal/present scope guard as the other global actions.
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const active = typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      this.commandPaletteService.open(active);
      return;
    }

    // Ctrl+F: Canvas Search. Claimed only with Canvas focus (the typing
    // guard above keeps browser find alive while editing Text) and behind
    // the modal guard (the service refuses Present Mode and stacked modals).
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      const active = typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      this.canvasSearchService.open(active);
      return;
    }

    // Ctrl+B: Toggle the Sidebar (a UI preference — never touches History)
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.sidebarService.toggle();
      return;
    }

    // Ctrl+Shift+Z: Redo (check before Ctrl+Z)
    if (event.ctrlKey && event.shiftKey && event.key === 'Z') {
      event.preventDefault();
      this.historyService.redo();
      return;
    }

    // Ctrl+Z: Undo
    if (event.ctrlKey && event.key === 'z') {
      event.preventDefault();
      this.historyService.undo();
      return;
    }

    // Clipboard shortcuts apply to the selected Nodes and Groups only; no
    // selection (or an empty Clipboard for paste) is a silent no-op
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      const selectedNodeIds = this.graphService.selectedNodeIds();

      // Ctrl+A: select the whole graph — Groups as units, loose Nodes, and
      // all Connections (ADR-0015)
      if (key === 'a') {
        event.preventDefault();
        this.graphService.selectAll();
        return;
      }

      // Ctrl+X: Cut the Selection's Nodes and Groups (explicitly selected
      // Connections are removed too, though danglers are never copied)
      if (key === 'x') {
        if (selectedNodeIds.length > 0) {
          event.preventDefault();
          this.clipboardService.cut(selectedNodeIds, this.graphService.selectedConnectionIds());
        }
        return;
      }

      // Ctrl+C: Copy the Selection's Nodes and Groups (never touches History)
      if (key === 'c') {
        if (selectedNodeIds.length > 0) {
          event.preventDefault();
          this.clipboardService.copy(selectedNodeIds);
        }
        return;
      }

      // Ctrl+V: Paste at the cursor, cascading on repeat pastes
      if (key === 'v') {
        event.preventDefault();
        this.clipboardService.pasteAtCursor(this.canvasViewport.visibleCanvasCenter());
        return;
      }

      // Ctrl+D: Duplicate the Selection's Nodes and Groups (Clipboard
      // untouched); preventDefault suppresses the browser's bookmark dialog
      if (key === 'd') {
        event.preventDefault();
        if (selectedNodeIds.length > 0) {
          this.clipboardService.duplicate(selectedNodeIds);
        }
        return;
      }
    }

    // Shift+1 / Shift+2: frame the whole graph / the current selection in the
    // Viewport. Keyed off event.code (not event.key) so the shifted glyph and
    // keyboard layout don't matter. Pure Viewport change — no History entry.
    if (event.shiftKey && !event.ctrlKey && !event.altKey && (event.code === 'Digit1' || event.code === 'Digit2')) {
      const rect = document.querySelector('.canvas-container')?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      if (event.code === 'Digit1') {
        this.graphService.zoomToFit(rect.width, rect.height);
      } else {
        this.graphService.zoomToSelection(rect.width, rect.height);
      }
      return;
    }

    // Armed Handle flow (keyboard Connection creation): Tab cycles between
    // Handles — the ghost follows focus — and Escape cancels the pending
    // Connection. Escape must short-circuit before the selection-clear below,
    // or cancelling would also wipe the user's Selection.
    if (this.keyboardConnection.pending()) {
      if (event.key === 'Tab') {
        event.preventDefault();
        this.keyboardConnection.cycleHandleFocus(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.keyboardConnection.cancel();
        return;
      }
    }

    // Tab while a Reroute Point is focused: cycle the selected Connection's
    // points. Runs after the pending-Connection block — the two flows are
    // mutually exclusive by construction.
    if (event.key === 'Tab') {
      const rerouteEl = document.activeElement instanceof Element
        ? document.activeElement.closest('.reroute-point')
        : null;
      if (rerouteEl) {
        event.preventDefault();
        this.keyboardConnection.cycleReroutePoints(event.shiftKey ? -1 : 1);
        return;
      }
    }

    // [ / ]: cycle the focusable Connections — the dense-canvas path to reach
    // a Connection without wading the tab order. Shift extends the Selection
    // (the app's additive convention). Dead while a Connection is pending, so
    // the ghost's focus flow is never yanked elsewhere.
    if (!event.ctrlKey && !event.altKey && !event.metaKey && (event.key === '[' || event.key === ']')) {
      if (this.keyboardConnection.pending()) return;
      event.preventDefault();
      this.keyboardConnection.cycleConnections(event.key === ']' ? 1 : -1, event.shiftKey);
      return;
    }

    // Viewport pan when nothing is focused: arrow keys pan 40 screen px
    // (10 with Shift). The focus state owns the arrow grammar — a focused
    // Node card nudges or resizes with the same keys, and interactive
    // elements (buttons, selects, inputs) keep their native arrow behavior.
    // Panning never touches History, matching every other Viewport change.
    if (!event.ctrlKey && !event.altKey && !event.metaKey &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
         event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const active = document.activeElement;
      const canvasFocused = active === document.body ||
        (active instanceof Element &&
         (active.classList.contains('canvas-container') || active.classList.contains('canvas-viewport')));
      if (!canvasFocused) return; // let the focused element handle arrows
      event.preventDefault();
      const viewport = this.graphService.viewportState();
      const screenStep = event.shiftKey ? 10 : 40;
      const dx = event.key === 'ArrowLeft' ? -screenStep : event.key === 'ArrowRight' ? screenStep : 0;
      const dy = event.key === 'ArrowUp' ? -screenStep : event.key === 'ArrowDown' ? screenStep : 0;
      this.graphService.setViewport({
        panX: viewport.panX + dx / viewport.zoom,
        panY: viewport.panY + dy / viewport.zoom,
      });
      return;
    }

    // Delete/Backspace: a focused Reroute Point is removed (its Connection's
    // selection is untouched); otherwise the Selection is deleted. A single
    // element keeps its exact single-target Command (a lone Group still
    // releases children); a multi-Selection deletes as one compound step where
    // a Group is removed WITH its children (ADR-0015).
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const rerouteEl = document.activeElement instanceof Element
        ? document.activeElement.closest('.reroute-point')
        : null;
      if (rerouteEl) {
        const connectionId = rerouteEl.getAttribute('data-connection-id');
        const indexAttr = rerouteEl.getAttribute('data-reroute-point-index');
        if (connectionId && indexAttr !== null && Number.isInteger(Number(indexAttr))) {
          event.preventDefault();
          this.historyService.execute(new RemoveConnectionReroutePointCommand(
            this.graphService,
            connectionId,
            Number(indexAttr),
          ));
          // The removed circle is gone; hand focus back to its Connection
          const hit = document.querySelector<SVGPathElement>(
            `path.connection-hit[data-connection-id="${connectionId}"]`,
          );
          hit?.focus();
          return;
        }
      }
      if (this.graphService.selectionSize() > 1) {
        event.preventDefault();
        const cmd = buildDeleteSelectionCommand(
          this.graphService,
          this.graphService.selectedNodeIds(),
          this.graphService.selectedConnectionIds(),
        );
        if (cmd) this.historyService.execute(cmd);
        return;
      }
      const selectedConnectionId = this.graphService.selectedConnectionId();
      if (selectedConnectionId) {
        event.preventDefault();
        const cmd = new DeleteConnectionCommand(this.graphService, selectedConnectionId);
        this.historyService.execute(cmd);
        return;
      }
      const selectedId = this.graphService.selectedNodeId();
      if (selectedId) {
        event.preventDefault();
        const cmd = new DeleteNodeCompoundCommand(this.graphService, selectedId);
        this.historyService.execute(cmd);
      }
      return;
    }

    // Escape: Resize mode is modal, so it exits first (keeping the Selection
    // — the user was resizing, not dismissing); otherwise clear the Selection
    if (event.key === 'Escape') {
      if (this.resizeMode.mode()) {
        event.preventDefault();
        this.resizeMode.exit();
        return;
      }
      this.graphService.clearSelection();
      (document.activeElement as HTMLElement)?.blur();
      return;
    }
  }
}
