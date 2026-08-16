import { describe, it, expect } from 'vitest';
import { encodeShareParam, decodeShareParam } from './share-link';

describe('share-link codec', () => {
  it('encodes as gz-prefixed base64url and round-trips', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'n1', label: 'Hello', x: 0, y: 0 }],
      connections: [],
    });

    const param = await encodeShareParam(json);

    expect(param.startsWith('gz:')).toBe(true);
    expect(param.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
    await expect(decodeShareParam(param)).resolves.toBe(json);
  });

  it('round-trips non-ASCII Text through gzip without corruption', async () => {
    const json = JSON.stringify({ nodes: [{ id: 'n1', label: 'Café ☕ — 100%' }], connections: [] });

    await expect(decodeShareParam(await encodeShareParam(json))).resolves.toBe(json);
  });

  it('passes legacy raw-JSON parameters through unchanged', async () => {
    const json = JSON.stringify({ nodes: [], connections: [] });

    await expect(decodeShareParam(json)).resolves.toBe(json);
  });

  it('rejects a corrupt gz payload', async () => {
    await expect(decodeShareParam('gz:truncated-garbage')).rejects.toThrow();
  });
});
