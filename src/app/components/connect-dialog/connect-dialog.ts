import { Component, signal, computed, inject, ChangeDetectionStrategy, viewChild, ElementRef } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLink, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { GraphNode, HandleSide, isTextBlock, oppositeHandle } from '../../models/node';
import { textToPlainString } from '../../models/text';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { KeyboardConnectionService } from '../../services/keyboard-connection.service';
import { CreateConnectionCommand } from '../../services/commands';

// The drag path attaches to the Handle nearest the pointer; the keyboard
// dialog has no pointer, so the Handle facing the other Node is the natural
// default (a right-facing source meets a left-facing target, like a drag).
function facingHandle(source: GraphNode, target: GraphNode): HandleSide {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

@Component({
  selector: 'app-connect-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  imports: [FormsModule, NgIcon, HlmButton, CdkTrapFocus],
  providers: [provideIcons({ lucideLink, lucideX })],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4" (click)="close()">
        <div
          class="w-[420px] max-w-[90vw] rounded-xl border border-border bg-card text-card-foreground p-6 shadow-2xl"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-label="Connect Nodes"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
        >
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold">Connect Nodes</h2>
            <button #closeButton hlmBtn variant="ghost" size="icon-sm" (click)="close()" aria-label="Close">
              <ng-icon name="lucideX" />
            </button>
          </div>

          <div class="space-y-4">
            <label class="block">
              <span class="mb-1 block text-sm font-medium">From node</span>
              <select
                [(ngModel)]="sourceNodeId"
                class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                @for (node of nodes(); track node.id) {
                  <option [ngValue]="node.id">{{ nodeName(node) }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="mb-1 block text-sm font-medium">To node</span>
              <select
                [(ngModel)]="targetNodeId"
                class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                @for (node of nodes(); track node.id) {
                  @if (node.id !== sourceNodeId()) {
                    <option [ngValue]="node.id">{{ nodeName(node) }}</option>
                  }
                }
              </select>
            </label>

            <p class="text-xs text-muted-foreground">
              Handles are chosen automatically to face each other.
            </p>
          </div>

          @if (error(); as message) {
            <p role="alert" class="mt-3 text-sm text-destructive">{{ message }}</p>
          }

          <div class="mt-6 flex justify-end gap-2">
            <button hlmBtn variant="ghost" (click)="close()">Cancel</button>
            <button hlmBtn (click)="connect()">Connect</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConnectDialogComponent {
  private graphService = inject(GraphService);
  private historyService = inject(HistoryService);
  private keyboardConnection = inject(KeyboardConnectionService);

  private closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  isOpen = signal(false);
  sourceNodeId = signal<string | null>(null);
  targetNodeId = signal<string | null>(null);

  nodes = computed(() =>
    this.graphService.nodes().filter(n => !isTextBlock(n)),
  );

  nodeName(node: GraphNode): string {
    if (node.kind === 'group') return node.label?.trim() || 'Group';
    return textToPlainString(node.text ?? []).trim() || 'Node';
  }

  // Live validation mirrors the graph's createConnection guards; the dialog
  // shows the reason inline instead of a silent no-op on Connect
  error = computed(() => {
    const sourceId = this.sourceNodeId();
    const targetId = this.targetNodeId();
    if (!sourceId || !targetId || sourceId === targetId) return 'Pick two different nodes';
    const source = this.graphService.nodes().find(n => n.id === sourceId);
    const target = this.graphService.nodes().find(n => n.id === targetId);
    if (!source || !target) return null;
    const sourceHandle = facingHandle(source, target);
    return this.keyboardConnection.invalidConnectionReason(
      { sourceNodeId: sourceId, sourceHandle },
      { nodeId: targetId, handle: oppositeHandle(sourceHandle) },
    );
  });

  open(): void {
    const nodes = this.nodes();
    if (nodes.length < 2) return;
    const selected = this.graphService.selectedNodeIds();
    const preferred = selected.length === 1 ? nodes.find(n => n.id === selected[0]) : undefined;
    this.sourceNodeId.set(preferred?.id ?? nodes[0].id);
    this.targetNodeId.set(nodes.find(n => n.id !== (preferred?.id ?? nodes[0].id))?.id ?? null);
    this.isOpen.set(true);
    queueMicrotask(() => this.closeButton()?.nativeElement.focus());
  }

  close(): void {
    this.isOpen.set(false);
  }

  connect(): void {
    // The inline alert already explains why; don't fire an invalid Command
    if (this.error()) return;
    const sourceId = this.sourceNodeId();
    const targetId = this.targetNodeId();
    if (!sourceId || !targetId) return;
    const source = this.graphService.nodes().find(n => n.id === sourceId);
    const target = this.graphService.nodes().find(n => n.id === targetId);
    if (!source || !target) return;
    const sourceHandle = facingHandle(source, target);
    const command = new CreateConnectionCommand(
      this.graphService,
      sourceId,
      sourceHandle,
      targetId,
      oppositeHandle(sourceHandle),
    );
    this.historyService.execute(command);
    // Pre-validation mirrors the guards, so failure here is a race (the graph
    // changed under the dialog) — keep the dialog open rather than vanish
    if (!command.getConnection()) return;
    this.isOpen.set(false);
  }
}
