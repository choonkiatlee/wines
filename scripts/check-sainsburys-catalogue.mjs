import { SainsburysClient } from '../packages/sainsburys-client/src/index.ts';

const wineCategory = '/groceries/browse/beer-wine-and-spirits/wine/c:1019462';
const category = process.argv[2] ?? wineCategory;
const client = new SainsburysClient();
const seen = new Set();

async function readPage(page) {
  return client.listCategoryPage(category, { page, signal: AbortSignal.timeout(15_000) });
}

const first = await readPage(1);
const { total, totalPages } = first.pagination;

for (let page = 1; page <= totalPages; page++) {
  const { products, pagination } = page === 1 ? first : await readPage(page);
  if (pagination.total !== total) {
    throw new Error(`Catalogue total changed from ${total} to ${pagination.total} on page ${page}`);
  }
  if (pagination.totalPages !== totalPages) {
    throw new Error(`Catalogue page count changed from ${totalPages} to ${pagination.totalPages} on page ${page}`);
  }
  for (const { product_uid } of products) {
    if (seen.has(product_uid)) throw new Error(`Duplicate SKU ${product_uid} on page ${page}`);
    seen.add(product_uid);
  }
  console.log(`Page ${page}/${totalPages}: ${products.length} records, ${seen.size}/${total} unique SKUs`);
}

if (seen.size !== total) throw new Error(`Incomplete catalogue: ${seen.size}/${total} unique SKUs`);
