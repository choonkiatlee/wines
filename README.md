# wines

## Architecture

The wine-list assistant distinguishes **resolution** (finding the right wine and vintage) from **enrichment** (retrieving information for an already resolved ID). This is the Stage C/D/E boundary in [issue #1](https://github.com/choonkiatlee/wines/issues/1).

| Layer | API | Access configuration |
|---|---|---|
| `VivinoResolver` (`src/resolver.ts`) | `searchWines(query)`, `getWine(wineId)`, `resolveVintage(wineId, year)` | Algolia app ID / search key |
| `VivinoClient` (`src/client.ts`) | `getVintage(vintageId)`, `getTastes(wineId)`, `getProfile(vintageId)` | No Algolia credentials |

`searchWines` returns **candidates, not verified matches**. The calling workflow must confirm producer and cuvée before resolving a vintage. `resolveVintage` rejects missing years rather than falling back to the all-vintage aggregate. `getProfile` keeps vintage and all-vintage ratings separate, and correctly labels tastes as wine-level.

### Example

```ts
import { VivinoClient, VivinoResolver } from './src/index.ts';

const resolver = new VivinoResolver({
  fetch: authorisedFetch,
  algolia: { appId: yourAppId, searchKey: yourSearchKey },
});
const info = new VivinoClient({ fetch: authorisedFetch }); // no Algolia configuration

const { hits } = await resolver.searchWines('example producer');
// Verify the matching wine manually or with a future Stage C matching component.
const selectedWineId = hits[0].id;
const resolved = await resolver.resolveVintage(selectedWineId, 2020);
const profile = await info.getProfile(resolved.vintageId);
// profile.ratings.vintage and profile.ratings.allVintages are distinct
```

The resolver is replaceable without modifying `VivinoClient`; another resolver can supply the same `vintageId`. Both layers use an injectable standard `fetch`, suitable for Node or Cloudflare Workers, and no database or MCP transport is required.

### Permissions

Vivino does not offer a public developer API. Its terms restrict automated access/scraping without authorisation. These are **reverse-engineered, unofficial endpoints**, not a guarantee of anonymous access. Removing the Algolia credentials from the information client does **not** establish that its endpoints are public, reliably accessible or licensed for use. No live requests are made by the tests, and neither layer implements browser impersonation, cookie extraction, challenge bypass or blocked-request retries.

### Offline validation

```sh
npm install
npm run typecheck
npm test
```

Node 22.16+ and TypeScript are required for the included tests. Underlying field shapes follow [marco-vrinssen/vivino-mcp](https://github.com/marco-vrinssen/vivino-mcp/blob/main/src/vivino.js) and may change without warning.

### Later work

Stage C producer/cuvée matching and confidence thresholds, more provider implementations, reviews, prices, caching, live integration (subject to permission), Cloudflare deployment, R2 and D1 are intentionally deferred.
