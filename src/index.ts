/** Minimal adapter for Vivino's unofficial website JSON endpoints.
 * Live network access requires Vivino's authorisation. No anti-bot workarounds.
 * Uses standard fetch and works in TypeScript/Cloudflare Workers.
 */

export type WineStats = {
  status?: string;
  is_wine_rating?: boolean;
  ratings_average?: number;
  ratings_count?: number;
  wine_ratings_average?: number;
  wine_ratings_count?: number;
};

export type Wine = {
  id: number;
  name: string;
  winery?: { name?: string };
  region?: { name?: string; country?: { code?: string } };
  statistics?: WineStats;
  vintages?: Array<{ id: number; year: number | string }>;
};

export type Vintage = {
  id: number;
  year?: number | string;
  name?: string;
  statistics?: WineStats;
  wine: Wine;
};

export type Tastes = {
  structure?: {
    acidity?: number;
    tannin?: number;
    sweetness?: number;
    intensity?: number;
    fizziness?: number;
    user_structure_count?: number;
  };
  flavor?: Array<{
    group: string;
    primary_keywords?: Array<{ name: string }>;
  }>;
};

export type Rating = { average: number; count: number };
export type WineProfile = {
  wine: { id: number; name: string; winery?: string; region?: string; country?: string };
  vintage: { id: number; year: number | null };
  ratings: { vintage: Rating | null; allVintages: Rating | null };
  taste: ({ scope: 'wine'; structure: Tastes['structure']; flavors: Tastes['flavor'] } | null);
  sourceUrl: string;
  warnings: string[];
};

export type AlgoliaOptions = { appId: string; searchKey: string; host?: string };
export type VivinoOptions = { fetch?: typeof fetch; baseUrl?: string; algolia?: AlgoliaOptions };

export class VivinoHttpError extends Error {
  readonly status: number;
  readonly endpoint: string;
  constructor(status: number, endpoint: string) {
    super('Vivino request failed (' + status + ') for ' + endpoint);
    this.name = 'VivinoHttpError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Unexpected Vivino response shape');
  }
  return value as Record<string, unknown>;
}

function rating(average: unknown, count: unknown): Rating | null {
  return typeof average === 'number' && average > 0
    ? { average, count: typeof count === 'number' ? count : 0 }
    : null;
}

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

/** Raw retrieval plus deliberately conservative normalized output. */
export class VivinoClient {
  private readonly request: typeof fetch;
  private readonly base: string;
  private readonly algolia?: AlgoliaOptions;

  constructor(options: VivinoOptions = {}) {
    this.request = options.fetch ?? fetch;
    this.base = (options.baseUrl ?? 'https://www.vivino.com').replace(/\/$/, '');
    this.algolia = options.algolia;
  }

  private async json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const res = await this.request(url, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new VivinoHttpError(res.status, new URL(url).pathname);
    return object(await res.json());
  }

  private algoliaUrl(suffix: string): string {
    if (!this.algolia) throw new Error('Algolia configuration is required for wine search/lookup');
    return 'https://' + (this.algolia.host ?? '9takgwjuxl-dsn.algolia.net') + '/1/indexes/WINES_prod' + suffix;
  }

  private algoliaHeaders(): HeadersInit {
    if (!this.algolia) throw new Error('Missing Algolia configuration');
    return {
      'content-type': 'application/json',
      'x-algolia-application-id': this.algolia.appId,
      'x-algolia-api-key': this.algolia.searchKey,
    };
  }

  /** Returns candidates, not verified matches. */
  async searchWines(query: string, limit = 10): Promise<{ total: number; hits: Wine[] }> {
    if (!query.trim()) throw new Error('Wine search query cannot be empty');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new RangeError('limit must be 1..20');
    const data = await this.json(this.algoliaUrl('/query'), {
      method: 'POST', headers: this.algoliaHeaders(),
      body: JSON.stringify({ query, hitsPerPage: limit }),
    });
    if (!Array.isArray(data.hits)) throw new Error('Unexpected Vivino search response');
    return {
      total: typeof data.nbHits === 'number' ? data.nbHits : data.hits.length,
      hits: data.hits as Wine[],
    };
  }

  async getWine(wineId: number): Promise<Wine> {
    const data = await this.json(this.algoliaUrl('/' + encodeURIComponent(wineId)), {
      headers: this.algoliaHeaders(),
    });
    if (typeof data.id !== 'number') throw new Error('Unexpected Vivino wine response');
    return data as Wine;
  }

  async getVintage(vintageId: number): Promise<Vintage> {
    const data = await this.json(this.base + '/api/vintages/' + encodeURIComponent(vintageId));
    const vintage = object(data.vintage);
    const wine = object(vintage.wine);
    if (typeof vintage.id !== 'number' || typeof wine.id !== 'number') {
      throw new Error('Unexpected Vivino vintage response');
    }
    return vintage as Vintage;
  }

  async getTastes(wineId: number): Promise<Tastes> {
    const data = await this.json(this.base + '/api/wines/' + encodeURIComponent(wineId) + '/tastes');
    return object(data.tastes) as Tastes;
  }

  /** Do not silently replace missing vintages with an all-vintage rating. */
  async getProfileForYear(wineId: number, year: number): Promise<WineProfile> {
    const wine = await this.getWine(wineId);
    const vintage = wine.vintages?.find(v => Number(v.year) === year);
    if (!vintage) throw new Error('No verified ' + year + ' vintage found for wine ' + wineId);
    return this.getProfile(vintage.id);
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
