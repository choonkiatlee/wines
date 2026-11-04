import type { ResolvedVivinoVintage, Wine } from './types.ts';

/** Search returns candidates; selection/verification remains the caller's responsibility. */
export interface IWineResolver {
  searchWines(query: string, limit?: number): Promise<{ total: number; hits: Wine[] }>;
  getWine(wineId: number): Promise<Wine>;
  resolveVintage(wineId: number, year: number): Promise<ResolvedVivinoVintage>;
}
