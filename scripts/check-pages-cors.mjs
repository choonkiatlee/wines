// Diagnostic: mimic the CORS preflight a browser would send from GitHub Pages.
// This tests response headers only. A real browser check is still required.
const origin = 'https://choonkiatlee.github.io';
const endpoint = 'https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query';
const requested = ['content-type', 'x-algolia-application-id', 'x-algolia-api-key'];

const response = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': requested.join(','),
  },
});

const allowedOrigin = response.headers.get('access-control-allow-origin') ?? '';
const allowedMethods = (response.headers.get('access-control-allow-methods') ?? '').toLowerCase();
const allowedHeaders = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();

console.log(JSON.stringify({
  status: response.status, origin,
  allowOrigin: allowedOrigin || null,
  allowMethods: allowedMethods || null,
  allowHeaders: allowedHeaders || null,
}, null, 2));

const originOk = allowedOrigin === '*' || allowedOrigin === origin;
const methodsOk = allowedMethods.split(/[,\s]+/).includes('post') || allowedMethods === '*';
const headersOk = allowedHeaders === '*' || requested.every(h => allowedHeaders.split(/[,\s]+/).includes(h));

if (!response.ok || !originOk || !methodsOk || !headersOk) {
  throw new Error('Browser CORS preflight is not demonstrably permitted from GitHub Pages');
}
console.log('CORS preflight headers permit browser search; still verify with a deployed browser.');
