import type { ResolvedVivinoVintage, Wine } from './types.ts';

/**
 * Swappable wine-search and vintage-resolution strategy.
 *
 * Implementations may use Algolia or another index, but must return Vivino
 * wine/vintage IDs: VivinoClient enriches those IDs using Vivino endpoints.
 * Other providers can implement this contract if they can map to Vivino IDs.
 *
 * A search result is a candidate, not a verified producer/cuvée match.
 */
export interface IWineResolver {
  searchWines(query: string, limit?: number): Promise<{ total: number; hits: Wine[] }>;
  getWine(wineId: number): Promise<Wine>;
  resolveVintage(wineId: number, year: number): Promise<ResolvedVivinoVintage>;
}
