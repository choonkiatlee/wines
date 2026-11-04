/** Read-only Vivino enrichment by previously resolved vintage ID.
 * No Algolia keys or search implementation belong here; an optional resolver
 * is injected for convenient wine ID + year lookups.
 * Live use of unofficial endpoints requires authorisation from Vivino.
 */
import { object, requestJson } from './http.ts';
import type { IWineResolver } from './wine-resolver.ts';
import type { Rating, Tastes, Vintage, WineProfile } from './types.ts';

export type VivinoOptions = { fetch?: typeof fetch; baseUrl?: string; resolver?: IWineResolver };

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
  private readonly resolver?: IWineResolver;

  constructor(options: VivinoOptions = {}) {
    this.request = options.fetch ?? fetch;
    this.base = (options.baseUrl ?? 'https://www.vivino.com').replace(/\/$/, '');
    this.resolver = options.resolver;
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

  /**
   * Resolve an exact year via the injected strategy, then enrich by vintage ID.
   * Direct getProfile(vintageId) does not require a resolver.
   */
  async getProfileForYear(wineId: number, year: number): Promise<WineProfile> {
    if (!this.resolver) {
      throw new Error('No wine resolver configured; inject an IWineResolver or call getProfile(vintageId)');
    }
    const resolved = await this.resolver.resolveVintage(wineId, year);
    if (
      resolved.provider !== 'vivino' || resolved.wineId !== wineId ||
      resolved.year !== year || !Number.isSafeInteger(resolved.vintageId) ||
      resolved.vintageId <= 0
    ) {
      throw new Error('Resolver returned an inconsistent Vivino vintage identity');
    }
    const profile = await this.getProfile(resolved.vintageId);
    if (profile.wine.id !== wineId || profile.vintage.year !== year) {
      throw new Error('Resolved vintage information does not match requested wine/year');
    }
    return profile;
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
