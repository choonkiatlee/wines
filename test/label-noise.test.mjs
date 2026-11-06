import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichWines } from '../src/enrichment.ts';

// Regression records based on the live 6 November 2026 Algolia lookup.
const wanderer = { id: 10725356, name: 'Malbec', winery: { name: 'The Wanderer' },
  region: { name: 'San Juan' }, type_id: 1, non_vintage: true, vintages: [] };
const darkStranger = { id: 3383528, name: 'Malbec', winery: { name: 'Tall Dark Stranger' },
  region: { name: 'Mendoza' }, type_id: 1, vintages: [] };
const dreamBird = { id: 5944115, name: 'Murder In The Dark Malbec', winery: { name: 'Dream Bird' },
  region: { name: 'Ferguson Valley' }, type_id: 1, vintages: [] };
function fakeProfile(w) {
  return {
    wine: { id:w.id,name:w.name,winery:w.winery.name,region:w.region.name,country:null,
      alcohol:null,closure:null,nonVintage:w.non_vintage??null,grapeIds:null,foodIds:null,
      styleId:null,imageUrl:null },
    vintage:null,ratings:{vintage:null,allVintages:null},vintageCounts:null,description:null,
    source:'vivino-algolia',retrievedAt:'2026-11-06T20:56:13Z',indexUpdatedAt:null,
    sourceUrl:'https://www.vivino.com/w/'+w.id,warnings:[],
  };
}
function provider(search) {
  const searches = [];
  const all = [wanderer,darkStranger,dreamBird,
    { id: 11001, name: 'After Dark Malbec', winery: { name: 'The Wanderer' },
      region: { name: 'San Juan' }, type_id:1, vintages:[] },
    { id: 11002, name: 'Dark Malbec', winery: { name: 'The Outsider' },
      region: { name: 'Mendoza' }, type_id:1, vintages:[] },
  ];
  const byId = new Map(all.map(w=>[w.id,w]));
  return { searches, client: {
    async searchWines(query) {
      searches.push(query);
      const candidates = search(query);
      return {total:candidates.length,candidates};
    },
    async getProfile(id) { return fakeProfile(byId.get(id)); },
    async getProfileForYear(id) { return fakeProfile(byId.get(id)); },
  } };
}

test('real-world label: The Wanderer beats unrelated Malbecs sharing the word Dark', async () => {
  const { client } = provider(() => [darkStranger, dreamBird, wanderer]);
  const [row] = await enrichWines([{name:'The Wanderer After Dark Malbec', type:'red'}], {client});
  assert.equal(row.matches[0].url,'https://www.vivino.com/w/10725356');
  assert.equal(row.error,undefined);
});

test('long printed label keeps producer+wine evidence despite packaging words', async () => {
  const { client } = provider(() => [darkStranger, dreamBird, wanderer]);
  const [row] = await enrichWines([{
    name:'The Wanderer Malbec Bold Red Wine Limited Edition After Dark', type:'red',
  }], {client});
  assert.equal(row.matches[0].url,'https://www.vivino.com/w/10725356');
});

test('fallback first+last search recovers wine absent from noisy initial results', async () => {
  const { client, searches } = provider(q => q === 'wanderer malbec'
    ? [wanderer] : [darkStranger,dreamBird,
      { id:11002,name:'Dark Malbec',winery:{name:'The Outsider'},region:{name:'Mendoza'},type_id:1,vintages:[] }]);
  const [row] = await enrichWines([{name:'The Wanderer After Dark Malbec',type:'red'}], {client});
  assert.ok(searches.includes('wanderer malbec'), 'should search informative label endpoints');
  assert.equal(row.matches[0].url,'https://www.vivino.com/w/10725356');
});

test('actual After Dark cuvee beats the base Malbec if Vivino indexes both', async () => {
  const edition = {id:11001,name:'After Dark Malbec',winery:{name:'The Wanderer'},
    region:{name:'San Juan'},type_id:1,vintages:[]};
  const {client} = provider(() => [wanderer,darkStranger,edition]);
  const [row] = await enrichWines([{name:'The Wanderer After Dark Malbec',type:'red'}], {client});
  assert.equal(row.matches[0].url,'https://www.vivino.com/w/11001');
});
