import { Injectable, inject, signal } from '@angular/core';
import { KeyboardScopeService } from './keyboard-scope.service';

export type CommandPaletteStep = 'commands' | 'collections';

/** Transient UI state for the application-shell Command Palette. */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly keyboardScope = inject(KeyboardScopeService);

  readonly isOpen = signal(false);
  readonly step = signal<CommandPaletteStep>('commands');

  private opener: HTMLElement | null = null;

  open(opener?: HTMLElement | null): void {
    if (this.isOpen()) return;
    if (!this.keyboardScope.canOpenPalette()) return;
    this.opener = opener ?? this.activeElement();
    this.step.set('commands');
    this.isOpen.set(true);
  }

  close(restoreFocus = true): void {
    const opener = this.opener;
    this.opener = null;
    this.step.set('commands');
    this.isOpen.set(false);
    if (restoreFocus && opener && typeof opener.focus === 'function') {
      queueMicrotask(() => opener.focus());
    }
  }

  toggle(opener?: HTMLElement | null): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open(opener);
    }
  }

  enterCollectionPicker(): void {
    if (this.isOpen()) this.step.set('collections');
  }

  backToCommands(): void {
    this.step.set('commands');
  }

  private activeElement(): HTMLElement | null {
    return typeof document !== 'undefined' && typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }
}
