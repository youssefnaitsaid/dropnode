import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { CommandPaletteService } from '../services/command-palette.service';
import { GraphService } from '../services/graph.service';
import { PresentationService } from '../services/presentation.service';

@Component({
  standalone: true,
  imports: [KeyboardShortcuts],
  template: '<div appKeyboardShortcuts></div>',
})
class KeyboardHost {}

describe('KeyboardShortcuts Command Palette scope', () => {
  let fixture: ComponentFixture<KeyboardHost>;
  let palette: CommandPaletteService;

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [KeyboardHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(KeyboardHost);
    palette = TestBed.inject(CommandPaletteService);
    fixture.detectChanges();
  });

  afterEach(() => {
    palette.close(false);
    document.body.innerHTML = '';
  });

  function ctrlK(target: EventTarget = document.body): void {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  }

  it('opens and toggles with Ctrl+K', () => {
    ctrlK();
    expect(palette.isOpen()).toBe(true);
    ctrlK();
    expect(palette.isOpen()).toBe(false);
  });

  it('ignores Ctrl+K from text inputs', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    ctrlK(input);
    expect(palette.isOpen()).toBe(false);
  });

  it('does not stack over an existing modal', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    document.body.appendChild(modal);
    ctrlK();
    expect(palette.isOpen()).toBe(false);
  });

  it('does not stack over an open menu or picker', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    ctrlK();
    expect(palette.isOpen()).toBe(false);
  });

  it('does not open during Present Mode', () => {
    const graph = TestBed.inject(GraphService);
    const presentation = TestBed.inject(PresentationService);
    graph.createGroup('Tour', 0, 0);
    presentation.enter(800, 600);

    ctrlK();
    expect(palette.isOpen()).toBe(false);
    presentation.exit();
  });
});
