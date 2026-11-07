/** Deterministic, source-faithful extraction. No LLM, inferred flavours, or keyword-only tags. */
export type WineDerived = { tastingNotes: string | null };

const EVIDENCE: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(aromas?|bouquet|nose|palate|tasting notes?|scents?|smells?|flavo[u]?rs?|notes of|hints of|tastes? of)\b/i, 5],
  [/\b(tannins?|acidity|mouthfeel|texture|body|bodied)\b/i, 3],
  [/\b(finish|aftertaste|length)\b/i, 3],
  [/\b(cherr(?:y|ies)|raspberr(?:y|ies)|strawberr(?:y|ies)|blackberr(?:y|ies)|plum|peach|apricot|pear|apple|citrus|lemon|lime|orange|grapefruit|fig|currant|melon|tropical fruit|stone fruit|red fruit|dark fruit)\b/i, 2],
  [/\b(violet|rose petals?|jasmine|lavender|floral|herbal|herbs?|thyme|mint|basil|flowers?)\b/i, 2],
  [/\b(spic(?:e|es|y)|pepper|vanilla|cedar|tobacco|leather|chocolate|coffee|smoky|smoke|earthy|savoury|savory|mineral(?:ity)?|saline|flint(?:y)?)\b/i, 2],
  [/\b(crisp|silky|velvety|fine-grained|refreshing|bright|juicy|lively|zesty|rich|elegant|balanced|dry|sweet|creamy|lingering|fresh|persistent|round|structured)\b/i, 1],
];

const BACKGROUND = /\b(founded|established|since \d{4}|century|generation|family.owned|vineyard|hectares?|harvested|winemak(?:er|ing)|fermented|oak barrels?|aged (?:in|for)|planted|soil|terroir|estate|located|region|village|sustainable|organic farming|grape varieties|the winery)\b/i;

/**
 * Extract the most sensory-relevant source sentences, in original reading order.
 * Null means no sufficient sensory evidence; the caller can show the original
 * description instead. Negations ("no oak", "not sweet") remain verbatim.
 */
export function deriveTastingNotes(description: string | null | undefined): string | null {
  if (!description?.trim()) return null;
  const sentences = description.trim().slice(0, 12_000)
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const scored = sentences.map((sentence, index) => {
    const sensory = EVIDENCE.reduce((total, [regex, weight]) =>
      total + (regex.test(sentence) ? weight : 0), 0);
    return {
      sentence, index,
      score: sensory - (BACKGROUND.test(sentence) ? 4 : 0),
    };
  }).filter(item => item.score >= 4);
  if (!scored.length) return null;
  const winners = scored.sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2).sort((a, b) => a.index - b.index);
  const combined = winners.map(item => item.sentence).join(' ');
  if (combined.length <= 240) return combined;
  const prefix = combined.slice(0, 239);
  const atWord = prefix.lastIndexOf(' ');
  return prefix.slice(0, atWord >= 156 ? atWord : 239).trimEnd() + '…';
}
