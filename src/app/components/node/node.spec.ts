import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GraphNode } from '../../models/node';
import { textFromString } from '../../models/text';
import { NodeComponent } from './node';

describe('NodeComponent shapes', () => {
  let fixture: ComponentFixture<NodeComponent>;
  let component: NodeComponent;

  function render(node: GraphNode): void {
    fixture = TestBed.createComponent(NodeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('node', node);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NodeComponent] });
  });

  it('renders the selected regular Node shape on its surface while keeping all four Handles outside it', () => {
    render({
      id: 'diamond-node',
      text: textFromString('Decision'),
      x: 100,
      y: 80,
      width: 200,
      height: 96,
      shape: 'diamond',
    });

    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;
    const surface = fixture.nativeElement.querySelector('.node-surface') as HTMLElement;

    expect(card.dataset.shape).toBe('diamond');
    expect(surface.classList.contains('shape-diamond')).toBe(true);
    expect(surface.classList.contains('shape-pill')).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('app-handle')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.grip')).toHaveLength(0);
  });

  it('uses the rectangle default and never gives a Group a shape surface', () => {
    render({
      id: 'group',
      kind: 'group',
      label: 'Group',
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      shape: 'pill',
    } as GraphNode);

    const card = fixture.nativeElement.querySelector('.node-card') as HTMLElement;
    const surface = fixture.nativeElement.querySelector('.node-surface') as HTMLElement;

    expect(card.dataset.shape).toBeUndefined();
    expect(surface.classList.contains('shape-pill')).toBe(false);
    expect(surface.classList.contains('group-card')).toBe(true);
  });
});
