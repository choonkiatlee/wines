# Primary Algolia client implementation

Spec: ../specs/2026-11-04-vivino-algolia-primary-design.md

- [x] Write failing contracts for primary indexed profiles, scopes/counts, metadata, exact years, invalid input and website isolation.
- [x] Implement the concrete Algolia client and exported types; delegate legacy discovery without changing website profile signatures.
- [x] Run all offline tests and typecheck; update primary examples and provider scope.
- [ ] Review the new client and fix material findings.
- [ ] Run one-off live Actions end-to-end validation; update wines#1 and the existing feature PR with current results.

Baseline: 22 tests. New primary contracts initially failed because the class did not exist; 35 tests and typecheck pass after implementation. No production TLS changes or new dependencies. Missing counts stay null; a missing exact year throws. Existing website enrichment remains experimental.
