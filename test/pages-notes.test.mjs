import assert from 'node:assert/strict';
import test from 'node:test';
import { shortWineNote } from '../apps/pages/src/notes.ts';

test('short wine note preserves complete short descriptions without rewriting', () => {
  const description = 'Crisp apple and citrus, with a mineral finish.';
  assert.equal(shortWineNote(description), description);
});

test('long description is condensed at a word boundary, faithfully', () => {
  const description = 'Aromas of dark cherry, wild strawberry and savoury herbs, with fine tannins and a refreshing acidity that lifts the long mineral finish.';
  const excerpt = shortWineNote(description, 75);
  assert.ok(excerpt.endsWith('…'));
  assert.ok(excerpt.length <= 75);
  assert.ok(description.startsWith(excerpt.slice(0, -1)));
  assert.ok(!excerpt.includes('refreshing acidity'));
});

test('blank or unavailable descriptions do not fabricate tasting notes', () => {
  assert.equal(shortWineNote(null), null);
  assert.equal(shortWineNote(undefined), null);
  assert.equal(shortWineNote('   \n '), null);
});

test('line breaks collapse only in the table excerpt, while source remains unchanged', () => {
  const original = 'Deep cherry fruit.\n\nSpice and earthy notes.  Long finish.';
  assert.equal(shortWineNote(original), 'Deep cherry fruit. Spice and earthy notes. Long finish.');
  assert.equal(original.includes('\n\n'), true);
});
