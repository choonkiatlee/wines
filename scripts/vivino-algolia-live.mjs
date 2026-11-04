import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { VivinoAlgoliaClient } from '../src/index.ts';
const requests = [];
const c = new VivinoAlgoliaClient({ fetch: async (url, init) => {
  assert.equal(new URL(url).hostname, '9takgwjuxl-dsn.algolia.net');
  const r = await fetch(url, {...init, signal: AbortSignal.timeout(20000)});
  requests.push({ endpoint: new URL(url).pathname, status: r.status });
  return r;
} });
await mkdir('integration-output', { recursive: true });
let result;
try {
  const search = await c.searchWines('Opus One', 5);
  const selected = search.candidates.find(w => w.id === 1911534);
  assert.ok(selected, 'Expected wine identity not found');
  const wine = await c.getWine(selected.id);
  const resolved = await c.resolveVintage(wine.id, 2022);
  assert.equal(resolved.vintageId, 170415755);
  const overall = await c.getProfile(wine.id);
  assert.equal(overall.vintage, null);
  const profile = await c.getProfileForYear(wine.id, 2022);
  assert.equal(profile.vintage.id, resolved.vintageId);
  assert.equal(profile.vintage.year, 2022);
  assert.ok(profile.ratings.vintage?.average > 0);
  assert.ok(profile.ratings.allVintages?.average > 0);
  assert.equal(profile.description?.scope, 'wine');
  assert.equal(profile.wine.country, 'us');
  assert.equal(requests.length, 5, 'One request per public method');
  result = { status:'PASS', selected: {id:wine.id,name:wine.name}, total:search.total,
    resolved, overall, profile, requests };
} catch (e) {
  result = { status:'FAIL', error:{name:e.name,message:e.message,status:e.status}, requests };
  process.exitCode=1;
}
console.log(JSON.stringify(result));
await writeFile('integration-output/algolia-e2e.json', JSON.stringify(result,null,2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
  '# Primary VivinoAlgoliaClient end-to-end check\n\n```json\n'+JSON.stringify(result,null,2)+'\n```\n');
