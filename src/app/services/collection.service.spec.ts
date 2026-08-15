import { TestBed } from '@angular/core/testing';
import { CollectionService, COLLECTIONS_STORAGE_KEY } from './collection.service';
import { GraphState } from '../models/graph-state';

describe('CollectionService', () => {
  // A fresh singleton per call so the constructor re-reads localStorage,
  // which is how a real page reload behaves.
  function freshService(): CollectionService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(CollectionService);
  }

  const emptyGraph: GraphState = { nodes: [], connections: [] };

  function sampleGraph(): GraphState {
    return {
      nodes: [{ id: 'node_1_1', label: 'A', x: 10, y: 20, width: 160, height: 48 }],
      connections: [],
    };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  describe('collection CRUD', () => {
    it('starts with no collections and no projects', () => {
      const service = freshService();
      expect(service.collections()).toEqual([]);
      expect(service.projects()).toEqual([]);
    });

    it('creates a collection with a col_ id and the given name', () => {
      const service = freshService();
      const col = service.createCollection('Client work');
      expect(col.id).toMatch(/^col_\d+_\d+$/);
      expect(col.name).toBe('Client work');
      expect(service.collections()).toEqual([col]);
    });

    it('lists collections in creation order', () => {
      const service = freshService();
      const a = service.createCollection('A');
      const b = service.createCollection('B');
      expect(service.collections().map(c => c.id)).toEqual([a.id, b.id]);
    });

    it('allows duplicate collection names', () => {
      const service = freshService();
      const first = service.createCollection('Same');
      const second = service.createCollection('Same');
      expect(first.id).not.toBe(second.id);
      expect(service.collections().length).toBe(2);
    });

    it('renames a collection', () => {
      const service = freshService();
      const col = service.createCollection('Old');
      service.renameCollection(col.id, 'New');
      expect(service.getCollection(col.id)?.name).toBe('New');
    });

    it('deleting an unknown collection throws', () => {
      const service = freshService();
      expect(() => service.deleteCollection('col_nope')).toThrow('Collection col_nope not found');
    });
  });

  describe('project CRUD', () => {
    it('creates a project with a proj_ id inside its collection, seeded with an empty graph', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'Onboarding flow');
      expect(proj.id).toMatch(/^proj_\d+_\d+$/);
      expect(proj.name).toBe('Onboarding flow');
      expect(proj.collectionId).toBe(col.id);
      expect(service.projectsIn(col.id)).toEqual([proj]);
      expect(service.getProjectGraph(proj.id)).toEqual(emptyGraph);
    });

    it('creating a project in an unknown collection throws', () => {
      const service = freshService();
      expect(() => service.createProject('col_nope', 'P')).toThrow('Collection col_nope not found');
    });

    it('seeds a project with a provided graph', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P', sampleGraph());
      expect(service.getProjectGraph(proj.id)).toEqual(sampleGraph());
    });

    it('renames a project', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'Old');
      service.renameProject(proj.id, 'New');
      expect(service.getProject(proj.id)?.name).toBe('New');
    });

    it('deletes a project along with its stored graph', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P', sampleGraph());
      service.deleteProject(proj.id);
      expect(service.getProject(proj.id)).toBeUndefined();
      expect(service.getProjectGraph(proj.id)).toBeUndefined();
    });

    it('deleting an unknown project throws', () => {
      const service = freshService();
      expect(() => service.deleteProject('proj_nope')).toThrow('Project proj_nope not found');
    });
  });

  describe('deletion cascade', () => {
    it('deleting a collection deletes all its projects and their graphs', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const other = service.createCollection('Other');
      const p1 = service.createProject(col.id, 'P1', sampleGraph());
      const p2 = service.createProject(col.id, 'P2');
      const survivor = service.createProject(other.id, 'Survivor');

      service.deleteCollection(col.id);

      expect(service.getCollection(col.id)).toBeUndefined();
      expect(service.getProject(p1.id)).toBeUndefined();
      expect(service.getProject(p2.id)).toBeUndefined();
      expect(service.getProjectGraph(p1.id)).toBeUndefined();
      expect(service.getProject(survivor.id)).toEqual(survivor);
    });
  });

  describe('persistence', () => {
    it('a fresh instance restores collections, projects, and graphs after a reload', () => {
      const first = freshService();
      const col = first.createCollection('C');
      const proj = first.createProject(col.id, 'P', sampleGraph());

      const second = freshService();
      expect(second.collections()).toEqual([col]);
      expect(second.projects()).toEqual([proj]);
      expect(second.getProjectGraph(proj.id)).toEqual(sampleGraph());
    });

    it('persists under the single versioned storage key', () => {
      const service = freshService();
      service.createCollection('C');
      const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).version).toBe(1);
    });

    it('tolerates corrupt stored data by starting empty', () => {
      localStorage.setItem(COLLECTIONS_STORAGE_KEY, '{not json');
      let service!: CollectionService;
      expect(() => {
        service = freshService();
      }).not.toThrow();
      expect(service.collections()).toEqual([]);
      expect(service.projects()).toEqual([]);
    });

    it('tolerates a stored payload with the wrong shape by starting empty', () => {
      localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify({ version: 1, collections: 'nope' }));
      const service = freshService();
      expect(service.collections()).toEqual([]);
    });

    it('returned graphs are copies — mutating them does not affect the store', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P', sampleGraph());
      const graph = service.getProjectGraph(proj.id)!;
      graph.nodes.push({ id: 'node_x', label: 'X', x: 0, y: 0, width: 160, height: 48 });
      expect(service.getProjectGraph(proj.id)).toEqual(sampleGraph());
    });
  });

  describe('per-project viewport', () => {
    it('stores and returns a viewport for a project', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P');
      service.saveProjectViewport(proj.id, { panX: 40, panY: -12, zoom: 1.5 });
      expect(service.getProjectViewport(proj.id)).toEqual({ panX: 40, panY: -12, zoom: 1.5 });
    });

    it('has no viewport for a fresh project', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P');
      expect(service.getProjectViewport(proj.id)).toBeUndefined();
    });

    it('viewports survive a reload and die with their project', () => {
      const first = freshService();
      const col = first.createCollection('C');
      const proj = first.createProject(col.id, 'P');
      first.saveProjectViewport(proj.id, { panX: 1, panY: 2, zoom: 2 });

      const second = freshService();
      expect(second.getProjectViewport(proj.id)).toEqual({ panX: 1, panY: 2, zoom: 2 });
      second.deleteProject(proj.id);
      expect(second.getProjectViewport(proj.id)).toBeUndefined();
    });
  });

  describe('most-recently-opened tracking', () => {
    it('returns null when no project was ever opened', () => {
      const service = freshService();
      expect(service.mostRecentProjectId()).toBeNull();
    });

    it('returns the most recently opened project', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const a = service.createProject(col.id, 'A');
      const b = service.createProject(col.id, 'B');
      service.markOpened(a.id);
      service.markOpened(b.id);
      expect(service.mostRecentProjectId()).toBe(b.id);
    });

    it('falls back to the next most recent when the latest is deleted', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const a = service.createProject(col.id, 'A');
      const b = service.createProject(col.id, 'B');
      service.markOpened(a.id);
      service.markOpened(b.id);
      service.deleteProject(b.id);
      expect(service.mostRecentProjectId()).toBe(a.id);
    });

    it('falls back to creation order when no opened project survives', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const a = service.createProject(col.id, 'A');
      service.createProject(col.id, 'B');
      expect(service.mostRecentProjectId()).toBe(a.id);
    });

    it('survives a reload', () => {
      const first = freshService();
      const col = first.createCollection('C');
      const a = first.createProject(col.id, 'A');
      const b = first.createProject(col.id, 'B');
      first.markOpened(b.id);
      first.markOpened(a.id);

      const second = freshService();
      expect(second.mostRecentProjectId()).toBe(a.id);
    });
  });

  describe('root target resolution', () => {
    it('stays on the Scratch Canvas when a ?data param is present', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P');
      service.markOpened(proj.id);
      expect(service.resolveRootTarget(true)).toBeNull();
    });

    it('redirects to the most recent project otherwise', () => {
      const service = freshService();
      const col = service.createCollection('C');
      const proj = service.createProject(col.id, 'P');
      service.markOpened(proj.id);
      expect(service.resolveRootTarget(false)).toBe(proj.id);
    });

    it('stays on the Scratch Canvas when no projects exist', () => {
      const service = freshService();
      expect(service.resolveRootTarget(false)).toBeNull();
    });
  });

  describe('scratch snapshot', () => {
    it('is empty initially and holds a stashed graph in memory only', () => {
      const service = freshService();
      expect(service.takeScratchSnapshot()).toBeNull();

      service.stashScratch(sampleGraph(), { panX: 5, panY: 6, zoom: 2 });
      const snapshot = service.takeScratchSnapshot();
      expect(snapshot?.graph).toEqual(sampleGraph());
      expect(snapshot?.viewport).toEqual({ panX: 5, panY: 6, zoom: 2 });

      // In-memory only: a reload loses it.
      const second = freshService();
      expect(second.takeScratchSnapshot()).toBeNull();
    });

    it('saveScratchAsProject creates a seeded project and consumes the snapshot', () => {
      const service = freshService();
      const col = service.createCollection('C');
      service.stashScratch(sampleGraph(), { panX: 0, panY: 0, zoom: 1 });

      const proj = service.saveScratchAsProject(col.id, sampleGraph());

      expect(proj.collectionId).toBe(col.id);
      expect(service.getProjectGraph(proj.id)).toEqual(sampleGraph());
      expect(service.takeScratchSnapshot()).toBeNull();
    });

    it('discards the one stash that follows saveScratchAsProject (the dying scratch page re-stashing)', () => {
      const service = freshService();
      const col = service.createCollection('C');
      service.saveScratchAsProject(col.id, sampleGraph());

      // Navigating away from scratch stashes on destroy — must not resurrect
      // the graph that was just saved as a Project.
      service.stashScratch(sampleGraph(), { panX: 0, panY: 0, zoom: 1 });
      expect(service.takeScratchSnapshot()).toBeNull();

      // Later stashes behave normally again.
      service.stashScratch(sampleGraph(), { panX: 1, panY: 1, zoom: 1 });
      expect(service.takeScratchSnapshot()).not.toBeNull();
    });
  });

  describe('collection export', () => {
    it('produces the envelope with every project name and graph', () => {
      const service = freshService();
      const col = service.createCollection('Client work');
      service.createProject(col.id, 'P1', sampleGraph());
      service.createProject(col.id, 'P2');

      expect(service.exportCollection(col.id)).toEqual({
        name: 'Client work',
        projects: [
          { name: 'P1', graph: sampleGraph() },
          { name: 'P2', graph: { nodes: [], connections: [] } },
        ],
      });
    });

    it('throws for an unknown collection', () => {
      const service = freshService();
      expect(() => service.exportCollection('col_nope')).toThrow('Collection col_nope not found');
    });
  });

  describe('collection import', () => {
    const validEnvelope = () => ({
      name: 'Imported',
      projects: [{ name: 'P1', graph: sampleGraph() }],
    });

    it('appends a brand-new collection with regenerated ids', () => {
      const service = freshService();
      const existing = service.createCollection('Existing');

      const result = service.importCollection(validEnvelope());

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.collection.name).toBe('Imported');
      expect(result.collection.id).toMatch(/^col_\d+_\d+$/);
      expect(service.collections().map(c => c.name)).toEqual(['Existing', 'Imported']);
      const imported = service.projectsIn(result.collection.id);
      expect(imported.map(p => p.name)).toEqual(['P1']);
      expect(service.getProjectGraph(imported[0].id)).toEqual(sampleGraph());
      expect(service.getCollection(existing.id)).toBeDefined();
    });

    it('canonicalizes explicit rectangle Shapes while importing a collection', () => {
      const service = freshService();
      const result = service.importCollection({
        name: 'Imported',
        projects: [{
          name: 'Pill and rectangle',
          graph: {
            nodes: [
              { id: 'rect', label: 'Rectangle', x: 0, y: 0, width: 160, height: 48, shape: 'rectangle' },
              { id: 'diamond', label: 'Diamond', x: 240, y: 0, width: 200, height: 96, shape: 'diamond' },
            ],
            connections: [],
          },
        }],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      const graph = service.getProjectGraph(service.projectsIn(result.collection.id)[0].id)!;
      expect(graph.nodes.find(node => node.id === 'rect')?.shape).toBeUndefined();
      expect(graph.nodes.find(node => node.id === 'diamond')?.shape).toBe('diamond');
    });

    it('importing the same file twice produces two independent copies', () => {
      const service = freshService();
      const first = service.importCollection(validEnvelope());
      const second = service.importCollection(validEnvelope());
      expect(first.success && second.success).toBe(true);
      if (!first.success || !second.success) return;
      expect(first.collection.id).not.toBe(second.collection.id);
      expect(service.collections().length).toBe(2);
      expect(service.projects().length).toBe(2);
    });

    it('accepts a collection with zero projects', () => {
      const service = freshService();
      const result = service.importCollection({ name: 'Empty', projects: [] });
      expect(result.success).toBe(true);
    });

    it.each([
      ['not an object', 'nope'],
      ['null', null],
      ['missing name', { projects: [] }],
      ['non-string name', { name: 42, projects: [] }],
      ['missing projects', { name: 'X' }],
      ['non-array projects', { name: 'X', projects: 'nope' }],
      ['project entry without a name', { name: 'X', projects: [{ graph: { nodes: [], connections: [] } }] }],
    ])('rejects an invalid envelope (%s) without touching existing state', (_label, payload) => {
      const service = freshService();
      service.createCollection('Existing');

      const result = service.importCollection(payload);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBeTruthy();
      expect(service.collections().length).toBe(1);
      expect(service.projects().length).toBe(0);
    });

    it('one invalid project graph rejects the whole file with the graph error', () => {
      const service = freshService();
      const payload = {
        name: 'X',
        projects: [
          { name: 'Good', graph: { nodes: [], connections: [] } },
          {
            name: 'Bad',
            graph: {
              nodes: [
                { id: 'dup', label: 'A', x: 0, y: 0, width: 160, height: 48 },
                { id: 'dup', label: 'B', x: 0, y: 0, width: 160, height: 48 },
              ],
              connections: [],
            },
          },
        ],
      };

      const result = service.importCollection(payload);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Duplicate node id');
      expect(service.collections()).toEqual([]);
    });

    it('round-trips: export then import yields the same names and graphs under new ids', () => {
      const service = freshService();
      const col = service.createCollection('Round trip');
      const orig = service.createProject(col.id, 'P', sampleGraph());

      const result = service.importCollection(service.exportCollection(col.id));

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.collection.id).not.toBe(col.id);
      const copy = service.projectsIn(result.collection.id)[0];
      expect(copy.id).not.toBe(orig.id);
      expect(copy.name).toBe('P');
      expect(service.getProjectGraph(copy.id)).toEqual(sampleGraph());
    });
  });
});
