# wines

Wine lookup for the restaurant wine-list assistant ([planning issue #1](https://github.com/choonkiatlee/wines/issues/1)). **Use `VivinoAlgoliaClient` as the primary data source.** Its search, vintage resolution and profiles use Vivino's own Algolia index exclusively; no website API calls are needed.

## Primary client

```ts
import { VivinoAlgoliaClient } from './src/index.ts';

const vivino = new VivinoAlgoliaClient();
const { candidates } = await vivino.searchWines('Opus One', 5);
// Verify the producer/cuvée before selecting a candidate. Do not blindly take the first hit.
const selected = candidates.find(w => w.id === 1911534);
if (!selected) throw new Error('Expected wine not found');

const profile = await vivino.getProfileForYear(selected.id, 2022);
console.log(profile.ratings.vintage);     // { average, count, reviewsCount }, or null
console.log(profile.ratings.allVintages); // separately labelled overall rating
console.log(profile.description);        // { scope: 'wine', text }, or null
console.log(profile.sourceUrl, profile.retrievedAt);

// No vintage on the menu? Keep the profile at wine level:
const overall = await vivino.getProfile(selected.id);
// overall.vintage === null; overall.ratings.vintage === null
```

| Method | Returns |
|---|---|
| `searchWines(query, limit?)` | Candidate wines and total hits; limit 1–20, default 10 |
| `getWine(wineId)` | Raw indexed wine metadata and vintages, including their statistics |
| `resolveVintage(wineId, year)` | Exact indexed wine/year/vintage IDs |
| `getProfile(wineId)` | Normalised wine-level profile; takes a **wine ID** |
| `getProfileForYear(wineId, year)` | Exact-vintage profile from **one index lookup** |

Profiles include identity, region/country, alcohol, closure, image, grape/food/style IDs, ratings and sample sizes, wine-level description, retrieval time and source URL. `indexUpdatedAt` preserves the index's `updated_at` field; it is not a guarantee that every rating was refreshed at that time. Unavailable metadata and counts stay null. `vintageCounts` preserves known counts even when a score is below threshold. Description text is a source description, not a community taste aggregate or a vintage-specific tasting note.

Candidate search is not identity verification. Missing exact years and ambiguous year entries are rejected; another year or U.V. is never substituted. Below-threshold, explicitly invalid and all-vintage fallback scores are not presented as exact-vintage ratings. The index contains noisy historical entries: an indexed vintage is not proof a wine was produced in that year.

## MVP scope

Use **menu price + verified wine/vintage + rating + rating count + review count + wine description/image** for the comparison table. Rating counts and written-review counts are distinct. The index supplies grape, food-pairing and style IDs, not names for those fields; retain IDs until an explicit mapping is available.

The inspected index records do not contain review text, numeric acidity/tannin/body scores, community flavour mention statistics, merchant offers or market prices. Keep these unavailable rather than deriving them from a description. Restaurant prices come from menu extraction. Do not infer taste scores or fabricate retailer value comparisons.

Algolia credentials are Vivino's publicly embedded application ID/search-only key and `WINES_prod` index, not MCP credentials. They remain internal to the concrete client; no caller credentials, generic resolver or configuration layer is required. An optional injected `fetch` supports tests and caller-controlled request policies. No retries are performed after HTTP errors.

## Multi-candidate menu enrichment

`enrichWines` wraps the primary Algolia client with candidate search, lightweight ranking, and exact-vintage/overall rating fallback. It returns 0–3 candidates for each input (in the original order), leaving final menu identification to the external LLM.

```ts
import { enrichWines } from './src/index.ts';

const result = await enrichWines([
  { name: 'Fanny Sabre Anatole', type: 'red' },
  { name: 'Opus One', year: 2022 },
]);
const full = await enrichWines([{ name: 'Opus One', year: 2022 }], { returnAll: true });
```

`type` is optional: `red`, `white`, `rose`, `sparkling`, `dessert`, or `fortified`. If supplied, indexed candidates with a **known conflicting** Vivino type are excluded, while missing or unfamiliar type IDs stay eligible. The output schema and behaviour without `type` are unchanged. See [the pipeline design and regression benchmark](docs/enrichment.md).

## Experimental website enrichment

The existing `VivinoClient` remains available for compatibility and optional experiments with `getVintage`, `getTastes`, `getReviews`, `getReviewsWithFlavors`, `getPageInformation`, `getPrices` and `getCheckoutPrices`. Its discovery methods delegate to the same Algolia client. Its `getProfile(vintageId)` and `getProfileForYear` still use website APIs; **these are not the primary profile methods**. The two clients intentionally have different `getProfile` identifier semantics, so choose the class explicitly.

Website data worked from the development environment but native Node requests returned CloudFront403 on GitHub Actions. A separate curl diagnostic succeeded, while a later HTTP/TLS matrix found no working configuration. Access remains environment-dependent; website enrichment and TLS experiments are not dependencies of the MVP. Taste data are wine-level; prices require market/currency, merchant, vintage and bottle-size context.

Evidence: [first Actions check](https://github.com/choonkiatlee/wines/actions/runs/41795762655), [HTTP diagnostic](https://github.com/choonkiatlee/wines/actions/runs/41814189580), [TLS matrix](https://github.com/choonkiatlee/wines/actions/runs/41814793769). These were one-off experiment branches, not recurring CI.

## Validation

```sh
npm install
npm run typecheck
npm test
```

Node 22.16+ is required. Tests are offline with mocked HTTP responses, including a guard that primary profiles never call `www.vivino.com`. No recurring live workflow is installed. These unofficial index and website schemas can change; live checks are separate from deterministic tests. Publicly embedded credentials alone do not establish data-reuse rights; access for this investigation was authorised by the user.

Primary client live verification: [GitHub Actions, 4 November 2026](https://github.com/choonkiatlee/wines/actions/runs/41855364544) passed all five indexed requests (search, wine read, resolution, overall profile, exact-year profile) with HTTP 200 and no website calls. Opus One 2022 returned 4.5/513 ratings/140 reviews. The final fallback-count regression guard was verified offline afterward; the final local suite has 36 passing tests.


## Standalone Vivino client and browser playground

The Vivino provider is a **separate TypeScript subproject** in `packages/vivino-client/`.
Its entry point is `packages/vivino-client/src/index.ts`, and it does not depend
on the UI. The root `src/enrichment.ts` consumes the provider and contains
wine-name matching/ranking logic. `src/index.ts` remains a compatibility
entry point for existing scripts/tests. The static website lives entirely
inside `apps/pages/`, which imports `enrichWines` and does no matching itself.

```text
packages/vivino-client/src/   # independent VivinoAlgoliaClient/VivinoClient
src/                          # enrichment library + backwards-compatible exports
apps/pages/                   # static, browser-only Vite playground
.github/workflows/pages.yml   # build/test on PR; deploy on master
```

Local setup (Node >=22.16):

```sh
npm install
npm run typecheck && npm test
npm run pages:dev
npm run pages:build
```

After merging the Pages workflow, go to **Settings → Pages → Build and
deployment → Source → GitHub Actions**. The workflow publishes the `apps/pages/dist`
bundle on changes to `master`. Expected site once configured:
https://choonkiatlee.github.io/wines/

This is **not a server-side JSON API**: the page executes the existing
`enrichWines()` library inside a browser. Use **Check browser → Algolia**
first to verify third-party CORS/preflight permissions; successful Node/Actions
requests do not prove browser access. If blocked, the browser cannot work
around CORS and a small server-side HTTP adapter would be necessary.
The bundled search-only Algolia credentials are visible to page visitors.
Provider reuse permissions, quotas, and availability remain separate concerns.
