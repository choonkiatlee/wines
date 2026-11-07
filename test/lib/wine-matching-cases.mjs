import { readFile } from 'node:fs/promises';
const file=new URL('../fixtures/wine-matching-regressions.json',import.meta.url);
export async function regressionCases() {
 const doc=JSON.parse(await readFile(file,'utf8'));
 if(doc.schemaVersion!==1 || !Array.isArray(doc.cases))throw new Error('Invalid matching fixture');
 const ids=new Set();
 for(const c of doc.cases){
  if(typeof c.id!=='string' || !c.id || ids.has(c.id))throw new Error('Invalid/duplicate regression ID: '+c.id);
  ids.add(c.id);
  if(typeof c.input?.name!=='string' || !c.input.name || !Array.isArray(c.candidates))throw new Error('Invalid regression case '+c.id);
  if(!c.expected || typeof c.expected!=='object')throw new Error('Missing expected IDs in '+c.id);
  if(typeof c.verified!=='boolean' || !c.reason || !c.source)throw new Error('Missing provenance in '+c.id);
  if(c.verified && !('topId' in c.expected) && !('mustIncludeIds' in c.expected) && !('mustExcludeIds' in c.expected) && !('empty' in c.expected))
   throw new Error('No checked expectation in '+c.id);
  const wineIds=new Set();
  for(const w of c.candidates) {
   if(!Number.isSafeInteger(w.id) || wineIds.has(w.id) || !w.name || !w.winery)throw new Error('Invalid candidate ID in '+c.id);
   wineIds.add(w.id);
  }
  if(c.verified && c.expected.topId!==undefined && !wineIds.has(c.expected.topId))
   throw new Error('Expected top ID not in frozen search candidates: '+c.id);
 }
 return doc.cases;
}
export function checkCase(c, ids) {
 const expected=c.expected, problems=[];
 if(expected.topId!==undefined && ids[0]!==expected.topId)
  problems.push('top '+(ids[0]??'none')+' ≠ '+expected.topId);
 for(const id of expected.mustIncludeIds??[])if(!ids.slice(0,3).includes(id))problems.push('missing '+id+' from top 3');
 for(const id of expected.mustExcludeIds??[])if(ids.slice(0,3).includes(id))problems.push('forbidden '+id+' in top 3');
 if(expected.empty===true && ids.length)problems.push('expected abstention, got '+ids.join(', '));
 return problems;
}
export function frozenClient(c) {
 const wines=c.candidates.map(x=>({
  id:x.id,name:x.name,winery:{name:x.winery},region:{name:x.region??''},
  type_id:x.type_id,vintages:x.vintages??[],
 }));
 const byId=new Map(wines.map(w=>[w.id,w]));
 const calls={searches:[],profiles:[]};
 function profile(id,year=null) {
  const w=byId.get(id);
  if(!w)throw new Error('Unexpected profile ID '+id+' in '+c.id);
  calls.profiles.push(id);
  return { wine:{id,name:w.name,winery:w.winery.name,region:w.region.name,country:null,
       alcohol:null,closure:null,nonVintage:null,grapeIds:null,foodIds:null,styleId:null,imageUrl:null},
   vintage:year===null?null:{id:id*10,year},ratings:{vintage:null,allVintages:null},
   vintageCounts:null,description:null,source:'vivino-algolia',
   retrievedAt:'2026-11-07T00:00:00Z',indexUpdatedAt:null,
   sourceUrl:'https://www.vivino.com/w/'+id,warnings:[],
  };
 }
 return {calls,client:{
  async searchWines(q) {
   calls.searches.push(q);
   const selection=c.searchResults?.[q]??c.defaultIds??wines.map(w=>w.id);
   return {total:selection.length,candidates:selection.map(id=>{
    const w=byId.get(id);if(!w)throw new Error('Unknown fixture ID '+id);return w;
   })};
  },
  async getProfile(id){return profile(id)},
  async getProfileForYear(id,year){return profile(id,year)},
 }};
}
