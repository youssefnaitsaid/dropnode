import { Injectable, inject } from '@angular/core';
import { PresentationService } from './presentation.service';

/** Shared keyboard ownership checks for global shortcuts and modal surfaces. */
@Injectable({ providedIn: 'root' })
export class KeyboardScopeService {
  private readonly presentationService = inject(PresentationService);

  isTypingTarget(target: EventTarget | null): boolean {
    const element = typeof HTMLElement !== 'undefined' && target instanceof HTMLElement ? target : null;
    if (!element) return false;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable ||
      !!element.closest('[contenteditable="true"]')
    );
  }

  /** Present Mode and any existing overlay/confirmation own the keyboard. */
  canOpenPalette(): boolean {
    if (this.presentationService.active()) return false;
    if (typeof document === 'undefined') return true;
    return !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');
  }
}
