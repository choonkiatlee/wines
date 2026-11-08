import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  mapSainsburysProduct, mapSainsburysPage, SainsburysWineAdapter, SAINSBURYS_WINE_CATEGORY,
} from '../packages/retailer-ingestion/src/index.ts';

const timestamp = '2026-11-08T12:30:00.000Z';
// Minimal retailer-native captures from the public Wine category, not a full catalogue dump.
const sample = JSON.parse(readFileSync(new URL('./fixtures/sainsburys-wine-sample.json', import.meta.url)));
const byId = id => sample.find(x => x.product_uid === id);
const map = product => mapSainsburysProduct(product, timestamp);
const base = (name, overrides = {}) => ({
  product_uid: 'sku-1', name,
  retail_price: { price: 12.49, measure: 'ea' },
  ...overrides,
});

test('actual Conegliano listing: Nectar single price does not masquerade as regular; six-pack offer separate', () => {
  const wine = map(byId('6573987'));
  assert.equal(wine.retailer, 'sainsburys');
  assert.equal(wine.productId, '6573987');
  assert.equal(wine.name, "Sainsbury's Conegliano Prosecco, Taste the Difference 75cl");
  assert.equal(wine.sourceUrl, 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-conegliano-prosecco-taste-the-difference-75cl');
  assert.equal(wine.retrievedAt, timestamp);
  assert.equal(wine.wineType, 'sparkling');
  assert.equal(wine.bottleSizeMl, 750);
  assert.deepEqual(wine.prices, {
    currency: 'GBP', sourceRetailMinor: 750, regularMinor: 1000, nectarMinor: 750,
  });
  assert.equal(wine.conditionalOffers.length, 1);
  assert.equal(wine.conditionalOffers[0].kind, 'multibuy');
  assert.equal(wine.conditionalOffers[0].nectar, true);
  assert.match(wine.conditionalOffers[0].description, /six|6 or more/i);
  // The category listing wrongly labels even Champagne as non-alcoholic.
  assert.equal(byId('6573987').is_alcoholic, false);
});

test('actual category listings: ordinary shelf price and conditional Nectar multibuy stay distinct', () => {
  const veuve = map(byId('2284071'));
  assert.deepEqual(veuve.prices, {currency:'GBP', sourceRetailMinor: 5000, regularMinor: 5000});
  assert.equal(veuve.wineType, 'sparkling');
  assert.equal(veuve.conditionalOffers.length, 1);
  assert.equal(map(byId('7795070')).prices.regularMinor, 475);
  assert.equal(map(byId('7795070')).conditionalOffers.length, 0);
});

test('actual listing: Nectar can combine with meal deal without changing the individual price', () => {
  const wine = map(byId('8184559'));
  assert.equal(wine.wineType, 'white');
  assert.deepEqual(wine.prices, { currency:'GBP', sourceRetailMinor:850, regularMinor:850 });
  assert.deepEqual(wine.conditionalOffers.map(p => p.kind), ['meal_deal']);
});

test('actual listing: sherry is fortified; boxed wine is not mislabelled as a bottle', () => {
  const fortified = map(byId('2155876'));
  assert.equal(fortified.wineType, 'fortified');
  assert.equal(fortified.bottleSizeMl, 1000);
  assert.equal(fortified.prices.nectarMinor, 1250);
  assert.equal(map(byId('7470270')).bottleSizeMl, undefined);
});

test('public single-item offer remains separate from Nectar and conditional offers', () => {
  const wine = map(base('Example White Wine 750ml', {
    retail_price: { price: 8.25 },
    promotions: [{ promo_type:'SIMPLE_FIXED_PRICE', promo_group:'simple', original_price: 10.5, is_nectar: false, strap_line:'Now £8.25' }],
  }));
  assert.deepEqual(wine.prices, {
    currency:'GBP', sourceRetailMinor:825, regularMinor:1050, publicDiscountedMinor:825,
  });
  assert.deepEqual(wine.conditionalOffers, []);
});

test('missing, contradictory or untyped offers leave unsupported price fields unset', () => {
  const cases = [
    base('Unknown Wine', {retail_price:null, promotions:[]}),
    base('Unknown Wine', {retail_price:{price:12.345}}),
    base('Unknown Wine', {promotions:[{promo_type:'SIMPLE_FIXED_PRICE', original_price:14}]}),
    base('Unknown Wine', {promotions:[{promo_type:'SIMPLE_FIXED_PRICE', is_nectar:true, original_price:10}]}),
    base('Unknown Wine', {promotions:[{promo_type:'SIMPLE_FIXED_PRICE', is_nectar:true}, {promo_type:'SIMPLE_FIXED_PRICE', is_nectar:false}]}),
    base('Unknown Wine', {promotions:[{promo_type:'UNKNOWN_PROMO', strap_line:'Some offer'}]}),
  ];
  const mapped = cases.map(map);
  assert.deepEqual(mapped[0].prices, {currency:'GBP'});
  assert.deepEqual(mapped[1].prices, {currency:'GBP'});
  assert.deepEqual(mapped[2].prices, {currency:'GBP',sourceRetailMinor:1249});
  assert.deepEqual(mapped[3].prices, {currency:'GBP',sourceRetailMinor:1249,nectarMinor:1249});
  assert.deepEqual(mapped[4].prices, {currency:'GBP',sourceRetailMinor:1249});
  assert.deepEqual(mapped[5].prices, {currency:'GBP',sourceRetailMinor:1249});
  assert.equal(mapped[5].conditionalOffers[0].kind, 'other');
});

test('optional metadata is only inferred from explicit title and source evidence', () => {
  const wine = map(base('Chateau Something Red Wine 2021 18.7cl', {
    is_available:false,
    full_url:'https://www.sainsburys.co.uk/gol-ui/product/chateau-red',
  }));
  assert.equal(wine.vintage, 2021);
  assert.equal(wine.bottleSizeMl, 187);
  assert.equal(wine.availableOnline, false);
  assert.equal(wine.sourceUrl, 'https://www.sainsburys.co.uk/gol-ui/product/chateau-red');
  const ambiguous = map(base('Mysterious Reserve 2021/2022 6x75cl', {full_url:'https://outside.example/wine',is_available:null}));
  assert.equal(ambiguous.vintage, undefined);
  assert.equal(ambiguous.bottleSizeMl, undefined);
  assert.equal(ambiguous.wineType, undefined);
  assert.equal(ambiguous.sourceUrl, undefined);
  assert.equal(ambiguous.availableOnline, undefined);
  assert.equal(map(base('Bollinger Non Vintage Champagne 75cl')).vintage, undefined);
});

test('non-wine products excluded with affirmative evidence; ambiguous wines retained', () => {
  for (const name of [
    'White Wine Vinegar 500ml', 'Pack of Wine Glasses', 'Red Wine Gums 200g',
    'Corkscrew Wine Opener', 'Premium Gin 70cl', 'Lager Beer 330ml', 'Port Charlotte Whisky 70cl',
  ]) assert.equal(map(base(name)), null, name);
  const categorical = base('Mystery Alcohol 70cl', {categories:[{name:'Spirits'}]});
  assert.equal(map(categorical), null);
  for (const name of ['Alcohol-Free Rosé Wine 75cl', 'Mysterious Terroir Blend 75cl', 'Canned Red Wine 250ml', 'White Zinfandel Rosé Wine 75cl']) {
    assert.ok(map(base(name)), name);
  }
  assert.equal(map(base('White Zinfandel Rosé Wine 75cl')).wineType, 'rose');
  // Source is_alcoholic=false even on genuine wine: never use it for filtering.
  assert.ok(map(base('Vintage Champagne 75cl', {is_alcoholic:false})));
});

test('maps a native category page offline and preserves source totals despite filtering', () => {
  const page = mapSainsburysPage({
    products: [byId('6573987'), base('Wine Opener'), byId('7795070')],
    pagination: {page: 3,total: 807,returned:3,totalPages:14},
    retrievedAt:timestamp,
  });
  assert.equal(page.retailer, 'sainsburys');
  assert.deepEqual(page.pagination, {page:3,totalPages:14,sourceTotal:807,sourceReturned:3,included:2});
  assert.equal(page.wines.length, 2);
  assert.equal(page.wines[0].retrievedAt,timestamp);
});

test('adapter delegates page and signal to standalone raw client, with no Vivino calls', async () => {
  const controller = new AbortController();
  const calls = [];
  const client = {
    async listCategoryPage(category, options) {
      calls.push({category,options});
      return {
        products: [byId('6573987'),base('Wine Glass Set')],
        pagination: {page:4,total:999,returned:2,totalPages:20},
        retrievedAt:timestamp,
      };
    },
  };
  const page = await new SainsburysWineAdapter(client).fetchPage({page:4,signal:controller.signal});
  assert.deepEqual(calls, [{category:SAINSBURYS_WINE_CATEGORY, options:{page:4,signal:controller.signal}}]);
  assert.equal(page.wines.length,1);
  assert.equal(page.pagination.sourceTotal,999);
  assert.equal(page.pagination.included,1);
});
