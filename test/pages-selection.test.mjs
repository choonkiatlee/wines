import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialSelections, chooseCandidate, selectedProfile, ratingFor,
  displayWineName, selectionSummary, producerRatingLine,
} from '../apps/pages/src/selection.ts';

function profile(id, name, vintage = null, overall = null) {
  return {
    wine: { id, name, winery: 'Producer', region: null, country: null, alcohol: null,
      closure: null, nonVintage: false, grapeIds: null, foodIds: null, styleId: null, imageUrl: null },
    vintage: null, ratings: { vintage, allVintages: overall },
    vintageCounts: null, description: null,
    source: 'vivino-algolia', retrievedAt: '2026-11-07T00:00:00Z',
    indexUpdatedAt: null, sourceUrl: 'https://www.vivino.com/w/' + id, warnings: [],
  };
}

test('one suggested wine per row; manual alternate updates only its row', () => {
  const first = profile(1, 'First');
  const alternate = profile(2, 'Second');
  const third = profile(3, 'Third');
  const rows = [{ matches: [first, alternate] }, { matches: [third] }];
  const initial = initialSelections(rows);
  assert.deepEqual(initial, [{ index: 0, chosen: false }, { index: 0, chosen: false }]);
  const changed = chooseCandidate(rows, initial, 0, 1);
  assert.deepEqual(changed, [{ index: 1, chosen: true }, { index: 0, chosen: false }]);
  assert.strictEqual(selectedProfile(rows[0], changed[0]), alternate);
  assert.strictEqual(selectedProfile(rows[1], changed[1]), third);
  assert.deepEqual(initial[0], { index: 0, chosen: false });
});

test('none-of-these is distinct from no available candidate', () => {
  const rows = [{ matches: [profile(1, 'First')] }, { matches: [], error: 'upstream_unavailable' }];
  const declined = chooseCandidate(rows, initialSelections(rows), 0, null);
  assert.equal(selectedProfile(rows[0], declined[0]), null);
  assert.deepEqual(declined[0], { index: null, chosen: true });
  assert.deepEqual(selectionSummary(rows, declined), {
    total: 2, noCandidates: 1, chosen: 1, upstreamErrors: 1,
  });
  assert.deepEqual(initialSelections([{ matches: [] }]), [{ index: null, chosen: false }]);
});

test('invalid candidate indexes cannot select unrelated wine', () => {
  const rows = [{ matches: [profile(1, 'First')] }];
  const choices = initialSelections(rows);
  assert.throws(() => chooseCandidate(rows, choices, 1, 0), RangeError);
  assert.throws(() => chooseCandidate(rows, choices, 0, 1), RangeError);
  assert.throws(() => chooseCandidate(rows, choices, 0, -1), RangeError);
  assert.throws(() => chooseCandidate(rows, [], 0, 0), RangeError);
});

test('vintage ratings take precedence, otherwise overall remains explicitly labelled', () => {
  const overall = { average: 4.6, count: 1000, reviewsCount: 100 };
  const vintage = { average: 4.1, count: 72, reviewsCount: 9 };
  assert.deepEqual(ratingFor(profile(1, 'A', vintage, overall)),
    { ...vintage, scope: 'vintage' });
  assert.deepEqual(ratingFor(profile(2, 'B', null, overall)),
    { ...overall, scope: 'overall' });
  assert.equal(ratingFor(profile(3, 'C')), null);
});

test('producer name is not repeated when already part of the wine name', () => {
  assert.equal(displayWineName(profile(1, 'Producer Reserve')), 'Producer Reserve');
  assert.equal(displayWineName(profile(2, 'Reserve')), 'Producer · Reserve');
});

test('producer rating text uses preloaded profile stats and labels producer separately', () => {
  const p = profile(41, 'Ravera');
  p.winery = {id:2606,name:'G.D. Vajra',ratingAverage:4,
    ratingCount:162821,winesCount:28};
  assert.equal(producerRatingLine(p),
    '★ 4.0 / 5 · 162,821 ratings · 28 wines');
  p.winery = {id:2606,name:'G.D. Vajra',ratingAverage:null,
    ratingCount:null,winesCount:null};
  assert.equal(producerRatingLine(p),null);
  delete p.winery;
  assert.equal(producerRatingLine(p),null);
});
