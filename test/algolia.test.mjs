import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src/index.ts';

const sample = () => ({ id: 1911534, name: 'Opus One', winery: { name: 'Opus One' },
  region: { name: 'Napa Valley', country: 'us' }, description: 'Dark fruit with velvety tannins.', alcohol: 14.5,
  closure: 'cork', style_id: 289, grapes: [2], foods: [4, 8], non_vintage: false,
  image: { location: '//images.vivino.com/example.png' }, updated_at: '2023-05-15T12:32:29Z',
  statistics: { status: 'Normal', ratings_average: 4.6, ratings_count: 97125 },
  vintages: [{ id: 170415755, year: '2022', statistics: { status: 'Normal', ratings_average: 4.5, ratings_count: 513, reviews_count: 140 } },
    { id: 3333570, year: '', statistics: { status: 'Normal', ratings_average: 4.6, ratings_count: 97125 } }] });
function client(wine = sample(), status = 200) {
  const calls = [];
  return { calls, client: new api.VivinoAlgoliaClient({ fetch: async (url, init) => {
    calls.push({ url: new URL(url), init });
    assert.equal(new URL(url).hostname, '9takgwjuxl-dsn.algolia.net', 'Profiles must never call the website');
    return Response.json(String(url).endsWith('/query') ? { hits: [wine], nbHits: 1 } : wine, { status });
  } }) };
}
test('Algolia search uses built-in credentials and preserves indexed metadata', async () => {
  const { client: c, calls } = client();
  const r = await c.searchWines('Opus One', 3);
  assert.equal(r.candidates[0].vintages[0].statistics.reviews_count, 140);
  assert.equal(r.candidates[0].region.country, 'us');
  assert.equal(new Headers(calls[0].init.headers).get('x-algolia-application-id'), '9TAKGWJUXL');
  assert.deepEqual(JSON.parse(calls[0].init.body), { query: 'Opus One', hitsPerPage: 3 });
});
test('exact-year profile needs just one indexed lookup and preserves scope and provenance', async () => {
  const { client: c, calls } = client();
  const p = await c.getProfileForYear(1911534, 2022);
  assert.equal(calls.length, 1);
  assert.deepEqual(p.vintage, { id: 170415755, year: 2022 });
  assert.deepEqual(p.ratings.vintage, { average: 4.5, count: 513, reviewsCount: 140 });
  assert.deepEqual(p.ratings.allVintages, { average: 4.6, count: 97125, reviewsCount: null });
  assert.deepEqual(p.description, { scope: 'wine', text: sample().description });
  assert.equal(p.wine.country, 'us');
  assert.equal(p.wine.alcohol, 14.5);
  assert.deepEqual(p.wine.grapeIds, [2]);
  assert.deepEqual(p.wine.foodIds, [4, 8]);
  assert.equal(p.wine.styleId, 289);
  assert.equal(p.wine.imageUrl, 'https://images.vivino.com/example.png');
  assert.equal(p.source, 'vivino-algolia');
  assert.ok(Number.isFinite(Date.parse(p.retrievedAt)));
  assert.match(p.sourceUrl, /\/w\/1911534\?year=2022$/);
  assert.equal(p.indexUpdatedAt, sample().updated_at);
  assert.equal('taste' in p, false);
  assert.equal('prices' in p, false);
});
test('wine-only profile does not select an arbitrary vintage', async () => {
  const { client: c } = client();
  const p = await c.getProfile(1911534);
  assert.equal(p.vintage, null);
  assert.equal(p.ratings.vintage, null);
  assert.equal(p.ratings.allVintages.average, 4.6);
});
test('resolveVintage still resolves an exact indexed year', async () => {
  const { client: c } = client();
  assert.deepEqual(await c.resolveVintage(1911534, 2022), { provider: 'vivino', wineId: 1911534, vintageId: 170415755, year: 2022 });
});
test('missing year rejects instead of substituting U.V. or another year', async () => {
  const { client: c } = client();
  await assert.rejects(() => c.getProfileForYear(1911534, 2021), /No 2021 vintage/);
});
test('below-threshold ratings stay missing while known vintage counts survive', async () => {
  const w = sample(); w.vintages[0].statistics = { status: 'BelowThreshold', ratings_average: 0, ratings_count: 2, reviews_count: 0 };
  const p = await client(w).client.getProfileForYear(1911534, 2022);
  assert.equal(p.ratings.vintage, null);
  assert.deepEqual(p.vintageCounts, { ratings: 2, reviews: 0 });
  assert.equal(p.ratings.allVintages.average, 4.6);
  assert.match(p.warnings.join(' '), /vintage-specific rating/);
});
test('explicit fallback and invalid validity flags never become exact-year scores', async () => {
  for (const mutate of [w => w.vintages[0].statistics.is_wine_rating = true, w => w.vintages[0].has_valid_ratings = false]) {
    const w = sample(); mutate(w);
    const p = await client(w).client.getProfileForYear(1911534, 2022);
    assert.equal(p.ratings.vintage, null);
  }
});
test('missing metadata and counts remain null, rather than fabricated zeroes', async () => {
  const w = { id: 7, name: 'Minimal', vintages: [{ id: 9, year: 2020, statistics: { status: 'Normal', ratings_average: 4 } }] };
  const p = await client(w).client.getProfileForYear(7, 2020);
  assert.equal(p.description, null);
  assert.equal(p.wine.country, null);
  assert.equal(p.wine.grapeIds, null);
  assert.equal(p.ratings.vintage.count, null);
  assert.equal(p.ratings.vintage.reviewsCount, null);
  assert.equal(p.ratings.allVintages, null);
});
test('country object responses remain supported for existing callers', async () => {
  const w = sample(); w.region.country = { code: 'us' };
  assert.equal((await client(w).client.getProfile(1911534)).wine.country, 'us');
});
test('ambiguous year entries with different vintage IDs are rejected', async () => {
  const w = sample(); w.vintages.push({ id: 10, year: 2022 });
  await assert.rejects(() => client(w).client.getProfileForYear(1911534, 2022), /Ambiguous/);
});
test('mismatching wine IDs and malformed indexed responses are rejected', async () => {
  await assert.rejects(() => client().client.getWine(7), /does not match/);
  for (const w of [{ id: 7 }, { id: 7, name: 'Bad', vintages: {} }]) {
    await assert.rejects(() => client(w).client.getWine(7), /Unexpected/);
  }
});
test('invalid identifiers, year and query fail without network calls', async () => {
  const { client: c, calls } = client();
  await assert.rejects(() => c.getWine(-1), RangeError);
  await assert.rejects(() => c.getProfileForYear(1911534, 0), RangeError);
  await assert.rejects(() => c.searchWines(' '), /cannot be empty/);
  await assert.rejects(() => c.searchWines('x', 21), RangeError);
  assert.equal(calls.length, 0);
});
test('HTTP errors propagate once without retries', async () => {
  const { client: c, calls } = client(sample(), 403);
  await assert.rejects(() => c.getProfile(1911534), e => e instanceof api.VivinoHttpError && e.status === 403);
  assert.equal(calls.length, 1);
});
