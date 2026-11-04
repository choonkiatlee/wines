/** Public entrypoint: interchangeable resolution and Vivino enrichment. */
export { VivinoClient, ratingsFrom } from './client.ts';
export type { VivinoOptions } from './client.ts';
export { AlgoliaResolver, VivinoResolver } from './resolver.ts';
export type { AlgoliaOptions, AlgoliaResolverOptions, ResolverOptions } from './resolver.ts';
export type { IWineResolver } from './wine-resolver.ts';
export { VivinoHttpError } from './http.ts';
export type { Wine, Vintage, WineStats, Tastes, Rating, WineProfile, ResolvedVivinoVintage } from './types.ts';
