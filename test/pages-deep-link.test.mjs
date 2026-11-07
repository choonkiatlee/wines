import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WINES, MAX_SHARE_URL_CHARS, parseWineInputs, plainWineLink,
  readWineLink, createShareLink,
} from '../apps/pages/src/deep-link.ts';

const PAGE = 'https://choonkiatlee.github.io/wines/';
const sample = [
  { name: "G.D. Vajra Barbera d'Alba", year: 2022, type: 'red', menuPrice: 58,
    metadata: { serving: 'bottle', section: 'Piémont', notes: 'Café rosé' } },
  { name: 'Château d’Yquem', year: 2015, menuPrice: 42, metadata: { serving: 'glass' } },
];

test('plain agent-generated fragment supports Unicode, price and optional autorun', async () => {
  const url = plainWineLink(PAGE, sample, true);
  assert.match(url, /#wines=/);
  const decoded = await readWineLink(new URL(url).hash);
  assert.deepEqual(decoded, { wines: sample, autorun: true });
  const manual = plainWineLink(PAGE, sample, false);
  assert.equal((await readWineLink(new URL(manual).hash)).autorun, false);
  assert.equal(decoded.wines[0].menuPrice, 58);
  assert.equal(decoded.wines[1].menuPrice, 42);
});

test('browser-generated compressed link restores 60 wines including original menu prices', async () => {
  const items = Array.from({ length: MAX_WINES }, (_, i) => ({
    name: 'Domaine ' + i + ' Côte du Rhône Réserve Spéciale',
    year: 2000 + i % 20,
    type: i % 2 === 0 ? 'red' : 'white',
    menuPrice: 30 + i,
    metadata: { serving: 'bottle', section: 'Région ' + (i % 6) },
  }));
  const result = await createShareLink(PAGE, items, true);
  assert.equal(result.compressed, true);
  assert.ok(result.url.length <= MAX_SHARE_URL_CHARS, result.url.length);
  assert.ok(result.url.length < plainWineLink(PAGE, items).length);
  assert.deepEqual(await readWineLink(new URL(result.url).hash), { wines: items, autorun: true });
});

test('share-link URLs strip existing hash and query, never selected candidates or UI sort', async () => {
  const { url } = await createShareLink(PAGE + '?sort=type#ignored', sample, true);
  assert.equal(url.includes('sort='), false);
  assert.ok(url.startsWith(PAGE + '#'));
  assert.deepEqual((await readWineLink(new URL(url).hash)).wines, sample);
});

test('metadata is optional and respects original input ordering', () => {
  const rows = parseWineInputs(JSON.stringify([
    { name: 'First', menuPrice: 18, metadata: { notes: 'chilled' } },
    { name: 'Second' },
    { name: 'Third', menuPrice: 99 },
  ]));
  assert.equal(rows[0].menuPrice, 18);
  assert.equal(rows[1].menuPrice, undefined);
  assert.equal(rows[2].menuPrice, 99);
  assert.equal(rows[0].metadata.notes, 'chilled');
});

test('invalid/malformed/oversized inputs are rejected before any fetch could occur', async () => {
  const invalid = [
    [], Array.from({ length: MAX_WINES + 1 }, (_, i) => ({ name: 'Wine ' + i })),
    [{ name: '' }], [{ name: 'A', year: '2022' }],
    [{ name: 'B', type: 'blue' }], [{ name: 'C', menuPrice: '£42' }],
    [{ name: 'C', menuPrice: -1 }], [{ name: 'C', menuPrice: null }],
    [{ name: 'D', metadata: { notes: 'x'.repeat(221) } }],
    [{ name: 'E', metadata: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 } }],
  ];
  for (const input of invalid) assert.throws(() => parseWineInputs(JSON.stringify(input)));
  assert.throws(() => parseWineInputs('x'.repeat(24001)), /24 KB/);
  assert.equal(await readWineLink('#about'), null);
  await assert.rejects(readWineLink('#wines='), /JSON|Unexpected|input|position/i);
  await assert.rejects(readWineLink('#wines=%5B%5D&autorun=maybe'), /autorun/);
  await assert.rejects(readWineLink('#wines=%5B%5D&wines=%5B%5D'), /exactly one/);
  await assert.rejects(readWineLink('#z=not-base64_'), /Invalid|decompress|unknown|incorrect|Invalid/);
  await assert.rejects(readWineLink('#wines=' + 'x'.repeat(16001)), /too long/);
});

test('compressed zip bomb is stopped at 24 KB after decompression', async () => {
  const oversized = 'x'.repeat(24_050);
  const compressed = await new Response(new Blob([oversized]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const encoded = btoa(String.fromCharCode(...new Uint8Array(compressed)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  await assert.rejects(readWineLink('#z=' + encoded), /24 KB/);
});
