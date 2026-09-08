import { Injectable, signal, computed } from '@angular/core';

/** Floating Toolbar tool: Select (Marquee/drag world), Pan (drag pans), or Pin (armed placement). */
export type CanvasTool = 'select' | 'pan' | 'pin';

/**
 * Owns the Floating Toolbar tool mode. Persistent Select/Pan plus one-shot
 * Pin arming that reverts to Select on placement or cancel. Transient UI
 * state: never Graph State, never History, never persisted — Project
 * switches and reloads land on Select via reset().
 *
 * Deliberate divergence from ADR-0016 (which rejected a persistent tool-mode
 * concept): spec #68 re-decided this with an explicit Select/Pan toggle, and
 * the Marquee (Select) versus pan-anywhere (Pan) split keeps the ADR's
 * Space/middle-drag behavior intact in both modes.
 */
@Injectable({ providedIn: 'root' })
export class CanvasToolService {
  /** Active tool; 'pin' means armed placement, not a persistent mode. */
  readonly tool = signal<CanvasTool>('select');

  readonly isSelect = computed(() => this.tool() === 'select');
  readonly isPan = computed(() => this.tool() === 'pan');
  readonly isPinArmed = computed(() => this.tool() === 'pin');

  select(): void {
    this.tool.set('select');
  }

  pan(): void {
    this.tool.set('pan');
  }

  armPin(): void {
    this.tool.set('pin');
  }

  /** Back to Select: Project switches, placement commit, and every cancel path. */
  reset(): void {
    this.tool.set('select');
  }
}
