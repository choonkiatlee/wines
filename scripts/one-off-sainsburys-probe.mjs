// One-off live smoke test against products visible on Sainsbury's wine category page, 6 Nov 2026.
// This is a selected catalogue sample, not a complete Sainsbury's assortment.
// Retailer names and categories are kept intact to expose real matching weaknesses.
import { enrichWines } from '../src/index.ts';
import { writeFile } from 'node:fs/promises';

const source = 'https://www.sainsburys.co.uk/groceries/browse/beer-wine-and-spirits/wine/c:1019462';
const products = [
  { product: 'Canti Prosecco 75cl', type: 'sparkling' },
  { product: 'Mud House New Zealand Marlborough Sauvignon Blanc White Wine 75cl', type: 'white' },
  { product: 'Trivento Malbec Reserve Red Wine 75cl', type: 'red' },
  { product: 'Oyster Bay Sauvignon Blanc White Wine 75cl', type: 'white' },
  { product: 'La Vieille Ferme Rose Wine 75cl', type: 'rose' },
  { product: 'Yellow Tail Shiraz Red Wine 75cl', type: 'red' },
  { product: 'Yellow Tail Chardonnay White Wine 75cl', type: 'white' },
  { product: 'Barefoot Merlot Red Wine 75cl', type: 'red' },
  { product: 'Jam Shed Shiraz Red Wine 75cl', type: 'red' },
  { product: 'Villa Maria Private Bin Sauvignon Blanc White Wine 75cl', type: 'white' },
  { product: 'Brancott Estate Sauvignon Blanc White Wine 75cl', type: 'white' },
  { product: 'Veuve Clicquot Yellow Label Brut Champagne 75cl', type: 'sparkling' },
  { product: 'Bollinger Special Cuvee, Non Vintage Champagne 75cl', type: 'sparkling' },
  { product: 'La Vieille Ferme Red Wine 75cl', type: 'red' },
  { product: 'La Vieille Ferme White Wine 75cl', type: 'white' },
  { product: "Sainsbury's Portuguese Lisboa Red Wine, Taste the Difference 75cl", type: 'red' },
  { product: "Sainsbury's Malbec Red Wine, Taste the Difference 75cl", type: 'red' },
  { product: "Sainsbury's Montepulciano D'abruzzo Red Wine, Taste the Difference 75cl", type: 'red' },
  { product: "Sainsbury's Conegliano Prosecco, Taste the Difference 75cl", type: 'sparkling' },
  { product: "Sainsbury's Pinot Grigio Dolomiti Blush Rose Wine, Taste the Difference 75cl", type: 'rose' },
  { product: "Sainsbury's Pinot Grigio White Wine, Taste the Difference 75cl", type: 'white' },
  { product: "Sainsbury's Prosecco, Taste the Difference 75cl", type: 'sparkling' },
  { product: "Sainsbury's Cava Brut 75cl", type: 'sparkling' },
  { product: 'Mondelli Pinot Grigio White Wine 75cl', type: 'white' },
  { product: 'McGuigan Black Label Merlot Red Wine 75cl', type: 'red' },
];
const inputs = products.map(p => ({
  name: p.product.replace(/\s*75cl$/i, '').trim(), type: p.type,
}));
const startedAt = new Date().toISOString();
const results = await enrichWines(inputs, { concurrency: 4 });
const entries = results.map((row, i) => ({
  sainsburys: products[i],
  input: inputs[i],
  matches: row.matches,
  ...(row.error ? { error: row.error } : {}),
}));
const summary = {
  total: entries.length,
  withCandidates: entries.filter(e => e.matches.length > 0).length,
  withoutCandidates: entries.filter(e => e.matches.length === 0).length,
  withUpstreamErrors: entries.filter(e => e.error).length,
  multipleCandidates: entries.filter(e => e.matches.length > 1).length,
  brandedWithCandidates: entries.filter(e => !e.sainsburys.product.startsWith("Sainsbury's") && e.matches.length).length,
  brandedTotal: entries.filter(e => !e.sainsburys.product.startsWith("Sainsbury's")).length,
  ownLabelWithCandidates: entries.filter(e => e.sainsburys.product.startsWith("Sainsbury's") && e.matches.length).length,
  ownLabelTotal: entries.filter(e => e.sainsburys.product.startsWith("Sainsbury's")).length,
};
const output = { source, startedAt, finishedAt: new Date().toISOString(), summary, entries };
await writeFile('sainsburys-vivino-2026-11-06.json', JSON.stringify(output, null, 2));
console.log('SAINSBURYS_SUMMARY', JSON.stringify(summary));
for (const [i, e] of entries.entries()) {
  console.log('SAINSBURYS_ROW', JSON.stringify({
    i: i + 1, product: e.sainsburys.product, type: e.input.type,
    candidates: e.matches.length, error: e.error ?? null,
    top: e.matches[0] ? { name: e.matches[0].name, rating: e.matches[0].rating, url: e.matches[0].url } : null,
    alternativeNames: e.matches.slice(1).map(m => m.name),
  }));
}

function cleanedName(product) {
  const original = product.replace(/\s*75cl$/i, '').trim();
  // Drop shop packaging/category words, not producer or actual cuvée tokens.
  if (/^La Vieille Ferme Red Wine$/i.test(original)) return 'La Vieille Ferme Rouge';
  if (/^La Vieille Ferme White Wine$/i.test(original)) return 'La Vieille Ferme Blanc';
  if (/^La Vieille Ferme Rose Wine$/i.test(original)) return 'La Vieille Ferme Rosé';
  const ownLabel = /^Sainsbury's\b/i.test(original) && /,\s*Taste the Difference$/i.test(original);
  let name = original.replace(/,\s*Taste the Difference$/i, '')
    .replace(/\s+(?:Red|White|Rose)\s+Wine\b/gi, '')
    .replace(/,\s*Non Vintage(?=\s+Champagne)/i, '')
    .replace(/\s+/g, ' ').trim();
  if (ownLabel) name = name.replace(/^Sainsbury's\s*/i, "Sainsbury's Taste the Difference ");
  return name;
}
const cleanedInputs = products.map(p => ({ name: cleanedName(p.product), type: p.type }));
const normalized = await enrichWines(cleanedInputs, { concurrency: 4 });
const cleanedEntries = normalized.map((row, i) => ({
  product: products[i].product, input: cleanedInputs[i], matches: row.matches,
  ...(row.error ? { error: row.error } : {}),
}));
output.cleanedEntries = cleanedEntries;
const cleanedSummary = {
  total: normalized.length,
  withCandidates: normalized.filter(r => r.matches.length).length,
  withUpstreamErrors: normalized.filter(r => r.error).length,
  changedTop: normalized.filter((r, i) => r.matches[0]?.url !== results[i].matches[0]?.url).length,
};
output.cleanedSummary = cleanedSummary;
await writeFile('sainsburys-vivino-2026-11-06.json', JSON.stringify(output, null, 2));
console.log('CLEANED_SUMMARY', JSON.stringify(cleanedSummary));
for (const [i, e] of cleanedEntries.entries()) {
  console.log('CLEANED_ROW', JSON.stringify({
    i: i + 1, product: e.product, query: e.input.name, error: e.error ?? null,
    candidates: e.matches.map(m => ({ name: m.name, rating: m.rating, url: m.url })),
  }));
}
if (cleanedSummary.withUpstreamErrors > 0) process.exitCode = 1;

// A network outage should fail the check; genuine no-match rows should not.
if (summary.withUpstreamErrors > 0) process.exitCode = 1;
