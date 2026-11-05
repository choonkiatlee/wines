# Wine enrichment pipeline

`src/enrichment.ts` is a core-library function, not an HTTP API or identity classifier.

```ts
import { enrichWines } from './src/index.ts';

const inputs = [
  { name: 'Opus One', year: 2022, type: 'red' },
  { name: "G.D. Vajra Barbera d'Alba" },
];

const compact = await enrichWines(inputs);
const full = await enrichWines(inputs, { returnAll: true });
// For offline tests: enrichWines(inputs, { client: mockedClient, concurrency: 2 })
```

## Contract

- `WineEnrichmentInput`: `{ name: string; year?: number; type?: WineType }`. `name` is required; `year` and `type` are optional. Allowed `type` values: `red`, `white`, `rose`, `sparkling`, `dessert`, `fortified`. Invalid input rejects early.
- `WineEnrichmentRow<T>`: `{ matches: T[]; error?: 'upstream_unavailable' }`.
- Default candidate: `{ name, year, rating: {score,count,scope}|null, description, url }`.
- `returnAll: true`: the entire existing `AlgoliaWineProfile`, including IDs, wine/region, both rating scopes and counts, indexed vintage, warnings, source and retrieval timestamp.
- Output rows preserve input order; each contains 0–3 plausible candidates, not an asserted match.
- When a search or selected profile fails, successful candidates remain and the row carries `error: 'upstream_unavailable'`; genuine no-result searches yield `{ matches: [] }`.

## Retrieval and ranking

One full-name Algolia search (15 hits) starts each row. When fewer than three plausible candidates are found, try up to two distinct follow-up queries: accent/punctuation-folded, then a shortened set of informative tokens. Search results are deduplicated by wine ID. All queries within a batch share an in-flight promise cache.

A deterministic score rewards informative token coverage in the indexed wine name, winery and region; exact name agreement; and indexed availability of the requested vintage as a small tiebreaker. Generic particles and labels (such as *château*, *domaine* and *cuvée*) are ignored. Long tokens allow one edit or adjacent transposition. Adjacent words may match one indexed word, e.g. `Crazy Lud` ↔ `Crazylud` and `Pom Pon` ↔ `Pompon`.

**Producer/cuvée evidence is handled separately.** Indexed winery tokens locate the producer portion of the search phrase; the remaining distinctive words are treated as the requested cuvée. A candidate that matches only the producer but **none** of those cuvée words is filtered out. Partial cuvée overlap remains eligible, with a ranking penalty for unmatched terms, so related numbered or regional variants can still appear. Producer aliases before the winery token are supported (e.g. `Oszkár Maurer Krisztus` where the index calls the winery `Maurer`). If no winery token is recognizable, the matcher retains the permissive full-name fallback rather than inventing a split. Top three are chosen before enrichment, identically in compact/full modes.

**Regression benchmark (5 November 2026).** The 47-wine photo transcription is saved as `test/fixtures/restaurant-menu-2026-11-04.json`. Comparing the same live menu before/after the ranking change, nonempty rows improved from 45/47 to 46/47, with 0 upstream errors. Three top candidates improved: Pompon Rouge, Maurer Crazylud, and Maurer Kadarka Nagy-Krisztus; the other 44 top candidates were unchanged. Seven deterministic mocked tests cover the specific cuvée and ambiguity cases. Run the opt-in live check manually with `node --experimental-strip-types scripts/one-off-cuvee-probe.mjs`; it creates local JSON artifacts and checks four spot selections. These examples are **plausible candidates, not verified identities**; the live source index changes over time.

**Limits:** `Fanny Sabre Anatole` can legitimately return Blanc, Rouge and Rosé; the minimal API input contains no colour context so it cannot choose the red wine. `Giuseppe Cipolla Le Robbe` still had no candidate in this live check.

**Tradeoff:** conservative token-based filtering is not exhaustive fuzzy wine-name identification. An unusual alias, translated cuvée name, or severely misspelled producer can be missed. An indexed year is not proof that it was commercially produced. The external LLM remains responsible for deciding/abstaining.

## Optional wine category

When the caller knows the menu section, include `type: 'red'` (or one of the other values above). This is **not** inferred from the bottle name; it uses the indexed wine's `type_id`, which was verified with live Vivino Algolia search hits: red `1`, white `2`, sparkling `3`, rosé `4`, dessert `7`, fortified `24`.

- Explicitly conflicting **known** types are excluded before top-three selection, so `Fanny Sabre Anatole` with `type: 'red'` cannot return indexed Blanc or Rosé alternatives.
- Confirmed type agreement gets a small `+12` rank bonus. Wines with **missing or unrecognized** type IDs remain eligible, avoiding false no-match results from incomplete metadata.
- When omitted, the algorithm behaves exactly as before; no type-specific query is added, no additional network calls, and the compact/full output schemas are unchanged.
- Sparkling rosé is indexed under `sparkling` (type 3), rather than still `rose` (type 4). Orange/skin-contact is not a separate verified index category; omit `type` if that classification is needed.

## Profiles, performance and provenance

Selected IDs call `VivinoAlgoliaClient.getProfileForYear` when the search hit reports the exact year (or omits vintages), otherwise `getProfile`. If a requested vintage cannot be confirmed, the result stays at wine level (`year: null`) and the full profile explains the fallback. Neither unrelated vintages nor unverified vintage scores are substituted. A verified exact-year score takes priority, otherwise the all-vintages score is explicitly scoped `overall`. Null counts and descriptions are retained; compact descriptions are source text shortened to at most 240 characters.

Upstream requests share a bounded concurrency limit (default 4, valid 1–16) and per-call promise caches keyed by query and wine ID/year. There are no persistent caches, retries, website APIs, or additional third-party services. Each selected candidate normally requires one indexed profile lookup.

## Illustrative compact output

```json
[
  {
    "matches": [{
      "name": "Opus One",
      "year": 2022,
      "rating": { "score": 4.5, "count": 513, "scope": "vintage" },
      "description": "A source-provided description, truncated at a word boundary.",
      "url": "https://www.vivino.com/w/1911534?year=2022"
    }]
  },
  { "matches": [] }
]
```

The description is invented for illustration; 2022 rating and count are from the earlier indexed check. Actual candidate counts and order vary with Algolia.

## Illustrative full output (one candidate)

```json
{
  "matches": [{
    "wine": {
      "id": 1911534, "name": "Opus One", "winery": "Opus One",
      "region": "Napa Valley", "country": "us",
      "alcohol": null, "closure": null, "nonVintage": false,
      "grapeIds": null, "foodIds": null, "styleId": null, "imageUrl": null
    },
    "vintage": { "id": 170415755, "year": 2022 },
    "ratings": {
      "vintage": { "average": 4.5, "count": 513, "reviewsCount": 140 },
      "allVintages": { "average": 4.6, "count": 97125, "reviewsCount": null }
    },
    "vintageCounts": { "ratings": 513, "reviews": 140 },
    "description": { "scope": "wine", "text": "Unabridged source description." },
    "source": "vivino-algolia",
    "retrievedAt": "2026-11-04T12:00:00.000Z",
    "indexUpdatedAt": null,
    "sourceUrl": "https://www.vivino.com/w/1911534?year=2022",
    "warnings": []
  }]
}
```

The full JSON is a *shape example*, not a fresh provider response. Nullable metadata, retrieval timestamp and description are illustrative; any real output is returned as normalized by the client.
