import { Injectable, signal, computed } from '@angular/core';

/** Floating Toolbar tool: persistent Select/Pan modes or a one-shot armed placement. */
export type CanvasTool = 'select' | 'pan' | 'pin' | 'node' | 'group' | 'text-block';

/**
 * Owns the Floating Toolbar tool mode. Persistent Select/Pan plus one-shot
 * armed placements (Pin, Node, Group, Text Block) that revert to Select on
 * placement or cancel. Transient UI state: never Graph State, never History,
 * never persisted — Project switches and reloads land on Select via reset().
 *
 * Deliberate divergence from ADR-0016 (which rejected a persistent tool-mode
 * concept): spec #68 re-decided this with an explicit Select/Pan toggle, and
 * the Marquee (Select) versus pan-anywhere (Pan) split keeps the ADR's
 * Space/middle-drag behavior intact in both modes.
 */
@Injectable({ providedIn: 'root' })
export class CanvasToolService {
  /** Active tool; anything but Select/Pan means an armed one-shot placement. */
  readonly tool = signal<CanvasTool>('select');

  readonly isSelect = computed(() => this.tool() === 'select');
  readonly isPan = computed(() => this.tool() === 'pan');
  readonly isPinArmed = computed(() => this.tool() === 'pin');
  readonly isNodeArmed = computed(() => this.tool() === 'node');
  readonly isGroupArmed = computed(() => this.tool() === 'group');
  readonly isTextBlockArmed = computed(() => this.tool() === 'text-block');
  /** True for any one-shot armed placement (Pin, Node, Group, Text Block). */
  readonly armed = computed(() => this.tool() !== 'select' && this.tool() !== 'pan');

  select(): void {
    this.tool.set('select');
  }

  pan(): void {
    this.tool.set('pan');
  }

  armPin(): void {
    this.tool.set('pin');
  }

  armNode(): void {
    this.tool.set('node');
  }

  armGroup(): void {
    this.tool.set('group');
  }

  armTextBlock(): void {
    this.tool.set('text-block');
  }

  /** Back to Select: Project switches, placement commit, and every cancel path. */
  reset(): void {
    this.tool.set('select');
  }
}
