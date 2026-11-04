# Primary Vivino Algolia client

Agreed after inspecting full index objects: Algolia is sufficient for the first restaurant-menu comparison. Make `VivinoAlgoliaClient` the documented primary concrete client. Keep public frontend credentials internal. Existing `VivinoClient` website methods remain experimental and backward compatible; delegate its discovery methods instead of duplicating credentials or adding a resolver abstraction.

The primary client supports search, raw indexed wine reads, exact-vintage resolution, all-vintage profiles and exact-year profiles. A profile is built from one indexed wine lookup. Preserve vintage vs overall scores, rating vs written-review counts, unknown values, wine-level description scope, source URL, retrieval time and index update field. Expose image, country, alcohol and ID-only grape/food/style metadata. Reject missing or ambiguous years and wrong wine IDs. No website calls, synthetic taste scores, review text or price assumptions.

Menu prices remain input from menu extraction. Website enrichment, price APIs and transport fingerprint experiments are deferred optional work. Do not claim the larger matching/extraction/ranking pipeline is implemented. Update wines#1 and PR#4 around this accepted scope. Validate offline and run one one-off GitHub Actions Algolia end-to-end check; do not add recurring live CI.
