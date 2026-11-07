/**
 * One-off experiment: Sainsbury's partial wine list -> existing enrichWines()
 * No scraping, no ingest, no dependency changes. Writes throwaway JSON results.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { enrichWines } from '../src/index.ts';

const catalogue=JSON.parse(await readFile(new URL('../data/sainsburys/wines-2026-11-06.json',import.meta.url),'utf8'));
const products=catalogue.products;
function normalizedName(name) {
 let s=name.replace(/\s*(?:\d+(?:\.\d+)?\s*cl|small bottle)\b/gi,'')
   .replace(/\s*\(small bottle\)/gi,'')
   .replace(/\s*(?:red|white|ros[ée])\s+(?:boxed\s+)?wine\b/gi,'')
   .replace(/\bboxed wine\b/gi,'')
   .replace(/\s*,\s*non[- ]?vintage\b/gi,'')
   .replace(/\s+/g,' ').trim().replace(/[,\s]+$/,'');
 if (/^La Vieille Ferme$/i.test(s)) {
   const color=/Red Wine/i.test(name)?'Rouge':/White Wine/i.test(name)?'Blanc':/Ros[ée] Wine/i.test(name)?'Rosé':'';
   if(color) s+=' '+color;
 }
 if (/^Veuve Clicquot Yellow Label Brut Champagne/i.test(s)) s='Veuve Clicquot Brut Champagne';
 return s;
}
function simpleName(name) {
 let s=normalizedName(name);
 s=s.replace(/,\s*Taste the Difference\b/i,'').trim();
 // Some Vivino own-label entries are indexed without 'Taste the Difference';
 // preserve both spellings as separate probes, not assumed equivalent.
 s=s.replace(/\s*,?\s*Taste the Difference\b/i,'').trim();
 if (/^Sainsbury's /i.test(s) && /Taste the Difference/i.test(name)) {
   const rest=s.replace(/^Sainsbury's\s*/i,'');
   return "Sainsbury's Taste the Difference "+rest;
 }
 return s;
}
const base=products.map(p=>({name:normalizedName(p.name),type:p.type}));
const alternate=products.map(p=>({name:simpleName(p.name),type:p.type}));
console.log('PROBE_META',JSON.stringify({count:products.length,runAt:new Date().toISOString(),baseExamples:base.slice(0,5)}));
const baseResults=await enrichWines(base,{concurrency:4});
const altResults=await enrichWines(alternate,{concurrency:4});
const rows=products.map((product,i)=>{
 const collect=[];
 for(const [variant,inp,res] of [['normalized',base[i],baseResults[i]],['alternate',alternate[i],altResults[i]]]){
  for(let rank=0;rank<res.matches.length;rank++){
   const m=res.matches[rank];collect.push({variant,rank:rank+1,name:m.name,year:m.year,score:m.rating?.score??null,count:m.rating?.count??null,scope:m.rating?.scope??null,url:m.url,description:m.description??null});
  }
 }
 const unique=Array.from(new Map(collect.map(m=>[m.url,m])).values());
 return {index:i+1,retailerName:product.name,type:product.type,volumeMl:product.volumeMl,inputs:{normalized:base[i].name,alternate:alternate[i].name},errors:{normalized:baseResults[i].error??null,alternate:altResults[i].error??null},candidates:unique,rawCandidates:collect};
});
const report={source:catalogue.sourceCategoryUrl,assembledOn:catalogue.assembledOn,runAt:new Date().toISOString(),catalogueIsPartial:true,method:'Unmodified enrichWines() using VivinoAlgoliaClient; two normalized retailer-title variants; no auto-verified identities',count:rows.length,rows};
await writeFile('sainsburys-vivino-67-results.json',JSON.stringify(report,null,2));
console.log('PROBE_SUMMARY',JSON.stringify({rows:rows.length,withCandidates:rows.filter(r=>r.candidates.length>0).length,noCandidates:rows.filter(r=>r.candidates.length===0).length,errorRows:rows.filter(r=>r.errors.normalized||r.errors.alternate).length}));
for(const r of rows) console.log('PROBE_ROW',JSON.stringify({i:r.index,name:r.retailerName,type:r.type,inputs:r.inputs,errors:r.errors,candidates:r.candidates.map(c=>({rank:c.rank,variant:c.variant,name:c.name,score:c.score,count:c.count,url:c.url}))}));


import { VivinoAlgoliaClient } from '../src/index.ts';
const vivino = new VivinoAlgoliaClient();
const unresolvedQueries = [
  'Veuve Clicquot Yellow Label',
  'Veuve Clicquot Brut',
  'Sainsburys Prosecco',
  "Sainsbury's Prosecco",
  "Sainsbury's Portuguese Red",
  "Sainsbury's Primitivo",
  "Sainsbury's Gavi",
  "Sainsbury's Cremant",
  'Edizione 789 Famoso',
  'Famoso Pinot Grigio',
  "Sainsbury's Maipo Cabernet",
  'Caminada Cabernet',
  'Mondelli Pinot Grigio',
  "Sainsbury's Lisboa",
  "Sainsbury's Montepulciano",
];
for(const q of unresolvedQueries){
  try {
   const hits=await vivino.searchWines(q,20);
   console.log('TARGETED_SEARCH',JSON.stringify({q,total:hits.total,candidates:hits.candidates.slice(0,20).map(w=>({name:w.name,winery:w.winery?.name??null,id:w.id,score:w.statistics?.status==='Normal'?w.statistics?.ratings_average??null:null,count:w.statistics?.ratings_count??null}))}));
  }catch(error){console.log('TARGETED_ERROR',JSON.stringify({q,error:String(error)}))}
}
