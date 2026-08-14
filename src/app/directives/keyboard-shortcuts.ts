import { Directive, inject, HostListener } from '@angular/core';
import { GraphService } from '../services/graph.service';
import { HistoryService } from '../services/history.service';
import { SidebarService } from '../services/sidebar.service';
import { ClipboardService } from '../services/clipboard.service';
import { PresentationService } from '../services/presentation.service';
import {
  DeleteConnectionCommand, DeleteNodeCompoundCommand, buildDeleteSelectionCommand,
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

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Don't handle shortcuts when typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

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
        this.clipboardService.pasteAtCursor();
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

    // Delete/Backspace: delete the Selection. A single element keeps its
    // exact single-target Command (a lone Group still releases children); a
    // multi-Selection deletes as one compound step where a Group is removed
    // WITH its children (ADR-0015).
    if (event.key === 'Delete' || event.key === 'Backspace') {
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

    // Escape: clear the whole Selection
    if (event.key === 'Escape') {
      this.graphService.clearSelection();
      (document.activeElement as HTMLElement)?.blur();
      return;
    }
  }
}
