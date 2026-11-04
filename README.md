# wines

## Architecture

Wine discovery/identity resolution (Stage C) is separate from information retrieval (Stage D/E). See [issue #1](https://github.com/choonkiatlee/wines/issues/1).

| Component | Responsibility | Credentials |
|---|---|---|
| `IWineResolver<TCandidate, TWineId, TResolved>` (`src/wine-resolver.ts`) | Provider-independent strategy for searching candidates and resolving a vintage | None specified by interface |
| `AlgoliaResolver` (`src/algolia-resolver.ts`) | Concrete search and exact-year resolution using the Vivino Algolia index | Algolia app ID / search key |
| `VivinoClient` (`src/client.ts`) | Fetch a known `vintageId`, wine tastes and rating profiles; optional injected resolver for `getProfileForYear` | No Algolia credentials in client |

### Example

```ts
import { AlgoliaResolver, VivinoClient } from './src/index.ts';

const resolver = new AlgoliaResolver({
  fetch: authorisedFetch,
  algolia: { appId: yourAppId, searchKey: yourSearchKey },
});

const client = new VivinoClient({ fetch: authorisedFetch, resolver });
const { candidates } = await resolver.searchWines('example producer');
// Confirm the producer and cuvée before selecting a candidate.
const profile = await client.getProfileForYear(candidates[0].id, 2020);
// Alternatively, a previously resolved vintage needs no resolver or search key:
const infoOnly = new VivinoClient({ fetch: authorisedFetch });
const knownProfile = await infoOnly.getProfile(12345);
```

**Swappability:** `VivinoClient` depends only on `IWineResolver<Wine, number, ResolvedVivinoVintage>`, not `AlgoliaResolver`. A different discovery strategy can be injected, including a curated map or another index, provided it resolves to Vivino wine/vintage IDs. The generic interface itself has no Vivino imports, so other providers may use other candidate and identifier types in their own clients.

Candidate search does not verify a producer/cuvée. The resolver rejects a requested year that is not listed instead of falling back to another year or `U.V.`. The client checks that the resolved identity agrees with the retrieved vintage record and preserves vintage-specific versus all-vintage ratings. Taste data are labelled wine-level.

### Permissions

Vivino has no public developer API; its terms prohibit unauthorised automated access. These endpoints are reverse-engineered and cannot be assumed to be licensed or reliably accessible. The tests make no live Vivino calls. No browser impersonation, session-cookie extraction, bot-protection bypass or blocked-request retries are included.

### Offline validation

```sh
npm install
npm run typecheck
npm test
```

Node 22.16+ is required for the test runner. Schema references: [marco-vrinssen/vivino-mcp](https://github.com/marco-vrinssen/vivino-mcp/blob/main/src/vivino.js). Cloudflare routes, R2/D1, review pagination, prices and producer/cuvée matching are deferred.
