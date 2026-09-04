import { Component, inject, ChangeDetectionStrategy, viewChild, effect, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from '../toast/toast';
import { ImportDialogComponent } from '../import-dialog/import-dialog';
import { ExportDialogComponent } from '../export-dialog/export-dialog';
import { ConnectDialogComponent } from '../connect-dialog/connect-dialog';
import { SidebarComponent } from '../sidebar/sidebar';
import { SidebarService } from '../../services/sidebar.service';
import { ImportDialogService } from '../../services/import-dialog.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { ConnectDialogService } from '../../services/connect-dialog.service';
import { PresentationService } from '../../services/presentation.service';
import { CommandPaletteComponent } from '../command-palette/command-palette';
import { CanvasSearchComponent } from '../canvas-search/canvas-search';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastComponent, ImportDialogComponent, ExportDialogComponent, ConnectDialogComponent, SidebarComponent, CommandPaletteComponent, CanvasSearchComponent],
  template: `
    <div
      class="app-frame"
      [class.sidebar-collapsed]="sidebarService.collapsed()"
      [class.presenting]="presentationService.active()"
    >
      <!-- Present Mode hides all chrome; the canvas keeps the full width -->
      @if (!presentationService.active()) {
        <app-sidebar />
      }
      <main class="app-main">
        <router-outlet />
      </main>
    </div>
    <app-toast />
    <app-import-dialog #importDialog />
    <app-export-dialog #exportDialog />
    <app-connect-dialog #connectDialog />
    <app-command-palette />
    <app-canvas-search />
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    /* Sidebar collapse (optimize): the width lives in the grid track, so the
       200ms toggle animates grid-template-columns — the compositor-sanctioned
       interpolation for a squeeze — instead of reflowing a flex child's width
       every frame. Present Mode swaps to a single track with no motion. */
    .app-frame {
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr);
      transition: grid-template-columns 0.2s ease-linear;
      width: 100%;
      height: 100%;
    }
    .app-frame.sidebar-collapsed {
      grid-template-columns: 52px minmax(0, 1fr);
    }
    .app-frame.presenting {
      grid-template-columns: minmax(0, 1fr);
      transition: none;
    }
    .app-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
    }
  `],
})
export class AppShellComponent {
  private importDialogService = inject(ImportDialogService);
  private exportDialogService = inject(ExportDialogService);
  private connectDialogService = inject(ConnectDialogService);
  protected presentationService = inject(PresentationService);
  protected sidebarService = inject(SidebarService);
  private importDialog = viewChild<ImportDialogComponent>('importDialog');
  private exportDialog = viewChild<ExportDialogComponent>('exportDialog');
  private connectDialog = viewChild<ConnectDialogComponent>('connectDialog');

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
        const format = untracked(this.exportDialogService.format);
        untracked(() => this.exportDialog()?.open(projectId, scope, format));
      }
    });

    // Same pattern for "Connect Nodes…" (the Command Palette entry).
    effect(() => {
      if (this.connectDialogService.openRequests() > 0) {
        untracked(() => this.connectDialog()?.open());
      }
    });
  }
}
