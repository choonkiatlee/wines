/** Common HTTP utilities only; no discovery or enrichment behaviour. */
export class VivinoHttpError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(status: number, endpoint: string) {
    super('Vivino request failed (' + status + ') for ' + endpoint);
    this.name = 'VivinoHttpError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Unexpected Vivino response shape');
  }
  return value as Record<string, unknown>;
}

export async function requestJson(
  request: typeof fetch,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  const response = await request(url, { ...init, headers });
  if (!response.ok) throw new VivinoHttpError(response.status, new URL(url).pathname);
  return object(await response.json());
}
