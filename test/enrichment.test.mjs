import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichWines } from '../src/enrichment.ts';

const wine = (id, name, winery, vintages = [], region = 'Piedmont') =>
  ({ id, name, winery: { name: winery }, region: { name: region }, vintages });
const overallRating = (average = 4.1, count = 220) => ({ average, count, reviewsCount: 22 });
function profile(w, year = null, opts = {}) {
  return {
    wine: { id: w.id, name: w.name, winery: w.winery?.name ?? null, region: w.region?.name ?? null,
      country: 'it', alcohol: null, closure: null, nonVintage: null, grapeIds: [2], foodIds: null,
      styleId: null, imageUrl: null },
    vintage: year === null ? null : { id: w.id + year, year },
    ratings: { vintage: year === null ? null : (Object.hasOwn(opts, 'vintageRating') ? opts.vintageRating : { average: 4.5, count: 513, reviewsCount: 140 }),
      allVintages: opts.overall ?? overallRating() },
    vintageCounts: year === null ? null : { ratings: 513, reviews: 140 },
    description: opts.description === null ? null : { scope: 'wine', text: opts.description ?? 'Source description' },
    source: 'vivino-algolia', retrievedAt: '2026-11-04T12:00:00Z', indexUpdatedAt: null,
    sourceUrl: `https://www.vivino.com/w/${w.id}${year === null ? '' : '?year=' + year}`,
    warnings: [],
  };
}
function provider(wines, handlers = {}) {
  const calls = { search: [], overall: [], exact: [] };
  const client = {
    async searchWines(query) {
      calls.search.push(query);
      if (handlers.search) return handlers.search(query);
      return { candidates: wines, total: wines.length };
    },
    async getProfile(id) {
      calls.overall.push(id);
      if (handlers.overall) return handlers.overall(id);
      return profile(wines.find(w => w.id === id));
    },
    async getProfileForYear(id, year) {
      calls.exact.push([id, year]);
      if (handlers.exact) return handlers.exact(id, year);
      return profile(wines.find(w => w.id === id), year);
    },
  };
  return { client, calls };
}

test('ranks plausible candidates by producer/cuvee, rejects unrelated hits and deduplicates IDs', async () => {
  const best = wine(1, "Barbera d'Alba", 'G.D. Vajra', [{ id: 20221, year: 2022 }]);
  const second = wine(2, "Barbera d'Alba Superiore", 'G.D. Vajra');
  const wrong = wine(3, 'Langhe Rosso', 'G.D. Vajra');
  const other = wine(4, 'Pinot Noir', 'Somewhere Else');
  const { client, calls } = provider([other, wrong, second, best, best]);
  const result = await enrichWines([{ name: "G.D. Vajra Barbera d'Alba", year: 2022 }], { client });
  assert.deepEqual(result[0].matches.map(m => m.name), ["G.D. Vajra Barbera d'Alba", "G.D. Vajra Barbera d'Alba Superiore"]);
  assert.equal(result[0].matches[0].year, 2022);
  assert.equal(result[0].matches[1].year, null);
  assert.equal(result[0].matches[1].rating.scope, 'overall');
  assert.deepEqual(calls.exact, [[1, 2022]]);
  assert.deepEqual(calls.overall, [2]);
  assert.ok(calls.search.length <= 4);
});

test('preserves row ordering and returns empty matches for genuine no-hit searches', async () => {
  const one = wine(10, 'Opus One', 'Opus One', [{ id: 20220, year: 2022 }]);
  const { client } = provider([one], { search: async q => ({ candidates: q.includes('Opus') ? [one] : [], total: 1 }) });
  const out = await enrichWines([{ name: 'Nothing Related' }, { name: 'Opus One', year: 2022 }], { client });
  assert.deepEqual(out[0], { matches: [] });
  assert.equal(out[1].matches[0].name, 'Opus One');
  assert.equal(out[1].matches[0].rating.scope, 'vintage');
  assert.match(out[1].matches[0].url, /\?year=2022$/);
});

test('uses normalized queries for accents and initials, and tolerates one-character typos', async () => {
  const target = wine(42, 'Côte-Rôtie La Mouline', 'E. Guigal');
  const { client, calls } = provider([target], {
    search: async q => ({ candidates: q.toLowerCase().includes('cote') ? [target] : [], total: 1 }),
  });
  const out = await enrichWines([{ name: 'E Guigal Cote Rotie La Moulinne' }], { client });
  assert.equal(out[0].matches.length, 1);
  assert.ok(calls.search.length <= 3);
});

test('missing vintage uses overall without substituting another year; full output has provenance and warning', async () => {
  const target = wine(7, 'Opus One', 'Opus One', [{ id: 1, year: 2021 }]);
  const { client, calls } = provider([target]);
  const [short] = await enrichWines([{ name: 'Opus One', year: 2022 }], { client });
  const [full] = await enrichWines([{ name: 'Opus One', year: 2022 }], { client, returnAll: true });
  assert.equal(short.matches[0].year, null);
  assert.deepEqual(short.matches[0].rating, { score: 4.1, count: 220, scope: 'overall' });
  assert.equal(short.matches[0].url, 'https://www.vivino.com/w/7');
  assert.deepEqual(calls.exact, []);
  assert.deepEqual(calls.overall, [7, 7]);
  assert.equal(full.matches[0].wine.id, 7);
  assert.match(full.matches[0].warnings.join(' '), /Requested 2022 vintage not indexed/);
  assert.equal(full.matches[0].source, 'vivino-algolia');
});

test('invalid exact vintage rating falls back to overall score, retaining the confirmed vintage year', async () => {
  const target = wine(8, 'Opus One', 'Opus One', [{ id: 2, year: 2022 }]);
  const { client } = provider([target], {
    exact: async () => profile(target, 2022, { vintageRating: null, overall: { average: 4.6, count: null, reviewsCount: null } }),
  });
  const [row] = await enrichWines([{ name: 'Opus One', year: 2022 }], { client });
  assert.deepEqual(row.matches[0].rating, { score: 4.6, count: null, scope: 'overall' });
  assert.equal(row.matches[0].year, 2022);
});

test('unknown vintage listing attempts exact then falls back on missing or ambiguous year', async () => {
  const target = { id: 22, name: 'Wine Test', winery: { name: 'Winery' } };
  const { client, calls } = provider([target], { exact: async (_, year) => { throw new Error(`No ${year} vintage found for wine 22`); } });
  const [row] = await enrichWines([{ name: 'Wine Test', year: 2020 }], { client, returnAll: true });
  assert.equal(row.matches[0].vintage, null);
  assert.deepEqual(calls.exact, [[22, 2020]]);
  assert.deepEqual(calls.overall, [22]);
  assert.match(row.matches[0].warnings.join(' '), /not confirmed/);
});

test('candidate lookups fail independently and unsuccessful searches are not no-result success', async () => {
  const ok = wine(1, 'Opus One', 'Opus One');
  const bad = wine(2, 'Opus One Reserve', 'Opus One');
  const { client } = provider([bad, ok], {
    search: async query => { if (query.includes('Down')) throw new Error('upstream down'); return { candidates: [bad, ok], total: 2 }; },
    overall: async id => { if (id === 2) throw new Error('HTTP 403'); return profile(ok); },
  });
  const result = await enrichWines([{ name: 'Opus One' }, { name: 'Down Stream' }], { client });
  assert.deepEqual(result[0].matches.map(x => x.name), ['Opus One']);
  assert.equal(result[0].error, 'upstream_unavailable');
  assert.deepEqual(result[1], { matches: [], error: 'upstream_unavailable' });
});

test('in-flight searches and profiles are deduplicated within a batch', async () => {
  const target = wine(3, 'Opus One', 'Opus One');
  const { client, calls } = provider([target]);
  const rows = await enrichWines(Array.from({ length: 5 }, () => ({ name: 'Opus One' })), { client });
  assert.equal(rows.length, 5);
  assert.deepEqual(calls.search, ['Opus One']);
  assert.deepEqual(calls.overall, [3]);
});

test('caps concurrent upstream calls even under many independent rows', async () => {
  let active = 0, peak = 0;
  const client = {
    async searchWines(query) {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return { candidates: [], total: 0 };
    },
    getProfile() { throw new Error('not expected'); },
    getProfileForYear() { throw new Error('not expected'); },
  };
  const rows = await enrichWines(Array.from({ length: 9 }, (_, i) => ({ name: `UnknownWine ${i}` })), { client, concurrency: 2 });
  assert.equal(rows.length, 9);
  assert.ok(peak <= 2, `peak upstream concurrency was ${peak}`);
});

test('compact description stays <=240 chars and nulls are preserved', async () => {
  const target = wine(11, 'Opus One', 'Opus One');
  const { client } = provider([target], {
    overall: async () => profile(target, null, { description: 'A very expressive wine with considerable depth. '.repeat(10), overall: null }),
  });
  const [row] = await enrichWines([{ name: 'Opus One' }], { client });
  assert.ok(row.matches[0].description.length <= 240);
  assert.match(row.matches[0].description, /…$/);
  const { client: noData } = provider([target], { overall: async () => ({ ...profile(target, null, { description: null }), ratings: { vintage: null, allVintages: null } }) });
  const [empty] = await enrichWines([{ name: 'Opus One' }], { client: noData });
  assert.equal(empty.matches[0].description, null);
  assert.equal(empty.matches[0].rating, null);
});

test('invalid input and concurrency reject before provider requests', async () => {
  const { client, calls } = provider([]);
  await assert.rejects(() => enrichWines([{ name: '' }], { client }), /name/);
  await assert.rejects(() => enrichWines([{ name: 'Opus One', year: 22 }], { client }), /year/);
  await assert.rejects(() => enrichWines([], { client, concurrency: 0 }), /concurrency/);
  assert.deepEqual(calls.search, []);
});

test('derived tasting notes are returned in compact and full enrichment without rewriting source descriptions', async () => {
  const target = wine(90, 'Estate Reserve', 'Estate Reserve');
  const description = 'The estate was founded in 1890 and is located on limestone soils. ' +
    'Aromas of black cherry, violet and spice. Silky tannins lead to a long, savoury finish.';
  const { client } = provider([target], {
    overall: async () => profile(target, null, { description }),
  });
  const [compactRow] = await enrichWines([{ name: 'Estate Reserve' }], { client });
  const [fullRow] = await enrichWines([{ name: 'Estate Reserve' }], { client, returnAll: true });
  const expected = 'Aromas of black cherry, violet and spice. Silky tannins lead to a long, savoury finish.';
  assert.deepEqual(compactRow.matches[0].derived, { tastingNotes: expected });
  assert.deepEqual(fullRow.matches[0].derived, { tastingNotes: expected });
  assert.equal(fullRow.matches[0].description.text, description);
});

test('source material without sensory evidence returns null derived notes in both modes', async () => {
  const target = wine(91, 'Estate Reserve', 'Estate Reserve');
  const { client } = provider([target], {
    overall: async () => profile(target, null, { description: 'Founded in 1880. Our vineyard has limestone soils and a century of family heritage.' }),
  });
  const [compact] = await enrichWines([{ name: 'Estate Reserve' }], { client });
  const [full] = await enrichWines([{ name: 'Estate Reserve' }], { client, returnAll: true });
  assert.equal(compact.matches[0].derived.tastingNotes, null);
  assert.equal(full.matches[0].derived.tastingNotes, null);
});
