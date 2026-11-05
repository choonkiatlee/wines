import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichWines } from '../src/enrichment.ts';

const wine = (id, name, type_id, winery = 'Fanny Sabre') =>
  ({ id, name, type_id, winery: { name: winery }, region: { name: 'Bourgogne' }, vintages: [] });
const anatole = [
  wine(5821880, 'Cuvée Anatole Pinot Noir', 1),
  wine(6570229, 'Cuvée Anatole Blanc', 2),
  wine(11005617, 'Cuvée Anatole Rosé', 4),
  wine(12248328, 'Cuvée Anatole Rouge', 1),
];
function provider(wines, searchFn = () => wines) {
  const calls = { searches: [], profiles: [] };
  const byId = new Map(wines.map(w => [w.id, w]));
  async function getProfile(id) {
    calls.profiles.push(id);
    const w = byId.get(id);
    return {
      wine: { id, name: w.name, winery: w.winery?.name ?? null, region: w.region?.name ?? null,
        country: null, alcohol: null, closure: null, nonVintage: null, grapeIds: null,
        foodIds: null, styleId: null, imageUrl: null },
      vintage: null, ratings: { vintage: null, allVintages: null }, vintageCounts: null,
      description: null, source: 'vivino-algolia', retrievedAt: '2026-11-05T21:00:00Z',
      indexUpdatedAt: null, sourceUrl: 'https://www.vivino.com/w/' + id, warnings: [],
    };
  }
  return { calls, client: {
    async searchWines(query) {
      calls.searches.push(query);
      const candidates = searchFn(query);
      return { candidates, total: candidates.length };
    },
    getProfile,
    async getProfileForYear(id) { return getProfile(id); },
  }};
}

test('without type, the existing ambiguous Anatole candidate set stays unchanged', async () => {
  const { client } = provider(anatole);
  const [row] = await enrichWines([{ name: 'Fanny Sabre Anatole' }], { client });
  assert.equal(row.matches.length, 3);
  assert.ok(row.matches.some(m => m.name.includes('Blanc')));
  assert.ok(row.matches.some(m => m.name.includes('Rouge')));
});

test('explicit red type excludes known white and rose index hits without fetching profiles', async () => {
  const { client, calls } = provider(anatole);
  const [row] = await enrichWines([{ name: 'Fanny Sabre Anatole', type: 'red' }], { client });
  assert.deepEqual(new Set(calls.profiles), new Set([5821880, 12248328]));
  assert.equal(row.matches.length, 2);
  assert.ok(row.matches.every(m => /Pinot Noir|Rouge/.test(m.name)));
  assert.ok(!calls.searches.some(q => /\bred\b/i.test(q)), 'wine type must not be appended to the text query');
});

test('white and rose select the appropriate index categories', async () => {
  const { client } = provider(anatole);
  const [white, rose] = await enrichWines([
    { name: 'Fanny Sabre Anatole', type: 'white' },
    { name: 'Fanny Sabre Anatole', type: 'rose' },
  ], { client });
  assert.deepEqual(white.matches.map(m => m.name), ['Fanny Sabre Cuvée Anatole Blanc']);
  assert.deepEqual(rose.matches.map(m => m.name), ['Fanny Sabre Cuvée Anatole Rosé']);
});

test('sparkling filters out known still wines and handles champagne type IDs', async () => {
  const wines = [
    wine(10, 'Brut Champagne', 3, 'Dom Pérignon'),
    wine(11, 'Brut Champagne', 1, 'Dom Pérignon'),
  ];
  const { client } = provider(wines);
  const [sparkling] = await enrichWines([{ name: 'Dom Pérignon Brut Champagne', type: 'sparkling' }], { client });
  assert.equal(sparkling.matches.length, 1);
  assert.equal(sparkling.matches[0].url, 'https://www.vivino.com/w/10');
});

test('dessert and fortified type IDs are treated as distinct categories', async () => {
  const wines = [
    wine(21, 'Reserve', 5, 'Cellar'),
    wine(22, 'Reserve', 6, 'Cellar'),
  ];
  const { client } = provider(wines);
  const [dessert, fortified] = await enrichWines([
    { name: 'Cellar Reserve', type: 'dessert' },
    { name: 'Cellar Reserve', type: 'fortified' },
  ], { client });
  assert.deepEqual(dessert.matches.map(m => m.url), ['https://www.vivino.com/w/21']);
  assert.deepEqual(fortified.matches.map(m => m.url), ['https://www.vivino.com/w/22']);
});

test('missing or unfamiliar type IDs stay eligible instead of being guessed', async () => {
  const wines = [
    wine(30, 'Cuvée Anatole', undefined),
    wine(31, 'Cuvée Anatole Rouge', 1),
    wine(32, 'Cuvée Anatole Blanc', 2),
    wine(33, 'Cuvée Anatole Spéciale', 99),
  ];
  const { client } = provider(wines);
  const [row] = await enrichWines([{ name: 'Fanny Sabre Anatole', type: 'red' }], { client });
  assert.ok(row.matches.some(m => m.url.endsWith('/31')), 'recognized red remains eligible');
  assert.ok(row.matches.some(m => m.url.endsWith('/30')), 'missing type stays eligible');
  assert.ok(!row.matches.some(m => m.url.endsWith('/32')), 'recognized incompatible white is rejected');
});

test('type filtering applies to every query variant and continues search for relevant category', async () => {
  const wrong = wine(40, 'Cuvée Anatole Blanc', 2);
  const correct = wine(41, 'Cuvée Anatole Rouge', 1);
  const { client, calls } = provider([wrong, correct], query =>
    query.includes('Cuvée') ? [wrong] : [correct]);
  const [row] = await enrichWines([{ name: 'Fanny Sabre Cuvée Anatole', type: 'red' }], { client });
  assert.deepEqual(row.matches.map(m => m.url), ['https://www.vivino.com/w/41']);
  assert.ok(calls.searches.length > 1);
});

test('invalid type fails before any search and remains optional for old callers', async () => {
  const { client, calls } = provider(anatole);
  await assert.rejects(() =>
    enrichWines([{ name: 'Fanny Sabre Anatole', type: 'pink' }], { client }), /type must be/);
  await assert.rejects(() =>
    enrichWines([{ name: 'Fanny Sabre Anatole', type: null }], { client }), /type must be/);
  assert.deepEqual(calls.searches, []);
});
