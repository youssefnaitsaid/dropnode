import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ImportDialogService } from './import-dialog.service';
import { CanvasLockService } from './canvas-lock.service';
import { ToastService } from '../components/toast/toast';

describe('ImportDialogService Canvas Lock', () => {
  let service: ImportDialogService;
  let canvasLock: CanvasLockService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImportDialogService);
    canvasLock = TestBed.inject(CanvasLockService);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    canvasLock.unlock({ silent: true });
  });

  it('opens normally while unlocked', () => {
    service.requestOpen();
    expect(service.openRequests()).toBe(1);
  });

  it('refuses to open while locked, with a locked hint', () => {
    canvasLock.lock();
    toast.dismiss();
    service.requestOpen();
    expect(service.openRequests()).toBe(0);
    expect(toast.message()).toBe('Unlock the Canvas to import');
  });
});
