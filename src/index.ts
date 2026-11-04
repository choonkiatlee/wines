/** Independent wine resolution and Vivino information retrieval. */
export { VivinoClient, ratingsFrom } from './client.ts';
export type { VivinoOptions } from './client.ts';
export { AlgoliaResolver } from './algolia-resolver.ts';
export type { AlgoliaOptions, AlgoliaResolverOptions } from './algolia-resolver.ts';
export type { IWineResolver, WineSearchResult } from './wine-resolver.ts';
export { VivinoHttpError } from './http.ts';
export type { Wine, Vintage, WineStats, Tastes, Rating, WineProfile, ResolvedVivinoVintage } from './types.ts';
