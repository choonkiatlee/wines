/** Candidate retrieval and enrichment, not automatic wine identification. */
import { VivinoAlgoliaClient } from '../packages/vivino-client/src/algolia-client.ts';
import type { AlgoliaWineProfile, Wine } from '../packages/vivino-client/src/types.ts';

/** Wine category as printed on a restaurant menu; absent means no category restriction. */
export type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
const WINE_TYPE_IDS: Record<WineType, number> = {
  red: 1, white: 2, sparkling: 3, rose: 4, dessert: 7, fortified: 24,
};
/** Optional restaurant-menu context, ignored by wine matching and kept with input rows. */
export type WineMenuMetadata = Record<string, string | number | boolean | null>;
export type WineEnrichmentInput = {
  name: string;
  year?: number;
  type?: WineType;
  /** Numeric price as listed on the restaurant menu; currency not inferred. */
  menuPrice?: number;
  metadata?: WineMenuMetadata;
};
export type CompactWineMatch = {
  name: string;
  year: number | null;
  rating: { score: number; count: number | null; scope: 'vintage' | 'overall' } | null;
  description: string | null;
  url: string | null;
};
export type WineEnrichmentRow<T> = { matches: T[]; error?: 'upstream_unavailable' };
export type WineEnrichmentProvider = Pick<VivinoAlgoliaClient, 'searchWines' | 'getProfile' | 'getProfileForYear'>;
export type WineEnrichmentOptions = {
  returnAll?: boolean;
  /** Maximum concurrent upstream requests across the entire batch; default 4. */
  concurrency?: number;
  /** Optional client injection, useful for tests. */
  client?: WineEnrichmentProvider;
};

const STOPWORDS = new Set(['a', 'and', 'chateau', 'cuvee', 'd', 'da', 'de', 'del', 'des', 'di', 'do', 'domaine', 'du', 'et', 'la', 'le', 'les', 'of', 'the']);

function tokens(value: string): string[] {
  const raw = value.toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) ?? [];
  const joined: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].length === 1 && i + 1 < raw.length && raw[i + 1].length === 1) {
      let initial = raw[i];
      while (i + 1 < raw.length && raw[i + 1].length === 1) initial += raw[++i];
      joined.push(initial);
    } else joined.push(raw[i]);
  }
  return joined;
}
function significant(value: string): string[] {
  return [...new Set(tokens(value).filter(t => !STOPWORDS.has(t)))];
}
/**
 * Search-only normalization. Do not discard the original or translate genuine cuvée words.
 * These are retailer/packaging descriptors, not winery identities.
 */
function identityName(name: string): string {
  return name.trim()
    .replace(/\([^)]*\bsmall bottle\b[^)]*\)/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:cl|ml|litres?|liters?)\b/gi, ' ')
    .replace(/\b(?:red|white|ros[ée])\s+(?:boxed\s+)?wine\b/gi, ' ')
    .replace(/\bboxed\s+wine\b/gi, ' ')
    .replace(/\btaste\s+the\s+difference\b/gi, ' ')
    .replace(/\bnon[\s-]?vintage\b/gi, ' ')
    .replace(/[,\s]+/g, ' ').trim();
}

/** A scoped alias observed for one actual wine, not a general-purpose translation dictionary. */
function labelAliases(value: string): string[] {
  if (/^veuve\s+clicquot\b/i.test(value) && /\byellow\s+label\b/i.test(value)) {
    return [
      value.replace(/\byellow\s+label\b/i, '').replace(/\s+/g, ' ').trim(),
      value.replace(/\byellow\s+label\b/i, 'Carte Jaune'),
    ];
  }
  return [];
}
function matchingName(name: string): string {
  const clean = identityName(name);
  if (/^veuve\s+clicquot\b/i.test(clean)) return clean.replace(/\byellow\s+label\b/i, 'Carte Jaune');
  return clean;
}
function searchQueries(name: string): string[] {
  const original = name.trim().replace(/\s+/g, ' ');
  const clean = identityName(original);
  const words = significant(clean);
  const folded = tokens(clean).join(' ');
  const edges = words.length >= 4 ? words[0] + ' ' + words.at(-1) : '';
  const short = words.slice(0, 3).join(' ');
  const seen = new Set<string>();
  return [original, clean, ...labelAliases(clean), folded, edges, short].filter(query => {
    const key = query.toLowerCase();
    if (!query || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

/** One insertion/deletion/substitution or adjacent transposition for reasonably long tokens. */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const different = [...a].filter((ch, i) => ch !== b[i]).length;
    if (different === 1) return true;
    if (different === 2) {
      for (let i = 0; i < a.length - 1; i++) {
        if (a[i] !== b[i] && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true;
      }
    }
    return false;
  }
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  for (let i = 0; i < longer.length; i++) {
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  }
  return false;
}
/** Token coverage includes joined/split spellings: 'Crazy Lud' <-> 'Crazylud'. */
function overlap(query: string[], candidate: string[]): number {
  const covered = query.map(word => candidate.some(other => similar(word, other)));
  for (let i = 0; i < query.length - 1; i++) {
    if (candidate.some(other => similar(query[i] + query[i + 1], other))) {
      covered[i] = true;
      covered[i + 1] = true;
    }
  }
  for (let i = 0; i < query.length; i++) {
    for (let j = 0; j < candidate.length - 1; j++) {
      if (similar(query[i], candidate[j] + candidate[j + 1])) covered[i] = true;
    }
  }
  return covered.filter(Boolean).length;
}

/** Use indexed winery tokens to locate the producer prefix; compare the remaining cuvee independently.
 * A leading alias such as 'Oszkar' is treated as part of 'Oszkar Maurer' even if winery is just 'Maurer'.
 */
function cuveeTokens(query: string[], winery: string[]): string[] {
  if (!winery.length) return [];
  let producerEnd = -1;
  let producerStart = -1;
  for (let i = 0; i < query.length; i++) {
    if (winery.some(word => similar(query[i], word))) {
      if (producerStart < 0) producerStart = i;
      producerEnd = i;
    } else if (producerEnd >= 0) break;
  }
  // Winery matches deep inside the label are often accidental word overlap
  // (e.g. "Dark" in "Tall Dark Stranger" after "The Wanderer After Dark").
  if (producerEnd < 0 || producerStart > 1) return [];
  return query.slice(producerEnd + 1).filter(word => !winery.some(producer => similar(word, producer)));
}
function relevance(input: WineEnrichmentInput, wine: Wine): number | null {
  const query = significant(matchingName(input.name));
  const name = significant(wine.name);
  const winery = significant(wine.winery?.name ?? '');
  const region = significant(wine.region?.name ?? '');
  if (!query.length) return null;
  // The Algolia wine record includes type_id. A verified conflicting type is not
  // a plausible candidate; missing or unfamiliar type_ids remain eligible.
  const indexedType = wine.type_id;
  if (input.type !== undefined &&
    typeof indexedType === 'number' &&
    Object.values(WINE_TYPE_IDS).includes(indexedType) &&
    indexedType !== WINE_TYPE_IDS[input.type]) return null;
  const nameHits = overlap(query, name);
  const wineryHits = overlap(query, winery);
  // The producer normally starts the label. Do not treat a stray word like
  // "Dark" in a different producer's name as equivalent producer evidence.
  // The second slot accommodates an optional leading alias (Oszkar Maurer).
  const producerAnchor = winery.some(word => similar(query[0], word)) ? 45
    : winery.some(word => similar(query[1] ?? '', word)) ? 25 : 0;
  const relevantHits = overlap(query, [...name, ...winery]);
  // A long input with neither an early producer anchor nor a substantially
  // matching wine name should abstain. Shared grape/marketing words alone
  // are not evidence for substituting another producer.
  const earlyProducer = overlap(query.slice(0, 2), winery) > 0;
  const nameIdentity = overlap(query, name) >= Math.ceil(query.length * 0.75);
  if (query.length >= 3 && !earlyProducer && !nameIdentity) return null;
  const hits = overlap(query, [...name, ...winery, ...region]);
  const threshold = Math.max(1, Math.ceil(query.length * 0.5));
  const cuvee = cuveeTokens(query, winery);
  const cuveeHits = overlap(cuvee, [...name, ...region]);
  // A producer-only result for a named cuvee is worse than no candidate.
  // Partial cuvee agreement is allowed, so variants and nearby cuvees can still appear.
  // A long label may contain more packaging terms than wine-identity terms.
  // Relax the global coverage threshold only with independent evidence of an
  // early producer and a matching wine name; cuvee validation still applies.
  const anchoredCore = query.length >= 5 && producerAnchor > 0 && nameHits > 0;
  if (relevantHits < 1 || (hits < threshold && !anchoredCore) ||
    (cuvee.length > 0 && cuveeHits === 0)) return null;
  const exactName = tokens(wine.name).join(' ') === tokens(matchingName(input.name)).join(' ');
  const exactFull = tokens([wine.winery?.name, wine.name].filter(Boolean).join(' ')).join(' ') === tokens(matchingName(input.name)).join(' ');
  const vintageAvailable = input.year !== undefined && wine.vintages?.some(v => Number(v.year) === input.year);
  const typeBonus = input.type !== undefined && indexedType === WINE_TYPE_IDS[input.type] ? 12 : 0;
  const extraNameTokens = Math.max(0, name.length - overlap(name, [...query, ...winery]));
  return 100 * hits / query.length + 20 * nameHits / query.length +
    6 * wineryHits / query.length + (exactName || exactFull ? 55 : 0) +
    (cuvee.length ? 45 * cuveeHits / cuvee.length +
      (cuveeHits === cuvee.length ? 12 : 0) - 10 * (cuvee.length - cuveeHits) : 0) +
    (vintageAvailable ? 3 : 0) + typeBonus + producerAnchor - 3 * extraNameTokens -
    Math.max(0, name.length + winery.length - query.length) * 0.3;
}
/** Rank candidates by wine identity, not the Algolia hit order or review popularity. */
function scored(input: WineEnrichmentInput, candidates: Wine[]): Array<{ wine: Wine; index: number; score: number }> {
  return candidates.map((wine, index) => ({ wine, index, score: relevance(input, wine) }))
    .filter((entry): entry is { wine: Wine; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index || a.wine.id - b.wine.id);
}
function rank(input: WineEnrichmentInput, candidates: Wine[]): Wine[] {
  const ranked = scored(input, candidates);
  const query = significant(matchingName(input.name));
  const top = ranked[0]?.wine;
  const topNameCoverage = top ? overlap(query, significant(top.name)) : 0;
  const veryStrongName = !!top && query.length >= 4 && topNameCoverage >= query.length - 1;
  const topWinery = significant(top?.winery?.name ?? '');
  return ranked.filter(({ wine }) => {
    const candidateName = significant(wine.name);
    // A known distinct bottling (e.g. Veuve Yellow Label / Moët Impérial)
    // must not turn into rosé just because producer + champagne match.
    if (input.type === 'sparkling' && /\bchampagne\b/i.test(input.name) &&
      !tokens(input.name).includes('rose') && tokens(wine.name).includes('rose')) return false;
    // A verified scoped alias is defining identity, not merely a search hint.
    if (/^veuve\s+clicquot\b/i.test(input.name) && /\byellow\s+label\b/i.test(input.name) &&
      !(candidateName.includes('carte') && candidateName.includes('jaune'))) return false;
    // Once the leading winery has been identified, another producer sharing
    // the grape or a marketing token is not a useful alternative.
    const producerWords = Math.min(2, topWinery.length);
    if (top && top.id !== wine.id && producerWords > 0 &&
      overlap(query.slice(0, 2), topWinery) >= producerWords &&
      overlap(topWinery, significant(wine.winery?.name ?? '')) < producerWords) return false;
    // Strong full-name evidence should outrank, and exclude, a wrong producer
    // that shares the region/grape but misses the distinctive wine-name phrase.
    if (veryStrongName && wine.id !== top!.id &&
      overlap(query, candidateName) <= topNameCoverage - 2 &&
      overlap(topWinery, significant(wine.winery?.name ?? '')) === 0) return false;
    return true;
  }).map(entry => entry.wine);
}
function hasStrongIdentity(input: WineEnrichmentInput, ranked: Wine[]): boolean {
  const top = ranked[0];
  if (!top) return false;
  const query = significant(matchingName(input.name));
  const name = significant(top.name);
  const winery = significant(top.winery?.name ?? '');
  if (!query.length) return false;
  const wineryAtStart = overlap(query.slice(0, 2), winery) >= 1;
  const nameHits = overlap(query, name);
  const cuvee = cuveeTokens(query, winery);
  const cuveeHits = overlap(cuvee, name);
  const exact = tokens(top.name).join(' ') === tokens(matchingName(input.name)).join(' ');
  const full = overlap(query, [...name, ...winery]) === query.length;
  // Never stop on three approximate matches with no distinctive cuvée evidence.
  return exact || (wineryAtStart && full && (!cuvee.length || cuveeHits === cuvee.length)) ||
    (nameHits >= 3 && nameHits >= query.length - 1);
}
function limitConcurrency(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function scheduled<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
          active--;
          waiting.shift()?.();
        });
      };
      if (active < max && waiting.length === 0) run();
      else waiting.push(run);
    });
  };
}
function shortDescription(description: string | null): string | null {
  if (!description) return null;
  const clean = description.replace(/\s+/g, ' ').trim();
  if (clean.length <= 240) return clean || null;
  const slice = clean.slice(0, 239);
  const boundary = slice.lastIndexOf(' ');
  return (boundary >= 160 ? slice.slice(0, boundary) : slice) + '…';
}
function compact(profile: AlgoliaWineProfile): CompactWineMatch {
  const vintage = profile.ratings.vintage;
  const rating = vintage ?? profile.ratings.allVintages;
  const winery = profile.wine.winery;
  const wineName = profile.wine.name;
  const name = winery && !tokens(wineName).join(' ').includes(tokens(winery).join(' '))
    ? `${winery} ${wineName}` : wineName;
  return {
    name, year: profile.vintage?.year ?? null,
    rating: rating ? { score: rating.average, count: rating.count, scope: vintage ? 'vintage' : 'overall' } : null,
    description: shortDescription(profile.description?.text ?? null), url: profile.sourceUrl ?? null,
  };
}
function vintageMissing(error: unknown, year: number): boolean {
  return error instanceof Error && (error.message.startsWith(`No ${year} vintage found`) ||
    error.message.startsWith(`Ambiguous ${year} vintage`));
}

export function enrichWines(inputs: readonly WineEnrichmentInput[], options: WineEnrichmentOptions & { returnAll: true }): Promise<WineEnrichmentRow<AlgoliaWineProfile>[]>;
export function enrichWines(inputs: readonly WineEnrichmentInput[], options?: WineEnrichmentOptions & { returnAll?: false }): Promise<WineEnrichmentRow<CompactWineMatch>[]>;
export function enrichWines(inputs: readonly WineEnrichmentInput[], options: WineEnrichmentOptions): Promise<WineEnrichmentRow<CompactWineMatch | AlgoliaWineProfile>[]>;
export async function enrichWines(inputs: readonly WineEnrichmentInput[], options: WineEnrichmentOptions = {}): Promise<WineEnrichmentRow<CompactWineMatch | AlgoliaWineProfile>[]> {
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new RangeError('concurrency must be 1..16');
  for (const input of inputs) {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new TypeError('Each wine needs a nonempty name');
    if (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1800 || input.year > 2100))
      throw new RangeError('year must be a valid four-digit vintage');
    if (input.type !== undefined && (typeof input.type !== 'string' || !Object.hasOwn(WINE_TYPE_IDS, input.type)))
      throw new TypeError('type must be red, white, rose, sparkling, dessert, or fortified');
  }
  const client = options.client ?? new VivinoAlgoliaClient();
  const scheduled = limitConcurrency(concurrency);
  // Promise caches are scoped to one batch, so failures and stale profiles are never retained across calls.
  const searches = new Map<string, Promise<Wine[]>>();
  const profiles = new Map<string, Promise<AlgoliaWineProfile>>();
  function find(query: string): Promise<Wine[]> {
    let pending = searches.get(query);
    if (!pending) {
      pending = scheduled(async () => (await client.searchWines(query, 15)).candidates);
      searches.set(query, pending);
    }
    return pending;
  }
  function getProfile(candidate: Wine, year?: number): Promise<AlgoliaWineProfile> {
    const key = candidate.id + ':' + (year ?? 'overall');
    let pending = profiles.get(key);
    if (!pending) {
      pending = (async () => {
        if (year === undefined) return scheduled(() => client.getProfile(candidate.id));
        const knownVintages = candidate.vintages;
        if (Array.isArray(knownVintages) && !knownVintages.some(v => Number(v.year) === year)) {
          const overall = await scheduled(() => client.getProfile(candidate.id));
          return { ...overall, warnings: [...overall.warnings, `Requested ${year} vintage not indexed; using wine-level profile`] };
        }
        try { return await scheduled(() => client.getProfileForYear(candidate.id, year)); }
        catch (error) {
          if (!vintageMissing(error, year)) throw error;
          const overall = await scheduled(() => client.getProfile(candidate.id));
          return { ...overall, warnings: [...overall.warnings, `Requested ${year} vintage not confirmed; using wine-level profile`] };
        }
      })();
      profiles.set(key, pending);
    }
    return pending;
  }
  return Promise.all(inputs.map(async input => {
    const found = new Map<number, Wine>();
    let failed = false;
    for (const query of searchQueries(input.name)) {
      try {
        for (const candidate of await find(query)) if (!found.has(candidate.id)) found.set(candidate.id, candidate);
      } catch { failed = true; }
      const ranked = rank(input, [...found.values()]);
      // Three superficially plausible hits can still all belong to the wrong
      // producer when promotional words dominate a longer label.
      if (hasStrongIdentity(input, ranked)) break;
    }
    const top = rank(input, [...found.values()]).slice(0, 3);
    const profilesByRank = await Promise.all(top.map(candidate => getProfile(candidate, input.year).catch(() => {
      failed = true;
      return null;
    })));
    const matches = profilesByRank.filter((p): p is AlgoliaWineProfile => p !== null)
      .map(p => options.returnAll ? p : compact(p));
    return { matches, ...(failed ? { error: 'upstream_unavailable' as const } : {}) };
  }));
}
