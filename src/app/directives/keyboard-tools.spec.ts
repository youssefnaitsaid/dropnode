import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { CanvasToolService } from '../services/canvas-tool.service';
import { GraphService } from '../services/graph.service';

@Component({
  standalone: true,
  imports: [KeyboardShortcuts],
  template: '<div appKeyboardShortcuts></div>',
})
class ToolKeyHost {}

describe('KeyboardShortcuts tool keys', () => {
  let fixture: ComponentFixture<ToolKeyHost>;
  let tool: CanvasToolService;

  const key = (k: string): void => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [ToolKeyHost],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ToolKeyHost);
    tool = TestBed.inject(CanvasToolService);
    fixture.detectChanges();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('switches to Pan on H and back to Select on V', () => {
    key('h');
    expect(tool.tool()).toBe('pan');
    key('v');
    expect(tool.tool()).toBe('select');
  });

  it('is case-insensitive for both keys', () => {
    key('H');
    expect(tool.tool()).toBe('pan');
    key('V');
    expect(tool.tool()).toBe('select');
  });

  it('cancels Pin arming on Escape without clearing the Selection', () => {    const graph = TestBed.inject(GraphService);
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    tool.armPin();
    key('Escape');
    expect(tool.tool()).toBe('select');
    expect(graph.selectedNodeId()).toBe(node.id);
  });

  it('reverts Pan to Select on Escape without clearing the Selection', () => {    const graph = TestBed.inject(GraphService);
    const node = graph.createNode('N', 0, 0);
    graph.selectNode(node.id);
    tool.pan();
    key('Escape');
    expect(tool.tool()).toBe('select');
    expect(graph.selectedNodeId()).toBe(node.id);
  });

  it('cancels an armed Node on Escape without touching Graph State', () => {
    const graph = TestBed.inject(GraphService);
    tool.armNode();
    key('Escape');
    expect(tool.tool()).toBe('select');
    expect(graph.nodes().length).toBe(0);
  });

  it('ignores V and H while typing', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }));
    expect(tool.tool()).toBe('select');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
    expect(tool.tool()).toBe('select');
  });
});
