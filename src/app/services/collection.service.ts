import { Injectable, inject, signal, type Signal } from '@angular/core';
import { Collection, Project, CollectionExportFile } from '../models/collection';
import { GraphState } from '../models/graph-state';
import { ViewportState } from '../models/viewport-state';
import { GraphService } from './graph.service';

/** Single schema-versioned key holding all Collections and Projects (ADR-0007). */
export const COLLECTIONS_STORAGE_KEY = 'dropnode:collections';

const SCHEMA_VERSION = 1;

interface StoredState {
  version: number;
  collections: Collection[];
  projects: Project[];
  graphs: Record<string, GraphState>;
  viewports: Record<string, ViewportState>;
  /** Most-recently-opened project ids, newest first. */
  recentProjectIds: string[];
}

function emptyStore(): StoredState {
  return {
    version: SCHEMA_VERSION,
    collections: [],
    projects: [],
    graphs: {},
    viewports: {},
    recentProjectIds: [],
  };
}

/**
 * Owns Collections and Projects: CRUD with cascade delete, localStorage
 * persistence, per-Project Graph State and Viewport storage, most-recently
 * opened tracking, the Scratch Canvas session snapshot, and the collection
 * export/import envelope. localStorage is the source of truth (ADR-0007);
 * this data is app-level structure, never Graph State — mutations here are
 * not Commands and never touch History.
 */
@Injectable({ providedIn: 'root' })
export class CollectionService {
  private graphService = inject(GraphService);

  private store: StoredState = this.readStoredState();

  private readonly _collections = signal<Collection[]>(this.store.collections);
  private readonly _projects = signal<Project[]>(this.store.projects);

  readonly collections: Signal<Collection[]> = this._collections.asReadonly();
  readonly projects: Signal<Project[]> = this._projects.asReadonly();

  private idCounter = 0;

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${++this.idCounter}`;
  }

  // ── Collection CRUD ──────────────────────────────────────────────

  createCollection(name = 'New Collection'): Collection {
    const collection: Collection = { id: this.generateId('col'), name };
    this.store.collections = [...this.store.collections, collection];
    this.commit();
    return collection;
  }

  renameCollection(id: string, name: string): void {
    this.store.collections = this.store.collections.map(c =>
      c.id === id ? { ...c, name } : c
    );
    this.commit();
  }

  /** Cascade: deleting a Collection deletes every Project it contains. */
  deleteCollection(id: string): void {
    if (!this.store.collections.some(c => c.id === id)) {
      throw new Error(`Collection ${id} not found`);
    }
    const removedIds = this.store.projects
      .filter(p => p.collectionId === id)
      .map(p => p.id);
    this.store.collections = this.store.collections.filter(c => c.id !== id);
    this.removeProjects(removedIds);
    this.commit();
  }

  getCollection(id: string): Collection | undefined {
    return this.store.collections.find(c => c.id === id);
  }

  // ── Project CRUD ─────────────────────────────────────────────────

  createProject(collectionId: string, name = 'New Project', graph?: GraphState): Project {
    if (!this.store.collections.some(c => c.id === collectionId)) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    const project: Project = { id: this.generateId('proj'), name, collectionId };
    this.store.projects = [...this.store.projects, project];
    this.store.graphs[project.id] = structuredClone(graph ?? { nodes: [], connections: [] });
    this.commit();
    return project;
  }

  renameProject(id: string, name: string): void {
    this.store.projects = this.store.projects.map(p =>
      p.id === id ? { ...p, name } : p
    );
    this.commit();
  }

  deleteProject(id: string): void {
    if (!this.store.projects.some(p => p.id === id)) {
      throw new Error(`Project ${id} not found`);
    }
    this.removeProjects([id]);
    this.commit();
  }

  getProject(id: string): Project | undefined {
    return this.store.projects.find(p => p.id === id);
  }

  projectsIn(collectionId: string): Project[] {
    // Reads the signal so Sidebar templates re-render on project changes.
    return this._projects().filter(p => p.collectionId === collectionId);
  }

  // ── Project Graph State ──────────────────────────────────────────

  saveProjectGraph(id: string, graph: GraphState): void {
    if (!this.store.projects.some(p => p.id === id)) return;
    this.store.graphs[id] = structuredClone(graph);
    this.commit();
  }

  getProjectGraph(id: string): GraphState | undefined {
    const graph = this.store.graphs[id];
    return graph ? structuredClone(graph) : undefined;
  }

  // ── Per-project Viewport (outside Graph State — never exported) ──

  saveProjectViewport(id: string, viewport: ViewportState): void {
    if (!this.store.projects.some(p => p.id === id)) return;
    this.store.viewports[id] = { ...viewport };
    this.commit();
  }

  getProjectViewport(id: string): ViewportState | undefined {
    const viewport = this.store.viewports[id];
    return viewport ? { ...viewport } : undefined;
  }

  // ── Most-recently-opened tracking ────────────────────────────────

  markOpened(id: string): void {
    if (!this.store.projects.some(p => p.id === id)) return;
    this.store.recentProjectIds = [
      id,
      ...this.store.recentProjectIds.filter(r => r !== id),
    ];
    this.commit();
  }

  /**
   * The most recently opened surviving Project, falling back to creation
   * order; null when no Projects exist. Drives the `/` redirect and the
   * "where to go after deleting the current Project" decision.
   */
  mostRecentProjectId(): string | null {
    const alive = new Set(this.store.projects.map(p => p.id));
    const recent = this.store.recentProjectIds.find(id => alive.has(id));
    return recent ?? this.store.projects[0]?.id ?? null;
  }

  /**
   * Where `/` should land: null means show the Scratch Canvas. A ?data
   * share link always lands on scratch; otherwise the last-opened Project.
   */
  resolveRootTarget(hasDataParam: boolean): string | null {
    if (hasDataParam) return null;
    return this.mostRecentProjectId();
  }

  // ── Scratch Canvas session snapshot (in-memory only) ─────────────

  private scratchSnapshot: { graph: GraphState; viewport: ViewportState } | null = null;

  // "Save as project" navigates away from scratch, which destroys the scratch
  // page and makes it stash on destroy — that one stash must be discarded or
  // the just-saved graph would resurrect on the Scratch Canvas.
  private suppressNextStash = false;

  stashScratch(graph: GraphState, viewport: ViewportState): void {
    if (this.suppressNextStash) {
      this.suppressNextStash = false;
      return;
    }
    this.scratchSnapshot = { graph: structuredClone(graph), viewport: { ...viewport } };
  }

  /** Consume the stashed scratch graph; null when nothing was stashed. */
  takeScratchSnapshot(): { graph: GraphState; viewport: ViewportState } | null {
    const snapshot = this.scratchSnapshot;
    this.scratchSnapshot = null;
    return snapshot;
  }

  /** "Save as project": keep the scratch graph as a real Project. */
  saveScratchAsProject(collectionId: string, graph: GraphState): Project {
    const project = this.createProject(collectionId, 'New Project', graph);
    this.scratchSnapshot = null;
    this.suppressNextStash = true;
    return project;
  }

  // ── Collection export/import envelope ────────────────────────────

  exportCollection(id: string): CollectionExportFile {
    const collection = this.getCollection(id);
    if (!collection) throw new Error(`Collection ${id} not found`);
    return {
      name: collection.name,
      projects: this.projectsIn(id).map(p => ({
        name: p.name,
        graph: this.getProjectGraph(p.id) ?? { nodes: [], connections: [] },
      })),
    };
  }

  /**
   * Validate-then-append: one invalid project graph rejects the whole file
   * and existing state stays untouched. Collection and project ids are
   * regenerated so importing twice yields two independent copies.
   */
  importCollection(payload: unknown):
    | { success: true; collection: Collection }
    | { success: false; error: string } {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Invalid collection file: not an object' };
    }
    const file = payload as Record<string, unknown>;
    if (typeof file['name'] !== 'string' || !file['name']) {
      return { success: false, error: 'Invalid collection file: missing or invalid name' };
    }
    if (!Array.isArray(file['projects'])) {
      return { success: false, error: 'Invalid collection file: projects must be an array' };
    }
    const entries: { name: string; graph: GraphState }[] = [];
    for (let i = 0; i < file['projects'].length; i++) {
      const entry = file['projects'][i] as Record<string, unknown>;
      if (!entry || typeof entry !== 'object' || typeof entry['name'] !== 'string' || !entry['name']) {
        return { success: false, error: `Invalid project at index ${i}: missing or invalid name` };
      }
      const validation = this.graphService.validateGraphState(entry['graph']);
      if (!validation.valid) {
        return { success: false, error: `Invalid project "${entry['name']}": ${validation.error}` };
      }
      entries.push({
        name: entry['name'],
        graph: this.graphService.canonicalizeNodeShapes(entry['graph'] as GraphState),
      });
    }

    const collection = this.createCollection(file['name']);
    for (const entry of entries) {
      this.createProject(collection.id, entry.name, entry.graph);
    }
    return { success: true, collection };
  }

  // ── Internals ────────────────────────────────────────────────────

  private removeProjects(ids: string[]): void {
    const removed = new Set(ids);
    this.store.projects = this.store.projects.filter(p => !removed.has(p.id));
    for (const id of ids) {
      delete this.store.graphs[id];
      delete this.store.viewports[id];
    }
    this.store.recentProjectIds = this.store.recentProjectIds.filter(id => !removed.has(id));
  }

  /** Push the working store into signals and localStorage. */
  private commit(): void {
    this._collections.set(this.store.collections);
    this._projects.set(this.store.projects);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(this.store));
    } catch {
      // Storage unavailable (private mode / quota) — state still works in-memory.
    }
  }

  /** Read the stored state; anything missing or malformed means an empty store. */
  private readStoredState(): StoredState {
    try {
      const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      if (
        parsed.version !== SCHEMA_VERSION ||
        !Array.isArray(parsed.collections) ||
        !Array.isArray(parsed.projects) ||
        typeof parsed.graphs !== 'object' || parsed.graphs === null ||
        typeof parsed.viewports !== 'object' || parsed.viewports === null ||
        !Array.isArray(parsed.recentProjectIds)
      ) {
        return emptyStore();
      }
      return parsed as StoredState;
    } catch {
      return emptyStore();
    }
  }
}
