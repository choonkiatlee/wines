import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCandidate, initialSelections } from '../apps/pages/src/selection.ts';
import { visibleRows, wineTypeFor } from '../apps/pages/src/table-view.ts';

function mock(id, typeId, score, name = 'Wine') {
  const rating = score === null ? null : { average: score, count: 100, reviewsCount: null };
  return {
    wine: { id, name, winery: 'Producer', typeId },
    vintage: null, ratings: { vintage: null, allVintages: rating },
    description: null, sourceUrl: '', warnings: [],
  };
}

const inputs = [
  { name: 'Bordeaux', menuPrice: 80 },
  { name: 'White Wine', menuPrice: 0 },
  { name: 'Unrated rosé' },
  { name: 'Mystery wine', menuPrice: 40 },
  { name: 'Unknown wine', type: 'fortified' },
];
const rows = [
  { matches: [mock(1, 1, 4.2), mock(10, 2, 4.9)] },
  { matches: [mock(2, 2, 3.7)] },
  { matches: [mock(3, 4, null)] },
  { matches: [mock(4, null, 4.6)] },
  { matches: [] },
];
const indexes = entries => entries.map(e => e.index);

test('highest/lowest rating sort stable, missing ratings always at the bottom', () => {
  const choices = initialSelections(rows);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'all', 'rating-desc')), [3, 0, 1, 2, 4]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'all', 'rating-asc')), [1, 0, 3, 2, 4]);
});

test('filter uses indexed wine type or explicit input fallback, not name guesses', () => {
  const choices = initialSelections(rows);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'red', 'original')), [0]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'white', 'original')), [1]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'rose', 'original')), [2]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'fortified', 'original')), [4]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'unknown', 'original')), [3]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'sparkling', 'original')), []);
  assert.equal(wineTypeFor(inputs[3], rows[3], choices[3]), 'unknown');
});

test('type sorting groups categories, preserves original ordering and puts unknown last', () => {
  const choices = initialSelections(rows);
  assert.deepEqual(indexes(visibleRows(inputs, rows, choices, 'all', 'type')), [4, 0, 2, 1, 3]);
});

test('choice switching affects filtering/rating without mutating underlying matches', () => {
  const first = initialSelections(rows);
  const updated = chooseCandidate(rows, first, 0, 1);
  assert.deepEqual(indexes(visibleRows(inputs, rows, updated, 'red', 'original')), []);
  assert.deepEqual(indexes(visibleRows(inputs, rows, updated, 'white', 'rating-desc')), [0, 1]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, updated, 'all', 'rating-desc')), [0, 3, 1, 2, 4]);
  assert.equal(wineTypeFor(inputs[0], rows[0], first[0]), 'red');
  assert.equal(wineTypeFor(inputs[0], rows[0], updated[0]), 'white');
});

test('unresolved choices and unknown indexed type are handled conservatively', () => {
  const first = initialSelections(rows);
  const declined = chooseCandidate(rows, first, 0, null);
  assert.equal(wineTypeFor(inputs[0], rows[0], declined[0]), 'unknown');
  assert.deepEqual(indexes(visibleRows(inputs, rows, declined, 'unknown', 'original')), [0, 3]);
  const input = [{ name: 'Red menu', type: 'red' }];
  const row = [{ matches: [mock(9, 999, 4.3)] }];
  assert.equal(wineTypeFor(input[0], row[0], initialSelections(row)[0]), 'red');
});

test('mismatched input/result arrays fail loudly', () => {
  assert.throws(() => visibleRows([], rows, initialSelections(rows), 'all', 'original'), RangeError);
});

test('menu price sort is numeric, independent of Vivino matches; missing prices always last', () => {
  const initial = initialSelections(rows);
  assert.deepEqual(indexes(visibleRows(inputs, rows, initial, 'all', 'price-asc')), [1, 3, 0, 2, 4]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, initial, 'all', 'price-desc')), [0, 3, 1, 2, 4]);
  const changed = chooseCandidate(rows, initial, 0, 1);
  assert.deepEqual(indexes(visibleRows(inputs, rows, changed, 'all', 'price-asc')), [1, 3, 0, 2, 4]);
  assert.deepEqual(indexes(visibleRows(inputs, rows, changed, 'white', 'price-asc')), [1, 0]);
});
