import assert from 'node:assert/strict';
import test from 'node:test';
import { VivinoClient, VivinoHttpError, ratingsFrom } from '../src/index.ts';

const urls = [];
const mockedFetch = async (url, init = {}) => {
  urls.push([String(url), init]);
  const path = new URL(url).pathname;
  const data = path.endsWith('/query')
    ? { nbHits: 1, hits: [{ id: 7, name: 'Example wine', vintages: [{ id: 9, year: 2020 }] }] }
    : path.endsWith('/WINES_prod/7')
      ? { id: 7, name: 'Example wine', vintages: [{ id: 9, year: 2020 }] }
      : path.endsWith('/api/vintages/9')
        ? { vintage: {
            id: 9, year: 2020,
            statistics: { status: 'Normal', is_wine_rating: false, ratings_average: 4.2, ratings_count: 45, wine_ratings_average: 4.0, wine_ratings_count: 900 },
            wine: { id: 7, name: 'Example wine', winery: { name: 'Producer' } },
          } }
        : path.endsWith('/api/wines/7/tastes')
          ? { tastes: { structure: { tannin: 3.2 }, flavor: [{ group: 'red_fruit', primary_keywords: [{ name: 'cherry' }] }] } }
          : null;
  return data ? new Response(JSON.stringify(data), { status: 200 }) : new Response('{}', { status: 404 });
};

const client = new VivinoClient({
  fetch: mockedFetch,
  algolia: { appId: 'test-app', searchKey: 'test-key' },
});

test('search returns unverified candidates and uses configured headers', async () => {
  const { total, hits } = await client.searchWines('example', 2);
  assert.equal(total, 1);
  assert.equal(hits[0].id, 7);
  assert.equal(urls.at(-1)[1].headers['x-algolia-api-key'], 'test-key');
});

test('profile keeps vintage rating separate from all-vintage rating and wine-level taste', async () => {
  const profile = await client.getProfileForYear(7, 2020);
  assert.deepEqual(profile.ratings, {
    vintage: { average: 4.2, count: 45 },
    allVintages: { average: 4.0, count: 900 },
  });
  assert.equal(profile.taste.scope, 'wine');
  assert.equal(profile.taste.flavors[0].primary_keywords[0].name, 'cherry');
  assert.match(profile.sourceUrl, /year=2020/);
});

test('requested missing vintage is never silently replaced', async () => {
  await assert.rejects(() => client.getProfileForYear(7, 2021), /No verified 2021 vintage/);
});

test('wine-level fallback is not mislabelled vintage-specific', () => {
  const ratings = ratingsFrom({
    id: 10, year: 2020,
    statistics: { is_wine_rating: true, ratings_average: 4.1, ratings_count: 600 },
    wine: { id: 7, name: 'Example' },
  });
  assert.equal(ratings.vintage, null);
  assert.deepEqual(ratings.allVintages, { average: 4.1, count: 600 });
});

test('errors preserve HTTP status without exposing credentials', async () => {
  await assert.rejects(() => client.getVintage(100), error => {
    assert.ok(error instanceof VivinoHttpError);
    assert.equal(error.status, 404);
    assert.ok(!error.message.includes('test-key'));
    return true;
  });
});
