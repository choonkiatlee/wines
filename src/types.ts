/** Vivino-shaped data; private upstream API fields may change. */
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

/** Candidate resolution is not identity verification. The caller must select the correct wine. */
export type ResolvedVivinoVintage = {
  provider: 'vivino';
  wineId: number;
  vintageId: number;
  year: number;
};
