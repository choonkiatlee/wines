/** Pure client-side filtering/sorting; original indices preserve selection identities. */
import type { WineEnrichmentInput, WineType } from '../../../src/enrichment.ts';
import type { FullWineRow, Selection } from './selection.ts';
import { ratingFor, selectedProfile } from './selection.ts';

export type TypeFilter = WineType | 'unknown' | 'all';
export type SortKey = 'original' | 'rating-desc' | 'rating-asc' | 'type';

export const WINE_TYPE_LABELS: Record<WineType, string> = {
  red: 'Red', white: 'White', rose: 'Rosé', sparkling: 'Sparkling',
  dessert: 'Dessert', fortified: 'Fortified',
};

const TYPES_BY_ID: Readonly<Record<number, WineType>> = {
  1: 'red', 2: 'white', 3: 'sparkling', 4: 'rose', 7: 'dessert', 24: 'fortified',
};

export type VisibleRow = {
  index: number;
  type: WineType | 'unknown';
  rating: number | null;
};

export function wineTypeFor(
  input: WineEnrichmentInput,
  row: FullWineRow,
  selection: Selection,
): WineType | 'unknown' {
  const profile = selectedProfile(row, selection);
  const indexed = profile?.wine.typeId;
  if (typeof indexed === 'number' && Object.hasOwn(TYPES_BY_ID, indexed)) {
    return TYPES_BY_ID[indexed];
  }
  // Fall back to the user's explicit category only when the source is missing.
  return input.type ?? 'unknown';
}

/** Null/unrated scores always sort last, including for low-to-high ordering. */
export function visibleRows(
  inputs: readonly WineEnrichmentInput[],
  rows: readonly FullWineRow[],
  selections: readonly Selection[],
  typeFilter: TypeFilter,
  sort: SortKey,
): VisibleRow[] {
  if (inputs.length !== rows.length || selections.length !== rows.length) {
    throw new RangeError('Input, result and selection lengths must match');
  }
  const visible: VisibleRow[] = rows.map((row, index) => {
    const profile = selectedProfile(row, selections[index]);
    const score = profile ? ratingFor(profile)?.average ?? null : null;
    return { index, type: wineTypeFor(inputs[index], row, selections[index]), rating: score };
  }).filter(entry => typeFilter === 'all' || entry.type === typeFilter);

  if (sort === 'original') return visible;
  return visible.sort((a, b) => {
    if (sort === 'type') {
      if (a.type === 'unknown' && b.type !== 'unknown') return 1;
      if (b.type === 'unknown' && a.type !== 'unknown') return -1;
      return (WINE_TYPE_LABELS[a.type as WineType] ?? '').localeCompare(
        WINE_TYPE_LABELS[b.type as WineType] ?? '') || a.index - b.index;
    }
    if (a.rating === null && b.rating !== null) return 1;
    if (b.rating === null && a.rating !== null) return -1;
    if (a.rating === null && b.rating === null) return a.index - b.index;
    const difference = sort === 'rating-desc' ? b.rating! - a.rating! : a.rating! - b.rating!;
    return difference || a.index - b.index;
  });
}
