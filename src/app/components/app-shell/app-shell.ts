import { Component, inject, ChangeDetectionStrategy, viewChild, effect, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from '../toast/toast';
import { ImportDialogComponent } from '../import-dialog/import-dialog';
import { ExportDialogComponent } from '../export-dialog/export-dialog';
import { SidebarComponent } from '../sidebar/sidebar';
import { ImportDialogService } from '../../services/import-dialog.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { PresentationService } from '../../services/presentation.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastComponent, ImportDialogComponent, ExportDialogComponent, SidebarComponent],
  template: `
    <div class="app-frame">
      <!-- Present Mode hides all chrome; the canvas keeps the full width -->
      @if (!presentationService.active()) {
        <app-sidebar />
      }
      <div class="app-main">
        <router-outlet />
      </div>
    </div>
    <app-toast />
    <app-import-dialog #importDialog />
    <app-export-dialog #exportDialog />
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    .app-frame {
      display: flex;
      width: 100%;
      height: 100%;
    }
    .app-main {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      height: 100%;
    }
  `],
})
export class AppShellComponent {
  private importDialogService = inject(ImportDialogService);
  private exportDialogService = inject(ExportDialogService);
  protected presentationService = inject(PresentationService);
  private importDialog = viewChild<ImportDialogComponent>('importDialog');
  private exportDialog = viewChild<ExportDialogComponent>('exportDialog');

  constructor() {
    // The toolbar (Scratch Canvas) and Sidebar Project rows both request the
    // import dialog through the service; the shell owns the single instance.
    // open() is untracked (editor-page pattern): the effect must depend only
    // on the request counter, never on signals the dialogs touch internally.
    effect(() => {
      if (this.importDialogService.openRequests() > 0) {
        untracked(() => this.importDialog()?.open());
      }
    });

    // Same pattern for the "Export as…" dialog (toolbar + open Project's row).
    effect(() => {
      if (this.exportDialogService.openRequests() > 0) {
        const projectId = untracked(this.exportDialogService.projectId);
        const scope = untracked(this.exportDialogService.scope);
        untracked(() => this.exportDialog()?.open(projectId, scope));
      }
    });
  }
}
