/** Compatibility entry point: provider is an independent subproject. */
export * from '../packages/vivino-client/src/index.ts';

/** Multi-candidate enrichment for a parsed list of wine names. */
export { enrichWines } from './enrichment.ts';
export type {
  WineEnrichmentInput, WineType, WineEnrichmentOptions,
  WineEnrichmentProvider, WineEnrichmentRow, CompactWineMatch,
} from './enrichment.ts';
