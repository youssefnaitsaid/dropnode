import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Text } from '../../models/text';

/**
 * Display-mode renderer for Text: plain templates over the structured JSON
 * (no innerHTML, no sanitizer). Links open in a new tab on Ctrl+Click only —
 * plain click keeps normal canvas select/drag behavior.
 *
 * Font sizes come from the host context via CSS variables so Node and
 * Connection Text can differ (Node S/M/L = 11/14/18, Connection = 10/12/15).
 */
@Component({
  selector: 'app-text-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    @for (block of text(); track $index) {
      @if (block.kind === 'paragraph') {
        <p class="tv-block">
          <ng-container *ngTemplateOutlet="runsTpl; context: { $implicit: block.runs }" />
        </p>
      } @else {
        <ul class="tv-list">
          @for (item of block.items; track $index) {
            <li>
              <ng-container *ngTemplateOutlet="runsTpl; context: { $implicit: item }" />
            </li>
          }
        </ul>
      }
    }

    <ng-template #runsTpl let-runs>
      @for (run of runs; track $index) {
        @if (run.link) {
          <a
            class="tv-run tv-link"
            [class.tv-bold]="run.bold"
            [class.tv-italic]="run.italic"
            [class.tv-highlight]="run.highlight"
            [attr.data-size]="run.size ?? null"
            [href]="run.link"
            [title]="run.link"
            (click)="onLinkClick($event, run.link)"
          >{{ run.text }}</a>
        } @else {
          <span
            class="tv-run"
            [class.tv-bold]="run.bold"
            [class.tv-italic]="run.italic"
            [class.tv-highlight]="run.highlight"
            [attr.data-size]="run.size ?? null"
          >{{ run.text }}</span>
        }
      }
    </ng-template>
  `,
  styles: [`
    :host {
      display: block;
      line-height: 1.4;
      overflow-wrap: normal;
      white-space: pre-wrap;
    }
    .tv-block {
      margin: 0;
      min-height: 1.4em;
    }
    .tv-list {
      margin: 0;
      padding-left: 1.3em;
      text-align: left;
      list-style: disc;
    }
    .tv-bold { font-weight: 700; }
    .tv-italic { font-style: italic; }
    .tv-highlight {
      background: var(--dn-highlight);
      border-radius: 2px;
      padding: 0 1px;
    }
    .tv-link {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    [data-size='S'] { font-size: var(--tv-size-s, 11px); }
    [data-size='L'] { font-size: var(--tv-size-l, 18px); }
  `],
})
export class TextViewComponent {
  text = input.required<Text>();

  onLinkClick(event: MouseEvent, url: string): void {
    // Plain click must keep select/drag semantics; Ctrl+Click follows the link
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      window.open(url, '_blank', 'noopener');
    }
  }
}
