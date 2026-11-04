import assert from 'node:assert/strict';
import test from 'node:test';
import { VivinoClient, VivinoHttpError, ratingsFrom } from '../src/index.ts';

function fixture(data, status = 200) {
  const calls = [];
  const client = new VivinoClient({ baseUrl: 'https://example.test/', fetch: async (url, init) => {
    calls.push({ url: new URL(url), headers: new Headers(init?.headers) });
    return Response.json(data, { status });
  } });
  return { client, calls };
}
const vintage = { id: 170415755, year: 2022, wine: { id: 1911534, name: 'Opus One' } };
const price = { id: 43055597, vintage_id: vintage.id, amount: 449, currency: { code: 'USD' }, bottle_type: { volume_ml: 750 } };

test('website GETs send the frontend JSON headers without Algolia headers', async () => {
  const tastes = { structure: { fizziness: null, calculated_structure_count: 4422 }, flavor: null };
  const { client, calls } = fixture({ tastes });
  assert.deepEqual(await client.getTastes(1911534), tastes);
  assert.equal(calls[0].url.origin, 'https://example.test');
  assert.equal(calls[0].headers.get('accept'), 'application/json');
  assert.equal(calls[0].headers.get('content-type'), 'application/json');
  assert.equal(calls[0].headers.get('x-requested-with'), 'XMLHttpRequest');
  assert.equal(calls[0].headers.has('x-algolia-api-key'), false);
});

test('reviews retain decimal stars and vintage context, with encoded filters and pagination', async () => {
  const reviews = [{ id: 1, rating: 4.6, note: 'Example', vintage, created_at: '2026-01-01T00:00:00Z' }];
  const { client, calls } = fixture({ reviews });
  assert.deepEqual(await client.getReviews(1911534, { year: 2022, ratings: [4, 5], perPage: 2, page: 3 }), reviews);
  assert.equal(calls[0].url.pathname, '/api/wines/1911534/reviews');
  assert.equal(calls[0].url.searchParams.get('year'), '2022');
  assert.deepEqual(calls[0].url.searchParams.getAll('ratings[]'), ['4', '5']);
  assert.equal(calls[0].url.searchParams.get('per_page'), '2');
  assert.equal(calls[0].url.searchParams.get('page'), '3');
  await client.getReviews(1911534, { sort: 'latest' });
  assert.equal(calls[1].url.pathname, '/api/wines/1911534/latest_reviews');
  assert.equal(calls[1].url.searchParams.has('year'), false);
});

test('flavor reviews encode keyword IDs and optional category', async () => {
  const { client, calls } = fixture({ reviews: [] });
  assert.deepEqual(await client.getReviewsWithFlavors(1911534, { flavorIds: [292, 101], categoryId: 1, page: 2 }), []);
  assert.equal(calls[0].url.pathname, '/api/wines/1911534/reviews_with_flavors');
  assert.deepEqual(calls[0].url.searchParams.getAll('flavor_ids[]'), ['292', '101']);
  assert.equal(calls[0].url.searchParams.get('category_id'), '1');
});

test('page information retains prices and validates the requested year', async () => {
  const info = { wine: vintage.wine, vintage: { ...vintage, year: '2022' }, price, tastes: null };
  const { client, calls } = fixture({ page_information: info });
  assert.deepEqual(await client.getPageInformation(1911534, { year: 2022, priceId: price.id, bottleCount: 6 }), info);
  assert.equal(calls[0].url.pathname, '/api/wines/1911534/page_information');
  assert.equal(calls[0].url.searchParams.get('price_id'), String(price.id));
  assert.equal(calls[0].url.searchParams.get('bottle_count'), '6');
  await assert.rejects(() => client.getPageInformation(1911534, { year: 2021 }), /does not match/);
});

test('page information rejects another wine and unspecified-year substitutions', async () => {
  for (const wrong of [{ ...vintage, wine: { id: 2 } }, { ...vintage, year: '' }, { ...vintage, year: 'U.V.' }]) {
    const { client } = fixture({ page_information: { vintage: wrong, wine: wrong.wine } });
    await assert.rejects(() => client.getPageInformation(1911534, { year: 2022 }), /does not match/);
  }
});

test('batch prices preserve market, median and selected offer separately', async () => {
  const prices = { market: { country: 'us', state: 'CA', currency: { code: 'USD' } }, vintages: {
    [vintage.id]: { vintage: { id: vintage.id, year: 2022 }, median: { amount: 479.97, type: 'market' }, price },
  } };
  const { client, calls } = fixture({ prices });
  assert.deepEqual(await client.getPrices([vintage.id, 3333570]), prices);
  assert.equal(calls[0].url.pathname, '/api/prices');
  assert.deepEqual(calls[0].url.searchParams.getAll('vintage_ids[]'), [String(vintage.id), '3333570']);
});

test('checkout prices retain merchants, bottle size and vintage availability', async () => {
  const checkout_prices = [{ availability: { vintage: { id: vintage.id, year: 2022 } }, merchants_with_prices: [
    { merchant: { id: 29045, name: 'Example merchant' }, prices: [price] },
  ] }];
  const { client, calls } = fixture({ checkout_prices });
  assert.deepEqual(await client.getCheckoutPrices(1911534), checkout_prices);
  assert.equal(calls[0].url.pathname, '/api/wines/1911534/checkout_prices');
});

test('invalid filters and identifiers fail before making requests', async () => {
  const { client, calls } = fixture({});
  for (const options of [{ page: 0 }, { perPage: -1 }, { year: 0 }, { ratings: [6] }, { sort: 'typo' }]) {
    await assert.rejects(() => client.getReviews(1911534, options), RangeError);
  }
  await assert.rejects(() => client.getReviews(-1), RangeError);
  await assert.rejects(() => client.getPageInformation(1911534, { bottleCount: 0 }), RangeError);
  await assert.rejects(() => client.getPrices([]), RangeError);
  await assert.rejects(() => client.getPrices([NaN]), RangeError);
  await assert.rejects(() => client.getCheckoutPrices(0), RangeError);
  await assert.rejects(() => client.getReviewsWithFlavors(1911534, { flavorIds: [] }), RangeError);
  assert.equal(calls.length, 0);
});

test('malformed successful payloads throw instead of pretending data is empty', async () => {
  const { client } = fixture({ reviews: {}, tastes: [], prices: {}, checkout_prices: {}, page_information: {} });
  await assert.rejects(() => client.getReviews(1911534), /Unexpected/);
  await assert.rejects(() => client.getReviewsWithFlavors(1911534, { flavorIds: [292] }), /Unexpected/);
  await assert.rejects(() => client.getTastes(1911534), /Unexpected/);
  await assert.rejects(() => client.getPrices([vintage.id]), /Unexpected/);
  await assert.rejects(() => client.getCheckoutPrices(1911534), /Unexpected/);
  await assert.rejects(() => client.getPageInformation(1911534), /Unexpected/);
});

test('blocked website requests propagate once without retries', async () => {
  const { client, calls } = fixture({}, 403);
  await assert.rejects(() => client.getReviews(1911534), e => e instanceof VivinoHttpError && e.status === 403);
  assert.equal(calls.length, 1);
});

test('explicit invalid-vintage ratings remain all-vintage even when status is Normal', () => {
  const result = ratingsFrom({ ...vintage, has_valid_ratings: false,
    statistics: { status: 'Normal', ratings_average: 4.6, ratings_count: 97125 },
  });
  assert.equal(result.vintage, null);
  assert.deepEqual(result.allVintages, { average: 4.6, count: 97125 });
});

test('unspecified and non-vintage records are never labelled exact vintage ratings', () => {
  for (const year of ['', 'U.V.', 'N.V.', undefined]) {
    const result = ratingsFrom({ ...vintage, year, has_valid_ratings: true,
      statistics: { status: 'Normal', ratings_average: 4.6, ratings_count: 97125 },
    });
    assert.equal(result.vintage, null);
  }
});
