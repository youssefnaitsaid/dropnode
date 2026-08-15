import { TestBed } from '@angular/core/testing';
import { ExportImageRenderer } from './export-image-renderer';

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
      </svg>
    `;

    (renderer as unknown as { stripEditorChrome(element: HTMLElement): void }).stripEditorChrome(
      clone,
    );

    expect(clone.querySelector('.reroute-point')).toBeNull();
    expect(clone.querySelector('.connection-hit')).toBeNull();
    expect(clone.querySelector('.connection-path')?.classList.contains('selected')).toBe(false);
    expect(clone.querySelector('.connection-path')?.getAttribute('style')).not.toContain('filter');
  });
});
