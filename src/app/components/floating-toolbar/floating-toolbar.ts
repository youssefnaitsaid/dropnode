import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideMousePointer2,
  lucideHand,
  lucideSquarePlus,
  lucideGroup,
  lucideMessageCircle,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import { CanvasToolService } from '../../services/canvas-tool.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { PresentationService } from '../../services/presentation.service';
import { PinVisibilityService } from '../../services/pin-visibility.service';
import {
  CreateNodeCommand,
  CreateGroupCommand,
  CreateTextBlockCommand,
} from '../../services/commands';

/**
 * The Floating Toolbar: persistent Select/Pan modes plus immediate Add
 * Node/Group/Text Block and armed Add Pin. Bottom pill of the floating
 * stack; the parent hides it in Present Mode. Adds are disabled while the
 * Canvas is locked or presenting; Pin additionally while Pins are hidden.
 */
@Component({
  selector: 'app-floating-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton],
  providers: [
    provideIcons({
      lucideMousePointer2,
      lucideHand,
      lucideSquarePlus,
      lucideGroup,
      lucideMessageCircle,
    }),
  ],
  template: `
    <div class="floating-toolbar" role="toolbar" aria-label="Canvas tools">
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="select()"
        [class.tool-active]="tool.isSelect()"
        [attr.aria-pressed]="tool.isSelect()"
        title="Select (V)" aria-label="Select"
      >
        <ng-icon name="lucideMousePointer2" />
      </button>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="pan()"
        [class.tool-active]="tool.isPan()"
        [attr.aria-pressed]="tool.isPan()"
        title="Pan (H)" aria-label="Pan"
      >
        <ng-icon name="lucideHand" />
      </button>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="addNode()"
        [disabled]="addDisabled()"
        title="Add Node" aria-label="Add Node"
      >
        <ng-icon name="lucideSquarePlus" />
      </button>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="addGroup()"
        [disabled]="addDisabled()"
        title="Add Group" aria-label="Add Group"
      >
        <ng-icon name="lucideGroup" />
      </button>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="addTextBlock()"
        [disabled]="addDisabled()"
        title="Add Text Block" aria-label="Add Text Block"
      >
        <ng-icon name="lucideSquarePlus" />
      </button>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="togglePin()"
        [disabled]="pinDisabled()"
        [class.tool-active]="tool.isPinArmed()"
        [attr.aria-pressed]="tool.isPinArmed()"
        title="Add Pin" aria-label="Add Pin"
      >
        <ng-icon name="lucideMessageCircle" />
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .floating-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--dn-shadow-chip);
    }
    .floating-toolbar button:hover {
      color: var(--card-foreground) !important;
    }
    .tool-active {
      background: var(--primary) !important;
      color: var(--primary-foreground) !important;
    }
    .toolbar-divider {
      width: 1px;
      align-self: stretch;
      margin: 4px;
      background: var(--border);
    }
  `],
})
export class FloatingToolbarComponent {
  readonly tool = inject(CanvasToolService);
  private readonly graphService = inject(GraphService);
  private readonly historyService = inject(HistoryService);
  private readonly menus = inject(ContextMenuService);
  private readonly viewport = inject(CanvasViewportService);
  private readonly lock = inject(CanvasLockService);
  private readonly presenting = inject(PresentationService);
  private readonly pins = inject(PinVisibilityService);

  /** Adds are Viewport-centered Commands: dead while locked or presenting. */
  readonly addDisabled = computed(() => this.lock.locked() || this.presenting.active());
  /** Pin arming additionally needs Pins visible. */
  readonly pinDisabled = computed(
    () => this.lock.locked() || this.presenting.active() || this.pins.hidden(),
  );

  select(): void {
    this.tool.select();
  }

  pan(): void {
    this.tool.pan();
  }

  togglePin(): void {
    if (this.pinDisabled()) return;
    if (this.tool.isPinArmed()) this.tool.select();
    else this.tool.armPin();
  }

  /** Palette-path verbatim: centered 160x48 Node plus its Text editor request. */
  addNode(): void {
    if (this.addDisabled()) return;
    const center = this.viewport.visibleCanvasCenter();
    const command = new CreateNodeCommand(this.graphService, 'New Node', center.x - 80, center.y - 24);
    this.historyService.execute(command);
    const node = command.getNode();
    if (node) this.menus.requestEditText(node.id);
  }

  /** Palette-path verbatim: centered 320x200 Group plus its Label editor request. */
  addGroup(): void {
    if (this.addDisabled()) return;
    const center = this.viewport.visibleCanvasCenter();
    const command = new CreateGroupCommand(this.graphService, 'New Group', center.x - 160, center.y - 100);
    this.historyService.execute(command);
    const group = command.getGroup();
    if (group) this.menus.requestRename(group.id);
  }

  /** Palette-path verbatim: centered 160x48 Text Block plus its Text editor request. */
  addTextBlock(): void {
    if (this.addDisabled()) return;
    const center = this.viewport.visibleCanvasCenter();
    const command = new CreateTextBlockCommand(this.graphService, 'New Text Block', center.x - 80, center.y - 24);
    this.historyService.execute(command);
    const block = command.getNode();
    if (block) this.menus.requestEditText(block.id);
  }
}
