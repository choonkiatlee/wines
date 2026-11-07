import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTastingNotes } from '../src/derived-tasting.ts';

test('prefers sensory sentences over estate background, without rephrasing', () => {
  const source = 'Founded in 1890, the estate is on limestone soils. ' +
    'Aromas of black cherry, violet and spice. Silky tannins lead to a long, savoury finish.';
  assert.equal(deriveTastingNotes(source),
    'Aromas of black cherry, violet and spice. Silky tannins lead to a long, savoury finish.');
});

test('no sensory evidence yields null instead of fabricating flavour tags', () => {
  assert.equal(deriveTastingNotes('This estate is located in the Rhône Valley, founded in 1870.'), null);
  assert.equal(deriveTastingNotes('The vineyard has chalk soils and old vines.'), null);
  assert.equal(deriveTastingNotes(null), null);
  assert.equal(deriveTastingNotes('  '), null);
});

test('negations and caveats stay intact because only original sentences are extracted', () => {
  const source = 'Aromas of bright apple and citrus. The palate is fresh and not overly sweet, with no oak influence.';
  assert.equal(deriveTastingNotes(source), source);
});

test('selected sentences keep source ordering even when higher scoring sentence comes later', () => {
  const source = 'Soft tannins and a long finish. The winemaker established the estate in 1981. ' +
    'On the palate, black cherry, violet, cinnamon spice and refreshing acidity.';
  assert.equal(deriveTastingNotes(source),
    'Soft tannins and a long finish. On the palate, black cherry, violet, cinnamon spice and refreshing acidity.');
});

test('long extracted descriptions are capped at 240 characters', () => {
  const source = 'On the palate, flavours of cherry and plum, with silky tannins and spice ' +
    'that carry through to an exceptionally long and deliciously layered finish, ' +
    'showing great balance, freshness and vitality in every sip. ' +
    'The nose has violet flowers, citrus, blackberries and a compelling savoury character ' +
    'alongside nuances of tobacco, cedar and dark chocolate.';
  const derived = deriveTastingNotes(source);
  assert.ok(derived !== null && derived.length <= 240);
  assert.ok(derived.endsWith('…'));
  assert.ok(source.startsWith(derived.slice(0, -1)) || source.includes(derived.slice(0, -1)));
});

test('descriptions split on newlines and whitespace does not produce empty results', () => {
  assert.equal(deriveTastingNotes('Growing on limestone soils\n\nCrisp palate with lemon and pear aromas.'),
    'Crisp palate with lemon and pear aromas.');
});
