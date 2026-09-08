import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasToolService } from './canvas-tool.service';

describe('CanvasToolService', () => {
  let tool: CanvasToolService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    tool = TestBed.inject(CanvasToolService);
  });

  it('starts in Select with nothing armed', () => {
    expect(tool.tool()).toBe('select');
    expect(tool.isSelect()).toBe(true);
    expect(tool.isPan()).toBe(false);
    expect(tool.isPinArmed()).toBe(false);
  });

  it('switches between Select and Pan, clearing Pin arming', () => {
    tool.armPin();
    expect(tool.isPinArmed()).toBe(true);
    tool.pan();
    expect(tool.tool()).toBe('pan');
    expect(tool.isPinArmed()).toBe(false);
    tool.select();
    expect(tool.tool()).toBe('select');
  });

  it('arming Pin twice stays armed; selecting cancels it', () => {
    tool.armPin();
    tool.armPin();
    expect(tool.tool()).toBe('pin');
    tool.select();
    expect(tool.tool()).toBe('select');
  });

  it('reset returns to Select (Project switch)', () => {
    tool.pan();
    tool.reset();
    expect(tool.tool()).toBe('select');
    tool.armPin();
    tool.reset();
    expect(tool.tool()).toBe('select');
  });
});
