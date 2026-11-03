/** Public entrypoint: resolution and enrichment are independently usable. */
export { VivinoClient, ratingsFrom } from './client.ts';
export type { VivinoOptions } from './client.ts';
export { VivinoResolver } from './resolver.ts';
export type { AlgoliaOptions, ResolverOptions } from './resolver.ts';
export { VivinoHttpError } from './http.ts';
export type { Wine, Vintage, WineStats, Tastes, Rating, WineProfile, ResolvedVivinoVintage } from './types.ts';
