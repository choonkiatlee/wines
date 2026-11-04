# wines

A small TypeScript wrapper for Vivino's unofficial HTTP endpoints, supporting the restaurant wine-list assistant ([issue #1](https://github.com/choonkiatlee/wines/issues/1)).

## One Vivino client

All discovery and information methods are on `VivinoClient`:

| Method | Purpose |
|---|---|
| `searchWines(query, limit?)` | Find candidate wines by text using Vivino's Algolia index |
| `getWine(wineId)` | Retrieve a wine and its indexed vintages |
| `resolveVintage(wineId, year)` | Get the exact `vintageId` for a selected wine and year |
| `getVintage(vintageId)` | Retrieve Vivino vintage data |
| `getTastes(wineId)` | Retrieve wine-level taste structure, flavour keywords and mention counts |
| `getReviews(wineId, options?)` | Retrieve one page of helpful/latest reviews, optionally filtered by year and stars |
| `getReviewsWithFlavors(wineId, options)` | Retrieve reviews supporting selected flavour keyword IDs |
| `getPageInformation(wineId, options?)` | Retrieve website page data, optionally for an exact year and offer |
| `getPrices(vintageIds)` | Retrieve market context, medians and selected offers for vintage IDs |
| `getCheckoutPrices(wineId)` | Retrieve vintage availability and merchant offers |
| `getProfile(vintageId)` | Normalise ratings and tastes for a known vintage |
| `getProfileForYear(wineId, year)` | Resolve a year and retrieve its profile |

```ts
import { VivinoClient } from './src/index.ts';

const vivino = new VivinoClient(); // no Algolia configuration needed

const { candidates } = await vivino.searchWines('example producer');
// Confirm the producer and cuvée before selecting a candidate.
const profile = await vivino.getProfileForYear(candidates[0].id, 2020);

// Or use a known Vivino vintage ID:
const known = await vivino.getProfile(12345);
```

The client hardcodes **Vivino's** Algolia application ID, search-only key and `WINES_prod` index, as found in its publicly served frontend and documented in [vivino-mcp](https://github.com/marco-vrinssen/vivino-mcp/blob/main/src/vivino.js). These values belong to **Vivino, not to the MCP project**. No personal API key or credentials are needed in the constructor.

Search results are **candidates, not verified matches**. The caller must confirm the correct producer/cuvée; `resolveVintage` never substitutes another year or `U.V.` for a missing exact vintage. Ratings remain clearly distinguished between exact vintage and all-vintage averages. Taste data are labelled wine-level.

## Reviews, tastes and prices

```ts
const page = await vivino.getPageInformation(1911534, { year: 2022 });
const reviews = await vivino.getReviews(1911534, {
  year: 2022, sort: 'latest', perPage: 10, page: 1,
});
const tastes = await vivino.getTastes(1911534);
const supportingReviews = await vivino.getReviewsWithFlavors(1911534, {
  flavorIds: [292], // keyword ID from tastes.flavor; 292 = oak
});
const prices = await vivino.getPrices([page.vintage.id]);
const offers = await vivino.getCheckoutPrices(1911534);
console.log(prices.market, prices.vintages[String(page.vintage.id)]);
```

`getReviews` returns `Review[]` for one page. Options are `year`, `ratings` (1–5 star values), `sort` (`helpful` or `latest`), `perPage` (default 10), and `page` (default 1). `getReviewsWithFlavors` accepts `flavorIds`, optional `categoryId`, and the same pagination options. The endpoint does not supply a total or next-page token; an empty page is returned as `[]`.

`getPageInformation` unwraps `page_information` and rejects a mismatching wine or requested year, including U.V. substitutions. It also accepts `priceId` and `bottleCount`. `getPrices` unwraps `prices`, retaining `market` and the `vintages` map. `getCheckoutPrices` unwraps the `checkout_prices` array and retains each vintage's merchant offers.

Taste structure values use 1–5 scales and may be null. The response includes user/calculated structure counts and flavour groups with primary/secondary keywords and mention statistics. Taste data remain wine-level, even when reviews are filtered by year. The upstream payload does not explain how calculated structure values are derived.

Prices are market-specific, not universal valuations. Keep the returned country/state, currency, vintage, merchant and bottle size together. Amounts are currency units, not cents; a median is distinct from a selected merchant offer. Website location/session settings determine the market; `getCheckoutPrices` has no top-level market object, so retain currencies on its offers. No implicit currency conversion or UK-market assumption is made. Callers can supply a custom `fetch` for their authorised session. Existing `getProfile` methods do not automatically fetch reviews or prices.

Website GET requests use the frontend's `Accept: application/json`, `Content-Type: application/json`, and `X-Requested-With: XMLHttpRequest` headers. They do not require Algolia credentials. HTTP errors propagate as `VivinoHttpError`; the client does not retry blocked requests.

## Permissions

Vivino has no officially supported public developer API, and its terms restrict unauthorised automated access. A search-only key visible in a website frontend is **not permission** for third-party automated use or commercial reuse of its data. The automated test suite is offline and uses mocked HTTP responses. Live checks are separate and access can differ by environment. No browser impersonation, bot-protection bypass or blocked-request retries are included.

## Offline tests

```sh
npm install
npm run typecheck
npm test
```

Node 22.16+ is required for the test runner. The HTTP response shapes may change without warning. Cloudflare deployment, R2/D1 storage and robust producer/cuvée matching remain out of scope.

## Manual live check — 4 November 2026

Using this client from the development environment, all six website reads succeeded for Opus One (`wineId: 1911534`): page information for 2022, year-filtered reviews, oak-keyword reviews, tastes, batch prices and checkout offers. The page returned vintage `170415755`, a 2022 rating of 4.5/513 ratings, and an all-vintage rating of 4.6/97,125 ratings. Taste data contained 13 flavour groups; checkout data contained 24 vintage entries. Batch prices identified US/California and USD, with a $479.97 median and $449 selected offer for 2022. These are a dated access check, not fixed expected values or a guarantee of access from other environments. No recurring workflow was added.
