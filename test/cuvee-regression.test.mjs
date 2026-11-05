import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichWines } from '../src/enrichment.ts';

// Offline mock built from producer/cuvee spellings observed in the 47-row November 2026 menu probe.
function wine(id, name, winery, region = 'Subotica-Horgos') {
  return { id, name, winery: { name: winery }, region: { name: region }, vintages: [{id:id*10, year:2024}] };
}
function profile(w, year = null) {
  return {
    wine: {id:w.id,name:w.name,winery:w.winery.name,region:w.region.name,country:null,
      alcohol:null,closure:null,nonVintage:null,grapeIds:null,foodIds:null,styleId:null,imageUrl:null},
    vintage:year === null ? null : {id:w.id*10,year},
    ratings:{vintage:null,allVintages:null},vintageCounts:null,description:null,
    source:'vivino-algolia',retrievedAt:'2026-11-05T00:00:00Z',indexUpdatedAt:null,
    sourceUrl:`https://www.vivino.com/w/${w.id}${year === null ? '' : '?year='+year}`,warnings:[],
  };
}
function mock(wines) {
  const byId = new Map(wines.map(w => [w.id,w]));
  const stats = {queries:[],profiles:[]};
  return {stats, client:{
    async searchWines(q){stats.queries.push(q);return {total:wines.length,candidates:wines};},
    async getProfile(id){stats.profiles.push(id);return profile(byId.get(id));},
    async getProfileForYear(id,year){stats.profiles.push(id);return profile(byId.get(id),year);},
  }};
}

test('live regression: Crazy Lud should rank Crazylud above unrelated Maurer bottles', async () => {
  const wines=[
    wine(11138134,'Maurer Oszkár Jumbo','Maurer'),
    wine(8004032,'Oszkar Kövidinka','Maurer'),
    wine(10081637,'Oszkár Maurer Bor III','Maurer'),
    wine(8878803,'CrazyLud Red','Maurer'),
    wine(8421921,'Crazylud','Maurer'),
  ];
  const {client,stats}=mock(wines);
  const [row]=await enrichWines([{name:'Oszkár Maurer Crazy Lud',year:2024}],{client});
  assert.equal(row.matches[0].name,'Maurer Crazylud');
  assert.deepEqual(row.matches.map(m=>m.name),['Maurer Crazylud','Maurer CrazyLud Red']);
  assert.deepEqual(stats.profiles,[8421921,8878803]);
});

test('live regression: Krisztus should not match unrelated Maurer producer-only results', async () => {
  const {client,stats}=mock([
    wine(11138134,'Maurer Oszkár Jumbo','Maurer'),
    wine(8004032,'Oszkar Kövidinka','Maurer'),
    wine(10081637,'Oszkár Maurer Bor III','Maurer'),
  ]);
  const [row]=await enrichWines([{name:'Oszkár Maurer Krisztus',year:2022}],{client});
  assert.deepEqual(row,{matches:[]});
  assert.deepEqual(stats.profiles,[]);
});

test('live regression: exact cuvee retained with neighbouring G.D. Vajra variants', async () => {
  const {client}=mock([
    wine(8727037,`Barbera d'Alba Bricco delle Viole`,'G.D. Vajra'),
    wine(1169875,`Barbera d'Alba Superiore`,'G.D. Vajra'),
    wine(1100127,`Barbera d'Alba`,'G.D. Vajra'),
  ]);
  const [row]=await enrichWines([{name:`G.D. Vajra Barbera d'Alba`,year:2024}],{client});
  assert.equal(row.matches[0].url,'https://www.vivino.com/w/1100127?year=2024');
  assert.equal(row.matches.length,3);
});

test('live regression: split and fused cuvee words, punctuation and typo are supported', async () => {
  const {client}=mock([
    wine(1,'Margalh Rouge','Domaine Bassac','Languedoc'),
    wine(2,'Margalh Rosé','Domaine Bassac','Languedoc'),
  ]);
  const [row]=await enrichWines([{name:'Domaine Bassac Mangalh'}],{client});
  assert.equal(row.matches.length,2);
  assert.equal(row.matches[0].name,'Domaine Bassac Margalh Rouge');
});

test('live regression: exact Fred numbered cuvee is ranked ahead of its siblings', async () => {
  const {client}=mock([
    wine(9815880,'Fred #8','Strekov 1075'),
    wine(11071008,'Fred #9','Strekov 1075'),
    wine(13670133,'Fred #12','Strekov 1075'),
  ]);
  const [row]=await enrichWines([{name:'Strekov 1075 Fred #12'}],{client});
  assert.equal(row.matches[0].name,'Strekov 1075 Fred #12');
  assert.equal(row.matches.length,3);
});

test('live regression: ambiguous Anatole variants remain candidates without colour in input', async () => {
  const {client}=mock([
    wine(6570229,'Cuvée Anatole Blanc','Fanny Sabre','Bourgogne'),
    wine(12248328,'Cuvée Anatole Rouge','Fanny Sabre','Vin de France'),
    wine(11005617,'Cuvée Anatole Rosé','Fanny Sabre','Bourgogne'),
  ]);
  const [row]=await enrichWines([{name:'Fanny Sabre Anatole',year:2024}],{client});
  assert.equal(row.matches.length,3);
  assert.ok(row.matches.some(m=>m.name.includes('Rouge')));
  // The function has no menu colour field; it cannot assert red is correct.
});

test('live regression: cuvee validation does not penalise winery names repeated in the label', async () => {
  const {client}=mock([
    wine(1,'Syrah','Château Pesquie','Vin de France'),
    wine(2,'Côtes du Ventoux','Château Pesquie','Ventoux'),
    wine(3,'Grenache - Syrah','Château Saint Andre','Vin de France'),
  ]);
  const [row]=await enrichWines([{name:'Château Pesquié Syrah du Pesquié'}],{client});
  assert.equal(row.matches[0].name,'Château Pesquie Syrah');
  assert.ok(!row.matches.some(x=>x.name.includes('Côtes du Ventoux')));
});
