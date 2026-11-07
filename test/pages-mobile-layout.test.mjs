import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../apps/pages/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../apps/pages/src/style.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../apps/pages/src/main.ts', import.meta.url), 'utf8');

test('all results show tasting notes without a toggle or hidden column', () => {
  assert.doesNotMatch(html, /id="show-notes"|id="notes-header"/);
  assert.match(html, /<th scope="col">Tasting notes<\/th>/);
  assert.match(html, /colspan="5"/);
  assert.doesNotMatch(js, /showNotesInput|if \(showNotes\)|notesHeader/);
  assert.match(js, /const noteCell = appendCell\(tr, 'notes-cell'\)/);
  assert.match(js, /profile\?\.derived\.tastingNotes/);
  assert.match(js, /td\.colSpan = 5/);
});

test('mobile card rules make rating and tasting notes visible without horizontal scrolling', () => {
  assert.match(css, /grid-template-areas: "menu rating" "match match" "notes notes"/);
  assert.match(css, /\.wine-row \.rating-cell \{ grid-area: rating/);
  assert.match(css, /\.wine-row \.notes-cell \{ grid-area: notes/);
  assert.match(css, /\.table-frame \{ background: transparent; border: 0; overflow: visible/);
  assert.doesNotMatch(css, /\.rating-cell \{ display: none/);
});

test('mobile detail is native full-screen dialog with sticky header and safe areas', () => {
  assert.match(html, /<dialog id="wine-dialog"/);
  assert.match(css, /\.wine-dialog \{ position: fixed; inset: 0; margin: 0; width: 100vw/);
  assert.match(css, /height: 100dvh; max-height: 100dvh; border-radius: 0/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.dialog-head \{ display: flex;[^}]*position: sticky; top: 0/s);
  assert.match(js, /dialog\.showModal\(\)/);
  assert.match(js, /dialogClose\.focus\(\)/);
});

test('producer rating is shown in both table and detail without on-open API calls', () => {
  assert.match(js, /producerRatingLine\(profile\)/);
  assert.match(js, /producerInTable/);
  assert.match(js, /producerInDetail/);
  assert.doesNotMatch(js, /\.getWineryStats\(|\.listWineryWines\(/);
  assert.match(css, /\.producer-caption/);
  assert.match(css, /\.producer-rating-summary/);
});
