import { Component, signal, inject, ChangeDetectionStrategy, ElementRef, effect, viewChild } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideUpload, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { GraphService } from '../../services/graph.service';
import { ToastService } from '../toast/toast';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  imports: [FormsModule, NgIcon, HlmButton, HlmTextarea, CdkTrapFocus],
  providers: [provideIcons({ lucideUpload, lucideX })],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4" (click)="close()">
          <div
            class="flex max-h-[85vh] w-[480px] max-w-[90vw] flex-col rounded-xl border border-border bg-card text-card-foreground p-6 shadow-2xl"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
            aria-label="Import Graph"
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
          >
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold">Import Graph</h2>
            <button #closeButton hlmBtn variant="ghost" size="icon-sm" (click)="close()" aria-label="Close">
              <ng-icon name="lucideX" />
            </button>
          </div>

          <div class="flex gap-1 mb-4 rounded-lg bg-muted p-1" role="group" aria-label="Import source">
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              class="flex-1 export-seg"
              [class.export-seg-active]="activeTab() === 'file'"
              [attr.aria-pressed]="activeTab() === 'file'"
              (click)="activeTab.set('file')"
            >Upload file</button>
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              class="flex-1 export-seg"
              [class.export-seg-active]="activeTab() === 'text'"
              [attr.aria-pressed]="activeTab() === 'text'"
              (click)="activeTab.set('text')"
            >Paste JSON</button>
          </div>

          @if (activeTab() === 'file') {
            <!-- The whole drop zone is the label: clicking anywhere opens the
                 picker, and the control has a programmatic name (WCAG 3.3.2) -->
            <label class="block cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center mb-4">
              <ng-icon name="lucideUpload" class="text-2xl text-muted-foreground" aria-hidden="true" />
              <input
                type="file"
                accept=".json"
                (change)="onFileSelected($event)"
                class="mt-3 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:text-primary-foreground hover:file:bg-primary/80"
              />
              <span class="mt-2 block text-xs text-muted-foreground">Select a .json file to import</span>
            </label>
          }

          @if (activeTab() === 'text') {
            <textarea
              hlmTextarea
              class="mb-4 max-h-[50vh] min-h-40 w-full font-mono text-xs"
              [(ngModel)]="jsonText"
              placeholder="Paste your JSON here..."
              rows="10"
            ></textarea>
          }

          @if (errorMessage()) {
            <p role="alert" class="mb-3 max-h-24 overflow-y-auto break-words text-sm text-destructive">{{ errorMessage() }}</p>
          }

          <div class="flex justify-end gap-2">
            <button hlmBtn variant="outline" (click)="close()">Cancel</button>
            <button hlmBtn [disabled]="!canImport()" (click)="doImport()">Import</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Same segmented-pill polish as the Export dialog (DESIGN.md 2026-08):
       the active tab is a solid blurple fill, hover tints toward blurple. */
    .export-seg:hover {
      background: color-mix(in oklch, var(--primary) 15%, transparent) !important;
    }
    .export-seg.export-seg-active,
    .export-seg.export-seg-active:hover {
      background: var(--primary) !important;
      color: var(--primary-foreground) !important;
    }
  `],
})
export class ImportDialogComponent {
  private graphService = inject(GraphService);
  private toastService = inject(ToastService);

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    // Move focus into the dialog on open (export-dialog pattern), so
    // Escape/Tab land inside it rather than on the canvas behind.
    effect(() => {
      this.closeButton()?.nativeElement.focus();
    });
  }

  isOpen = signal(false);
  activeTab = signal<'file' | 'text'>('file');
  jsonText = '';
  errorMessage = signal<string | null>(null);
  private pendingJson: string | null = null;

  open(): void {
    this.isOpen.set(true);
    this.jsonText = '';
    this.errorMessage.set(null);
    this.pendingJson = null;
  }

  close(): void {
    this.isOpen.set(false);
  }

  /** Escape closes the dialog with no side effects, like the backdrop. */
  onEscape(): void {
    if (this.isOpen()) this.close();
  }

  canImport(): boolean {
    return !!this.pendingJson || this.jsonText.trim().length > 0;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.pendingJson = reader.result as string;
      this.errorMessage.set(null);
    };
    reader.onerror = () => {
      this.errorMessage.set('Failed to read file');
    };
    reader.readAsText(file);
  }

  doImport(): void {
    const jsonStr = this.pendingJson || this.jsonText;
    if (!jsonStr) return;

    try {
      const parsed = JSON.parse(jsonStr);
      const result = this.graphService.importGraph(parsed);
      if (result.success) {
        this.toastService.show('Graph imported successfully', 'success');
        this.close();
      } else {
        this.errorMessage.set(result.error ?? 'Import failed: invalid graph data');
      }
    } catch (e) {
      this.errorMessage.set('Invalid JSON: ' + (e instanceof Error ? e.message : 'parse error'));
    }
  }
}
