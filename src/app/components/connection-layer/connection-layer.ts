import { Component, computed, effect, input, output, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { GraphNode, HandleSide, NODE_PALETTE, oppositeHandle } from '../../models/node';
import { Connection, ArrowheadType, effectiveArrowhead, effectiveTextPosition, effectiveStrokePattern, effectiveStrokeWeight, strokeWidthPx, strokeDasharray } from '../../models/connection';
import { Curve, connectionCurve, pointAt, textPositionFromPoint } from '../../models/curve';
import { Text, isTextEmpty } from '../../models/text';
import { GraphService } from '../../services/graph.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { PresentationService } from '../../services/presentation.service';
import { TextViewComponent } from '../text-view/text-view';
import { TextEditorComponent } from '../text-editor/text-editor';

interface DragState {
  sourceNodeId: string;
  sourceHandle: HandleSide;
  currentX: number;
  currentY: number;
  targetNodeId: string | null;
  targetHandle: HandleSide | null;
}

@Component({
  selector: 'app-connection-layer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextViewComponent, TextEditorComponent],
  template: `
    <svg class="connection-layer" [class.presenting]="presentationService.active()" [attr.width]="svgWidth()" [attr.height]="svgHeight()">
      <defs>
        @for (color of markerColors; track color) {
          <marker
            [attr.id]="markerId('arrow', color)"
            viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse"
          >
            <path d="M1,1 L9,5 L1,9" fill="none" [attr.stroke]="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </marker>
          <marker
            [attr.id]="markerId('triangle', color)"
            viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse"
          >
            <path d="M1,1 L9,5 L1,9 Z" [attr.fill]="color" />
          </marker>
        }
      </defs>
      @for (conn of connections(); track conn.id) {
        <!-- Invisible solid companion path (ADR-0020): the sole pointer target,
             so dash gaps and thin strokes never shrink the click area -->
        <path
          [attr.d]="getConnectionPath(conn)"
          [attr.data-connection-id]="conn.id"
          class="connection-hit"
          (mousedown)="onConnectionMouseDown(conn, $event)"
          (dblclick)="onConnectionDoubleClick(conn, $event)"
        />
        <path
          [attr.d]="getConnectionPath(conn)"
          [attr.marker-start]="markerStart(conn)"
          [attr.marker-end]="markerEnd(conn)"
          class="connection-path"
          [class.selected]="isSelected(conn.id)"
          [style.stroke]="strokeColor(conn)"
          [style.--sw]="strokeBaseWidth(conn)"
          [attr.stroke-dasharray]="strokeDash(conn)"
          [attr.stroke-linecap]="strokeDash(conn) ? 'round' : null"
          [style.filter]="isSelected(conn.id) ? glowFilter(conn) : null"
        />
      }

      @if (dragState()) {
        <path
          [attr.d]="getGhostPath()"
          class="connection-ghost"
        />
      }
    </svg>

    <!-- Connection Text renders as DOM cards (ADR-0001 hybrid: text in DOM, curves in SVG) -->
    <div class="label-layer" [class.presenting]="presentationService.active()">
      @for (conn of connections(); track conn.id) {
        @if (editingConnectionId() === conn.id) {
          <div
            class="connection-text-card editing"
            [style.left.px]="getTextCardPosition(conn).x"
            [style.top.px]="getTextCardPosition(conn).y"
            (mousedown)="$event.stopPropagation()"
            (dblclick)="$event.stopPropagation()"
            (contextmenu)="$event.stopPropagation()"
          >
            <app-text-editor
              [text]="conn.text ?? []"
              (commit)="onTextEditorCommit(conn, $event)"
              (cancelled)="cancelTextEdit()"
            />
          </div>
        } @else if (conn.text) {
          <div
            class="connection-text-card"
            [attr.data-connection-id]="conn.id"
            [class.selected]="isSelected(conn.id)"
            [style.left.px]="getTextCardPosition(conn).x"
            [style.top.px]="getTextCardPosition(conn).y"
            (mousedown)="onTextCardMouseDown(conn, $event)"
            (dblclick)="onConnectionDoubleClick(conn, $event)"
          >
            <app-text-view [text]="conn.text" />
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .connection-layer {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      overflow: visible;
    }
    .connection-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 12;
      pointer-events: stroke;
      cursor: pointer;
    }
    /* Present Mode: Connections are pictures — no hit area, no hover growth,
       no Text card interactions; mousedowns fall through to the canvas so
       free-roam panning still works over them */
    .presenting .connection-hit,
    .presenting .connection-text-card {
      pointer-events: none;
    }
    .connection-path {
      fill: none;
      stroke: #7c5cff;
      /* Width comes from the Stroke Weight preset (--sw, set inline); the
         hover/selected increments are relative (ADR-0020). Rounded linecaps
         (which draw dotted's dots) bind per path — only for dashed/dotted,
         so default solid curves keep their pre-feature butt caps. */
      stroke-width: calc(var(--sw, 2.5) * 1px);
      pointer-events: none;
      transition: stroke-width 0.15s ease, filter 0.15s ease;
    }
    .connection-hit:hover + .connection-path {
      stroke-width: calc((var(--sw, 2.5) + 1) * 1px);
    }
    .connection-path.selected,
    .connection-hit:hover + .connection-path.selected {
      stroke-width: calc((var(--sw, 2.5) + 1.5) * 1px);
    }
    .connection-ghost {
      fill: none;
      stroke: #7c5cff;
      stroke-width: 2;
      stroke-dasharray: 8 4;
      opacity: 0.7;
      pointer-events: none;
    }
    .label-layer {
      position: absolute;
      top: 0;
      left: 0;
    }
    .connection-text-card {
      position: absolute;
      transform: translate(-50%, -50%);
      background: #1c1c22;
      border: 1px solid rgba(124, 92, 255, 0.45);
      border-radius: 10px;
      padding: 3px 10px;
      color: #e8e8ee;
      font-size: 12px;
      font-weight: 500;
      max-width: 240px;
      width: max-content;
      text-align: center;
      cursor: pointer;
      user-select: none;
      --tv-size-s: 10px;
      --tv-size-l: 15px;
    }
    .connection-text-card.selected {
      border-color: #7c5cff;
      box-shadow: 0 0 0 2px rgba(124, 92, 255, 0.4);
    }
    .connection-text-card.editing {
      border-color: #7c5cff;
      width: 240px;
      cursor: text;
      user-select: text;
    }
  `],
})
export class ConnectionLayerComponent {
  private graphService = inject(GraphService);
  protected presentationService = inject(PresentationService);

  nodes = this.graphService.nodes;
  connections = this.graphService.connections;

  // Default stroke when a Connection carries no color (matches the CSS fallback)
  private static readonly DEFAULT_STROKE = '#7c5cff';

  // SVG markers don't inherit stroke color, so one marker is emitted per
  // possible stroke color: the default plus every palette color.
  readonly markerColors: readonly string[] = [
    ConnectionLayerComponent.DEFAULT_STROKE,
    ...NODE_PALETTE,
  ];

  markerId(type: 'arrow' | 'triangle', color: string): string {
    return `ah-${type}-${color.replace('#', '')}`;
  }

  strokeColor(conn: Connection): string {
    return conn.color ?? ConnectionLayerComponent.DEFAULT_STROKE;
  }

  // The at-rest curve width from the Stroke Weight preset; hover/selected
  // increments are applied in CSS on top of this custom property
  strokeBaseWidth(conn: Connection): number {
    return strokeWidthPx(effectiveStrokeWeight(conn), 'base');
  }

  // Dash rhythm scales with the base width (ADR-0020); null keeps solid
  strokeDash(conn: Connection): string | null {
    return strokeDasharray(effectiveStrokePattern(conn), this.strokeBaseWidth(conn));
  }

  // A colored Connection keeps its own color when selected; the glow matches it
  glowFilter(conn: Connection): string {
    return `drop-shadow(0 0 4px ${this.strokeColor(conn)})`;
  }

  markerStart(conn: Connection): string | null {
    return this.markerRef(effectiveArrowhead(conn, 'start'), conn);
  }

  markerEnd(conn: Connection): string | null {
    return this.markerRef(effectiveArrowhead(conn, 'end'), conn);
  }

  // A shared marker (orient="auto-start-reverse") serves both endpoints: it
  // points outward at the start and into the target at the end.
  private markerRef(type: ArrowheadType, conn: Connection): string | null {
    if (type === 'none') return null;
    return `url(#${this.markerId(type, this.strokeColor(conn))})`;
  }

  svgWidth = computed(() => {
    const nodes = this.nodes();
    if (nodes.length === 0) return 5000;
    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    return Math.max(maxX + 1000, 5000);
  });

  svgHeight = computed(() => {
    const nodes = this.nodes();
    if (nodes.length === 0) return 5000;
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    return Math.max(maxY + 1000, 5000);
  });

  dragState = signal<DragState | null>(null);

  // Connection whose Text is being edited inline, if any
  editingConnectionId = signal<string | null>(null);

  private contextMenuService = inject(ContextMenuService);

  constructor() {
    // The context menu's "Edit text" opens this Connection's inline editor
    effect(() => {
      const id = this.contextMenuService.connectionTextRequest();
      if (id && this.connections().some(c => c.id === id)) {
        this.editingConnectionId.set(id);
        this.contextMenuService.clearConnectionTextRequest();
      }
    });
  }

  connectionSelect = output<{ connectionId: string; additive: boolean }>();
  // Mousedown on a Text card: the Canvas owns the gesture (click-select vs
  // 2px-threshold drag along the curve), mirroring the node-drag split
  textDragStart = output<{ connectionId: string; event: MouseEvent }>();
  // null means the Text was cleared (committing empty removes it)
  textCommit = output<{ connectionId: string; newText: Text | null }>();

  snapTarget = computed(() => {
    const state = this.dragState();
    if (!state || !state.targetNodeId || !state.targetHandle) return null;
    return { nodeId: state.targetNodeId, handle: state.targetHandle };
  });

  private getHandlePos(nodeId: string, handle: HandleSide): { x: number; y: number } {
    return this.graphService.getHandlePosition(nodeId, handle) ?? { x: 0, y: 0 };
  }

  getConnectionPath(conn: Connection): string {
    return this.formatBezier(this.getCurve(conn));
  }

  // The Text card centers on the bezier point at the Connection's stored
  // position (absent means the midpoint, ADR-0013)
  getTextCardPosition(conn: Connection): { x: number; y: number } {
    return pointAt(this.getCurve(conn), effectiveTextPosition(conn));
  }

  // Cursor→position projection for the Text card drag, delegated to the pure
  // curve module (nearest-t, clamped, midpoint-snapped)
  textPositionAtPoint(connectionId: string, canvasX: number, canvasY: number): number | null {
    const conn = this.connections().find(c => c.id === connectionId);
    if (!conn) return null;
    return textPositionFromPoint(this.getCurve(conn), { x: canvasX, y: canvasY });
  }

  private getCurve(conn: Connection): Curve {
    const start = this.getHandlePos(conn.sourceNodeId, conn.sourceHandle);
    const end = this.getHandlePos(conn.targetNodeId, conn.targetHandle);
    return connectionCurve(start, end, conn.sourceHandle, conn.targetHandle);
  }

  isSelected(connectionId: string): boolean {
    return this.graphService.isConnectionSelected(connectionId);
  }

  getGhostPath(): string {
    const state = this.dragState();
    if (!state) return '';
    const start = this.getHandlePos(state.sourceNodeId, state.sourceHandle);
    const end = { x: state.currentX, y: state.currentY };
    const endHandle = state.targetHandle ?? oppositeHandle(state.sourceHandle);
    return this.formatBezier(connectionCurve(start, end, state.sourceHandle, endHandle));
  }

  private formatBezier(curve: Curve): string {
    const { start, cp1, cp2, end } = curve;
    return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
  }

  // Public API for CanvasComponent
  startConnectionDrag(nodeId: string, handle: HandleSide, _event: MouseEvent): void {
    const pos = this.getHandlePos(nodeId, handle);
    this.dragState.set({
      sourceNodeId: nodeId,
      sourceHandle: handle,
      currentX: pos.x,
      currentY: pos.y,
      targetNodeId: null,
      targetHandle: null,
    });
  }

  updateConnectionDrag(canvasX: number, canvasY: number): void {
    const state = this.dragState();
    if (!state) return;

    const snapThreshold = 30;
    let targetNodeId: string | null = null;
    let targetHandle: HandleSide | null = null;
    let minDist = snapThreshold;

    const sourceNode = this.nodes().find(n => n.id === state.sourceNodeId);
    for (const node of this.nodes()) {
      if (node.id === state.sourceNodeId) continue;
      // A Group and its own children are never snap targets of each other
      if (node.parentId === state.sourceNodeId || sourceNode?.parentId === node.id) continue;
      for (const side of ['top', 'right', 'bottom', 'left'] as HandleSide[]) {
        const handlePos = this.getHandlePos(node.id, side);
        const dist = Math.sqrt((canvasX - handlePos.x) ** 2 + (canvasY - handlePos.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          targetNodeId = node.id;
          targetHandle = side;
        }
      }
    }

    this.dragState.update(s => s ? {
      ...s,
      currentX: canvasX,
      currentY: canvasY,
      targetNodeId,
      targetHandle,
    } : null);
  }

  endConnectionDrag(): { targetNodeId: string; targetHandle: HandleSide } | null {
    const state = this.dragState();
    this.dragState.set(null);
    if (state && state.targetNodeId && state.targetHandle) {
      return { targetNodeId: state.targetNodeId, targetHandle: state.targetHandle };
    }
    return null;
  }

  onConnectionMouseDown(conn: Connection, event: MouseEvent): void {
    // Left button only — right-click is reserved for the context menu, and
    // middle-drag must bubble up so the Canvas can pan
    if (event.button !== 0) return;
    event.stopPropagation();
    this.connectionSelect.emit({ connectionId: conn.id, additive: event.ctrlKey });
  }

  // A Text card mousedown selects (as any Connection click) and arms a
  // potential drag; whether it becomes one is the Canvas's threshold call.
  // Ctrl+click only toggles membership — it never arms a drag.
  onTextCardMouseDown(conn: Connection, event: MouseEvent): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.connectionSelect.emit({ connectionId: conn.id, additive: event.ctrlKey });
    if (!event.ctrlKey) {
      this.textDragStart.emit({ connectionId: conn.id, event });
    }
  }

  onConnectionDoubleClick(conn: Connection, event: MouseEvent): void {
    event.stopPropagation();
    this.editingConnectionId.set(conn.id);
  }

  // Unlike Node Text, committing empty is meaningful: it removes the Text.
  // The editor only emits when the content changed.
  onTextEditorCommit(conn: Connection, newText: Text): void {
    this.editingConnectionId.set(null);
    const cleared = isTextEmpty(newText);
    // Emptying an already-unlabeled Connection changes nothing — no Command
    if (cleared && !conn.text) return;
    this.textCommit.emit({
      connectionId: conn.id,
      newText: cleared ? null : newText,
    });
  }

  cancelTextEdit(): void {
    this.editingConnectionId.set(null);
  }
}
