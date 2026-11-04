# Vivino Website Data Implementation Plan

> Implement inline with superpowers:executing-plans; use test-first verification.

**Goal:** Incorporate observed website review, taste and price responses into VivinoClient.
**Architecture:** One client, shared website GET helper, upstream-shaped exported data types. Existing profile calls remain unchanged.
**Tech Stack:** TypeScript, native fetch, node:test.
**Spec:** docs/superpowers/specs/2026-11-04-vivino-website-data-design.md

## Constraints
Preserve Algolia search and existing signatures; add no dependencies or scheduled CI. Return market and vintage context with prices. Reject year substitutions and label tastes wine-level.

## Review focus
Nullable structure/flavor fields; false vintage-rating validity; U.V. records; array query encoding; malformed successful responses; empty prices and API failures.

## Task 1: Website data contracts
- [x] Add failing tests in test/website.test.mjs for website headers, review filters/sort, flavor reviews, page information and mismatches, prices/checkout context, malformed responses, invalid queries, and rating fallback.
- [x] Run npm test and confirm new cases fail while baseline passes.
- [x] Extend src/types.ts and src/index.ts with upstream response types. Add methods/helper in src/client.ts and correct ratingsFrom.
- [x] Run npm test and npm run typecheck; inspect failures and fix.

## Task 2: Documentation and delivery
- [x] Update README methods, examples, scope and market caveats.
- [x] Run a live smoke check for new methods without adding CI; distinguish access failures from offline tests.
- [x] Review complete diff, commit, and open a focused PR.

Verification: baseline 10/10; new tests reproduced absent methods/headers and rating fallback bugs; final suite 22/22 and typecheck passed. Six manual live client calls succeeded.

Review: independent read-only review found no critical or important issues and independently reran 22 tests plus typecheck. Deferred minor: dedicated empty price-map/checkout-array fixtures (current behavior accepts both). Ruling: retain existing shallow envelope validation rather than introduce a complete upstream runtime schema; nested malformed records remain a caller/upstream contract risk.
