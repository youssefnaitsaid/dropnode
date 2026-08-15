import { TestBed } from '@angular/core/testing';
import { ExportImageRenderer } from './export-image-renderer';
import { EXPORT_THEMES } from '../models/export-image';
import { GraphNode } from '../models/node';

describe('ExportImageRenderer', () => {
  let renderer: ExportImageRenderer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    renderer = TestBed.inject(ExportImageRenderer);
  });

  it('omits editor-only Reroute Point markers from a PNG snapshot', () => {
    const clone = document.createElement('div');
    clone.innerHTML = `
      <svg>
        <path class="connection-hit"></path>
        <path class="connection-path selected" style="filter: drop-shadow(0 0 4px #7c5cff)"></path>
        <circle class="reroute-point" cx="100" cy="120"></circle>
        <div class="node-card selected"><div class="node-surface selected"></div></div>
      </svg>
    `;

    (renderer as unknown as { stripEditorChrome(element: HTMLElement): void }).stripEditorChrome(
      clone,
    );

    expect(clone.querySelector('.reroute-point')).toBeNull();
    expect(clone.querySelector('.connection-hit')).toBeNull();
    expect(clone.querySelector('.connection-path')?.classList.contains('selected')).toBe(false);
    expect(clone.querySelector('.connection-path')?.getAttribute('style')).not.toContain('filter');
    expect(clone.querySelector('.node-card')?.classList.contains('selected')).toBe(false);
    expect(clone.querySelector('.node-surface')?.classList.contains('selected')).toBe(false);
  });

  it('applies PNG theme fills to the shaped Node surface', () => {
    const clone = document.createElement('div');
    clone.innerHTML = `
      <div class="node-card" data-node-id="n1">
        <div class="node-surface shape-diamond"></div>
      </div>
    `;
    const node: GraphNode = {
      id: 'n1',
      text: [{ kind: 'paragraph', runs: [{ text: 'N' }] }],
      x: 0,
      y: 0,
      width: 200,
      height: 96,
      shape: 'diamond',
    };

    (renderer as unknown as {
      applyTheme(element: HTMLElement, colors: typeof EXPORT_THEMES.dark, nodes: GraphNode[]): void;
    }).applyTheme(clone, EXPORT_THEMES.dark, [node]);

    expect((clone.querySelector('.node-surface') as HTMLElement).style.background).toBe(
      'rgb(240, 240, 245)',
    );
  });
});
