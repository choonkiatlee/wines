import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogue, pageCatalogue } from '../scripts/page-sainsburys-catalog.mjs';

test('partial retailer catalogue is deduplicated and explicitly sourced', async () => {
 const c=await loadCatalogue();
 assert.equal(c.completeness,'partial');
 assert.ok(c.products.length >= 60);
 assert.equal(new Set(c.products.map(w=>w.name.toLowerCase())).size,c.products.length);
 assert.ok(c.products.every(w=>w.name && ['red','white','rose','sparkling','unknown'].includes(w.type)));
});
test('paging yields each product once without network calls',async()=>{
 const c=await loadCatalogue();
 const pages=[];
 for(let p=1;p<=Math.ceil(c.products.length/20);p++)pages.push(...pageCatalogue(c,{page:p}).products);
 assert.deepEqual(pages,c.products);
 assert.equal(pageCatalogue(c,{page:1,pageSize:20}).hasNextPage,true);
 assert.deepEqual(pageCatalogue(c,{page:100,pageSize:20}).products,[]);
});
test('filters operate before pagination',async()=>{
 const c=await loadCatalogue();
 const p=pageCatalogue(c,{page:1,pageSize:10,type:'white',search:'Sauvignon'});
 assert.ok(p.products.length>0);
 assert.ok(p.products.every(x=>x.type==='white' && /sauvignon/i.test(x.name)));
});
