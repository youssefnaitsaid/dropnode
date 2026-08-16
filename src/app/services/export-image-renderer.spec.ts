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

  it('strips the whole pin layer unless the export includes Pins', () => {
    const clone = document.createElement('div');
    clone.innerHTML = `
      <div class="pin-layer">
        <div class="pin" data-pin-id="p1"></div>
      </div>
    `;

    (renderer as unknown as { stripPinLayer(element: HTMLElement): void }).stripPinLayer(clone);

    expect(clone.querySelector('.pin-layer')).toBeNull();
    expect(clone.querySelector('.pin')).toBeNull();
  });

  it('an include-Pins snapshot reveals a layer hidden by the on-screen toggle', () => {
    const clone = document.createElement('div');
    clone.innerHTML = `
      <div class="pin-layer pin-layer-hidden">
        <div class="pin" data-pin-id="p1"></div>
      </div>
    `;

    (renderer as unknown as { revealPinLayer(element: HTMLElement): void }).revealPinLayer(clone);

    const layer = clone.querySelector('.pin-layer');
    expect(layer).not.toBeNull();
    expect(layer?.classList.contains('pin-layer-hidden')).toBe(false);
    expect(clone.querySelector('.pin')).not.toBeNull();
  });

  it('strips the open pin popover from every snapshot', () => {
    const clone = document.createElement('div');
    clone.innerHTML = `<div class="pin-popover"><textarea></textarea></div>`;

    (renderer as unknown as { stripEditorChrome(element: HTMLElement): void }).stripEditorChrome(clone);

    expect(clone.querySelector('.pin-popover')).toBeNull();
  });

  it('a scoped snapshot with Pins included drops Pins anchored outside the Scope and all Canvas Pins', () => {
    const clone = document.createElement('div');
    clone.innerHTML = `
      <div class="pin-layer">
        <div class="pin" data-pin-id="p1" data-pin-kind="node" data-pin-node-id="n1"></div>
        <div class="pin" data-pin-id="p2" data-pin-kind="node" data-pin-node-id="n9"></div>
        <div class="pin" data-pin-id="p3" data-pin-kind="canvas"></div>
      </div>
    `;

    (renderer as unknown as {
      hideOutsideScope(element: HTMLElement, scope: {
        nodes: GraphNode[]; connections: never[];
      }): void;
    }).hideOutsideScope(clone, {
      nodes: [{ id: 'n1', x: 0, y: 0, width: 100, height: 48 }],
      connections: [],
    });

    expect(clone.querySelector('[data-pin-id="p1"]')).not.toBeNull();
    expect(clone.querySelector('[data-pin-id="p2"]')).toBeNull();
    expect(clone.querySelector('[data-pin-id="p3"]')).toBeNull();
  });
});
