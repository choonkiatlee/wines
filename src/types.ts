/** Vivino-shaped data; private upstream API fields may change. */
export type WineStats = {
  status?: string;
  is_wine_rating?: boolean;
  ratings_average?: number;
  ratings_count?: number;
  reviews_count?: number;
  wine_ratings_average?: number;
  wine_ratings_count?: number;
};

export type IndexedVintage = {
  id: number;
  year: number | string;
  name?: string;
  statistics?: WineStats;
  has_valid_ratings?: boolean;
};

export type Wine = {
  id: number;
  name: string;
  winery?: { name?: string };
  region?: { name?: string; country?: string | { code?: string } };
  statistics?: WineStats;
  vintages?: IndexedVintage[] | null;
  description?: string | null;
  alcohol?: number | null;
  closure?: string | null;
  non_vintage?: boolean;
  style_id?: number | null;
  grapes?: number[] | null;
  foods?: number[] | null;
  image?: { location?: string; variations?: Record<string, string> } | null;
  updated_at?: string;
};

export type Vintage = {
  id: number;
  has_valid_ratings?: boolean;
  year?: number | string;
  name?: string;
  statistics?: WineStats;
  wine: Wine;
};

export type FlavorKeyword = { id?: number; name: string; count?: number; image?: string };
export type Tastes = {
  structure?: {
    acidity?: number | null;
    tannin?: number | null;
    sweetness?: number | null;
    intensity?: number | null;
    fizziness?: number | null;
    user_structure_count?: number;
    calculated_structure_count?: number;
  } | null;
  flavor?: Array<{
    group: string;
    stats?: { count?: number; score?: number; mentions_count?: number };
    primary_keywords?: FlavorKeyword[];
    secondary_keywords?: FlavorKeyword[];
  }> | null;
};

export type Review = {
  id: number;
  rating: number;
  note?: string | null;
  language?: string;
  created_at?: string;
  user?: { id: number; alias?: string; [key: string]: unknown };
  vintage?: Vintage;
  activity?: unknown;
  tagged_note?: unknown;
};
export type PaginationOptions = { perPage?: number; page?: number };
export type ReviewOptions = PaginationOptions & {
  year?: number;
  ratings?: number[];
  sort?: 'helpful' | 'latest';
};
export type FlavorReviewOptions = PaginationOptions & { flavorIds: number[]; categoryId?: number };
export type PageInformationOptions = { year?: number; priceId?: number; bottleCount?: number };
export type Currency = { code: string; name?: string; prefix?: string | null; suffix?: string | null };
export type Market = { country: string; state?: string | null; currency?: Currency };
export type Price = {
  id?: number;
  vintage_id?: number;
  amount: number;
  type?: string;
  currency?: Currency;
  amount_in_usd?: number;
  discounted_from?: number | null;
  bottle_type_id?: number;
  bottle_type?: { id?: number; name?: string; volume_ml?: number; [key: string]: unknown };
  inventory_bottles_count?: number | null;
  url?: string;
  [key: string]: unknown;
};
export type Merchant = { id: number; name?: string; [key: string]: unknown };
export type PriceAvailability = {
  vintage: { id: number; year?: number | string; has_valid_ratings?: boolean };
  median?: { amount: number; type?: string; discounted_from?: number | null } | null;
  price?: Price | null;
  [key: string]: unknown;
};
export type Prices = { market: Market; vintages: Record<string, PriceAvailability> };
export type CheckoutPrice = {
  availability: PriceAvailability;
  merchants_with_prices: Array<{ merchant: Merchant; prices: Price[] }>;
};
export type PageInformation = {
  wine: Wine;
  vintage: Vintage;
  tastes?: Tastes | null;
  price?: Price | null;
  merchant?: Merchant | null;
  checkout_prices?: {
    market?: Market;
    price_selection?: { price?: Price | null; merchant?: Merchant | null } | null;
    vintages?: CheckoutPrice[];
  } | null;
  sold_out?: boolean;
  [key: string]: unknown;
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

/** Candidate resolution is not identity verification. The caller must select the correct wine. */
export type ResolvedVivinoVintage = {
  provider: 'vivino';
  wineId: number;
  vintageId: number;
  year: number;
};

/** Ratings observed in the index; missing counts are not assumed to be zero. */
export type AlgoliaRating = { average: number; count: number | null; reviewsCount: number | null };
export type AlgoliaWineProfile = {
  wine: {
    id: number; name: string; winery: string | null; region: string | null; country: string | null;
    alcohol: number | null; closure: string | null; nonVintage: boolean | null;
    grapeIds: number[] | null; foodIds: number[] | null; styleId: number | null; imageUrl: string | null;
  };
  vintage: { id: number; year: number } | null;
  ratings: { vintage: AlgoliaRating | null; allVintages: AlgoliaRating | null };
  vintageCounts: { ratings: number | null; reviews: number | null } | null;
  description: { scope: 'wine'; text: string } | null;
  source: 'vivino-algolia';
  retrievedAt: string;
  indexUpdatedAt: string | null;
  sourceUrl: string;
  warnings: string[];
};
