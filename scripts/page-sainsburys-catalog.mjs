#!/usr/bin/env node
/** Paginate a saved retailer catalogue offline. Does not call Vivino or the retailer. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DATA_URL = new URL('../data/sainsburys/wines-2026-11-06.json', import.meta.url);
export async function loadCatalogue() {
  const data = JSON.parse(await readFile(DATA_URL, 'utf8'));
  if (!Array.isArray(data.products)) throw new Error('Catalogue is missing products');
  return data;
}

export function pageCatalogue(catalogue, { page = 1, pageSize = 20, type = 'all', search = '' } = {}) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be a positive integer');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new RangeError('pageSize must be between 1 and 100');
  if (!['all', 'red', 'white', 'rose', 'sparkling', 'unknown'].includes(type))
    throw new RangeError('Unknown wine type');
  const term = search.toLocaleLowerCase('en-GB').trim();
  const filtered = catalogue.products
    .filter(row => type === 'all' || row.type === type)
    .filter(row => row.name.toLocaleLowerCase('en-GB').includes(term));
  const total = filtered.length;
  const pages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    retailer: catalogue.retailer,
    assembledOn: catalogue.assembledOn,
    completeness: catalogue.completeness,
    filters: { type, search },
    page, pageSize, pages, total,
    hasNextPage: page < pages,
    products: filtered.slice(start, start + pageSize),
  };
}

function parseArgs(args) {
  const out = { page: 1, pageSize: 20, type: 'all', search: '', json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i], value = args[i + 1];
    if (arg === '--json') { out.json = true; continue; }
    if (arg === '--page') { out.page = Number(value); i++; continue; }
    if (arg === '--page-size') { out.pageSize = Number(value); i++; continue; }
    if (arg === '--type') { out.type = value; i++; continue; }
    if (arg === '--search') { out.search = value; i++; continue; }
    if (arg === '--help') {
      console.log('node scripts/page-sainsburys-catalog.mjs [--page 1] [--page-size 20] [--type red|white|rose|sparkling] [--search text] [--json]');
      process.exit(0);
    }
    throw new Error('Unknown argument: ' + arg);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { json, ...options } = parseArgs(process.argv.slice(2));
  const page = pageCatalogue(await loadCatalogue(), options);
  if (json) console.log(JSON.stringify(page, null, 2));
  else {
    console.log('Sainsbury’s wine catalogue (' + page.completeness + ') — ' +
      page.total + ' filtered products, page ' + page.page + '/' + page.pages);
    for (const [index, row] of page.products.entries()) {
      console.log(String((page.page-1)*page.pageSize+index+1).padStart(3) +
        '  ' + row.type.padEnd(10) + ' ' + row.name);
    }
    if (page.hasNextPage) console.log('Next: --page ' + (page.page + 1));
  }
}
