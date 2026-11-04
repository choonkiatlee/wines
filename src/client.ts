/** Minimal Vivino HTTP client.
 * Uses Vivino's public-in-frontend Algolia search-only credentials for discovery.
 * These are unofficial endpoints: live automated access requires authorisation.
 */
import { object, requestJson } from './http.ts';
import type {
  Rating, Tastes, Vintage, Wine, WineProfile, ResolvedVivinoVintage,
} from './types.ts';

// Vivino's frontend Algolia application and search-only key (not MCP credentials).
// Publicly embedded in Vivino's frontend; NOT evidence of permission to scrape.
const ALGOLIA_INDEX_URL = 'https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod';
const ALGOLIA_APP_ID = '9TAKGWJUXL';
const ALGOLIA_SEARCH_ONLY_KEY = '60c11b2f1068885161d95ca068d3a6ae';

export type VivinoOptions = { fetch?: typeof fetch; baseUrl?: string };

function rating(average: unknown, count: unknown): Rating | null {
  return typeof average === 'number' && average > 0
    ? { average, count: typeof count === 'number' ? count : 0 }
    : null;
}

/** Treat an all-vintages fallback as all-vintages, never the requested year's rating. */
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

  private algoliaHeaders(): HeadersInit {
    return {
      'content-type': 'application/json',
      'x-algolia-application-id': ALGOLIA_APP_ID,
      'x-algolia-api-key': ALGOLIA_SEARCH_ONLY_KEY,
    };
  }

  /** Algolia returns candidate wines, not verified producer/cuvée matches. */
  async searchWines(query: string, limit = 10): Promise<{ total: number; candidates: Wine[] }> {
    if (!query.trim()) throw new Error('Wine search query cannot be empty');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new RangeError('limit must be 1..20');
    }
    const data = await requestJson(this.request, ALGOLIA_INDEX_URL + '/query', {
      method: 'POST',
      headers: this.algoliaHeaders(),
      body: JSON.stringify({ query, hitsPerPage: limit }),
    });
    if (!Array.isArray(data.hits)) throw new Error('Unexpected Vivino search response');
    return {
      total: typeof data.nbHits === 'number' ? data.nbHits : data.hits.length,
      candidates: data.hits as Wine[],
    };
  }

  /** Fetch a candidate wine and its list of indexed vintages from Vivino's Algolia index. */
  async getWine(wineId: number): Promise<Wine> {
    const data = await requestJson(
      this.request,
      ALGOLIA_INDEX_URL + '/' + encodeURIComponent(wineId),
      { headers: this.algoliaHeaders() },
    );
    if (typeof data.id !== 'number') throw new Error('Unexpected Vivino wine response');
    return data as Wine;
  }

  /** Match an exact year; never silently substitute a different year or U.V. */
  async resolveVintage(wineId: number, year: number): Promise<ResolvedVivinoVintage> {
    if (!Number.isInteger(year) || year < 1800 || year > 2100) {
      throw new RangeError('year must be a valid four-digit vintage');
    }
    const wine = await this.getWine(wineId);
    const vintage = wine.vintages?.find(v => Number(v.year) === year);
    if (!vintage || !Number.isSafeInteger(vintage.id) || vintage.id <= 0) {
      throw new Error('No ' + year + ' vintage found for wine ' + wineId);
    }
    return { provider: 'vivino', wineId, vintageId: vintage.id, year };
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

  /** Resolve using Vivino's index, then ensure the resulting profile matches the request. */
  async getProfileForYear(wineId: number, year: number): Promise<WineProfile> {
    const resolved = await this.resolveVintage(wineId, year);
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
