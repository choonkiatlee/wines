import assert from 'node:assert/strict';
import test from 'node:test';
import { VivinoClient, VivinoHttpError, ratingsFrom } from '../src/index.ts';

function mockFetch(calls, { omitTastes = false, wrongVintage = false } = {}) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(url).pathname;
    const wine = { id: 7, name: 'Example wine', vintages: [{ id: 9, year: 2020 }, { id: 10, year: 'U.V.' }] };
    const data = path.endsWith('/query')
      ? { nbHits: 1, hits: [wine] }
      : path.endsWith('/WINES_prod/7')
        ? wine
        : path.endsWith('/api/vintages/9')
          ? { vintage: {
              id: 9, year: wrongVintage ? 2019 : 2020,
              statistics: {
                status: 'Normal', is_wine_rating: false, ratings_average: 4.2,
                ratings_count: 45, wine_ratings_average: 4.0, wine_ratings_count: 900,
              },
              wine: { id: 7, name: 'Example wine', winery: { name: 'Producer' } },
            } }
          : path.endsWith('/api/wines/7/tastes') && !omitTastes
            ? { tastes: {
                structure: { tannin: 3.2 },
                flavor: [{ group: 'red_fruit', primary_keywords: [{ name: 'cherry' }] }],
              } }
            : null;
    return data ? Response.json(data) : Response.json({}, { status: 404 });
  };
}

test('VivinoClient is usable without passing credentials or a resolver', async () => {
  const calls = [];
  const client = new VivinoClient({ fetch: mockFetch(calls) });
  const profile = await client.getProfile(9);
  assert.equal(profile.vintage.id, 9);
  assert.deepEqual(profile.ratings, {
    vintage: { average: 4.2, count: 45 },
    allVintages: { average: 4.0, count: 900 },
  });
  assert.equal(profile.taste.scope, 'wine');
  assert.equal(profile.taste.flavors[0].primary_keywords[0].name, 'cherry');
  assert.ok(calls.every(c => new URL(c.url).hostname === 'www.vivino.com'));
  assert.ok(calls.every(c => !new Headers(c.init.headers).has('x-algolia-api-key')));
});

test('searchWines uses Vivino-specific application ID and built-in search-only key', async () => {
  const calls = [];
  const client = new VivinoClient({ fetch: mockFetch(calls) });
  const result = await client.searchWines('example', 3);
  assert.equal(result.total, 1);
  assert.equal(result.candidates[0].id, 7);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).hostname, '9takgwjuxl-dsn.algolia.net');
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('x-algolia-application-id'), '9TAKGWJUXL');
  assert.ok(headers.get('x-algolia-api-key'));
  assert.deepEqual(JSON.parse(calls[0].init.body), { query: 'example', hitsPerPage: 3 });
});

test('search refuses blank queries and invalid limits without network access', async () => {
  const calls = [];
  const client = new VivinoClient({ fetch: mockFetch(calls) });
  await assert.rejects(() => client.searchWines('   '), /cannot be empty/);
  await assert.rejects(() => client.searchWines('test', 99), /limit must be/);
  assert.equal(calls.length, 0);
});

test('getWine looks up a Vivino wine and its indexed vintages', async () => {
  const calls = [];
  const wine = await new VivinoClient({ fetch: mockFetch(calls) }).getWine(7);
  assert.equal(wine.id, 7);
  assert.deepEqual(wine.vintages[0], { id: 9, year: 2020 });
  assert.equal(new URL(calls[0].url).pathname, '/1/indexes/WINES_prod/7');
});

test('resolveVintage requires an exact year and does not substitute U.V.', async () => {
  const client = new VivinoClient({ fetch: mockFetch([]) });
  assert.deepEqual(await client.resolveVintage(7, 2020), {
    provider: 'vivino', wineId: 7, vintageId: 9, year: 2020,
  });
  await assert.rejects(() => client.resolveVintage(7, 2021), /No 2021 vintage found/);
  await assert.rejects(() => client.resolveVintage(7, 0), /valid four-digit vintage/);
});

test('getProfileForYear combines search-index resolution with enrichment', async () => {
  const calls = [];
  const profile = await new VivinoClient({ fetch: mockFetch(calls) }).getProfileForYear(7, 2020);
  assert.equal(profile.wine.id, 7);
  assert.equal(profile.vintage.year, 2020);
  assert.equal(profile.ratings.vintage.average, 4.2);
  assert.equal(calls.length, 3);
});

test('getProfileForYear catches mismatches between index and vintage endpoint', async () => {
  const client = new VivinoClient({ fetch: mockFetch([], { wrongVintage: true }) });
  await assert.rejects(() => client.getProfileForYear(7, 2020), /does not match requested wine\/year/);
});

test('missing taste data is nonfatal but reported', async () => {
  const profile = await new VivinoClient({ fetch: mockFetch([], { omitTastes: true }) }).getProfile(9);
  assert.equal(profile.taste, null);
  assert.match(profile.warnings.join(' '), /taste data unavailable/);
});

test('all-vintage fallback is never presented as a vintage-specific rating', () => {
  const ratings = ratingsFrom({
    id: 10, year: 2020,
    statistics: { is_wine_rating: true, ratings_average: 4.1, ratings_count: 600 },
    wine: { id: 7, name: 'Example' },
  });
  assert.equal(ratings.vintage, null);
  assert.deepEqual(ratings.allVintages, { average: 4.1, count: 600 });
});

test('HTTP errors preserve status and endpoint without exposing API keys', async () => {
  const client = new VivinoClient({ fetch: mockFetch([]) });
  await assert.rejects(() => client.getVintage(100), error => {
    assert.ok(error instanceof VivinoHttpError);
    assert.equal(error.status, 404);
    assert.equal(error.endpoint, '/api/vintages/100');
    assert.ok(!error.message.includes('60c11b2f'));
    return true;
  });
});
