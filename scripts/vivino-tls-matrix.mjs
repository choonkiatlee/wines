import { Agent, buildConnector } from 'undici';
import { createSecureContext } from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
const exec = promisify(execFile);
const url = 'https://www.vivino.com/api/wines/1911534/tastes';
const out = 'integration-output';
const explicitHeaders = { accept: 'application/json', 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' };
const matchedHeaders = { ...explicitHeaders, 'user-agent': 'wines-integration-check/0.1',
  'accept-encoding': 'identity', 'accept-language': '*', 'sec-fetch-mode': 'cors', connection: 'keep-alive' };
const tls12Ciphers = 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384';
const cases = [
  { name: 'node-native-baseline', native: true },
  { name: 'node-matched-headers', tls: {} },
  { name: 'curl-matched-http1', curl: '--http1.1' },
  { name: 'curl-matched-http2', curl: '--http2' },
  { name: 'node-tls12-only', tls: { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' } },
  { name: 'node-tls13-only', tls: { minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' } },
  { name: 'node-curves-x25519', tls: { ecdhCurve: 'X25519' } },
  { name: 'node-curves-p256', tls: { ecdhCurve: 'prime256v1' } },
  { name: 'node-curves-p256-x25519', tls: { ecdhCurve: 'prime256v1:X25519' } },
  { name: 'node-tls13-aes-first', tls: { ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:' + tls12Ciphers } },
  { name: 'node-tls13-chacha-first', tls: { ciphers: 'TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:' + tls12Ciphers } },
  { name: 'node-signature-list', tls: { sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pss_rsae_sha384:rsa_pkcs1_sha256' } },
];
// Validate every option before making any requests. This is also an offline dry-run mode.
for (const c of cases) if (c.tls) createSecureContext(c.tls);
if (process.env.TLS_MATRIX_DRY_RUN === '1') {
  console.log(JSON.stringify({ cases, url, matchedHeaders, maxConcurrency: 2, requestsPerCase: 1 }));
} else {
  await mkdir(out, { recursive: true });
  const environment = { checkedAt: new Date().toISOString(), node: process.version, openssl: process.versions.openssl,
    undici: JSON.parse(await readFile(new URL('../node_modules/undici/package.json', import.meta.url))).version,
    curl: (await exec('curl', ['--version'])).stdout.split('\n')[0],
    runner: process.env.RUNNER_OS ?? 'local', headers: matchedHeaders,
    note: 'One GET per case, two concurrent cases, no retries, certificate verification enabled. TLS changes are diagnostic only; each differs from matched-header baseline except cipher order cases which are compared to each other.' };
  const results = new Array(cases.length);
  let next = 0;
  async function run(c) {
    const start = Date.now();
    let agent;
    const connections = [];
    try {
      let status, headers, body, transport;
      if (c.curl) {
        const headerFile = `${out}/${c.name}.headers.tmp`;
        const { stdout } = await exec('curl', ['-sS', '--max-time', '20', c.curl, '-D', headerFile,
          ...Object.entries(matchedHeaders).flatMap(([k, v]) => ['-H', `${k}: ${v}`]),
          '--write-out', '\n%{json}', url], { maxBuffer: 1024 * 1024 });
        const split = stdout.lastIndexOf('\n');
        body = stdout.slice(0, split);
        const meta = JSON.parse(stdout.slice(split + 1));
        status = meta.http_code;
        transport = { httpVersion: meta.http_version, remoteIp: meta.remote_ip, sslVerifyResult: meta.ssl_verify_result };
        const blocks = (await readFile(headerFile, 'utf8')).split(/\r?\n\r?\n/).filter(b => /^HTTP\//.test(b));
        headers = Object.fromEntries((blocks.at(-1) ?? '').split(/\r?\n/).slice(1).flatMap(line => {
          const i = line.indexOf(':'); return i > 0 ? [[line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()]] : [];
        }));
        // Never retain raw headers, which may contain Set-Cookie.
        const { unlink } = await import('node:fs/promises');
        await unlink(headerFile);
      } else {
        if (!c.native) {
          const connector = buildConnector({ ...c.tls, allowH2: false });
          agent = new Agent({ allowH2: false, connect: (options, callback) => connector(options, (error, socket) => {
            if (socket) connections.push({ tlsVersion: socket.getProtocol(), cipher: socket.getCipher(),
              ephemeralKey: socket.getEphemeralKeyInfo(), alpn: socket.alpnProtocol || null, remoteIp: socket.remoteAddress });
            callback(error, socket);
          }) });
        }
        const response = await fetch(url, { headers: c.native ? explicitHeaders : matchedHeaders,
          ...(agent ? { dispatcher: agent } : {}), redirect: 'manual', signal: AbortSignal.timeout(20000) });
        status = response.status; headers = Object.fromEntries(response.headers); body = await response.text();
        transport = { connections };
      }
      let tastes = null;
      try { tastes = JSON.parse(body).tastes; } catch {}
      return { case: c.name, tlsOptions: c.tls, status, validTasteJson: !!tastes?.structure,
        elapsedMs: Date.now() - start, transport,
        headers: Object.fromEntries(Object.entries(headers).filter(([k]) => /^(server|content-type|x-cache|via|x-amz-cf-pop|x-amzn-waf-action|x-request-id)$/.test(k))),
        bytes: Buffer.byteLength(body), bodyPreview: tastes ? undefined : body.slice(0, 1200),
        tasteSummary: tastes ? { structure: tastes.structure, flavorGroups: tastes.flavor?.length } : undefined };
    } catch (error) {
      return { case: c.name, tlsOptions: c.tls, elapsedMs: Date.now() - start,
        error: { name: error.name, message: error.message, cause: error.cause?.message, code: error.cause?.code }, connections };
    } finally { if (agent) await agent.destroy(); }
  }
  async function worker() {
    while (next < cases.length) {
      const i = next++;
      const result = await run(cases[i]);
      results[i] = result;
      await writeFile(`${out}/${cases[i].name}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
    }
  }
  await Promise.all([worker(), worker()]);
  await writeFile(`${out}/tls-matrix.json`, JSON.stringify({ environment, results }, null, 2));
  const md = '# Vivino TLS diagnostic matrix\n\n| Case | HTTP | Taste JSON | TLS / HTTP | Error |\n|---|---|---|---|---|\n' +
    results.map(r => `| ${r.case} | ${r.status ?? '—'} | ${r.validTasteJson ?? false} | ${r.transport?.connections?.[0]?.tlsVersion ?? r.transport?.httpVersion ?? 'not captured'} | ${r.error?.message ?? ''} |`).join('\n') +
    '\n\nSuccess of this job means diagnostics completed. It does not mean every case returned HTTP 200. Full options, negotiation details and response diagnostics are in the artifact. No client change.\n';
  await writeFile(`${out}/summary.md`, md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}
