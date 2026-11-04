/** Provider-independent contract for candidate discovery and vintage resolution.
 *
 * Type parameters represent a provider's candidate, wine identifier, and
 * resolved identity. This contract intentionally imports no Vivino types.
 *
 * Search returns candidates, not verified producer/cuvee matches.
 */
export interface WineSearchResult<TCandidate> {
  total: number;
  candidates: TCandidate[];
}

export interface IWineResolver<TCandidate, TWineId, TResolved> {
  searchWines(query: string, limit?: number): Promise<WineSearchResult<TCandidate>>;
  resolveVintage(wineId: TWineId, year: number): Promise<TResolved>;
}
