/** Minimal Vivino HTTP client.
 * Uses Vivino's public-in-frontend Algolia search-only credentials for discovery.
 * These are unofficial endpoints: live automated access requires authorisation.
 */
import { object, requestJson } from './http.ts';
import type {
  Rating, Tastes, Vintage, Wine, WineProfile, ResolvedVivinoVintage,
  Review, ReviewOptions, FlavorReviewOptions, PaginationOptions, PageInformation,
  PageInformationOptions, Prices, CheckoutPrice,
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
  const hasYear = /^\d{4}$/.test(String(vintage.year ?? ''));
  const isFallback = s?.is_wine_rating === true || vintage.has_valid_ratings === false || !hasYear;
  const exact = s?.status === 'Normal' && !isFallback
    ? rating(s.ratings_average, s.ratings_count)
    : null;
  const allVintages = rating(s?.wine_ratings_average, s?.wine_ratings_count)
    ?? rating(w?.ratings_average, w?.ratings_count)
    ?? (isFallback ? rating(s?.ratings_average, s?.ratings_count) : null);
  return { vintage: exact, allVintages };
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(name + ' must be a positive integer');
}

function vintageYear(year: number): void {
  if (!Number.isInteger(year) || year < 1800 || year > 2100) {
    throw new RangeError('year must be a valid four-digit vintage');
  }
}

function pagination(options: PaginationOptions, params: URLSearchParams): void {
  const { perPage = 10, page = 1 } = options;
  positiveInteger(perPage, 'perPage');
  positiveInteger(page, 'page');
  params.set('per_page', String(perPage));
  params.set('page', String(page));
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error('Unexpected Vivino ' + name + ' response');
  return value;
}

export class VivinoClient {
  private readonly request: typeof fetch;
  private readonly base: string;

  constructor(options: VivinoOptions = {}) {
    this.request = options.fetch ?? fetch;
    this.base = (options.baseUrl ?? 'https://www.vivino.com').replace(/\/$/, '');
  }

  /** Same headers used by Vivino's website GET helper; no credentials or retry logic. */
  private website(path: string, params = new URLSearchParams()): Promise<Record<string, unknown>> {
    const query = params.toString();
    return requestJson(this.request, this.base + path + (query ? '?' + query : ''), {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
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
    const data = await this.website('/api/vintages/' + encodeURIComponent(vintageId));
    const vintage = object(data.vintage);
    const wine = object(vintage.wine);
    if (typeof vintage.id !== 'number' || typeof wine.id !== 'number') {
      throw new Error('Unexpected Vivino vintage response');
    }
    return vintage as Vintage;
  }

  async getTastes(wineId: number): Promise<Tastes> {
    const data = await this.website('/api/wines/' + encodeURIComponent(wineId) + '/tastes');
    return object(data.tastes) as Tastes;
  }

  /** Wine-level reviews, optionally filtered to a year and star values. One page per call. */
  async getReviews(wineId: number, options: ReviewOptions = {}): Promise<Review[]> {
    positiveInteger(wineId, 'wineId');
    const params = new URLSearchParams();
    pagination(options, params);
    if (options.year !== undefined) {
      vintageYear(options.year);
      params.set('year', String(options.year));
    }
    for (const value of options.ratings ?? []) {
      if (!Number.isFinite(value) || value < 1 || value > 5) throw new RangeError('ratings must be 1..5');
      params.append('ratings[]', String(value));
    }
    const sort = options.sort ?? 'helpful';
    if (sort !== 'helpful' && sort !== 'latest') throw new RangeError('sort must be helpful or latest');
    const endpoint = sort === 'latest' ? 'latest_reviews' : 'reviews';
    const data = await this.website('/api/wines/' + wineId + '/' + endpoint, params);
    return array(data.reviews, 'reviews') as Review[];
  }

  /** Reviews supporting selected flavor keywords from getTastes(). */
  async getReviewsWithFlavors(wineId: number, options: FlavorReviewOptions): Promise<Review[]> {
    positiveInteger(wineId, 'wineId');
    if (!options.flavorIds.length) throw new RangeError('flavorIds cannot be empty');
    const params = new URLSearchParams();
    pagination(options, params);
    for (const id of options.flavorIds) {
      positiveInteger(id, 'flavorId');
      params.append('flavor_ids[]', String(id));
    }
    if (options.categoryId !== undefined) {
      positiveInteger(options.categoryId, 'categoryId');
      params.set('category_id', String(options.categoryId));
    }
    const data = await this.website('/api/wines/' + wineId + '/reviews_with_flavors', params);
    return array(data.reviews, 'flavor reviews') as Review[];
  }

  /** Website page payload; reject any substitution when a specific year was requested. */
  async getPageInformation(wineId: number, options: PageInformationOptions = {}): Promise<PageInformation> {
    positiveInteger(wineId, 'wineId');
    const params = new URLSearchParams();
    if (options.year !== undefined) {
      vintageYear(options.year);
      params.set('year', String(options.year));
    }
    if (options.priceId !== undefined) {
      positiveInteger(options.priceId, 'priceId');
      params.set('price_id', String(options.priceId));
    }
    if (options.bottleCount !== undefined) {
      positiveInteger(options.bottleCount, 'bottleCount');
      params.set('bottle_count', String(options.bottleCount));
    }
    const data = await this.website('/api/wines/' + wineId + '/page_information', params);
    const info = object(data.page_information);
    const vintage = object(info.vintage);
    const wine = object(info.wine);
    const vintageWine = object(vintage.wine);
    if (typeof vintage.id !== 'number' || typeof wine.id !== 'number' || typeof vintageWine.id !== 'number') {
      throw new Error('Unexpected Vivino page information response');
    }
    if (wine.id !== wineId || vintageWine.id !== wineId ||
      (options.year !== undefined && Number(vintage.year) !== options.year)) {
      throw new Error('Page information does not match requested wine/year');
    }
    return info as PageInformation;
  }

  /** Market context, medians and selected offers indexed by vintage ID. Amounts are currency units. */
  async getPrices(vintageIds: number[]): Promise<Prices> {
    if (!vintageIds.length) throw new RangeError('vintageIds cannot be empty');
    const params = new URLSearchParams();
    for (const id of vintageIds) {
      positiveInteger(id, 'vintageId');
      params.append('vintage_ids[]', String(id));
    }
    const data = await this.website('/api/prices', params);
    const prices = object(data.prices);
    object(prices.vintages);
    object(prices.market);
    return prices as Prices;
  }

  /** Merchant offers across vintages; currency and bottle size remain on each offer. */
  async getCheckoutPrices(wineId: number): Promise<CheckoutPrice[]> {
    positiveInteger(wineId, 'wineId');
    const data = await this.website('/api/wines/' + wineId + '/checkout_prices');
    return array(data.checkout_prices, 'checkout prices') as CheckoutPrice[];
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
