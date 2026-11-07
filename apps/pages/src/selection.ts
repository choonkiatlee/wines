/** Browser-only presentation state for candidate review. No provider or ranking logic. */
import type { AlgoliaWineProfile } from '../../../packages/vivino-client/src/types.ts';
import type { WineEnrichmentRow, EnrichedWineProfile } from '../../../src/enrichment.ts';

export type FullWineRow = WineEnrichmentRow<EnrichedWineProfile>;
export type Selection = { index: number | null; chosen: boolean };
export type WineRatingView = {
  average: number;
  count: number | null;
  reviewsCount: number | null;
  scope: 'vintage' | 'overall';
};

/** Top-ranked candidate is only a suggestion until someone explicitly chooses it. */
export function initialSelections(rows: readonly FullWineRow[]): Selection[] {
  return rows.map(row => ({ index: row.matches.length ? 0 : null, chosen: false }));
}

/** Immutable selection update; null means "none of these". */
export function chooseCandidate(
  rows: readonly FullWineRow[],
  selections: readonly Selection[],
  rowIndex: number,
  candidateIndex: number | null,
): Selection[] {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length ||
      selections.length !== rows.length) throw new RangeError('Unknown wine row');
  if (candidateIndex !== null &&
      (!Number.isInteger(candidateIndex) || candidateIndex < 0 ||
       candidateIndex >= rows[rowIndex].matches.length)) throw new RangeError('Unknown candidate');
  return selections.map((selection, i) =>
    i === rowIndex ? { index: candidateIndex, chosen: true } : selection);
}

export function selectedProfile(
  row: FullWineRow,
  choice: Selection,
): AlgoliaWineProfile | null {
  return choice.index === null ? null : row.matches[choice.index] ?? null;
}

/** Never label the wine-wide score as an exact-vintage score. */
export function ratingFor(profile: AlgoliaWineProfile): WineRatingView | null {
  const vintage = profile.ratings.vintage;
  if (vintage) return { ...vintage, scope: 'vintage' };
  const overall = profile.ratings.allVintages;
  return overall ? { ...overall, scope: 'overall' } : null;
}

export function displayWineName(profile: AlgoliaWineProfile): string {
  const name = profile.wine.name.trim();
  const winery = profile.wine.winery?.trim();
  return winery && !name.toLocaleLowerCase().includes(winery.toLocaleLowerCase())
    ? winery + ' · ' + name : name;
}

export function selectionSummary(
  rows: readonly FullWineRow[],
  choices: readonly Selection[],
): { total: number; noCandidates: number; chosen: number; upstreamErrors: number } {
  return {
    total: rows.length,
    noCandidates: rows.filter(row => row.matches.length === 0).length,
    chosen: choices.filter(choice => choice.chosen).length,
    upstreamErrors: rows.filter(row => row.error).length,
  };
}
