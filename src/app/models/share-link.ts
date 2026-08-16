/**
 * Share-link payload codec (ADR-0026): the ?data parameter carries the
 * Graph State as gzip-compressed, base64url-encoded compact JSON under a
 * `gz:` prefix. The previous shape — percent-encoded pretty JSON — grew
 * URLs past server request-line limits, which browsers surface as
 * HTTP 431. Base64url needs no percent-encoding, so the parameter length
 * tracks the compressed byte count. Unprefixed values are legacy raw JSON
 * and still import unchanged.
 */

const GZ_PREFIX = 'gz:';

/** One-shot byte stream — the payload always fits comfortably in memory. */
function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * The DOM types the compression streams as BufferSource pipes; at runtime
 * they only ever move gzipped bytes, so treat them as byte streams.
 */
type ByteTransform = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

async function pipeThrough(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reader = byteStream(bytes).pipeThrough(transform as unknown as ByteTransform).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  // String.fromCharCode spread in 32 KiB slices — a single spread of a
  // large graph would exceed the argument-count limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Serializes a JSON payload for the ?data parameter. Environments without
 * CompressionStream fall back to the legacy percent-encoded shape so
 * copying still works, just with a longer link.
 */
export async function encodeShareParam(json: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return encodeURIComponent(json);
  const compressed = await pipeThrough(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return GZ_PREFIX + bytesToBase64url(compressed);
}

/**
 * Restores the JSON payload from a ?data value (already URL-decoded by
 * URLSearchParams). Throws on corrupt compressed data; the caller decides
 * the error message.
 */
export async function decodeShareParam(param: string): Promise<string> {
  if (!param.startsWith(GZ_PREFIX)) return param;
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unavailable');
  const plain = await pipeThrough(base64urlToBytes(param.slice(GZ_PREFIX.length)), new DecompressionStream('gzip'));
  return new TextDecoder().decode(plain);
}
