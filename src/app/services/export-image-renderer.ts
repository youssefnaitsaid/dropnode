import { Injectable } from '@angular/core';
import {
  ExportBounds, ExportScope, ExportThemeColors, EXPORT_SCALE, themedNodeBackground,
} from '../models/export-image';
import { GraphNode } from '../models/node';

// Mirrors the node component's translucent Group fill (30% alpha suffix)
const GROUP_FILL_ALPHA = '4D';

/** Render-time options for the snapshot; none are ever stored in Graph State. */
export interface RenderOptions {
  /** PNG-only: render the pin layer instead of stripping it (default off).
   *  Reveals Pins even when the on-screen visibility toggle hides them — the
   *  checkbox is the explicit decision. */
  includePins?: boolean;
}

/**
 * The foreignObject snapshot pipeline (ADR-0014): photographs the live
 * `.canvas-transform` layer (DOM nodes + Connection SVG), restyles it for the
 * Export Theme, and rasterizes it onto a canvas at EXPORT_SCALE.
 *
 * This is the thin, untested-by-convention DOM shim — jsdom cannot rasterize.
 * All decisions (bounds, theme colors, node fills, filenames) are made
 * upstream in tested code; this class only executes them against the browser.
 */
@Injectable({ providedIn: 'root' })
export class ExportImageRenderer {
  async render(
    bounds: ExportBounds,
    colors: ExportThemeColors,
    nodes: readonly GraphNode[],
    scope?: ExportScope,
    options: RenderOptions = {},
  ): Promise<Blob> {
    const layer = document.querySelector<HTMLElement>('.canvas-transform');
    if (!layer) throw new Error('Canvas is not on screen');

    const svgMarkup = this.buildSvg(layer, bounds, colors, nodes, scope, options);
    const image = await this.loadImage(svgMarkup);
    return this.rasterize(image, bounds, colors);
  }

  // ── Snapshot construction ────────────────────────────────────────

  private buildSvg(
    layer: HTMLElement,
    bounds: ExportBounds,
    colors: ExportThemeColors,
    nodes: readonly GraphNode[],
    scope?: ExportScope,
    options: RenderOptions = {},
  ): string {
    const clone = layer.cloneNode(true) as HTMLElement;
    if (!options.includePins) {
      this.stripPinLayer(clone);
    } else {
      this.revealPinLayer(clone);
    }
    if (scope) this.hideOutsideScope(clone, scope);
    this.stripEditorChrome(clone);
    this.applyTheme(clone, colors, nodes);

    // Undo the shared pan/zoom transform and shift the capture region to the origin
    clone.style.transform = `translate(${-bounds.x}px, ${-bounds.y}px)`;
    clone.style.width = '0';
    clone.style.height = '0';

    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.width = `${bounds.width}px`;
    wrapper.style.height = `${bounds.height}px`;
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'hidden';
    wrapper.style.backgroundColor = colors.background;

    // The snapshot root is a plain div: the app's `html, body` rules match
    // nothing inside the foreignObject, and text styles are inherited — so
    // without this the export falls back to the SVG default (serif). Copy the
    // live body's computed text defaults for a font-faithful render.
    const bodyStyle = getComputedStyle(document.body);
    wrapper.style.fontFamily = bodyStyle.fontFamily;
    wrapper.style.fontSize = bodyStyle.fontSize;
    wrapper.style.lineHeight = bodyStyle.lineHeight;
    wrapper.style.letterSpacing = bodyStyle.letterSpacing;

    const style = document.createElement('style');
    style.textContent = this.collectCss();
    wrapper.appendChild(style);
    wrapper.appendChild(clone);

    const serialized = new XMLSerializer().serializeToString(wrapper);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.outputWidth}" height="${bounds.outputHeight}" ` +
      `viewBox="0 0 ${bounds.width} ${bounds.height}">` +
      `<foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`
    );
  }

  /** An artifact, not a screenshot: no Handles, Resize Grips, selection or drag
   *  chrome — and never an open Pin popover, even when Pins are included. */
  private stripEditorChrome(clone: HTMLElement): void {
    clone.querySelectorAll('app-handle, .grip, .connection-ghost, .connection-hit, .reroute-point, .pin-popover').forEach(el => el.remove());
    clone.querySelectorAll('.node-card.selected, .node-surface.selected')
      .forEach(el => el.classList.remove('selected'));
    clone.querySelectorAll<SVGElement>('.connection-path').forEach(el => {
      el.classList.remove('selected', 'hovered');
      // The selection glow is an inline filter bound in the template
      el.style.removeProperty('filter');
    });
    clone.querySelectorAll('.connection-text-card.selected')
      .forEach(el => el.classList.remove('selected'));
  }

  /** Pins are omitted from PNG Export unless the export says otherwise. */
  private stripPinLayer(clone: HTMLElement): void {
    clone.querySelectorAll('.pin-layer, .pin').forEach(el => el.remove());
  }

  /** An include-Pins snapshot reveals the layer even when the on-screen
   *  visibility toggle hid it — the class rules travel with collectCss. */
  private revealPinLayer(clone: HTMLElement): void {
    clone.querySelectorAll<HTMLElement>('.pin-layer').forEach(el =>
      el.classList.remove('pin-layer-hidden'),
    );
  }

  /** Scoped PNGs are artifacts of their Scope, never camera crops. */
  private hideOutsideScope(clone: HTMLElement, scope: ExportScope): void {
    const nodeIds = new Set(scope.nodes.map(node => node.id));
    clone.querySelectorAll<HTMLElement>('.node-card').forEach(card => {
      if (!nodeIds.has(card.getAttribute('data-node-id') ?? '')) card.remove();
    });

    const connectionIds = new Set(scope.connections.map(connection => connection.id));
    clone.querySelectorAll<SVGElement>('.connection-hit').forEach(hit => {
      if (connectionIds.has(hit.getAttribute('data-connection-id') ?? '')) return;
      const path = hit.nextElementSibling;
      hit.remove();
      if (path?.classList.contains('connection-path')) path.remove();
    });
    clone.querySelectorAll<HTMLElement>('.connection-text-card').forEach(card => {
      if (!connectionIds.has(card.getAttribute('data-connection-id') ?? '')) card.remove();
    });

    // Pins ride their Node's membership; a Canvas Pin's subject is the whole
    // graph, so it never belongs to a Scope
    clone.querySelectorAll<HTMLElement>('.pin').forEach(el => {
      const kind = el.getAttribute('data-pin-kind');
      if (kind === 'canvas') {
        el.remove();
        return;
      }
      const anchorId = el.getAttribute('data-pin-node-id') ?? '';
      if (!nodeIds.has(anchorId)) el.remove();
    });
  }

  /** Export Theme overrides for defaults that only work on the dark canvas. */
  private applyTheme(clone: HTMLElement, colors: ExportThemeColors, nodes: readonly GraphNode[]): void {
    // Node fills follow the tested Palette-passthrough decision
    for (const node of nodes) {
      const card = clone.querySelector<HTMLElement>(`.node-card[data-node-id="${node.id}"]`);
      if (!card) continue;
      const base = themedNodeBackground(node.color, colors);
      const surface = card.querySelector<HTMLElement>('.node-surface') ?? card;
      surface.style.background = node.kind === 'group' ? base + GROUP_FILL_ALPHA : base;
    }
    clone.querySelectorAll<HTMLElement>('.group-card').forEach(el => {
      el.style.borderColor = colors.groupBorder;
    });
    clone.querySelectorAll<HTMLElement>('.group-label').forEach(el => {
      el.style.color = colors.groupLabel;
    });
    clone.querySelectorAll<HTMLElement>('.node-text').forEach(el => {
      el.style.color = colors.nodeText;
    });
    clone.querySelectorAll<HTMLElement>('.connection-text-card').forEach(el => {
      el.style.background = colors.connectionTextBackground;
      el.style.color = colors.connectionTextColor;
    });
  }

  /**
   * Inline every same-origin stylesheet so the serialized snapshot carries the
   * component styles (Angular's scoped attributes survive cloneNode).
   */
  private collectCss(): string {
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          css += rule.cssText + '\n';
        }
      } catch {
        // Cross-origin stylesheet — nodes carry no external resources (ADR-0014)
      }
    }
    return css;
  }

  // ── Rasterization ────────────────────────────────────────────────

  private loadImage(svgMarkup: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to render snapshot'));
      // data: URL keeps the canvas untainted (blob: URLs can flake in some engines)
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
    });
  }

  private rasterize(
    image: HTMLImageElement,
    bounds: ExportBounds,
    colors: ExportThemeColors,
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = bounds.outputWidth;
    canvas.height = bounds.outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(new Error('Canvas 2D unavailable'));

    // Paint the theme background under the snapshot (foreignObject edges can antialias)
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    ctx.drawImage(image, 0, 0, bounds.width, bounds.height);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
        'image/png',
      );
    });
  }
}
