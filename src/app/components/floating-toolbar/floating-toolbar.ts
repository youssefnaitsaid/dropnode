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
import { CanvasToolService } from '../../services/canvas-tool.service';
import { CanvasLockService } from '../../services/canvas-lock.service';
import { PresentationService } from '../../services/presentation.service';
import { PinVisibilityService } from '../../services/pin-visibility.service';

/**
 * The Floating Toolbar: persistent Select/Pan modes plus one-shot armed
 * placements for Node, Group, Text Block, and Pin. Bottom pill of the
 * floating stack; the parent hides it in Present Mode. Arming is disabled
 * while the Canvas is locked or presenting; Pin additionally while Pins are
 * hidden. The placement click on the Canvas commits one undoable Command
 * and reverts to Select; re-clicking the tool, switching tools,
 * right-clicking, or Escape cancels with no History entry.
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
        (click)="toggleNode()"
        [disabled]="addDisabled()"
        [class.tool-active]="tool.isNodeArmed()"
        [attr.aria-pressed]="tool.isNodeArmed()"
        title="Add Node" aria-label="Add Node"
      >
        <ng-icon name="lucideSquarePlus" />
      </button>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="toggleGroup()"
        [disabled]="addDisabled()"
        [class.tool-active]="tool.isGroupArmed()"
        [attr.aria-pressed]="tool.isGroupArmed()"
        title="Add Group" aria-label="Add Group"
      >
        <ng-icon name="lucideGroup" />
      </button>
      <button
        hlmBtn variant="ghost" size="icon"
        (click)="toggleTextBlock()"
        [disabled]="addDisabled()"
        [class.tool-active]="tool.isTextBlockArmed()"
        [attr.aria-pressed]="tool.isTextBlockArmed()"
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
  private readonly lock = inject(CanvasLockService);
  private readonly presenting = inject(PresentationService);
  private readonly pins = inject(PinVisibilityService);

  /** Arming is dead while locked or presenting (the parent hides the stack). */
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

  toggleNode(): void {
    if (this.addDisabled()) return;
    if (this.tool.isNodeArmed()) this.tool.select();
    else this.tool.armNode();
  }

  toggleGroup(): void {
    if (this.addDisabled()) return;
    if (this.tool.isGroupArmed()) this.tool.select();
    else this.tool.armGroup();
  }

  toggleTextBlock(): void {
    if (this.addDisabled()) return;
    if (this.tool.isTextBlockArmed()) this.tool.select();
    else this.tool.armTextBlock();
  }

  togglePin(): void {
    if (this.pinDisabled()) return;
    if (this.tool.isPinArmed()) this.tool.select();
    else this.tool.armPin();
  }
}
