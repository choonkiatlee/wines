import assert from 'node:assert/strict';
import test from 'node:test';
import { VivinoClient, VivinoHttpError, ratingsFrom } from '../src/index.ts';

function mockFetch(calls, omitTastes = false) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(url).pathname;
    const data = path.endsWith('/api/vintages/9')
      ? { vintage: {
          id: 9, year: 2020,
          statistics: { status: 'Normal', is_wine_rating: false, ratings_average: 4.2, ratings_count: 45, wine_ratings_average: 4.0, wine_ratings_count: 900 },
          wine: { id: 7, name: 'Example wine', winery: { name: 'Producer' } },
        } }
      : path.endsWith('/api/wines/7/tastes') && !omitTastes
        ? { tastes: { structure: { tannin: 3.2 }, flavor: [{ group: 'red_fruit', primary_keywords: [{ name: 'cherry' }] }] } }
        : null;
    return data ? Response.json(data) : Response.json({}, { status: 404 });
  };
}

test('enrichment requires no Algolia credentials or search requests', async () => {
  const calls = [];
  const client = new VivinoClient({ fetch: mockFetch(calls) });
  const profile = await client.getProfile(9);
  assert.deepEqual(profile.ratings, {
    vintage: { average: 4.2, count: 45 },
    allVintages: { average: 4.0, count: 900 },
  });
  assert.equal(profile.taste.scope, 'wine');
  assert.equal(profile.taste.flavors[0].primary_keywords[0].name, 'cherry');
  assert.match(profile.sourceUrl, /year=2020/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => new URL(c.url).hostname === 'www.vivino.com'));
  assert.ok(calls.every(c => !new Headers(c.init.headers).has('x-algolia-api-key')));
  assert.equal(typeof client.searchWines, 'undefined');
  assert.equal(typeof client.getProfileForYear, 'undefined');
});

test('missing taste data is nonfatal but reported', async () => {
  const client = new VivinoClient({ fetch: mockFetch([], true) });
  const profile = await client.getProfile(9);
  assert.equal(profile.taste, null);
  assert.match(profile.warnings.join(' '), /taste data unavailable/);
});

test('cross-vintage fallback is not mislabelled as vintage-specific', () => {
  const ratings = ratingsFrom({
    id: 10, year: 2020,
    statistics: { is_wine_rating: true, ratings_average: 4.1, ratings_count: 600 },
    wine: { id: 7, name: 'Example' },
  });
  assert.equal(ratings.vintage, null);
  assert.deepEqual(ratings.allVintages, { average: 4.1, count: 600 });
});

test('information HTTP errors preserve status and endpoint', async () => {
  const client = new VivinoClient({ fetch: mockFetch([]) });
  await assert.rejects(() => client.getVintage(100), error => {
    assert.ok(error instanceof VivinoHttpError);
    assert.equal(error.status, 404);
    assert.equal(error.endpoint, '/api/vintages/100');
    return true;
  });
});

