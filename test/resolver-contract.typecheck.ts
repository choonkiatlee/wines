import { AlgoliaResolver } from '../src/index.ts';
import type { IWineResolver, ResolvedVivinoVintage, Wine } from '../src/index.ts';

// Concrete Algolia implementation satisfies the generic contract.
const algolia: IWineResolver<Wine, number, ResolvedVivinoVintage> =
  new AlgoliaResolver({ algolia: { appId: 'dummy', searchKey: 'dummy' } });

// A different provider can use completely different candidate/ID types.
type AlternativeCandidate = { id: string; displayName: string };
type AlternativeResolution = { source: 'catalogue'; vintageKey: string; year: number };

const alternative: IWineResolver<AlternativeCandidate, string, AlternativeResolution> = {
  async searchWines() {
    return { total: 1, candidates: [{ id: 'x-1', displayName: 'Test wine' }] };
  },
  async resolveVintage(wineId, year) {
    return { source: 'catalogue', vintageKey: `${wineId}:${year}`, year };
  },
};

void algolia;
void alternative;
