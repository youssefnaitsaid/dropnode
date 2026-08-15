import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  viewChild,
  effect,
  untracked,
  ElementRef,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideWaypoints,
  lucidePanelLeftClose,
  lucidePanelLeftOpen,
  lucideLibrary,
  lucidePlus,
  lucideUpload,
  lucideDownload,
  lucideEllipsis,
  lucideChevronRight,
  lucideChevronDown,
  lucideFile,
  lucidePencil,
  lucideTrash2,
  lucideFileJson,
  lucideFileDown,
  lucideCopy,
  lucideLink,
  lucideCloud,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTooltip } from '@spartan-ng/helm/tooltip';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import {
  HlmEmpty,
  HlmEmptyHeader,
  HlmEmptyMedia,
  HlmEmptyTitle,
  HlmEmptyDescription,
} from '@spartan-ng/helm/empty';
import {
  HlmDropdownMenu,
  HlmDropdownMenuTrigger,
  HlmDropdownMenuItem,
  HlmDropdownMenuSeparator,
  HlmDropdownMenuSub,
  HlmDropdownMenuSubTrigger,
  HlmDropdownMenuItemSubIndicator,
} from '@spartan-ng/helm/dropdown-menu';
import { SidebarService } from '../../services/sidebar.service';
import { CollectionService } from '../../services/collection.service';
import { ExportService } from '../../services/export.service';
import { ImportDialogService } from '../../services/import-dialog.service';
import { ExportDialogService } from '../../services/export-dialog.service';
import { ToastService } from '../toast/toast';
import { Collection, Project } from '../../models/collection';

type PendingDelete =
  | { kind: 'collection'; id: string; name: string; projectCount: number }
  | { kind: 'project'; id: string; name: string };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmButton,
    HlmTooltip,
    HlmSeparator,
    HlmEmpty,
    HlmEmptyHeader,
    HlmEmptyMedia,
    HlmEmptyTitle,
    HlmEmptyDescription,
    HlmDropdownMenu,
    HlmDropdownMenuTrigger,
    HlmDropdownMenuItem,
    HlmDropdownMenuSeparator,
    HlmDropdownMenuSub,
    HlmDropdownMenuSubTrigger,
    HlmDropdownMenuItemSubIndicator,
  ],
  providers: [
    provideIcons({
      lucideWaypoints,
      lucidePanelLeftClose,
      lucidePanelLeftOpen,
      lucideLibrary,
      lucidePlus,
      lucideUpload,
      lucideDownload,
      lucideEllipsis,
      lucideChevronRight,
      lucideChevronDown,
      lucideFile,
      lucidePencil,
      lucideTrash2,
      lucideFileJson,
      lucideFileDown,
      lucideCopy,
      lucideLink,
      lucideCloud,
    }),
  ],
  template: `
    <aside
      class="flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 ease-linear overflow-hidden"
      [style.width.px]="sidebar.collapsed() ? 52 : 250"
      aria-label="Primary"
    >
      <!-- Header: brand + collapse toggle -->
      @if (sidebar.collapsed()) {
        <div class="flex flex-col items-center gap-1 py-2 shrink-0">
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-[length:--spacing(4.5)]"
          >
            <ng-icon name="lucideWaypoints" />
          </span>
          <button
            hlmBtn
            size="icon"
            variant="ghost"
            (click)="sidebar.toggle()"
            [hlmTooltip]="'Expand sidebar (Ctrl+B)'"
            position="right"
            aria-label="Expand sidebar"
          >
            <ng-icon name="lucidePanelLeftOpen" />
          </button>
        </div>
      } @else {
        <div class="flex items-center gap-2 h-14 px-2.5 shrink-0">
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-[length:--spacing(4.5)]"
          >
            <ng-icon name="lucideWaypoints" />
          </span>
          <span class="text-base font-bold tracking-tight truncate">dropnode</span>
          <button
            hlmBtn
            size="icon"
            variant="ghost"
            class="ml-auto"
            (click)="sidebar.toggle()"
            aria-label="Collapse sidebar"
            title="Collapse sidebar (Ctrl+B)"
          >
            <ng-icon name="lucidePanelLeftClose" />
          </button>
        </div>
      }

      <hlm-separator orientation="horizontal" />

      <!-- Kept mounted even when the Sidebar is collapsed so the Command
           Palette can reuse the same Collection import flow. -->
      <input
        #collectionFileInput
        data-collection-import
        type="file"
        accept=".json"
        class="hidden"
        (change)="onCollectionFileSelected($event)"
      />

      <!-- Body: Collections -->
      <nav class="flex-1 min-h-0 overflow-y-auto" aria-label="Collections">
        @if (sidebar.collapsed()) {
          <div class="flex flex-col items-center gap-1 py-2">
            <button
              hlmBtn
              size="icon"
              variant="ghost"
              class="text-muted-foreground"
              (click)="sidebar.setCollapsed(false)"
              [hlmTooltip]="'Collections'"
              position="right"
              aria-label="Collections"
            >
              <ng-icon name="lucideLibrary" />
            </button>
          </div>
        } @else {
          <div class="px-2 py-2">
            <div class="flex items-center px-2 py-1">
              <span class="text-xs font-medium text-muted-foreground">Collections</span>
              <span class="ml-auto flex items-center">
                <button
                  hlmBtn
                  size="icon-sm"
                  variant="ghost"
                  class="text-muted-foreground"
                  (click)="collectionFileInput.click()"
                  title="Import collection"
                  aria-label="Import collection"
                >
                  <ng-icon name="lucideUpload" />
                </button>
                <button
                  hlmBtn
                  size="icon-sm"
                  variant="ghost"
                  class="text-muted-foreground"
                  (click)="newCollection()"
                  title="New collection"
                  aria-label="New collection"
                >
                  <ng-icon name="lucidePlus" />
                </button>
              </span>
            </div>
            @if (collectionService.collections().length === 0) {
              <div hlmEmpty class="border !p-6 mt-1 gap-2">
                <div hlmEmptyHeader>
                  <div hlmEmptyMedia variant="icon">
                    <ng-icon name="lucideLibrary" />
                  </div>
                  <div hlmEmptyTitle class="!text-sm">No collections yet</div>
                  <div hlmEmptyDescription class="!text-xs">
                    Create a collection to organize your projects.
                  </div>
                </div>
                <button hlmBtn size="sm" variant="outline" (click)="newCollection()">
                  <ng-icon name="lucidePlus" />
                  New collection
                </button>
              </div>
            } @else {
              @for (collection of collectionService.collections(); track collection.id) {
                <!-- Collection row -->
                <div
                  class="group/col flex h-8 items-center gap-1 rounded-md px-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-within:bg-sidebar-accent"
                >
                  <button
                    class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                    (click)="sidebar.toggleCollection(collection.id)"
                    [attr.aria-label]="sidebar.isCollectionCollapsed(collection.id) ? 'Expand collection' : 'Collapse collection'"
                    [attr.aria-expanded]="!sidebar.isCollectionCollapsed(collection.id)"
                  >
                    <ng-icon
                      class="text-[length:--spacing(3.5)]"
                      [name]="sidebar.isCollectionCollapsed(collection.id) ? 'lucideChevronRight' : 'lucideChevronDown'"
                    />
                  </button>
                  @if (renamingId() === collection.id) {
                    <input
                      #renameInput
                      class="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      [value]="collection.name"
                      (keydown)="onRenameKeydown($event)"
                      (blur)="onRenameBlur($event, collection.id, 'collection', collection.name)"
                    />
                  } @else {
                    <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ collection.name }}</span>
                    <span class="hidden shrink-0 items-center group-hover/col:flex group-focus-within/col:flex">
                      <button
                        hlmBtn
                        size="icon-sm"
                        variant="ghost"
                        class="!size-6 text-muted-foreground"
                        (click)="addProject(collection)"
                        title="New project"
                        aria-label="New project"
                      >
                        <ng-icon name="lucidePlus" />
                      </button>
                      <button
                        hlmBtn
                        size="icon-sm"
                        variant="ghost"
                        class="!size-6 text-muted-foreground"
                        [hlmDropdownMenuTrigger]="collectionMenu"
                        title="Collection actions"
                        aria-label="Collection actions"
                      >
                        <ng-icon name="lucideEllipsis" />
                      </button>
                    </span>
                    <ng-template #collectionMenu>
                      <div hlmDropdownMenu class="w-48">
                        <button hlmDropdownMenuItem (triggered)="startRename(collection.id)">
                          <ng-icon name="lucidePencil" />
                          <span>Rename</span>
                        </button>
                        <button hlmDropdownMenuItem (triggered)="exportCollection(collection)">
                          <ng-icon name="lucideDownload" />
                          <span>Export collection</span>
                        </button>
                        <hlm-dropdown-menu-separator />
                        <button hlmDropdownMenuItem variant="destructive" (triggered)="requestDeleteCollection(collection)">
                          <ng-icon name="lucideTrash2" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </ng-template>
                  }
                </div>

                <!-- Project rows -->
                @if (!sidebar.isCollectionCollapsed(collection.id)) {
                  @for (project of collectionService.projectsIn(collection.id); track project.id) {
                    <div
                      class="group/proj flex h-8 items-center gap-1 rounded-md pl-6 pr-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-within:bg-sidebar-accent"
                      routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      @if (renamingId() === project.id) {
                        <ng-icon name="lucideFile" class="shrink-0 text-[length:--spacing(3.5)] text-muted-foreground" />
                        <input
                          #renameInput
                          class="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                          [value]="project.name"
                          (keydown)="onRenameKeydown($event)"
                          (blur)="onRenameBlur($event, project.id, 'project', project.name)"
                        />
                      } @else {
                        <a
                          class="flex min-w-0 flex-1 items-center gap-1.5"
                          [routerLink]="['/p', project.id]"
                          [title]="project.name"
                        >
                          <ng-icon name="lucideFile" class="shrink-0 text-[length:--spacing(3.5)] text-muted-foreground" />
                          <span class="min-w-0 flex-1 truncate text-sm">{{ project.name }}</span>
                        </a>
                        <span class="hidden shrink-0 items-center group-hover/proj:flex group-focus-within/proj:flex">
                          <button
                            hlmBtn
                            size="icon-sm"
                            variant="ghost"
                            class="!size-6 text-muted-foreground"
                            [hlmDropdownMenuTrigger]="projectMenu"
                            title="Project actions"
                            aria-label="Project actions"
                          >
                            <ng-icon name="lucideEllipsis" />
                          </button>
                        </span>
                        <ng-template #projectMenu>
                          <div hlmDropdownMenu class="w-48">
                            <button hlmDropdownMenuItem (triggered)="startRename(project.id)">
                              <ng-icon name="lucidePencil" />
                              <span>Rename</span>
                            </button>
                            <button hlmDropdownMenuItem (triggered)="importIntoProject(project)">
                              <ng-icon name="lucideUpload" />
                              <span>Import</span>
                            </button>
                            <button hlmDropdownMenuItem [hlmDropdownMenuSubTrigger]="exportSub">
                              <ng-icon name="lucideDownload" />
                              <span>Export</span>
                              <hlm-dropdown-menu-item-sub-indicator />
                            </button>
                            <ng-template #exportSub>
                              <div hlmDropdownMenuSub class="w-56">
                                @if (isOpenProject(project.id)) {
                                  <!-- Only the on-screen graph can be snapshotted (ADR-0014) -->
                                  <button hlmDropdownMenuItem (triggered)="openExportDialog(project.id)">
                                    <ng-icon name="lucideFileDown" />
                                    <span>Export as…</span>
                                  </button>
                                } @else {
                                  <button hlmDropdownMenuItem (triggered)="exportService.exportProjectToFile(project.id)">
                                    <ng-icon name="lucideFileJson" />
                                    <span>Export JSON file</span>
                                  </button>
                                }
                                <button hlmDropdownMenuItem (triggered)="exportService.copyProjectJson(project.id)">
                                  <ng-icon name="lucideCopy" />
                                  <span>Copy JSON</span>
                                </button>
                                <button hlmDropdownMenuItem (triggered)="exportService.copyProjectLink(project.id)">
                                  <ng-icon name="lucideLink" />
                                  <span>Copy link</span>
                                </button>
                                <button hlmDropdownMenuItem disabled>
                                  <ng-icon name="lucideCloud" />
                                  <span class="flex flex-col">
                                    <span>Export to Drive</span>
                                    <span class="text-xs text-muted-foreground">Sign in required — coming soon</span>
                                  </span>
                                </button>
                              </div>
                            </ng-template>
                            <hlm-dropdown-menu-separator />
                            <button hlmDropdownMenuItem variant="destructive" (triggered)="requestDeleteProject(project)">
                              <ng-icon name="lucideTrash2" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </ng-template>
                      }
                    </div>
                  } @empty {
                    <div class="pl-8 pr-2 py-1 text-xs italic text-muted-foreground">No projects</div>
                  }
                }
              }
            }
          </div>
        }
      </nav>
    </aside>

    <!-- Deletion confirmation modal -->
    @if (pendingDelete(); as pending) {
      <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4" (click)="cancelDelete()">
        <div
          class="w-[420px] max-w-[90vw] rounded-xl border border-border bg-card text-card-foreground p-6 shadow-2xl"
          (click)="$event.stopPropagation()"
          role="alertdialog"
          aria-modal="true"
        >
          <h2 class="text-lg font-semibold mb-2">
            Delete {{ pending.kind === 'collection' ? 'collection' : 'project' }}?
          </h2>
          <p class="text-sm text-muted-foreground mb-5">
            @if (pending.kind === 'collection') {
              Delete "{{ pending.name }}"
              @if (pending.projectCount > 0) {
                and its {{ pending.projectCount }} {{ pending.projectCount === 1 ? 'project' : 'projects' }}
              }? This cannot be undone.
            } @else {
              Delete "{{ pending.name }}"? This cannot be undone.
            }
          </p>
          <div class="flex justify-end gap-2">
            <button hlmBtn variant="outline" (click)="cancelDelete()">Cancel</button>
            <button hlmBtn variant="destructive" (click)="confirmDelete()">Delete</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SidebarComponent {
  protected readonly sidebar = inject(SidebarService);
  protected readonly collectionService = inject(CollectionService);
  protected readonly exportService = inject(ExportService);
  private readonly importDialogService = inject(ImportDialogService);
  private readonly exportDialogService = inject(ExportDialogService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  /** Current URL as a signal, so row menus track the open Project. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** True when this Project is on screen — its row swaps in the PNG-capable dialog. */
  protected isOpenProject(projectId: string): boolean {
    return this.currentUrl().split('?')[0] === `/p/${projectId}`;
  }

  protected openExportDialog(projectId: string): void {
    this.exportDialogService.requestOpen(projectId);
  }

  protected readonly renamingId = signal<string | null>(null);
  protected readonly pendingDelete = signal<PendingDelete | null>(null);
  private renameCancelled = false;

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private lastNewCollectionRequest: number;

  constructor() {
    // Do not replay a request that was already handled before Present Mode
    // temporarily removed and recreated the Sidebar.
    this.lastNewCollectionRequest = this.sidebar.newCollectionRequest();

    // Focus and select the inline rename input the moment it renders.
    effect(() => {
      const input = this.renameInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });

    effect(() => {
      const request = this.sidebar.newCollectionRequest();
      if (request <= this.lastNewCollectionRequest) return;
      this.lastNewCollectionRequest = request;
      untracked(() => this.newCollection());
    });

    effect(() => {
      const projectId = this.sidebar.projectRenameRequest();
      if (!projectId) return;
      untracked(() => {
        if (this.collectionService.getProject(projectId)) this.startRename(projectId);
        this.sidebar.clearProjectRenameRequest();
      });
    });

    effect(() => {
      const projectId = this.sidebar.projectDeleteRequest();
      if (!projectId) return;
      untracked(() => {
        const project = this.collectionService.getProject(projectId);
        if (project) this.requestDeleteProject(project);
        this.sidebar.clearProjectDeleteRequest();
      });
    });
  }

  // ── Create ───────────────────────────────────────────────────────

  newCollection(): void {
    const collection = this.collectionService.createCollection();
    this.startRename(collection.id);
  }

  addProject(collection: Collection): void {
    const project = this.collectionService.createProject(collection.id);
    if (this.sidebar.isCollectionCollapsed(collection.id)) {
      this.sidebar.toggleCollection(collection.id);
    }
    this.router.navigate(['/p', project.id]);
    this.startRename(project.id);
  }

  // ── Inline rename (same contract as node labels) ─────────────────

  startRename(id: string): void {
    this.renameCancelled = false;
    this.renamingId.set(id);
  }

  onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      this.renameCancelled = true;
      (event.target as HTMLInputElement).blur();
      event.stopPropagation();
    }
  }

  onRenameBlur(event: Event, id: string, kind: 'collection' | 'project', currentName: string): void {
    this.renamingId.set(null);
    if (this.renameCancelled) {
      this.renameCancelled = false;
      return;
    }
    const name = (event.target as HTMLInputElement).value.trim();
    // Empty or unchanged names are never committed.
    if (!name || name === currentName) return;
    if (kind === 'collection') {
      this.collectionService.renameCollection(id, name);
    } else {
      this.collectionService.renameProject(id, name);
    }
  }

  // ── Delete (permanent — the modal is the safety net) ─────────────

  requestDeleteCollection(collection: Collection): void {
    this.pendingDelete.set({
      kind: 'collection',
      id: collection.id,
      name: collection.name,
      projectCount: this.collectionService.projectsIn(collection.id).length,
    });
  }

  requestDeleteProject(project: Project): void {
    this.pendingDelete.set({ kind: 'project', id: project.id, name: project.name });
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const pending = this.pendingDelete();
    if (!pending) return;
    this.pendingDelete.set(null);

    const currentId = this.currentProjectId();
    let losesCurrent = false;
    if (pending.kind === 'collection') {
      losesCurrent =
        currentId !== null &&
        this.collectionService.getProject(currentId)?.collectionId === pending.id;
      this.collectionService.deleteCollection(pending.id);
    } else {
      losesCurrent = currentId === pending.id;
      this.collectionService.deleteProject(pending.id);
    }

    if (losesCurrent) {
      const next = this.collectionService.mostRecentProjectId();
      this.router.navigate(next ? ['/p', next] : ['/']);
    }
  }

  // ── Collection import / export ───────────────────────────────────

  exportCollection(collection: Collection): void {
    this.exportService.exportCollectionToFile(collection.id);
  }

  onCollectionFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const result = this.collectionService.importCollection(parsed);
        if (result.success) {
          this.toastService.show(`Collection "${result.collection.name}" imported`, 'success');
        } else {
          this.toastService.show(result.error, 'error');
        }
      } catch {
        this.toastService.show('Invalid JSON: could not parse collection file', 'error');
      }
    };
    reader.onerror = () => this.toastService.show('Failed to read file', 'error');
    reader.readAsText(file);
  }

  // ── Project import (navigate first — replaces happen on-screen) ──

  importIntoProject(project: Project): void {
    this.router.navigate(['/p', project.id]).then(() => this.importDialogService.requestOpen());
  }

  private currentProjectId(): string | null {
    const match = /^\/p\/([^/?#]+)/.exec(this.router.url);
    return match ? match[1] : null;
  }
}
