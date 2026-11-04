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
| `getTastes(wineId)` | Retrieve wine-level taste structure and flavours |
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

## Permissions

Vivino has no officially supported public developer API, and its terms restrict unauthorised automated access. A search-only key visible in a website frontend is **not permission** for third-party automated use or commercial reuse of its data. This repository is an **offline-tested prototype**: no live Vivino requests, browser impersonation, bot-protection bypass or blocked-request retries are included in tests.

## Offline tests

```sh
npm install
npm run typecheck
npm test
```

Node 22.16+ is required for the test runner. The HTTP response shapes may change without warning. Cloudflare deployment, R2/D1 storage, reviews, prices and robust producer/cuvée matching remain out of scope for this first wrapper.
