import '@analogjs/vite-plugin-angular/setup-vitest';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// jsdom drops Node's web streams (ReadableStream and the compression
// streams); the share-link codec (ADR-0026) needs them for its gzip
// payloads. Bridge Node's zlib so specs exercise the real compression
// path instead of the legacy fallback.
import { createGzip, createGunzip } from 'node:zlib';
import { Readable, Writable } from 'node:stream';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';

if (typeof globalThis.ReadableStream === 'undefined') {
  (globalThis as Record<string, unknown>).ReadableStream = NodeReadableStream;
}

class NodeCompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  constructor() {
    const zlib = createGzip();
    this.readable = Readable.toWeb(zlib) as unknown as ReadableStream<Uint8Array>;
    this.writable = Writable.toWeb(zlib) as unknown as WritableStream<Uint8Array>;
  }
}

class NodeDecompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  constructor() {
    const zlib = createGunzip();
    this.readable = Readable.toWeb(zlib) as unknown as ReadableStream<Uint8Array>;
    this.writable = Writable.toWeb(zlib) as unknown as WritableStream<Uint8Array>;
  }
}

if (typeof globalThis.CompressionStream === 'undefined') {
  (globalThis as Record<string, unknown>).CompressionStream = NodeCompressionStream;
}
if (typeof globalThis.DecompressionStream === 'undefined') {
  (globalThis as Record<string, unknown>).DecompressionStream = NodeDecompressionStream;
}
