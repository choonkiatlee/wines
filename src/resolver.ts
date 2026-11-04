/** Discovery and vintage-ID resolution only. Not responsible for wine details.
 * Uses an Algolia search configuration; does not implement fuzzy matching/verification.
 * Live use of unofficial endpoints requires authorisation from Vivino.
 */
import { requestJson } from './http.ts';
import type { IWineResolver } from './wine-resolver.ts';
import type { ResolvedVivinoVintage, Wine } from './types.ts';

export type AlgoliaOptions = { appId: string; searchKey: string; host?: string };
export type AlgoliaResolverOptions = { fetch?: typeof fetch; algolia: AlgoliaOptions };
/** @deprecated Use AlgoliaResolverOptions. */
export type ResolverOptions = AlgoliaResolverOptions;

export class AlgoliaResolver implements IWineResolver {
  private readonly request: typeof fetch;
  private readonly algolia: AlgoliaOptions;

  constructor(options: AlgoliaResolverOptions) {
    if (!options.algolia?.appId || !options.algolia?.searchKey) {
      throw new Error('Algolia configuration required for wine resolution');
    }
    this.request = options.fetch ?? fetch;
    this.algolia = options.algolia;
  }

  private url(suffix: string): string {
    return 'https://' + (this.algolia.host ?? '9takgwjuxl-dsn.algolia.net')
      + '/1/indexes/WINES_prod' + suffix;
  }

  private headers(): HeadersInit {
    return {
      'content-type': 'application/json',
      'x-algolia-application-id': this.algolia.appId,
      'x-algolia-api-key': this.algolia.searchKey,
    };
  }

  /** Returns candidates; the caller must confirm the right producer/cuvée. */
  async searchWines(query: string, limit = 10): Promise<{ total: number; hits: Wine[] }> {
    if (!query.trim()) throw new Error('Wine search query cannot be empty');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new RangeError('limit must be 1..20');
    const data = await requestJson(this.request, this.url('/query'), {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ query, hitsPerPage: limit }),
    });
    if (!Array.isArray(data.hits)) throw new Error('Unexpected Vivino search response');
    return {
      total: typeof data.nbHits === 'number' ? data.nbHits : data.hits.length,
      hits: data.hits as Wine[],
    };
  }

  async getWine(wineId: number): Promise<Wine> {
    const data = await requestJson(this.request, this.url('/' + encodeURIComponent(wineId)), {
      headers: this.headers(),
    });
    if (typeof data.id !== 'number') throw new Error('Unexpected Vivino wine response');
    return data as Wine;
  }

  /** Match a requested year against the selected wine's indexed vintages. No fallback. */
  async resolveVintage(wineId: number, year: number): Promise<ResolvedVivinoVintage> {
    if (!Number.isInteger(year) || year < 1800 || year > 2100) {
      throw new RangeError('year must be a valid four-digit vintage');
    }
    const wine = await this.getWine(wineId);
    const vintage = wine.vintages?.find(v => Number(v.year) === year);
    if (!vintage || !Number.isInteger(vintage.id) || vintage.id <= 0) {
      throw new Error('No ' + year + ' vintage found for wine ' + wineId);
    }
    return { provider: 'vivino', wineId, vintageId: vintage.id, year };
  }
}

/** @deprecated Use AlgoliaResolver. */
export { AlgoliaResolver as VivinoResolver };
