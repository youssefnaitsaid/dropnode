import { Injectable, signal } from '@angular/core';

/**
 * The keyboard "Resize mode" (shape brief): while armed, arrow keys on a
 * focused Node card resize it instead of nudging it, matching the armed-Handle
 * pattern of the keyboard Connection flow. Escape exits. Owned here so the
 * Node card, the Context Menu, the Palette, and the global shortcut layer all
 * read and flip the same state.
 */
@Injectable({ providedIn: 'root' })
export class ResizeModeService {
  readonly mode = signal(false);

  toggle(): void {
    this.mode.update(v => !v);
  }

  exit(): void {
    this.mode.set(false);
  }
}
