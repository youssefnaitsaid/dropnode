import { Injectable, computed, inject, signal } from '@angular/core';
import { GraphService } from './graph.service';
import { PresentationService } from './presentation.service';
import { ContextMenuService } from './context-menu.service';
import { chainOf } from '../models/chain';

@Injectable({ providedIn: 'root' })
export class ChainHighlightService {
  private graphService = inject(GraphService);
  private presentationService = inject(PresentationService);
  private contextMenuService = inject(ContextMenuService);

  /** Currently hovered Node/Group id, or null. Canvas drives this via hover events. */
  private _hoveredId = signal<string | null>(null);

  /** Suppression flags driven by Canvas (drag gestures) and editing state. */
  private _dragSuppressed = signal(false);
  private _nodeEditing = signal(false);
  private _connectionEditing = signal(false);

  readonly hoveredId = this._hoveredId.asReadonly();

  /** True when any suppression condition is active. */
  readonly isSuppressed = computed(() => {
    if (this._dragSuppressed()) return true;
    if (this._nodeEditing()) return true;
    if (this._connectionEditing()) return true;
    if (this.presentationService.active()) return true;
    if (this.contextMenuService.menuKind() !== null) return true;
    return false;
  });

  /** Raw traversal, ignoring suppression — empty when hovered has no Connections. */
  private raw = computed(() =>
    chainOf(this._hoveredId(), this.graphService.nodes(), this.graphService.connections()),
  );

  /** Whether a highlight should currently be rendered (not suppressed and not empty). */
  readonly hasHighlight = computed(() => !this.isSuppressed() && !this.raw().empty);

  /** Nodes/Groups that should appear lit (selected styling, not actually selected). */
  readonly litNodeIds = computed(() => {
    if (this.isSuppressed() || this.raw().empty) return new Set<string>();
    return this.raw().nodeIds;
  });

  /** Connections that should appear lit (selected stroke + glow + traveling light). */
  readonly litConnectionIds = computed(() => {
    if (this.isSuppressed() || this.raw().empty) return new Set<string>();
    return this.raw().connectionIds;
  });

  /** Whether the graph should be dimming non-lit elements. */
  readonly shouldDim = computed(() => this.hasHighlight());

  /** External API: Canvas sets the hovered element, or clears it. */
  setHovered(id: string | null): void {
    this._hoveredId.set(id);
  }

  clearHovered(): void {
    this._hoveredId.set(null);
  }

  setDragSuppressed(v: boolean): void {
    this._dragSuppressed.set(v);
  }

  setEditingSuppressed(v: boolean): void {
    this._nodeEditing.set(v);
  }

  setNodeEditingSuppressed(v: boolean): void {
    this._nodeEditing.set(v);
  }

  setConnectionEditingSuppressed(v: boolean): void {
    this._connectionEditing.set(v);
  }

  /** Convenience for template bindings. */
  isNodeLit(nodeId: string): boolean {
    return this.litNodeIds().has(nodeId);
  }

  isConnectionLit(connectionId: string): boolean {
    return this.litConnectionIds().has(connectionId);
  }

  isNodeDimmed(nodeId: string): boolean {
    return this.shouldDim() && !this.isNodeLit(nodeId);
  }

  isConnectionDimmed(connectionId: string): boolean {
    return this.shouldDim() && !this.isConnectionLit(connectionId);
  }
}
