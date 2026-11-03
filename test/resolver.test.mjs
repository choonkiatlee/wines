import assert from 'node:assert/strict';
import test from 'node:test';
import { VivinoResolver } from '../src/index.ts';

function mockFetch(calls) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(url).pathname;
    const wine = { id: 7, name: 'Example wine', vintages: [{ id: 9, year: 2020 }, { id: 10, year: 'U.V.' }] };
    const data = path.endsWith('/query') ? { nbHits: 1, hits: [wine] }
      : path.endsWith('/WINES_prod/7') ? wine : null;
    return data ? Response.json(data) : Response.json({}, { status: 404 });
  };
}

function resolver(calls) {
  return new VivinoResolver({
    fetch: mockFetch(calls),
    algolia: { appId: 'example-app', searchKey: 'example-search-key' },
  });
}

test('search returns candidates and keeps Algolia headers in resolver', async () => {
  const calls = [];
  const { total, hits } = await resolver(calls).searchWines('example', 2);
  assert.equal(total, 1);
  assert.equal(hits[0].id, 7);
  assert.equal(new Headers(calls[0].init.headers).get('x-algolia-api-key'), 'example-search-key');
  assert.equal(new URL(calls[0].url).hostname, '9takgwjuxl-dsn.algolia.net');
});

test('resolves only an explicitly listed vintage, returning IDs for enrichment', async () => {
  const calls = [];
  const found = await resolver(calls).resolveVintage(7, 2020);
  assert.deepEqual(found, { provider: 'vivino', wineId: 7, vintageId: 9, year: 2020 });
  assert.equal(calls.length, 1);
});

test('does not substitute a different vintage or U.V.', async () => {
  const r = resolver([]);
  await assert.rejects(() => r.resolveVintage(7, 2021), /No 2021 vintage found/);
});

test('resolver requires explicit Algolia credentials', () => {
  assert.throws(() => new VivinoResolver({ algolia: { appId: '', searchKey: '' } }), /Algolia configuration/);
});
