export { VivinoAlgoliaClient } from './algolia-client.ts';
export type { VivinoAlgoliaOptions } from './algolia-client.ts';
/** Small Vivino HTTP API wrapper: search, vintage resolution and enrichment. */
export { VivinoClient, ratingsFrom } from './client.ts';
export type { VivinoOptions } from './client.ts';
export { VivinoHttpError } from './http.ts';
export type {
  Wine, Vintage, WineStats, Tastes, Rating, WineProfile, ResolvedVivinoVintage,
  IndexedVintage, AlgoliaRating, AlgoliaWineProfile,
  FlavorKeyword, Review, PaginationOptions, ReviewOptions, FlavorReviewOptions,
  PageInformationOptions, PageInformation, Currency, Market, Price, Merchant,
  PriceAvailability, Prices, CheckoutPrice,
} from './types.ts';

/** Multi-candidate enrichment for a parsed list of wine names. */
export { enrichWines } from './enrichment.ts';
export type { WineEnrichmentInput, WineEnrichmentOptions, WineEnrichmentProvider, WineEnrichmentRow, CompactWineMatch } from './enrichment.ts';
