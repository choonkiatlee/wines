/** LLM-friendly Pages deep links; URL fragments are client-side only, not private. */
import type { WineEnrichmentInput, WineType } from '../../../src/enrichment.ts';

export const MAX_WINES = 60;
export const MAX_JSON_BYTES = 24_000;
/** Import plain JSON URLs up to this size; links can be truncated by messaging apps. */
export const MAX_INCOMING_FRAGMENT_CHARS = 16_000;
/** Conservative shareable-link budget; use gzip when plain percent-encoding is too long. */
export const MAX_SHARE_URL_CHARS = 8_000;

const TYPES = new Set<WineType>(['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified']);
const MAX_NAME_LENGTH = 220;
const MAX_METADATA_ITEMS = 8;
const MAX_METADATA_KEY_LENGTH = 40;
const MAX_METADATA_VALUE_LENGTH = 220;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Shared by manual JSON input, generated links, and imported URL fragments. */
export function parseWineInputs(json: string): WineEnrichmentInput[] {
  if (byteLength(json) > MAX_JSON_BYTES) {
    throw new RangeError('Wine list exceeds the 24 KB input limit. Shorten long notes or split the list.');
  }
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_WINES) {
    throw new RangeError('Provide between 1 and ' + MAX_WINES + ' wines per list.');
  }
  return parsed.map((entry, index) => {
    const where = 'Wine ' + (index + 1);
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(where + ' must be an object.');
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > MAX_NAME_LENGTH) {
      throw new TypeError(where + ' needs a non-empty name (at most ' + MAX_NAME_LENGTH + ' characters).');
    }
    const wine: WineEnrichmentInput = { name: row.name.trim() };
    if (row.year !== undefined) {
      if (typeof row.year !== 'number' || !Number.isInteger(row.year) ||
          row.year < 1800 || row.year > 2100) {
        throw new TypeError(where + ' has an invalid four-digit vintage.');
      }
      wine.year = row.year;
    }
    if (row.type !== undefined) {
      if (typeof row.type !== 'string' || !TYPES.has(row.type as WineType)) {
        throw new TypeError(where + ' has an unknown wine type.');
      }
      wine.type = row.type as WineType;
    }
    if (row.metadata !== undefined) {
      const value = row.metadata;
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(where + ' metadata must be a flat object.');
      }
      const fields = Object.entries(value);
      if (fields.length > MAX_METADATA_ITEMS) {
        throw new RangeError(where + ' metadata has too many fields (max ' + MAX_METADATA_ITEMS + ').');
      }
      const metadata: NonNullable<WineEnrichmentInput['metadata']> = {};
      for (const [key, field] of fields) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || key.length > MAX_METADATA_KEY_LENGTH ||
            ['constructor', 'prototype', '__proto__'].includes(key)) {
          throw new TypeError(where + ' has an unsupported metadata key.');
        }
        if (!(field === null || typeof field === 'string' ||
              typeof field === 'boolean' || (typeof field === 'number' && Number.isFinite(field))) ||
            (typeof field === 'string' && field.length > MAX_METADATA_VALUE_LENGTH)) {
          throw new TypeError(where + ' has an unsupported metadata value for ' + key + '.');
        }
        Object.defineProperty(metadata, key, { value: field, enumerable: true, configurable: true, writable: true });
      }
      wine.metadata = metadata;
    }
    return wine;
  });
}

export function menuPrice(input: WineEnrichmentInput): string | null {
  const value = input.metadata?.menuPrice;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function baseUrl(pageUrl: string): string {
  const parsed = new URL(pageUrl);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('Expected an HTTP(S) Pages URL.');
  }
  parsed.hash = '';
  parsed.search = '';
  return parsed.href;
}

/** For agents/scripts: ordinary JSON works without gzip or any server tool. */
export function plainWineLink(pageUrl: string, wines: readonly WineEnrichmentInput[], autorun = true): string {
  const validated = parseWineInputs(JSON.stringify(wines));
  const params = new URLSearchParams();
  params.set('wines', JSON.stringify(validated));
  if (autorun) params.set('autorun', 'true');
  return baseUrl(pageUrl) + '#' + params.toString();
}

function binaryToBase64Url(bytes: Uint8Array): string {
  // Input is bounded to 24 KB, so this avoids a dependency and stack overflow.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x4000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBinary(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid compressed wine-list encoding.');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBounded(compressed: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(compressed).buffer as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let count = 0;
  let output = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_JSON_BYTES) {
        void reader.cancel();
        throw new RangeError('Decompressed wine list exceeds the 24 KB limit.');
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export type ImportedWineLink = { wines: WineEnrichmentInput[]; autorun: boolean };

/** Returns null for unrelated fragments (e.g. #about). Malformed wine links throw. */
export async function readWineLink(hash: string): Promise<ImportedWineLink | null> {
  if (!hash || hash === '#') return null;
  if (hash.length > MAX_INCOMING_FRAGMENT_CHARS) {
    throw new RangeError('Wine link is too long. Split the list or use a shorter compressed link.');
  }
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const plain = params.getAll('wines');
  const compressed = params.getAll('z');
  if (!plain.length && !compressed.length) return null;
  if (plain.length + compressed.length !== 1) {
    throw new Error('Wine link must provide exactly one wine-list payload.');
  }
  const flag = params.getAll('autorun');
  if (flag.length > 1 || (flag[0] !== undefined && !['true', 'false'].includes(flag[0]))) {
    throw new TypeError('Invalid autorun value.');
  }
  let json: string;
  if (plain.length) {
    json = plain[0];
  } else {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot open compressed wine links.');
    }
    try {
      json = await gunzipBounded(base64UrlToBinary(compressed[0]));
    } catch (error) {
      if (error instanceof RangeError) throw error;
      throw new Error('Invalid compressed wine-list payload.');
    }
  }
  return { wines: parseWineInputs(json), autorun: flag[0] === 'true' };
}

/** Copy-link helper. Prefers gzip to keep 30–60 wine lists under a conservative budget. */
export async function createShareLink(
  pageUrl: string,
  wines: readonly WineEnrichmentInput[],
  autorun = true,
): Promise<{ url: string; compressed: boolean }> {
  const plain = plainWineLink(pageUrl, wines, autorun);
  let best = plain;
  let compressed = false;
  if (typeof CompressionStream === 'function') {
    const compact = baseUrl(pageUrl) + '#z=' +
      binaryToBase64Url(await gzip(JSON.stringify(parseWineInputs(JSON.stringify(wines))))) +
      (autorun ? '&autorun=true' : '');
    if (compact.length < plain.length) {
      best = compact;
      compressed = true;
    }
  }
  if (best.length > MAX_SHARE_URL_CHARS) {
    throw new RangeError('This URL is too long to share reliably (' + best.length +
      ' characters). Split the list or shorten menu notes.');
  }
  return { url: best, compressed };
}
