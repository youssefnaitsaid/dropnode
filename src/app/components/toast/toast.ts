import { Component, signal, inject, Injectable } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideCircleX, lucideInfo, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { PresentationService } from '../../services/presentation.service';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  readonly type = signal<'error' | 'info' | 'success'>('info');
  private timeoutId: any = null;
  private presentationService = inject(PresentationService);

  show(msg: string, toastType: 'error' | 'info' | 'success' = 'info', duration = 4000): void {
    // Nothing pops over a Present tour — notifications are dropped, not queued
    if (this.presentationService.active()) return;
    this.message.set(msg);
    this.type.set(toastType);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.dismiss(), duration);
  }

  dismiss(): void {
    this.message.set(null);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgIcon, HlmButton],
  providers: [provideIcons({ lucideCircleCheck, lucideCircleX, lucideInfo, lucideX })],
  template: `
    @if (toastService.message(); as msg) {
      <div
        class="toast flex items-center gap-3 rounded-lg border border-border bg-popover text-popover-foreground pl-3.5 pr-2 py-2.5 shadow-lg max-w-sm"
        [attr.role]="toastService.type() === 'error' ? 'alert' : 'status'"
        [attr.aria-live]="toastService.type() === 'error' ? 'assertive' : 'polite'"
      >
        <ng-icon [name]="icon()" [class]="iconClass()" class="text-lg shrink-0" />
        <span class="text-sm font-medium">{{ msg }}</span>
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          class="ml-auto shrink-0"
          (click)="toastService.dismiss()"
          aria-label="Dismiss"
        >
          <ng-icon name="lucideX" />
        </button>
      </div>
    }
  `,
  styles: [`
    :host {
      position: fixed;
      bottom: max(20px, env(safe-area-inset-bottom));
      right: max(20px, env(safe-area-inset-right));
      z-index: var(--dn-z-toast);
    }
    .toast {
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }
  `],
})
export class ToastComponent {
  toastService = inject(ToastService);

  icon = () => {
    switch (this.toastService.type()) {
      case 'success': return 'lucideCircleCheck';
      case 'error': return 'lucideCircleX';
      default: return 'lucideInfo';
    }
  };

  iconClass = () => {
    switch (this.toastService.type()) {
      case 'success': return 'text-emerald-400';
      case 'error': return 'text-destructive';
      default: return 'text-primary';
    }
  };
}
