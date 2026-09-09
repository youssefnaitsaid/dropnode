import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorPageComponent } from './editor-page';
import { GraphService } from '../../services/graph.service';
import { CollectionService } from '../../services/collection.service';
import { CanvasToolService } from '../../services/canvas-tool.service';
import { PresentationService } from '../../services/presentation.service';

describe('EditorPageComponent floating stack', () => {
  let fixture: ComponentFixture<EditorPageComponent>;
  let tool: CanvasToolService;
  let presentation: PresentationService;

  const flushLoadAndFrame = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(requestAnimationFrame);
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [EditorPageComponent],
      providers: [provideRouter([])],
    });
    tool = TestBed.inject(CanvasToolService);
    presentation = TestBed.inject(PresentationService);
    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('mounts the floating tools and actions bar in normal editing', async () => {
    await flushLoadAndFrame();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-floating-toolbar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-selection-actions-bar')).not.toBeNull();
  });

  it('hides the floating stack in Present Mode', async () => {
    await flushLoadAndFrame();
    const graph = TestBed.inject(GraphService);
    graph.createGroup('Tour', 0, 0);
    presentation.enter(window.innerWidth, window.innerHeight, 'reading');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-floating-toolbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-selection-actions-bar')).toBeNull();
    presentation.exit();
  });

  it('resets the tool to Select when switching Projects', async () => {
    await flushLoadAndFrame();
    const collection = TestBed.inject(CollectionService);
    const col = collection.createCollection('C');
    const proj1 = collection.createProject(col.id, 'P1', { nodes: [], connections: [] });
    const proj2 = collection.createProject(col.id, 'P2', { nodes: [], connections: [] });
    fixture.componentRef.setInput('projectId', proj1.id);
    fixture.detectChanges();
    await flushLoadAndFrame();
    tool.pan();
    expect(tool.tool()).toBe('pan');
    fixture.componentRef.setInput('projectId', proj2.id);
    fixture.detectChanges();
    await flushLoadAndFrame();
    expect(tool.tool()).toBe('select');
  });
});
