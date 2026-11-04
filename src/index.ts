/** Small Vivino HTTP API wrapper: search, vintage resolution and enrichment. */
export { VivinoClient, ratingsFrom } from './client.ts';
export type { VivinoOptions } from './client.ts';
export { VivinoHttpError } from './http.ts';
export type {
  Wine, Vintage, WineStats, Tastes, Rating, WineProfile, ResolvedVivinoVintage,
} from './types.ts';
