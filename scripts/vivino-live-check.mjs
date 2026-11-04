import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { VivinoClient } from '../src/index.ts';

// An explicitly run experiment, not part of npm test or recurring CI.
const out = 'integration-output';
await mkdir(out, { recursive: true });
const results = [];
const requests = [];
const client = new VivinoClient({ fetch: async (url, init) => {
  const start = Date.now();
  const endpoint = new URL(url).origin + new URL(url).pathname + new URL(url).search;
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    requests.push({ endpoint, status: response.status, elapsedMs: Date.now() - start });
    return response;
  } catch (error) {
    requests.push({ endpoint, error: error.message, elapsedMs: Date.now() - start });
    throw error;
  }
} });
async function check(name, run, summarize) {
  const start = Date.now();
  let row;
  try {
    const output = await run();
    row = { name, status: 'PASS', elapsedMs: Date.now() - start, summary: summarize(output) };
    await writeFile(`${out}/${name}.json`, JSON.stringify({ ...row, output }, null, 2));
  } catch (error) {
    row = { name, status: 'FAIL', elapsedMs: Date.now() - start,
      error: { name: error.name, message: error.message, status: error.status, endpoint: error.endpoint } };
    await writeFile(`${out}/${name}.json`, JSON.stringify(row, null, 2));
  }
  results.push(row);
  console.log(JSON.stringify(row));
}
const wineId = 1911534;
const year = 2022;
const vintageId = 170415755;
const reviewSummary = r => ({ count: r.length, firstRating: r[0]?.rating, firstVintageId: r[0]?.vintage?.id,
  firstVintageYear: r[0]?.vintage?.year, fields: Object.keys(r[0] ?? {}) });
const profileSummary = p => ({ wine: p.wine, vintage: p.vintage, ratings: p.ratings,
  tasteScope: p.taste?.scope, flavorGroups: p.taste?.flavors?.length, warnings: p.warnings });
await check('searchWines', () => client.searchWines('Opus One', 5), r => ({ total: r.total,
  candidates: r.candidates.map(w => ({ id: w.id, name: w.name, winery: w.winery })) }));
await check('getWine', () => client.getWine(wineId), w => ({ id: w.id, name: w.name, statistics: w.statistics,
  vintages: w.vintages }));
await check('resolveVintage', () => client.resolveVintage(wineId, year), r => r);
await check('getVintage', () => client.getVintage(vintageId), v => ({ id: v.id, year: v.year,
  has_valid_ratings: v.has_valid_ratings, statistics: v.statistics, wine: { id: v.wine.id, statistics: v.wine.statistics } }));
await check('getTastes', () => client.getTastes(wineId), t => ({ structure: t.structure,
  groups: t.flavor?.map(f => ({ group: f.group, stats: f.stats, keywords: f.primary_keywords?.slice(0, 3) })) }));
await check('getReviews', () => client.getReviews(wineId, { year, perPage: 2 }), reviewSummary);
await check('getLatestReviews', () => client.getReviews(wineId, { year, perPage: 2, sort: 'latest' }), reviewSummary);
await check('getReviewsWithFlavors', () => client.getReviewsWithFlavors(wineId, { flavorIds: [292], perPage: 2 }), reviewSummary);
await check('getPageInformation', () => client.getPageInformation(wineId, { year }), p => ({
  vintage: { id: p.vintage.id, year: p.vintage.year, has_valid_ratings: p.vintage.has_valid_ratings,
    statistics: p.vintage.statistics }, wineStatistics: p.wine.statistics, price: p.price,
  merchant: p.merchant && { id: p.merchant.id, name: p.merchant.name }, fields: Object.keys(p) }));
await check('getPrices', () => client.getPrices([vintageId]), p => p);
await check('getCheckoutPrices', () => client.getCheckoutPrices(wineId), p => ({ vintages: p.length,
  sample: p.slice(0, 2).map(v => ({ availability: v.availability, merchants: v.merchants_with_prices.map(m => ({
    id: m.merchant.id, name: m.merchant.name, prices: m.prices.map(p => ({ id: p.id, amount: p.amount,
      currency: p.currency, bottle_type: p.bottle_type })) })) })) }));
await check('getProfile', () => client.getProfile(vintageId), profileSummary);
await check('getProfileForYear', () => client.getProfileForYear(wineId, year), profileSummary);
await check('endToEnd', async () => {
  const search = await client.searchWines('Opus One', 5);
  const candidate = search.candidates.find(w => w.id === wineId);
  assert.ok(candidate, 'Expected Opus One identity not found; refusing another candidate');
  const resolved = await client.resolveVintage(candidate.id, year);
  assert.equal(resolved.vintageId, vintageId);
  const profile = await client.getProfileForYear(candidate.id, year);
  assert.equal(profile.vintage.year, year);
  assert.ok(profile.taste, 'End-to-end enrichment requires tastes');
  const reviews = await client.getReviews(candidate.id, { year, perPage: 2 });
  const prices = await client.getPrices([resolved.vintageId]);
  return { selected: { id: candidate.id, name: candidate.name }, resolved, profile, reviews, prices };
}, r => ({ selected: r.selected, resolved: r.resolved, profile: profileSummary(r.profile),
  reviews: reviewSummary(r.reviews), prices: r.prices }));

await writeFile(`${out}/summary.json`, JSON.stringify({ checkedAt: new Date().toISOString(),
  node: process.version, runner: process.env.RUNNER_OS ?? 'local', wineId, year, vintageId, results, requests }, null, 2));
const summary = '# Live Vivino integration check\n\n' +
  '| Check | Result | Returned information / error |\n|---|---|---|\n' +
  results.map(r => `| ${r.name} | ${r.status} | ${JSON.stringify(r.summary ?? r.error).replaceAll('|', '\\|')} |`).join('\n') +
  '\n\nFull per-function JSON outputs and request HTTP statuses are in the `vivino-live-check` artifact (7-day retention). No retries or bot-protection workarounds.\n';
await writeFile(`${out}/summary.md`, summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
process.exitCode = results.some(r => r.status !== 'PASS') ? 1 : 0;
