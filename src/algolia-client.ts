/** Primary wine data client. Every read goes to Vivino's own Algolia index. */
import { object, requestJson } from './http.ts';
import type { Wine, WineStats, IndexedVintage, AlgoliaRating, AlgoliaWineProfile, ResolvedVivinoVintage } from './types.ts';
// Vivino's frontend Algolia application and search-only key (not MCP credentials).
// Publicly embedded in Vivino's frontend; NOT evidence of permission to scrape.
const ALGOLIA_INDEX_URL = 'https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod';
const ALGOLIA_APP_ID = '9TAKGWJUXL';
const ALGOLIA_SEARCH_ONLY_KEY = '60c11b2f1068885161d95ca068d3a6ae';

export type VivinoAlgoliaOptions = { fetch?: typeof fetch };

function identifier(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(label + ' must be a positive integer');
}
function yearValue(year: number): void {
  if (!Number.isInteger(year) || year < 1800 || year > 2100) throw new RangeError('year must be a valid four-digit vintage');
}
function wineFrom(value: unknown): Wine {
  const w = object(value);
  if (!Number.isSafeInteger(w.id) || (w.id as number) <= 0 || typeof w.name !== 'string' || !w.name.trim() ||
    (w.vintages != null && !Array.isArray(w.vintages))) throw new Error('Unexpected Vivino indexed wine response');
  return w as Wine;
}
function exactVintage(wine: Wine, year: number): IndexedVintage {
  const matches = (wine.vintages ?? []).filter(v => v && /^\d{4}$/.test(String(v.year)) && Number(v.year) === year);
  if (!matches.length) throw new Error('No ' + year + ' vintage found for wine ' + wine.id);
  if (new Set(matches.map(v => v.id)).size > 1) throw new Error('Ambiguous ' + year + ' vintage for wine ' + wine.id);
  const vintage = matches[0];
  identifier(vintage.id, 'vintageId');
  return vintage;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function indexedRating(s?: WineStats): AlgoliaRating | null {
  const average = s?.ratings_average;
  return s?.status === 'Normal' && typeof average === 'number' && Number.isFinite(average) && average >= 1 && average <= 5
    ? { average, count: count(s.ratings_count), reviewsCount: count(s.reviews_count) } : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function ids(value: unknown): number[] | null {
  return Array.isArray(value) && value.every(v => Number.isSafeInteger(v) && v > 0) ? value : null;
}
function profile(w: Wine, v?: IndexedVintage): AlgoliaWineProfile {
  const warnings: string[] = [];
  const vintageRating = v && v.has_valid_ratings !== false && v.statistics?.is_wine_rating !== true
    ? indexedRating(v.statistics) : null;
  const allVintages = indexedRating(w.statistics);
  if (v && !vintageRating) warnings.push('No verified vintage-specific rating in the index');
  if (!allVintages) warnings.push('No all-vintage rating in the index');
  const description = text(w.description);
  const image = text(w.image?.location);
  return {
    wine: { id: w.id, name: w.name, winery: text(w.winery?.name), region: text(w.region?.name),
      country: text(typeof w.region?.country === 'string' ? w.region.country : w.region?.country?.code),
      alcohol: numeric(w.alcohol), closure: text(w.closure), nonVintage: typeof w.non_vintage === 'boolean' ? w.non_vintage : null,
      grapeIds: ids(w.grapes), foodIds: ids(w.foods), styleId: count(w.style_id),
      imageUrl: image?.startsWith('//') ? 'https:' + image : image },
    vintage: v ? { id: v.id, year: Number(v.year) } : null,
    ratings: { vintage: vintageRating, allVintages },
    vintageCounts: v ? { ratings: count(v.statistics?.ratings_count), reviews: count(v.statistics?.reviews_count) } : null,
    description: description ? { scope: 'wine', text: description } : null,
    source: 'vivino-algolia', retrievedAt: new Date().toISOString(), indexUpdatedAt: text(w.updated_at),
    sourceUrl: 'https://www.vivino.com/w/' + w.id + (v ? '?year=' + v.year : ''), warnings,
  };
}

export class VivinoAlgoliaClient {
  private readonly request: typeof fetch;
  constructor(options: VivinoAlgoliaOptions = {}) { this.request = options.fetch ?? fetch; }

  private headers(): HeadersInit {
    return { 'content-type': 'application/json', 'x-algolia-application-id': ALGOLIA_APP_ID, 'x-algolia-api-key': ALGOLIA_SEARCH_ONLY_KEY };
  }

  /** Candidates only. The caller must verify the producer and cuvee before selecting a wine. */
  async searchWines(query: string, limit = 10): Promise<{ total: number; candidates: Wine[] }> {
    if (!query.trim()) throw new Error('Wine search query cannot be empty');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new RangeError('limit must be 1..20');
    const data = await requestJson(this.request, ALGOLIA_INDEX_URL + '/query', {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ query, hitsPerPage: limit }),
    });
    if (!Array.isArray(data.hits)) throw new Error('Unexpected Vivino search response');
    return { total: count(data.nbHits) ?? data.hits.length, candidates: data.hits.map(wineFrom) };
  }

  async getWine(wineId: number): Promise<Wine> {
    identifier(wineId, 'wineId');
    const w = wineFrom(await requestJson(this.request, ALGOLIA_INDEX_URL + '/' + wineId, { headers: this.headers() }));
    if (w.id !== wineId) throw new Error('Indexed wine does not match requested wineId');
    return w;
  }

  async resolveVintage(wineId: number, year: number): Promise<ResolvedVivinoVintage> {
    yearValue(year);
    const v = exactVintage(await this.getWine(wineId), year);
    return { provider: 'vivino', wineId, vintageId: v.id, year };
  }

  /** Wine-level profile, without guessing a vintage. This argument is a wine ID, not a vintage ID. */
  async getProfile(wineId: number): Promise<AlgoliaWineProfile> { return profile(await this.getWine(wineId)); }

  /** One index lookup, exact year only; no website calls or implicit enrichment. */
  async getProfileForYear(wineId: number, year: number): Promise<AlgoliaWineProfile> {
    yearValue(year);
    const w = await this.getWine(wineId);
    return profile(w, exactVintage(w, year));
  }
}
