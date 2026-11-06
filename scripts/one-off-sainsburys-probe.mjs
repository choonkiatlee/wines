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
// A network outage should fail the check; genuine no-match rows should not.
if (summary.withUpstreamErrors > 0) process.exitCode = 1;
