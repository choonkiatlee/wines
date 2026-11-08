# Agent instructions — wines

These instructions describe the repository architecture and an **optional, user-triggered** failure-improvement procedure. The regression procedure below is **not a standing instruction for every task**.

## Scope and architecture

- **Keep `packages/vivino-client/` a standalone TypeScript client.** The primary source is `VivinoAlgoliaClient` (Vivino's Algolia index). The higher-level menu matching/enrichment logic lives in `src/enrichment.ts`; the Pages app consumes that library.
- Preserve `enrichWines([{ name, year?, type? }])` and the current compact output: up to three **candidate** matches containing canonical name, confirmed year/null, correctly scoped rating/null, description/null, URL/null. `returnAll: true` exposes normalized profiles. **Candidates are not verified identities**; the caller makes the final choice.
- Prefer generic retrieval, normalization, producer/cuvée ranking, negative evidence, and abstention over one-off retailer rules. Do not introduce scraping, a catalogue-ingestion system, infrastructure, an LLM call, API fields, or provider dependencies unless explicitly requested. Keep test experiments small and throwaway.

## Sainsbury’s live checks on GitHub Actions

**A live Sainsbury’s catalogue request from a GitHub-hosted runner can return an expected upstream `403 Forbidden`.** The known response is an Akamai EdgeSuite HTML page titled `Access Denied`. Node fetch and curl both reproduced it. A follow-up probe also reproduced it across HTTP and TLS versions and with or without `RSC: 1`. The same Node release returned the catalogue through the development workspace’s proxy. The specific Akamai rule is unknown. [Hosted-runner diagnostic](https://github.com/choonkiatlee/wines/actions/runs/42514406825)

For this signature, report the live check as **blocked by upstream access**. Use `npm test` for normal CI and run `node --experimental-strip-types scripts/check-sainsburys-catalogue.mjs` from an environment with working access when live verification is needed. Investigate other response signatures and offline failures separately. Keep hosted live Sainsbury’s checks diagnostic and separate from required CI.

## Failure-driven API improvement workflow — EXPLICIT OPT-IN ONLY

**Trigger:** Use the following regression and live-validation workflow **only when the user explicitly instructs you to improve the wine-matching/enrichment API based on observed failed or incorrect matches** (for example, "improve the API using these failures", or "fix these wine-matching failures and add regression tests").

**Otherwise do not automatically invoke this workflow.** In particular:
- A request to look up wines, investigate results, diagnose a failure, test the client, create a UI, update documentation, or implement an unrelated feature **does not authorize** adding new golden cases, modifying ranking logic, running the live regression benchmark, creating an improvement PR, or merging to master under this procedure.
- Do not automatically ingest menus, create permanent datasets, or turn every failed lookup into a regression case. Only do that when explicitly asked to improve matching from failures.
- For other development tasks, follow the user's actual scope, and run appropriate ordinary tests; neither a live Vivino benchmark nor a squash-merge is automatically required by this file.
- If the user requests only a plan or issue, stop at the requested deliverable; don't implement or merge the work.

**Once explicitly invoked**, follow the remainder of this section and the validation section below.

The permanent, curated regression data is `test/fixtures/wine-matching-regressions.json`; the generic runner is `test/wine-matching-regressions.test.mjs`, using `test/lib/wine-matching-cases.mjs`.

1. **Reproduce each new failure first.** Record the **original** name/year/type, the **independently verified Vivino wine ID** (not merely Algolia's first hit), any IDs that must be excluded, why the previous result was wrong, and the evidence/source. Check the exact producer, cuvée, edition, wine colour, and vintage if relevant.
2. Append one case to the existing fixture. Give it a unique `id`, `input`, `expected` (`topId`, `mustIncludeIds`, `mustExcludeIds` and/or `empty`), `reason`, `source`, and a **small frozen `candidates` list** (wine IDs, names, wineries, indexed type and optional region/vintages). Use `searchResults`/ `defaultIds` only when testing query-dependent retrieval. Avoid whole menu or supermarket catalogue dumps.
3. Set `verified: true` **only** for established ground truth. If identity is uncertain, set `verified: false` and retain the case as a pending lead; never fabricate a correct ID or weaken an expectation to turn a failing test green. Set `live: false` only for deliberately simulated/offline-only cases, such as a correct result omitted from the candidate pool.
4. Run the generic offline test; ideally observe it **fail before the fix** and pass after. Fix the matching logic in `src/enrichment.ts`. Preserve previously working controls and legitimate ambiguities. Don't change golden IDs just because upstream Algolia ordering or ratings changed.
5. Tests compare **wine IDs**, not popularity, scores, rating counts, or display-string equality. Use `enrichWines(..., { client: mockProvider, returnAll: true })`. Keep the entire normal suite deterministic and network-free.

Illustrative fixture case (the existing file contains the full schema and examples):

```json
{
  "id": "veuve-yellow-label",
  "input": { "name": "Veuve Clicquot Yellow Label Brut Champagne", "type": "sparkling" },
  "expected": { "topId": 1128385, "mustExcludeIds": [23051] },
  "verified": true,
  "reason": "Yellow Label is Carte Jaune, not Brut Rosé",
  "source": "Verified Vivino producer/cuvée lookup",
  "candidates": [
    { "id": 1128385, "name": "Brut (Carte Jaune) Champagne", "winery": "Veuve Clicquot", "type_id": 3 },
    { "id": 23051, "name": "Brut Rosé Champagne", "winery": "Veuve Clicquot", "type_id": 3 }
  ]
}
```

## Validation and live Vivino check — only within the explicitly invoked workflow

1. If the user requested implementation, develop on a feature branch and open a PR against `master` that links the issue and describes the corrected/wrong matches.
2. Run `npm install --no-audit --no-fund`, `npm run typecheck`, `npm run typecheck -w @choonkiatlee/vivino-client`, and `npm test`. If Pages code or integration is affected, also run `npm run pages:build`. Fix all regressions rather than deleting cases.
3. **For this explicitly requested failure-improvement task, before merging, run the live Vivino check** with the current branch's code. Use the manually dispatched GitHub Actions workflow `.github/workflows/wine-matching-live.yml` (workflow name **Wine matching regression and live Vivino check**), selecting the feature branch; alternatively run `node --experimental-strip-types scripts/benchmark-wine-matching.mjs` in an environment with working Vivino Algolia access. The live benchmark reads the same `verified: true` cases except those marked `live: false`, and produces `wine-matching-live-results.json`. **Never auto-update the golden fixture from live results.**
4. Review per-case observed/expected IDs, **Top-1, Recall@3, known-wrong hits, abstention, upstream errors and search/profile call counts** against the prior baseline. Link the actual Actions run and JSON artifact (or equivalent captured report) in the PR; report any remaining mismatches explicitly. The benchmark is a *pre-merge check*, not part of deterministic unit-test CI.
5. If Vivino is blocked or unavailable, document the attempt and error. **Do not call the live gate passed** or merge solely on mocks; get an explicit decision to defer or accept an exception. Likewise, investigate any newly incorrect control before merging.
6. If the user authorized implementation through merge, when offline tests and live checks pass, **squash-merge the PR into `master`**, confirm the resulting master files/commit and resolve the issue. If the request was only to prepare a PR, leave it unmerged. The live gate is not required for documentation-only or otherwise unrelated changes.

## Reporting and hygiene

- **When the opt-in failure-improvement workflow was requested**, report the PR/merge link, test totals, live run URL, fixed and still-uncertain cases, and whether code reached `master`. For other tasks, report only what is relevant to the user's request.
- Keep raw experiments, transient workflow probes, generated live JSON, and retailer catalogue dumps out of `master` unless intentionally requested. Retain only reusable test fixtures, scripts, and documented commands.
- Related details: `docs/enrichment.md`, `README.md`, and [issue #14](https://github.com/choonkiatlee/wines/issues/14).
