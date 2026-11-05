import { VivinoAlgoliaClient, enrichWines } from '../src/index.ts';
import { readFile, writeFile } from 'node:fs/promises';
const benchmark = JSON.parse(await readFile(new URL('../test/fixtures/restaurant-menu-2026-11-04.json',import.meta.url),'utf8'));
const inputs = benchmark.inputs;
const vivino = new VivinoAlgoliaClient();
const raw = [];
for(const [index,input] of inputs.entries()){
  try {
    const response = await vivino.searchWines(input.name,15);
    raw.push({input, hits:response.candidates.map(w => ({
      id:w.id, name:w.name, winery:w.winery?.name ?? null,
      region:w.region?.name ?? null, years:(w.vintages ?? []).map(v=>Number(v.year)).filter(Number.isInteger).slice(0,30)
    }))});
  } catch(error) { raw.push({input,error:String(error), hits:[]}); }
}
await writeFile('menu-search-hits.json',JSON.stringify(raw,null,2));
for(const name of ['Oszkár Maurer Crazy Lud','Oszkár Maurer Krisztus','G.D. Vajra Barbera d\'Alba','Fanny Sabre Anatole','Château Pesquié Syrah du Pesquié','Klabjan White Label']){
 const entry=raw.find(x=>x.input.name===name);
 console.log('RAW_DIAGNOSTIC',JSON.stringify({name,hits:entry?.hits.slice(0,8).map(x=>({id:x.id,name:x.name,winery:x.winery,region:x.region}))}));
}
const result=await enrichWines(inputs,{concurrency:4});
const report=result.map((row,i)=>({input:inputs[i],...row}));
await writeFile('menu-lookup.json',JSON.stringify(report,null,2));
console.log('MENU_SUMMARY',JSON.stringify({rows:result.length,nonempty:result.filter(x=>x.matches.length).length,errors:result.filter(x=>x.error).length}));
let failed = false;
for(const check of benchmark.spotChecks){
  const row = report[check.inputIndex];
  const url = row?.matches?.[0]?.url ?? '';
  const actualId = url ? Number(new URL(url).pathname.split('/').at(-1)) : 0;
  const ok = actualId === check.expectedTopWineId;
  console.log('MENU_SPOTCHECK',JSON.stringify({input:row?.input.name,expected:check.expectedTopWineId,actual:actualId,ok}));
  if(!ok) failed = true;
}
if(failed) process.exitCode=1;
