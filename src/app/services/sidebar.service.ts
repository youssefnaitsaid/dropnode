import { Injectable, signal, type Signal } from '@angular/core';

/** Namespaced key — the Sidebar's collapsed/expanded rail state. */
export const SIDEBAR_STORAGE_KEY = 'dropnode:sidebar-collapsed';

/** Namespaced key — which Collections are collapsed in the Sidebar tree. */
export const SIDEBAR_COLLAPSED_COLLECTIONS_KEY = 'dropnode:sidebar-collapsed-collections';

/**
 * Owns the Sidebar's collapsed/expanded state and persists it to localStorage.
 * This is a transient UI preference, deliberately kept out of Graph State and
 * History — toggling it is never an undoable Command.
 */
@Injectable({ providedIn: 'root' })
export class SidebarService {
  private readonly _collapsed = signal<boolean>(this.readStoredState());

  private readonly _newCollectionRequest = signal(0);
  readonly newCollectionRequest = this._newCollectionRequest.asReadonly();
  readonly projectRenameRequest = signal<string | null>(null);
  readonly projectDeleteRequest = signal<string | null>(null);

  /** True when the Sidebar is collapsed to the icon rail. Defaults to expanded. */
  readonly collapsed: Signal<boolean> = this._collapsed.asReadonly();

  toggle(): void {
    this.setCollapsed(!this._collapsed());
  }

  setCollapsed(collapsed: boolean): void {
    this._collapsed.set(collapsed);
    this.persist(collapsed);
  }

  requestNewCollection(): void {
    this._newCollectionRequest.update(count => count + 1);
  }

  requestProjectRename(projectId: string): void {
    this.projectRenameRequest.set(projectId);
  }

  requestProjectDelete(projectId: string): void {
    this.projectDeleteRequest.set(projectId);
  }

  clearProjectRenameRequest(): void {
    this.projectRenameRequest.set(null);
  }

  clearProjectDeleteRequest(): void {
    this.projectDeleteRequest.set(null);
  }

  // ── Per-Collection expand/collapse (default expanded) ────────────

  private readonly _collapsedCollections = signal<ReadonlySet<string>>(
    this.readCollapsedCollections()
  );

  isCollectionCollapsed(collectionId: string): boolean {
    return this._collapsedCollections().has(collectionId);
  }

  toggleCollection(collectionId: string): void {
    const next = new Set(this._collapsedCollections());
    if (next.has(collectionId)) {
      next.delete(collectionId);
    } else {
      next.add(collectionId);
    }
    this._collapsedCollections.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_COLLECTIONS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable — state still works in-memory.
    }
  }

  private readCollapsedCollections(): Set<string> {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_COLLECTIONS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  }

  /** Read the stored preference; any missing or malformed value means expanded. */
  private readStoredState(): boolean {
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return false;
    } catch {
      return false;
    }
  }

  private persist(collapsed: boolean): void {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // Storage unavailable (private mode / SSR) — state still works in-memory.
    }
  }
}
