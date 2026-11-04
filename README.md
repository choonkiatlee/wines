# wines

## Architecture

Wine discovery and vintage resolution (Stage C) are separate from information retrieval (Stages D/E). See [issue #1](https://github.com/choonkiatlee/wines/issues/1).

| Component | Responsibility | Credentials |
|---|---|---|
| `IWineResolver<TCandidate, TWineId, TResolved>` (`src/wine-resolver.ts`) | Provider-independent candidate search and vintage-resolution contract | None specified by interface |
| `AlgoliaResolver` (`src/algolia-resolver.ts`) | Search the Vivino Algolia index, retrieve candidates, resolve an exact vintage | Algolia app ID / search key |
| `VivinoClient` (`src/client.ts`) | Fetch a known Vivino `vintageId`, wine-level tastes and ratings | No Algolia credentials or resolver |

### Example

```ts
import { AlgoliaResolver, VivinoClient } from './src/index.ts';

const resolver = new AlgoliaResolver({
  fetch: authorisedFetch,
  algolia: { appId: yourAppId, searchKey: yourSearchKey },
});
const client = new VivinoClient({ fetch: authorisedFetch }); // no resolver

const { candidates } = await resolver.searchWines('example producer');
// Confirm the correct producer and cuvée before choosing a candidate.
const chosenWineId = candidates[0].id;
const { vintageId } = await resolver.resolveVintage(chosenWineId, 2020);
const profile = await client.getProfile(vintageId);
```

The generic interface has **no Vivino imports**. Each implementation chooses its own candidate, wine-ID, and resolved-identity types. `AlgoliaResolver` implements `IWineResolver<Wine, number, ResolvedVivinoVintage>` and additionally exposes `getWine` for its own indexed wine lookup.

`VivinoClient` is intentionally **not injected with a resolver**. It is a standalone Vivino information client that accepts a resolved Vivino vintage ID. The calling workflow decides how to obtain and verify that ID. Another resolver could replace Algolia if it supplies compatible Vivino IDs; a different information provider could have a different client.

Search returns candidates, not verified matches. The Algolia resolver does not substitute a different year or `U.V.` when the requested vintage is unavailable. The Vivino information client preserves exact-vintage versus all-vintage ratings and labels taste data as wine-level.

### Permissions

Vivino has no public developer API. Its terms restrict unauthorised automated access. These endpoints are reverse-engineered and should not be assumed licensed or reliably accessible. Tests make no live Vivino calls. No browser impersonation, session-cookie extraction, bot-protection bypass, or blocked-request retries are included.

### Offline validation

```sh
npm install
npm run typecheck
npm test
```

Node 22.16+ is required for the test runner. Schema references: [marco-vrinssen/vivino-mcp](https://github.com/marco-vrinssen/vivino-mcp/blob/main/src/vivino.js). Cloudflare routes, R2/D1, review pagination, prices, and producer/cuvée matching are deferred.
