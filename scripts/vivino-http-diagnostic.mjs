import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const keep = /^(server|content-type|x-cache|via|x-amz-cf-pop|x-amzn-waf-action|cf-ray|cf-mitigated|x-request-id|location|retry-after|x-envoy-upstream-service-time)$/i;
const results = [];
for (const path of ['/', '/api/wines/1911534/tastes']) {
  const url = 'https://www.vivino.com' + path;
  for (const transport of ['node-fetch', 'curl']) {
    try {
      let status, responseHeaders, body;
      if (transport === 'node-fetch') {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
        status = response.status;
        responseHeaders = [...response.headers].filter(([k]) => keep.test(k));
        body = await response.text();
      } else {
        const raw = execFileSync('curl', ['-sS', '--max-time', '20', '-i', url,
          ...Object.entries(headers).flatMap(([k,v]) => ['-H', `${k}: ${v}`])], {encoding:'utf8'});
        // curl can include a proxy CONNECT header block before the actual response.
        const blocks = raw.split(/\r?\n\r?\n/);
        let block = blocks.shift();
        while (/^HTTP\/[^\n]+200 Connection established/i.test(block)) block = blocks.shift();
        status = Number(block.match(/^HTTP\/\S+\s+(\d+)/)?.[1]);
        responseHeaders = block.split(/\r?\n/).slice(1).flatMap(line => {
          const i=line.indexOf(':'); return i>0 && keep.test(line.slice(0,i)) ? [[line.slice(0,i),line.slice(i+1).trim()]] : [];
        });
        body = blocks.join('\n\n');
      }
      const result = { transport, path, status, headers:Object.fromEntries(responseHeaders),
        bytes:Buffer.byteLength(body), bodyPreview:body.slice(0,1200) };
      results.push(result); console.log(JSON.stringify(result));
    } catch (e) { const result={transport,path,error:e.message};results.push(result);console.log(JSON.stringify(result)); }
  }
}
await mkdir('integration-output',{recursive:true});
await writeFile('integration-output/http-diagnostic.json',JSON.stringify({node:process.version,
  proxyConfigured:!!(process.env.HTTPS_PROXY || process.env.https_proxy), results},null,2));
