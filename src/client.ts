/** Read-only Vivino enrichment by previously resolved vintage ID.
 * No Algolia keys, wine search or resolver injection belong here.
 * Live use of unofficial endpoints requires authorisation from Vivino.
 */
import { object, requestJson } from './http.ts';
import type { Rating, Tastes, Vintage, WineProfile } from './types.ts';

export type VivinoOptions = { fetch?: typeof fetch; baseUrl?: string };

function rating(average: unknown, count: unknown): Rating | null {
  return typeof average === 'number' && average > 0
    ? { average, count: typeof count === 'number' ? count : 0 }
    : null;
}

/** Treat a cross-vintage fallback as cross-vintage, never as the requested year's rating. */
export function ratingsFrom(vintage: Vintage): WineProfile['ratings'] {
  const s = vintage.statistics;
  const w = vintage.wine.statistics;
  const exact = s?.status === 'Normal' && s.is_wine_rating !== true
    ? rating(s.ratings_average, s.ratings_count)
    : null;
  const allVintages = rating(s?.wine_ratings_average, s?.wine_ratings_count)
    ?? rating(w?.ratings_average, w?.ratings_count)
    ?? (s?.is_wine_rating ? rating(s.ratings_average, s.ratings_count) : null);
  return { vintage: exact, allVintages };
}

export class VivinoClient {
  private readonly request: typeof fetch;
  private readonly base: string;

  constructor(options: VivinoOptions = {}) {
    this.request = options.fetch ?? fetch;
    this.base = (options.baseUrl ?? 'https://www.vivino.com').replace(/\/$/, '');
  }

  async getVintage(vintageId: number): Promise<Vintage> {
    const data = await requestJson(this.request, this.base + '/api/vintages/' + encodeURIComponent(vintageId));
    const vintage = object(data.vintage);
    const wine = object(vintage.wine);
    if (typeof vintage.id !== 'number' || typeof wine.id !== 'number') {
      throw new Error('Unexpected Vivino vintage response');
    }
    return vintage as Vintage;
  }

  async getTastes(wineId: number): Promise<Tastes> {
    const data = await requestJson(this.request, this.base + '/api/wines/' + encodeURIComponent(wineId) + '/tastes');
    return object(data.tastes) as Tastes;
  }

  async getProfile(vintageId: number): Promise<WineProfile> {
    const vintage = await this.getVintage(vintageId);
    const warnings: string[] = [];
    let tastes: Tastes | null = null;
    try {
      tastes = await this.getTastes(vintage.wine.id);
    } catch {
      warnings.push('Wine-level taste data unavailable');
    }
    const ratings = ratingsFrom(vintage);
    if (!ratings.vintage) warnings.push('No verified vintage-specific rating');
    const year = typeof vintage.year === 'number' ? vintage.year
      : /^\d{4}$/.test(vintage.year ?? '') ? Number(vintage.year) : null;
    const w = vintage.wine;
    return {
      wine: { id: w.id, name: w.name, winery: w.winery?.name, region: w.region?.name, country: w.region?.country?.code },
      vintage: { id: vintage.id, year },
      ratings,
      taste: tastes ? { scope: 'wine', structure: tastes.structure, flavors: tastes.flavor } : null,
      sourceUrl: 'https://www.vivino.com/w/' + w.id + (year ? '?year=' + year : ''),
      warnings,
    };
  }
}
