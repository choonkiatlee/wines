# wines

## Vivino HTTP adapter (experimental)

A minimal, dependency-free **TypeScript** HTTP wrapper for Stage D of [restaurant wine-list assistant #1](https://github.com/choonkiatlee/wines/issues/1). No Cloudflare-specific code, storage, MCP server or production deployment.

**Access/permissions:** Vivino has no public developer API. Its May 2026 Terms prohibit automated access/scraping without authorisation. This code documents an unofficial response contract and provides **offline mocked tests only**; do not enable live requests without permission from Vivino. No browser impersonation, session-cookie extraction, challenge bypass, or retrying blocked requests is included.

## API

- `searchWines(query, limit)` — Algolia candidates (not validated entity matches)
- `getWine(wineId)` — raw indexed wine record and listed vintages
- `getVintage(vintageId)` — raw vintage JSON
- `getTastes(wineId)` — wine-level taste structure/flavor groups
- `getProfile(vintageId)` — normalised wine/vintage/taste record
- `getProfileForYear(wineId, year)` — exact-year resolution; errors rather than substituting another vintage

Search and `getWine` require explicitly provided Algolia application ID and search key (only if authorised). The other methods target the website's internal JSON endpoints. All methods use injected standard `fetch` to support offline tests and eventual Workers use.

```ts
import { VivinoClient } from './src/index.ts';

const client = new VivinoClient({
  fetch: yourAuthorisedFetch,
  algolia: { appId: yourAppId, searchKey: yourSearchKey },
});

const candidates = await client.searchWines('example producer');
const profile = await client.getProfileForYear(12345, 2020);
// profile.ratings.vintage and profile.ratings.allVintages are distinct
// profile.taste.scope is 'wine', not 'vintage'
```

No live requests are made by the test suite:

```sh
npm install
npm run typecheck
npm test
```

Works with Node 22.16+ for built-in TypeScript stripping in tests. TypeScript/Workers bundlers can import `src/index.ts` directly. Request/response shapes are reverse-engineered from the [marco-vrinssen/vivino-mcp implementation](https://github.com/marco-vrinssen/vivino-mcp/blob/main/src/vivino.js) and may change.

## Explicitly not implemented yet

Review pagination, prices, autocomplete, configurable caching, rate limits, live integration tests, provider licensing, Cloudflare Worker routes, R2/D1 persistence and menu-based entity resolution. These should be decided separately for Stages C/D/E/H.
