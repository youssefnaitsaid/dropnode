import { Injectable, inject } from '@angular/core';
import { GraphService } from './graph.service';
import { CollectionService } from './collection.service';
import { ExportImageRenderer } from './export-image-renderer';
import { GraphState } from '../models/graph-state';
import {
  exportBounds, EXPORT_THEMES, ExportScope, ExportScopeInput, ExportScopeRequest, ExportTheme,
  expandExportScope, normalizeExportScopeRequest,
} from '../models/export-image';
import { ToastService } from '../components/toast/toast';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private graphService = inject(GraphService);
  private collectionService = inject(CollectionService);
  private toastService = inject(ToastService);
  private imageRenderer = inject(ExportImageRenderer);

  private graphAsJson(graph?: GraphState): string {
    return JSON.stringify(graph ?? this.graphService.exportGraph(), null, 2);
  }

  /** The exact payload every JSON destination serializes — the dialog previews this. */
  jsonPayload(): string {
    return this.graphAsJson();
  }

  /** Filename-safe slug of a Project/Collection name; names are free-form. */
  private slug(name: string, fallback: string): string {
    const slugged = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slugged || fallback;
  }

  private download(json: string, filename: string): void {
    this.downloadBlob(new Blob([json], { type: 'application/json' }), filename);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Current editor graph (Scratch Canvas toolbar) ────────────────

  /**
   * Downloads the live editor graph. A projectId only names the file after
   * the Project — the payload is always the on-screen Graph State, so the
   * dialog's preview and download never diverge (auto-save lags 300ms).
   */
  exportToFile(projectId?: string): void {
    this.download(this.graphAsJson(), this.filenameBase(projectId) + '.json');
    this.toastService.show('Graph exported to file', 'success');
  }

  copyJson(): Promise<void> {
    return this.copyToClipboard(this.graphAsJson(), 'Copied to clipboard', 'Failed to copy to clipboard');
  }

  copyLink(): Promise<void> {
    return this.copyGraphLink(this.graphAsJson());
  }

  // ── PNG export (ADR-0014: snapshots the on-screen graph) ─────────

  /** Real snapshot of the rendered graph — the preview and the download share this. */
  renderPng(theme: ExportTheme, scopeInput?: ExportScopeInput): Promise<Blob> {
    return this.renderPngWithScope(theme, scopeInput).blob;
  }

  private renderPngWithScope(
    theme: ExportTheme,
    scopeInput?: ExportScopeInput,
  ): { blob: Promise<Blob>; scope?: ExportScope; request?: Required<ExportScopeRequest> } {
    const nodes = this.graphService.nodes();
    const connections = this.graphService.connections();
    if (scopeInput === undefined) {
      return {
        blob: this.imageRenderer.render(exportBounds(nodes, connections), EXPORT_THEMES[theme], nodes),
      };
    }

    const request = normalizeExportScopeRequest(scopeInput);
    const scope = expandExportScope(request.rootIds, nodes, connections);
    return {
      blob: this.imageRenderer.render(
        exportBounds(scope.nodes, scope.connections), EXPORT_THEMES[theme], scope.nodes, scope,
      ),
      scope,
      request,
    };
  }

  /** Named after the Project when given its id, else the Scratch Canvas default. */
  async exportPngToFile(
    theme: ExportTheme,
    projectId?: string,
    scopeInput?: ExportScopeInput,
  ): Promise<void> {
    try {
      const rendered = this.renderPngWithScope(theme, scopeInput);
      const blob = await rendered.blob;
      const filename = scopeInput === undefined
        ? this.filenameBase(projectId) + '.png'
        : this.scopedFilename(rendered.scope!, rendered.request!);
      this.downloadBlob(blob, filename);
      this.toastService.show('Graph exported to file', 'success');
    } catch {
      this.toastService.show('Failed to export PNG', 'error');
    }
  }

  /** dropnode-graph on the Scratch Canvas; the slugged Project name otherwise. */
  private filenameBase(projectId?: string): string {
    if (!projectId) return 'dropnode-graph';
    const project = this.collectionService.getProject(projectId);
    return this.slug(project?.name ?? '', 'project');
  }

  /** A scoped PNG is named after exactly one labeled Group, otherwise generically. */
  private scopedFilename(scope: ExportScope, request: { isMultiSelection: boolean }): string {
    if (request.isMultiSelection) return 'dropnode-selection.png';
    const root = scope.roots.length === 1 ? scope.roots[0] : undefined;
    if (root?.kind === 'group' && root.label?.trim()) {
      return this.slug(root.label, 'dropnode-selection') + '.png';
    }
    return 'dropnode-selection.png';
  }

  // ── Stored project graphs (Sidebar row actions, no navigation) ───

  exportProjectToFile(projectId: string): void {
    const project = this.collectionService.getProject(projectId);
    const graph = this.collectionService.getProjectGraph(projectId);
    if (!project || !graph) return;
    this.download(this.graphAsJson(graph), this.slug(project.name, 'project') + '.json');
    this.toastService.show('Graph exported to file', 'success');
  }

  copyProjectJson(projectId: string): Promise<void> {
    const graph = this.collectionService.getProjectGraph(projectId);
    if (!graph) return Promise.resolve();
    return this.copyToClipboard(this.graphAsJson(graph), 'Copied to clipboard', 'Failed to copy to clipboard');
  }

  copyProjectLink(projectId: string): Promise<void> {
    const graph = this.collectionService.getProjectGraph(projectId);
    if (!graph) return Promise.resolve();
    return this.copyGraphLink(this.graphAsJson(graph));
  }

  // ── Collection envelope ──────────────────────────────────────────

  exportCollectionToFile(collectionId: string): void {
    const collection = this.collectionService.getCollection(collectionId);
    if (!collection) return;
    const envelope = this.collectionService.exportCollection(collectionId);
    this.download(
      JSON.stringify(envelope, null, 2),
      this.slug(collection.name, 'collection') + '.dropnode-collection.json',
    );
    this.toastService.show('Collection exported to file', 'success');
  }

  // ── Internals ────────────────────────────────────────────────────

  private copyToClipboard(text: string, successMsg: string, errorMsg: string): Promise<void> {
    return navigator.clipboard.writeText(text).then(
      () => this.toastService.show(successMsg, 'success'),
      () => this.toastService.show(errorMsg, 'error'),
    );
  }

  /**
   * Share links always target the root path: ?data is only honored on `/`
   * (the Scratch Canvas), never on a /p/:projectId route (ADR-0007).
   */
  private copyGraphLink(json: string): Promise<void> {
    const link = window.location.origin + '/?data=' + encodeURIComponent(json);
    return this.copyToClipboard(link, 'Link copied to clipboard', 'Failed to copy link to clipboard');
  }
}
