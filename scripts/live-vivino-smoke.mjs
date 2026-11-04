/** One-off live probe of the existing VivinoClient (no bot-workarounds). */
import { VivinoClient } from '../src/index.ts';
import { writeFileSync, appendFileSync } from 'node:fs';

const client = new VivinoClient();
const query = 'Opus One';
const records = [];

function printable(value, maxChars = 8000) {
  const json = JSON.stringify(value, null, 2) ?? 'null';
  return json.length > maxChars ? json.slice(0, maxChars) + '\n... [truncated in log; full output in artifact]' : json;
}

async function check(method, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    records.push({ method, status: 'ok', elapsedMs: Date.now() - start, result });
    console.log('\n### ' + method + ' — OK (' + (Date.now() - start) + ' ms)\n' + printable(result));
    return result;
  } catch (error) {
    const details = {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      ...(typeof error?.status === 'number' ? { httpStatus: error.status } : {}),
      ...(error?.endpoint ? { endpoint: error.endpoint } : {}),
    };
    records.push({ method, status: 'error', elapsedMs: Date.now() - start, error: details });
    console.log('\n### ' + method + ' — ERROR\n' + printable(details));
    return null;
  }
}

function skipped(method, reason) {
  records.push({ method, status: 'skipped', reason });
  console.log('\n### ' + method + ' — SKIPPED: ' + reason);
}

const search = await check('searchWines("Opus One", 5)', () => client.searchWines(query, 5));
const candidate = search?.candidates?.find(w => typeof w?.id === 'number' && /opus one/i.test((w.name ?? '') + ' ' + (w.winery?.name ?? '')))
  ?? search?.candidates?.find(w => typeof w?.id === 'number');
const wineId = candidate?.id;

let wine = null;
if (wineId) {
  wine = await check('getWine(' + wineId + ')', () => client.getWine(wineId));
} else {
  skipped('getWine', 'no wine ID returned from search');
}

const vintages = wine?.vintages ?? candidate?.vintages ?? [];
const numericYears = vintages.map(v => Number(v?.year))
  .filter(y => Number.isInteger(y) && y >= 1800 && y <= 2100)
  .sort((a, b) => b - a);
const year = numericYears[0];
const fallbackVintageId = vintages.find(v => Number(v?.year) === year)?.id;

let resolved = null;
if (wineId && year) {
  resolved = await check('resolveVintage(' + wineId + ', ' + year + ')', () => client.resolveVintage(wineId, year));
} else {
  skipped('resolveVintage', 'no numeric vintage year available in indexed wine');
}

const vintageId = resolved?.vintageId ?? fallbackVintageId;
if (vintageId) {
  await check('getVintage(' + vintageId + ')', () => client.getVintage(vintageId));
} else {
  skipped('getVintage', 'no vintage ID available');
}

if (wineId) {
  await check('getTastes(' + wineId + ')', () => client.getTastes(wineId));
} else {
  skipped('getTastes', 'no wine ID available');
}

if (vintageId) {
  await check('getProfile(' + vintageId + ')', () => client.getProfile(vintageId));
} else {
  skipped('getProfile', 'no vintage ID available');
}

if (wineId && year) {
  await check('END TO END: getProfileForYear(' + wineId + ', ' + year + ')',
    () => client.getProfileForYear(wineId, year));
} else {
  skipped('END TO END: getProfileForYear', 'missing wine ID or vintage year');
}

const report = {
  checkedAt: new Date().toISOString(),
  query,
  selectedCandidate: candidate ? { id: candidate.id, name: candidate.name, winery: candidate.winery?.name } : null,
  selectedYear: year ?? null,
  note: 'Live unofficial endpoints; search results are candidates, not verified wine identity.',
  checks: records,
};
writeFileSync('vivino-live-output.json', JSON.stringify(report, null, 2) + '\n');

const tick = String.fromCharCode(96);
const summary = [
  '## One-off VivinoClient live API check',
  '',
  '| Method | Result | Duration |',
  '|---|---|---:|',
  ...records.map(r => '| ' + tick + r.method.replaceAll('|', '\\|') + tick + ' | ' + r.status + (r.error?.httpStatus ? ' (HTTP ' + r.error.httpStatus + ')' : '') + ' | ' + (r.elapsedMs ?? '–') + ' ms |'),
  '',
  'Search term: ' + tick + query + tick + '. Selected wine ID: ' + tick + (wineId ?? 'none') + tick + ', year: ' + tick + (year ?? 'none') + tick + '.',
  '',
  'For the output of every function, open the job log or download the vivino-live-output JSON artifact.',
  '',
  '> The API is unofficial; HTTP 403/429 or format changes are reported, never bypassed.',
  '',
];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
const failing = records.filter(r => r.status !== 'ok');
if (failing.length) {
  console.error('\n' + failing.length + '/' + records.length + ' checks failed or were skipped.');
  process.exitCode = 1;
}
