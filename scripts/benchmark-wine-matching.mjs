/** Opt-in live identity benchmark: no golden fixture rewrites, no retailer catalogue ingest. */
import { writeFile } from 'node:fs/promises';
import { enrichWines } from '../src/enrichment.ts';
import { VivinoAlgoliaClient } from '../packages/vivino-client/src/algolia-client.ts';
import { checkCase, regressionCases } from '../test/lib/wine-matching-cases.mjs';

const cases=(await regressionCases()).filter(c=>c.verified && c.live!==false);
const provider=new VivinoAlgoliaClient();
const upstreamCalls={search:0,profile:0,vintageProfile:0};
const client={
 async searchWines(...args){upstreamCalls.search++;return provider.searchWines(...args)},
 async getProfile(...args){upstreamCalls.profile++;return provider.getProfile(...args)},
 async getProfileForYear(...args){upstreamCalls.vintageProfile++;return provider.getProfileForYear(...args)},
};
const rows=await enrichWines(cases.map(c=>c.input),{returnAll:true,concurrency:4,client});
const results=cases.map((c,i)=>{
 const row=rows[i],ids=row.matches.map(m=>m.wine.id);
 return {id:c.id,input:c.input,ids,expected:c.expected,problems:checkCase(c,ids),
  error:row.error??null,
  names:row.matches.map(m=>[m.wine.winery,m.wine.name].filter(Boolean).join(' '))};
});
const failures=results.filter(r=>r.error || r.problems.length);
const withTop=results.filter(r=>r.expected.topId!==undefined);
const withExpected=results.filter(r=>r.expected.mustIncludeIds?.length);
const summary={
 tested:results.length,passes:results.length-failures.length,failures:failures.length,
 upstreamCalls, searchCallsPerWine:Number((upstreamCalls.search/results.length).toFixed(2)),
 top1:withTop.filter(r=>r.ids[0]===r.expected.topId).length+'/'+withTop.length,
 recallAt3:withExpected.filter(r=>r.expected.mustIncludeIds.every(id=>r.ids.slice(0,3).includes(id))).length+'/'+withExpected.length,
 completedAt:new Date().toISOString(),
};
const report={summary,results};
console.log('LIVE_SUMMARY '+JSON.stringify(summary));
for(const r of results)console.log('LIVE_CASE '+JSON.stringify(r));
await writeFile('wine-matching-live-results.json',JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
