type NativeRecord = Record<string, unknown>;

export interface SainsburysProduct extends NativeRecord {
  product_uid: string;
  name: string;
}

export interface SainsburysPagination {
  page: number;
  total: number;
  returned: number;
  totalPages: number;
}

export interface SainsburysCategoryPage {
  products: SainsburysProduct[];
  pagination: SainsburysPagination;
  retrievedAt: string;
}

export interface SainsburysPageOptions {
  page?: number;
  signal?: AbortSignal;
}

const origin = 'https://www.sainsburys.co.uk';
const categoryPattern = /^\/groceries\/browse\/(?:[a-z0-9-]+\/)+c:\d+\/?$/i;

function isRecord(value: unknown): value is NativeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProduct(value: unknown): value is SainsburysProduct {
  return isRecord(value) && typeof value.product_uid === 'string' &&
    value.product_uid.length > 0 && typeof value.name === 'string';
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodePage(body: string, category: string, requestedPage: number): Omit<SainsburysCategoryPage, 'retrievedAt'> {
  let products: SainsburysProduct[] | undefined;
  let productPage: unknown;
  let pageData: NativeRecord | undefined;
  let pageControls: NativeRecord | undefined;

  // The Flight stream carries the listing, product counts and page controls in separate JSON rows.
  for (const row of body.split('\n')) {
    if (!row.includes('"productImpressions"') && !row.includes('"data_productList_numberOfProducts"') &&
      !row.includes('"categoryBasePath"')) continue;
    const match = /^[0-9a-f]+:(\["\$".*)$/i.exec(row);
    if (!match) continue;
    let element: unknown;
    try {
      element = JSON.parse(match[1]);
    } catch (cause) {
      throw new Error('Sainsbury’s returned invalid category listing JSON', { cause });
    }
    if (!Array.isArray(element) || !isRecord(element[3])) continue;
    const props = element[3];

    if (props.eventName === 'productImpressions') {
      if (products || !Array.isArray(props.products) || !props.products.every(isProduct)) {
        throw new Error('Sainsbury’s returned invalid or ambiguous category products');
      }
      products = props.products;
      productPage = props.pageNumber;
    }
    if (isRecord(props.data) && 'data_productList_numberOfProducts' in props.data) {
      if (pageData) throw new Error('Sainsbury’s returned ambiguous category pagination');
      pageData = props.data;
    }
    if ('categoryBasePath' in props && ('current' in props || 'total' in props)) {
      if (pageControls) throw new Error('Sainsbury’s returned ambiguous category page controls');
      pageControls = props;
    }
  }

  const page = pageData?.data_page_number;
  const total = pageData?.data_productList_numberOfProducts;
  const returned = pageData?.data_productList_numberOfProductsShown;
  if (!isCount(page) || page === 0 || !isCount(total) || !isCount(returned) || returned > total) {
    throw new Error('Sainsbury’s returned invalid or missing category pagination');
  }
  if (page !== requestedPage) {
    throw new Error(`Sainsbury’s requested page ${requestedPage} but reported page ${page}`);
  }
  if (products && String(productPage) !== String(page)) {
    throw new Error(`Sainsbury’s product rows do not match reported page ${page}`);
  }
  if (returned !== (products?.length ?? 0) || (total > 0 && returned === 0)) {
    throw new Error(`Sainsbury’s returned an inconsistent category product count on page ${page}`);
  }

  // A complete first page can omit the pagination component.
  let totalPages = 1;
  if (pageControls) {
    if (pageControls.categoryBasePath !== category || pageControls.current !== page ||
      !isCount(pageControls.total) || pageControls.total < page) {
      throw new Error('Sainsbury’s returned mismatched category pagination controls');
    }
    totalPages = pageControls.total;
  } else if (page !== 1 || returned !== total) {
    throw new Error('Sainsbury’s returned incomplete category pagination controls');
  }

  return { products: products ?? [], pagination: { page, total, returned, totalPages } };
}

export class SainsburysClient {
  private readonly fetch: typeof fetch;

  constructor(options: { fetch?: typeof fetch } = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async listCategoryPage(category: string, options: SainsburysPageOptions = {}): Promise<SainsburysCategoryPage> {
    const { page = 1, signal } = options;
    if (!categoryPattern.test(category)) throw new RangeError('Expected a Sainsbury’s grocery category path');
    if (!Number.isSafeInteger(page) || page < 1) throw new RangeError('Expected a positive integer page');

    const path = category.replace(/\/$/, '');
    const url = page === 1 ? origin + path : `${origin}${path}/opt/page:${page}`;
    const response = await this.fetch(url, { headers: { RSC: '1' }, credentials: 'omit', signal });
    if (!response.ok) throw new Error(`Sainsbury’s category request failed with HTTP ${response.status}: ${url}`);
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'text/x-component') {
      throw new Error(`Sainsbury’s category response was not text/x-component: ${url}`);
    }
    return { ...decodePage(await response.text(), path, page), retrievedAt: new Date().toISOString() };
  }
}
