import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const root='https://www.sainsburys.co.uk';
const targets=[
  ['category-html',root+'/groceries/browse/beer-wine-and-spirits/wine/c:1019462'],
  ['category-html-page2',root+'/groceries/browse/beer-wine-and-spirits/wine/c:1019462?beginIndex=60&pageSize=60'],
  ['api-keyword',root+'/groceries-api/gol-services/product/v1/product?filter%5Bkeyword%5D=wine&page_number=1&page_size=30&region=England'],
  ['api-category',root+'/groceries-api/gol-services/product/v1/product?filter%5Bcategory%5D=1019462&page_number=1&page_size=30&region=England'],
  ['api-category2',root+'/groceries-api/gol-services/product/v1/product?filter%5BcategoryId%5D=1019462&page_number=1&page_size=30&region=England'],
  ['api-category3',root+'/groceries-api/gol-services/product/v1/product?filter%5Bcategory%5D=1019448&page_number=1&page_size=30&region=England'],
];
for(const [name,url] of targets){
  try{
    const result=execFileSync('curl',['-sS','-L','-m','14','-w','\n__HTTP_CODE__%{http_code}\n__EFFECTIVE_URL__%{url_effective}','-H','Accept: application/json, text/html;q=0.9','-H','Accept-Language: en-GB,en;q=0.9','-H','User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',url],{encoding:'utf8',maxBuffer:15*1024*1024});
    const i=result.lastIndexOf('\n__HTTP_CODE__');
    const body=result.slice(0,i), trailer=result.slice(i);
    let obj=null;try{obj=JSON.parse(body)}catch{}
    const cards=[...body.matchAll(/href="([^"]*\/product\/[^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)].slice(0,6).map(m=>({url:m[1],text:m[2].replace(/<[^>]+>/g,' ').slice(0,100)}));
    console.log('PROBE',JSON.stringify({name,trailer:trailer.trim(),length:body.length,head:body.slice(0,200),jsonKeys:obj?Object.keys(obj):null,controls:obj?.controls?.page??null,products:obj?.products?.slice(0,3).map(p=>({name:p.name,uid:p.product_uid}))??null,cards}));
    if(name==='category-html' && body.length>10000) await writeFile('sainsburys-category-html.html',body);
    if(name==='api-category' && obj?.products?.length) await writeFile('sainsburys-category-api.json',JSON.stringify(obj,null,2));
  }catch(e){console.log('PROBE_ERROR',JSON.stringify({name,message:String(e).slice(0,450)}))}
}
