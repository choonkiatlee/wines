# Primary Algolia client implementation

Spec: ../specs/2026-11-04-vivino-algolia-primary-design.md

- [x] Write failing contracts for primary indexed profiles, scopes/counts, metadata, exact years, invalid input and website isolation.
- [x] Implement the concrete Algolia client and exported types; delegate legacy discovery without changing website profile signatures.
- [x] Run all offline tests and typecheck; update primary examples and provider scope.
- [x] Review the new client and fix material findings.
- [x] Run one-off live Actions end-to-end validation; update wines#1 and the existing feature PR with current results.

Baseline: 22 tests. New primary contracts initially failed because the class did not exist; 35 tests and typecheck pass after implementation. No production TLS changes or new dependencies. Missing counts stay null; a missing exact year throws. Existing website enrichment remains experimental.

Final review found one count-scope bug: explicit overall fallback counts could be labelled vintage counts. A regression test failed first; the guard now preserves those as null while genuine below-threshold vintage counts survive. Final suite: 36 passing; typecheck and diff checks pass. Live primary Actions run 41855364544 passed with five HTTP 200 indexed requests, preceding only the offline-tested fallback-count guard. Deferred minor scope: comprehensive nested runtime validation and contradictory duplicates sharing the same ID; no generic schema layer introduced.
