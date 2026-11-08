import { SainsburysClient } from '@choonkiatlee/sainsburys-client';
import type { SainsburysCategoryPage, SainsburysProduct } from '@choonkiatlee/sainsburys-client';

/** The shared shape for retailer wine records; retailer adapters own their source-specific mapping. */
export interface RetailerWine {
  retailer: string;
  productId: string; // ID is unique within the retailer, not globally.
  name: string; // Unmodified source display name.
  sourceUrl?: string;
  retrievedAt: string;
  wineType?: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified';
  vintage?: number;
  bottleSizeMl?: number;
  availableOnline?: boolean;
  prices: {
    currency: 'GBP';
    /** Original retail_price, which can already be a Nectar price. */
    sourceRetailMinor?: number;
    regularMinor?: number;
    publicDiscountedMinor?: number;
    nectarMinor?: number;
  };
  /** Conditional promotions only; they are never treated as a single-item price. */
  conditionalOffers: RetailerConditionalOffer[];
}

export interface RetailerConditionalOffer {
  kind: 'multibuy' | 'meal_deal' | 'other';
  description?: string;
  nectar?: boolean;
  sourcePromotionId?: string;
}

export interface RetailerWinePage {
  retailer: string;
  wines: RetailerWine[];
  retrievedAt: string;
  pagination: {
    page: number;
    totalPages: number;
    /** From the unfiltered upstream category; NOT the total number of wines. */
    sourceTotal: number;
    sourceReturned: number;
    included: number;
  };
}

export interface RetailerWineSource {
  fetchPage(options?: { page?: number; signal?: AbortSignal }): Promise<RetailerWinePage>;
}

export const SAINSBURYS_WINE_CATEGORY = '/groceries/browse/beer-wine-and-spirits/wine/c:1019462';
const sainsburysOrigin = 'https://www.sainsburys.co.uk';
type NativeRecord = Record<string, unknown>;

function record(value: unknown): NativeRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as NativeRecord : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Convert a verified GBP decimal amount into integer pence without floating-point noise. */
function minor(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  const pence = Math.round(value * 100);
  return Number.isSafeInteger(pence) && Math.abs(value * 100 - pence) < 1e-6 ? pence : undefined;
}

function productUrl(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  const candidate = raw.startsWith('://') ? 'https' + raw :
    raw.startsWith('/gol-ui/product/') ? sainsburysOrigin + raw : raw;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname === 'www.sainsburys.co.uk' &&
      url.pathname.startsWith('/gol-ui/product/') ? url.href : undefined;
  } catch { return undefined; }
}

function categoryNames(product: SainsburysProduct): string[] {
  return Array.isArray(product.categories)
    ? product.categories.map(x => str(record(x)?.name)).filter((x): x is string => !!x)
    : [];
}

/** Filter only strong non-wine evidence. Missing fields and mixed/unclear evidence stay in the list. */
function clearlyNotWine(product: SainsburysProduct): boolean {
  const name = product.name.toLowerCase();
  if (/\b(?:wine\s+(?:vinegar|gums|glass(?:es)?|openers?|stoppers?|racks?|bags?|coolers?|preservers?|aerators?|decant(?:ers?|ing))|corkscrews?|bottle\s+openers?|champagne\s+flutes?)\b/i.test(name)) return true;
  if (/\b(?:vinegar|chutney|sauce|crisps|chocolates|sweets)\b/i.test(name) && /\bwine\b/i.test(name)) return true;
  const explicitWine = /\b(?:wines?|champagne|prosecco|cava|cr[eé]mant|sherry|port(?:\s+wine)?|madeira|sauternes)\b/i.test(name);
  const otherDrink = /\b(?:beer|lager|ale|stout|cider|gin|vodka|whisk(?:y|ey)|rum|tequila|brandy|liqueur|tonic\s+water)\b/i.test(name);
  const strongWine = /\b(?:wines?|champagne|prosecco|cava|cr[eé]mant|sherry|port\s+wine|madeira|sauternes)\b/i.test(name);
  if (otherDrink && !strongWine) return true;
  const categories = categoryNames(product).map(x => x.toLowerCase());
  return !explicitWine && categories.some(x => /^(?:beer|cider|spirits|soft drinks|non-alcoholic spirits|vinegar|wine accessories|glassware)$/.test(x));
}

function wineType(product: SainsburysProduct): RetailerWine['wineType'] {
  const name = product.name;
  const categories = categoryNames(product);
  const evidence = [name, ...categories].join(' | ');
  if (/\b(?:champagne|prosecco|cava|cr[eé]mant|sparkling\s+wine|sekt|franciacorta)\b/i.test(evidence)) return 'sparkling';
  if (/\b(?:sherry|port\s*(?:wine)?|madeira|marsala)\b/i.test(evidence)) return 'fortified';
  if (/\b(?:dessert\s+wine|ice\s+wine|eiswein|sauternes)\b/i.test(evidence)) return 'dessert';
  if (/(?:\b(?:rose|rosé)(?=\W|$)|\bblush\b)/i.test(evidence)) return 'rose';
  if (/\bred\s+wine\b/i.test(evidence)) return 'red';
  if (/\bwhite\s+wine\b/i.test(evidence)) return 'white';
  return undefined;
}

function vintage(name: string): number | undefined {
  if (/\b(?:non[ -]?vintage|N\.?V\.?)\b/i.test(name)) return undefined;
  const years = [...name.matchAll(/\b(19\d\d|20\d\d)\b/g)].map(m => Number(m[1]));
  return years.length === 1 ? years[0] : undefined;
}

function bottleSize(name: string): number | undefined {
  // Multi-packs and boxes have a package price, not a verified single-bottle size.
  if (/\b(?:\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ml|cl|l)|pack\s+of\s+\d+|\d+\s*pack|box(?:ed)?\s+wine)\b/i.test(name)) return undefined;
  const found = [...name.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/gi)];
  if (found.length !== 1) return undefined;
  const amount = Number(found[0][1]);
  const multiplier = { ml: 1, cl: 10, l: 1000 }[found[0][2].toLowerCase() as 'ml' | 'cl' | 'l'];
  const ml = amount * multiplier;
  return ml > 0 && Number.isSafeInteger(ml) ? ml : undefined;
}

function promotions(product: SainsburysProduct): NativeRecord[] {
  return Array.isArray(product.promotions) ? product.promotions.map(record).filter((p): p is NativeRecord => !!p) : [];
}

function offerKind(p: NativeRecord): RetailerConditionalOffer['kind'] | undefined {
  const type = str(p.promo_type) ?? '';
  const group = str(p.promo_group) ?? '';
  if (type === 'SIMPLE_FIXED_PRICE') return undefined;
  if (/MULTIBUY|MULTI_BUY/.test(type) || group === 'multi_buy') return 'multibuy';
  if (/MEAL/.test(type) || group === 'meal_deal') return 'meal_deal';
  return 'other';
}

function prices(product: SainsburysProduct): RetailerWine['prices'] {
  const sourceRetailMinor = minor(record(product.retail_price)?.price);
  const p = promotions(product);
  const simple = p.filter(x => x.promo_type === 'SIMPLE_FIXED_PRICE');
  const otherUnclear = p.some(x => x.promo_type !== 'SIMPLE_FIXED_PRICE' && offerKind(x) === 'other');
  const result: RetailerWine['prices'] = { currency: 'GBP' };
  if (sourceRetailMinor !== undefined) result.sourceRetailMinor = sourceRetailMinor;
  if (sourceRetailMinor === undefined) return result;

  if (simple.length === 0 && !otherUnclear) {
    result.regularMinor = sourceRetailMinor;
  } else if (simple.length === 1 && !otherUnclear) {
    const offer = simple[0];
    // A missing is_nectar is not evidence of a public offer.
    if (offer.is_nectar === true) result.nectarMinor = sourceRetailMinor;
    if (offer.is_nectar === false) result.publicDiscountedMinor = sourceRetailMinor;
    const originalMinor = minor(offer.original_price);
    if (typeof offer.is_nectar === 'boolean' && originalMinor !== undefined && originalMinor >= sourceRetailMinor) {
      result.regularMinor = originalMinor;
    }
  }
  // Conflicting or unrecognised single-item promotions: preserve the source retail amount, not a guessed tier.
  return result;
}

/** Pure transformation; does not request details, use the network or call Vivino. */
export function mapSainsburysProduct(product: SainsburysProduct, retrievedAt: string): RetailerWine | null {
  if (clearlyNotWine(product)) return null;
  const url = productUrl(product.full_url) ?? productUrl(product.pdp_deep_link);
  const wine: RetailerWine = {
    retailer: 'sainsburys',
    productId: product.product_uid,
    name: product.name,
    retrievedAt,
    prices: prices(product),
    conditionalOffers: promotions(product)
      .map(p => {
        const kind = offerKind(p);
        if (!kind) return undefined;
        const offer: RetailerConditionalOffer = { kind };
        const description = str(p.strap_line);
        if (description) offer.description = description;
        if (typeof p.is_nectar === 'boolean') offer.nectar = p.is_nectar;
        const id = str(p.promotion_uid);
        if (id) offer.sourcePromotionId = id;
        return offer;
      })
      .filter((offer): offer is RetailerConditionalOffer => !!offer),
  };
  if (url) wine.sourceUrl = url;
  const type = wineType(product);
  if (type) wine.wineType = type;
  const year = vintage(product.name);
  if (year !== undefined) wine.vintage = year;
  const size = bottleSize(product.name);
  if (size !== undefined) wine.bottleSizeMl = size;
  if (typeof product.is_available === 'boolean') wine.availableOnline = product.is_available;
  return wine;
}

export function mapSainsburysPage(page: SainsburysCategoryPage): RetailerWinePage {
  const wines = page.products
    .map(product => mapSainsburysProduct(product, page.retrievedAt))
    .filter((wine): wine is RetailerWine => wine !== null);
  return {
    retailer: 'sainsburys',
    wines,
    retrievedAt: page.retrievedAt,
    pagination: {
      page: page.pagination.page,
      totalPages: page.pagination.totalPages,
      sourceTotal: page.pagination.total,
      sourceReturned: page.pagination.returned,
      included: wines.length,
    },
  };
}

/** Sainsbury’s transport is delegated entirely to the raw grocery client. */
export class SainsburysWineAdapter implements RetailerWineSource {
  private readonly client: Pick<SainsburysClient, 'listCategoryPage'>;

  constructor(client: Pick<SainsburysClient, 'listCategoryPage'> = new SainsburysClient()) {
    this.client = client;
  }

  async fetchPage(options: { page?: number; signal?: AbortSignal } = {}): Promise<RetailerWinePage> {
    const raw = await this.client.listCategoryPage(SAINSBURYS_WINE_CATEGORY, options);
    return mapSainsburysPage(raw);
  }
}
