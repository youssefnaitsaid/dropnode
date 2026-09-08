import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlignStartVertical,
  lucideAlignCenterVertical,
  lucideAlignEndVertical,
  lucideAlignStartHorizontal,
  lucideAlignCenterHorizontal,
  lucideAlignEndHorizontal,
  lucideAlignHorizontalSpaceBetween,
  lucideAlignVerticalSpaceBetween,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { GraphService } from '../../services/graph.service';
import { HistoryService } from '../../services/history.service';
import { ContextMenuService } from '../../services/context-menu.service';
import { AlignKind, DistributeAxis } from '../../models/align-distribute';

/**
 * The Align Popover: the eight arrangement actions in a three-column grid —
 * six Align variants plus two Distribute variants. Rendered above the
 * Selection Actions Bar while the More trigger is active; Distribute stays
 * disabled below three node roots, mirroring the top-toolbar rules.
 */
@Component({
  selector: 'app-align-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton],
  providers: [
    provideIcons({
      lucideAlignStartVertical,
      lucideAlignCenterVertical,
      lucideAlignEndVertical,
      lucideAlignStartHorizontal,
      lucideAlignCenterHorizontal,
      lucideAlignEndHorizontal,
      lucideAlignHorizontalSpaceBetween,
      lucideAlignVerticalSpaceBetween,
    }),
  ],
  template: `
    <div class="align-popover" role="toolbar" aria-label="Align and distribute">
      @for (option of alignOptions; track option.kind) {
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="align(option.kind)"
          [title]="option.label" [attr.aria-label]="option.label"
        >
          <ng-icon [name]="option.icon" />
        </button>
      }
      @for (option of distributeOptions; track option.axis) {
        <button
          hlmBtn variant="ghost" size="icon"
          (click)="distribute(option.axis)"
          [disabled]="distributeDisabled()"
          [title]="option.label" [attr.aria-label]="option.label"
        >
          <ng-icon [name]="option.icon" />
        </button>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .align-popover {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 8px;
      background: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--dn-shadow-pop);
    }
    .align-popover button:hover {
      color: var(--card-foreground) !important;
    }
  `],
})
export class AlignPopoverComponent {
  private readonly graphService = inject(GraphService);
  private readonly historyService = inject(HistoryService);
  private readonly menus = inject(ContextMenuService);

  readonly distributeDisabled = computed(() => this.graphService.selectedNodeIds().length < 3);

  readonly alignOptions: { kind: AlignKind; icon: string; label: string }[] = [
    { kind: 'left', icon: 'lucideAlignStartVertical', label: 'Align Left' },
    { kind: 'center', icon: 'lucideAlignCenterVertical', label: 'Align Horizontal Center' },
    { kind: 'right', icon: 'lucideAlignEndVertical', label: 'Align Right' },
    { kind: 'top', icon: 'lucideAlignStartHorizontal', label: 'Align Top' },
    { kind: 'middle', icon: 'lucideAlignCenterHorizontal', label: 'Align Vertical Middle' },
    { kind: 'bottom', icon: 'lucideAlignEndHorizontal', label: 'Align Bottom' },
  ];

  readonly distributeOptions: { axis: DistributeAxis; icon: string; label: string }[] = [
    { axis: 'horizontal', icon: 'lucideAlignHorizontalSpaceBetween', label: 'Distribute Horizontally' },
    { axis: 'vertical', icon: 'lucideAlignVerticalSpaceBetween', label: 'Distribute Vertically' },
  ];

  align(kind: AlignKind): void {
    this.menus.alignSelection(kind);
    this.graphService.clearSelection();
  }

  distribute(axis: DistributeAxis): void {
    if (this.distributeDisabled()) return;
    this.menus.distributeSelection(axis);
    this.graphService.clearSelection();
  }
}
