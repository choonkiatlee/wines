import assert from 'node:assert/strict';
import test from 'node:test';
import { VivinoAlgoliaClient, enrichWines, VivinoHttpError } from '../src/index.ts';

function wine(id = 101, name = 'Barolo Ravera', wineryId = 2606) {
  return {
    id, name, type_id: 1,
    winery: { id: wineryId, name: 'G.D. Vajra', statistics: {
      ratings_average: 4, ratings_count: 162821, wines_count: 28,
    } },
    statistics: { status: 'Normal', ratings_average: 4.3, ratings_count: 2612 },
    vintages: [], region: { name: 'Barolo', country: 'it' },
  };
}

test('embedded producer statistics survive profile normalization without extra requests', async () => {
  const calls = [];
  const c = new VivinoAlgoliaClient({ fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json(wine());
  } });
  const profile = await c.getProfile(101);
  assert.equal(calls.length, 1);
  assert.deepEqual(profile.winery, {
    id: 2606, name: 'G.D. Vajra', ratingAverage: 4,
    ratingCount: 162821, winesCount: 28,
  });
  assert.equal(profile.wine.winery, 'G.D. Vajra');
  assert.deepEqual(profile.ratings.allVintages, { average: 4.3, count: 2612, reviewsCount: null });

  const stats = await c.getWineryStats(101);
  assert.deepEqual(stats, profile.winery);
  assert.equal(calls.length, 2, 'explicit winery lookup adds one getWine request, not a winery-page search');
  assert.ok(calls.every(call => !String(call.url).endsWith('/query')));
});

test('missing or malformed producer metadata stays null rather than inventing a score', async () => {
  const fallback = wine();
  fallback.winery.statistics = { ratings_average: 6, ratings_count: -3, wines_count: 0 };
  const c = new VivinoAlgoliaClient({fetch: async () => Response.json(fallback)});
  const profile = await c.getProfile(101);
  assert.deepEqual(profile.winery, { id: 2606, name: 'G.D. Vajra',
    ratingAverage: null, ratingCount: null, winesCount: 0 });

  const noProducer = wine();
  delete noProducer.winery;
  const no = new VivinoAlgoliaClient({fetch: async () => Response.json(noProducer)});
  assert.equal((await no.getProfile(101)).winery, null);
  assert.equal(await no.getWineryStats(101), null);
});

test('listWineryWines filters by exact numeric winery id and supports pagination', async () => {
  const calls = [];
  const c = new VivinoAlgoliaClient({fetch: async (url, init) => {
    calls.push({url, init});
    return Response.json({ hits:[wine(101),wine(102, 'Albe Barolo')],
      nbHits:28, page:1, nbPages:14 });
  }});
  const r = await c.listWineryWines(2606, 1, 2);
  assert.deepEqual({wineryId:r.wineryId,page:r.page,total:r.total,pages:r.pages},
    {wineryId:2606,page:1,total:28,pages:14});
  assert.deepEqual(r.wines.map(w=>w.id),[101,102]);
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    query:'',numericFilters:['winery.id=2606'],hitsPerPage:2,page:1,
  });
  assert.ok(String(calls[0].url).endsWith('/query'));
});

test('listWineryWines detects an upstream winery mismatch instead of presenting unrelated wines', async () => {
  const c = new VivinoAlgoliaClient({fetch: async () =>
    Response.json({hits:[wine(103,'Other Wine',15)],nbHits:1})});
  await assert.rejects(() => c.listWineryWines(2606), /does not match requested wineryId/);
});

test('winery helpers reject invalid parameters before calling Algolia', async () => {
  let calls=0;
  const c=new VivinoAlgoliaClient({fetch: async () => { calls++; return Response.json({}); }});
  await assert.rejects(()=>c.getWineryStats(-1),RangeError);
  await assert.rejects(()=>c.listWineryWines(0),RangeError);
  await assert.rejects(()=>c.listWineryWines(2606,-1),RangeError);
  await assert.rejects(()=>c.listWineryWines(2606,0,101),RangeError);
  await assert.rejects(()=>c.listWineryWines(2606,0,0),RangeError);
  assert.equal(calls,0);
});

test('winery search errors propagate once, with no automatic retries', async () => {
  let calls=0;
  const c=new VivinoAlgoliaClient({fetch: async () => {
    calls++;return Response.json({error:'Blocked'},{status:403});
  }});
  await assert.rejects(()=>c.listWineryWines(2606),e=>e instanceof VivinoHttpError&&e.status===403);
  assert.equal(calls,1);
});

test('full menu enrichment includes producer metadata with only search + selected wine lookup', async () => {
  const calls=[];
  const w=wine();
  const c = new VivinoAlgoliaClient({fetch: async (url,init) => {
    calls.push(String(url));
    return Response.json(String(url).endsWith('/query')
      ? {hits:[w],nbHits:1} : w);
  }});
  const [row] = await enrichWines([{name:'G.D. Vajra Barolo Ravera',type:'red'}],
    {returnAll:true,client:c});
  assert.equal(row.matches.length,1);
  assert.equal(row.matches[0].winery.ratingAverage,4);
  assert.equal(row.matches[0].winery.ratingCount,162821);
  assert.ok(calls.filter(url=>url.endsWith('/query')).length >= 1);
  assert.equal(calls.filter(url=>!url.endsWith('/query')).length,1,
    'one selected wine profile fetch and no extra requests for producer information');
});
