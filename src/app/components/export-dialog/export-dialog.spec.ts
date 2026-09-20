import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExportDialogComponent } from './export-dialog';
import { GraphService } from '../../services/graph.service';

describe('ExportDialogComponent', () => {
  let fixture: ComponentFixture<ExportDialogComponent>;
  let component: ExportDialogComponent;
  let graphService: GraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExportDialogComponent],
    });
    fixture = TestBed.createComponent(ExportDialogComponent);
    component = fixture.componentInstance;
    graphService = TestBed.inject(GraphService);
    fixture.detectChanges();
  });

  afterEach(() => {
    component.close();
  });

  it('opens as an accessible dialog with focus containment', () => {
    component.open();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Export as');
    expect(dialog?.getAttribute('cdktrapfocus')).not.toBeNull();
  });

  it('switches formats when unconstrained', () => {
    component.open();
    fixture.detectChanges();
    expect(component.format()).toBe('png');

    component.setFormat('json');
    fixture.detectChanges();
    expect(component.format()).toBe('json');

    component.setFormat('mermaid');
    fixture.detectChanges();
    expect(component.format()).toBe('mermaid');
  });

  it('forces PNG for scoped requests even when Mermaid is requested', () => {
    const node = graphService.createNode('Scoped', 0, 0);
    component.open(undefined, [node.id], 'mermaid');
    fixture.detectChanges();
    expect(component.format()).toBe('png');

    component.setFormat('mermaid');
    fixture.detectChanges();
    expect(component.format()).toBe('png');
  });

  it('previews the Mermaid payload when the Mermaid format is open', () => {
    graphService.createNode('Hello', 0, 0);
    component.open(undefined, undefined, 'mermaid');
    fixture.detectChanges();

    expect(component.format()).toBe('mermaid');
    const preview = fixture.nativeElement.querySelector('pre')?.textContent ?? '';
    expect(preview).toContain('title: "dropnode-graph"');
    expect(preview).toContain('flowchart LR');
    expect(preview).toContain('["Hello"]');
  });

  it('copies the previewed Mermaid payload without closing the dialog', async () => {
    graphService.createNode('Hello', 0, 0);
    component.open(undefined, undefined, 'mermaid');
    fixture.detectChanges();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    component.copyMermaid();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(component.mermaidPreview());
    expect(component.isOpen()).toBe(true);

    vi.unstubAllGlobals();
  });

  it('closes on Escape while open', () => {
    component.open();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ignores Escape while closed', () => {
    expect(component.isOpen()).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
  });
});
