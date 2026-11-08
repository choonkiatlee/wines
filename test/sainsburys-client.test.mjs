import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SainsburysClient } from '../packages/sainsburys-client/src/index.ts';

const category = '/groceries/browse/beer-wine-and-spirits/wine/c:1019462';
const pageTwo = readFileSync(new URL('./fixtures/sainsburys-category-page-2.rsc', import.meta.url), 'utf8');

function rsc(body) {
  return new Response(body, { headers: { 'content-type': 'text/x-component' } });
}

test('requests the given category page and returns the native products and source counts', async () => {
  const client = new SainsburysClient({
    fetch: async (url, options) => {
      assert.equal(String(url), 'https://www.sainsburys.co.uk' + category + '/opt/page:2');
      assert.equal(new Headers(options.headers).get('RSC'), '1');
      assert.equal(options.credentials, 'omit');
      return rsc(pageTwo);
    },
  });

  const page = await client.listCategoryPage(category, { page: 2 });
  assert.deepEqual(page.pagination, { page: 2, total: 3, returned: 1, totalPages: 2 });
  assert.equal(page.products[0].product_uid, '8121557');
  assert.equal(page.products[0].retail_price.measure, '');
  assert.ok(page.products[0].source);
  assert.ok(Number.isFinite(Date.parse(page.retrievedAt)));
});

test('defaults to the unsuffixed first page of any category', async () => {
  const empty = '3:["$","$L66",null,{"data":{"data_page_number":1,"data_productList_numberOfProducts":0,"data_productList_numberOfProductsShown":0}}]\n';
  const client = new SainsburysClient({
    fetch: async url => {
      assert.equal(String(url), 'https://www.sainsburys.co.uk/groceries/browse/fruit-and-veg/fruit/c:123');
      return rsc(empty);
    },
  });
  assert.deepEqual(await client.listCategoryPage('/groceries/browse/fruit-and-veg/fruit/c:123/').then(x => x.products), []);
});

test('rejects invalid categories and page numbers before requesting data', async () => {
  const client = new SainsburysClient({ fetch: async () => assert.fail('unexpected fetch') });
  for (const path of ['//example.com/groceries/browse/wine/c:1', category + '/opt/page:2', category + '?store=2168', '/groceries/browse/../wine/c:1']) {
    await assert.rejects(client.listCategoryPage(path), RangeError);
  }
  for (const page of [0, -1, 1.5, Infinity]) {
    await assert.rejects(client.listCategoryPage(category, { page }), RangeError);
  }
});

test('rejects a response whose reported page differs from the requested page', async () => {
  const client = new SainsburysClient({ fetch: async () => rsc(pageTwo) });
  await assert.rejects(client.listCategoryPage(category), /requested page 1.*reported page 2/i);
});

test('rejects a page with missing products or inconsistent source counts', async () => {
  const missingProducts = pageTwo.split('\n').filter(line => !line.includes('productImpressions')).join('\n');
  const wrongCount = pageTwo.replace('"data_productList_numberOfProductsShown":1', '"data_productList_numberOfProductsShown":2');
  for (const body of [missingProducts, wrongCount]) {
    const client = new SainsburysClient({ fetch: async () => rsc(body) });
    await assert.rejects(client.listCategoryPage(category, { page: 2 }), /products|count/i);
  }
});

test('surfaces HTTP errors and rejects HTML returned as a successful response', async () => {
  const blocked = new SainsburysClient({ fetch: async () => new Response('', { status: 403 }) });
  await assert.rejects(blocked.listCategoryPage(category), /HTTP 403/);
  const html = new SainsburysClient({ fetch: async () => new Response('<html></html>', {
    headers: { 'content-type': 'text/html' },
  }) });
  await assert.rejects(html.listCategoryPage(category), /text\/x-component/);
});

test('rejects source pagination for a different category', async () => {
  const wrongCategory = pageTwo.replace('wine/c:1019462', 'fruit/c:123');
  const client = new SainsburysClient({ fetch: async () => rsc(wrongCategory) });
  await assert.rejects(client.listCategoryPage(category, { page: 2 }), /category pagination/i);
});
