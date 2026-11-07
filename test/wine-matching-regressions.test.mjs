import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichWines } from '../src/enrichment.ts';
import { regressionCases,checkCase,frozenClient } from './lib/wine-matching-cases.mjs';

const cases=await regressionCases();
test('regression corpus includes verified controls, failures and unverified backlog',()=>{
 assert.ok(cases.filter(c=>c.verified).length>=12);
 assert.ok(cases.some(c=>!c.verified));
});
for(const c of cases.filter(c=>c.verified)){
 test('wine identity regression: '+c.id,async()=>{
  const {client,calls}=frozenClient(c);
  const [row]=await enrichWines([c.input],{returnAll:true,client});
  const ids=row.matches.map(x=>x.wine.id);
  assert.deepEqual(checkCase(c,ids),[],c.id+': expected '+JSON.stringify(c.expected)+', observed '+JSON.stringify(ids)+', queries '+JSON.stringify(calls.searches));
  assert.ok(calls.searches.length<=6,'unbounded search expansion for '+c.id);
  assert.equal(row.error,undefined,'Unexpected fixture error in '+c.id);
 });
}
