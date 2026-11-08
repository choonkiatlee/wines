# Retailer wine ingestion

This package provides a **small shared wine-list contract** independent of the
Vivino lookup/enrichment library, Pages UI and HTTP API. Implement a future
retailer with `RetailerWineSource.fetchPage()` and the same `RetailerWinePage`
result. No automatic paging, persistence, or enrichment is performed.

```ts
import {
  SainsburysWineAdapter,
  mapSainsburysProduct,
} from '@choonkiatlee/retailer-ingestion';

const adapter = new SainsburysWineAdapter();
const page = await adapter.fetchPage({ page: 1 }); // one-based, one page only
console.log(page.wines, page.pagination.sourceTotal);

// Pure/offline mapping is also available for previously saved native records:
const wine = mapSainsburysProduct(savedNativeProduct, new Date().toISOString());
```

The adapter is pinned to Sainsbury's public Wine category and uses the separate
`@choonkiatlee/sainsburys-client` for transport. `sourceTotal` is the **unfiltered
category total**, not a guaranteed count of normalised wines; `included` is
the number of wines retained on this page. `sourceReturned` is also upstream.

Every price is integer minor units (`GBP` pence). `sourceRetailMinor` preserves
the upstream displayed `retail_price`, which **may already be a Nectar price**.
`regularMinor`, `publicDiscountedMinor`, and `nectarMinor` are distinct and are
only populated where promotion semantics support them. Conditional multibuys
and meal deals are described in `conditionalOffers`; their speculative per-bottle
price is never calculated. No advertised price is assumed to be valid at a
specific store, for a specific customer, or after its source offer expires.

Identity is retailer-scoped (`retailer`, `productId`) and the source name is
preserved for the consumer's matching logic. Wine type, vintage and bottle size
are inferred only where evident; unknown values, missing URLs and unclear
promotions remain unset. Boxed wine and multipack prices are not represented
as single-bottle sizes. Clearly non-wine listings are excluded without using
the unreliable `is_alcoholic` flag. Ambiguous listings are retained for review.

A consumer may **explicitly** pass `page.wines` names to Vivino's separate
`enrichWines()` entry point; this package does not import or call it.
