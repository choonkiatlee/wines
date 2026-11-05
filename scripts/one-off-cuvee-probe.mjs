import { VivinoAlgoliaClient, enrichWines } from '../src/index.ts';
import { writeFile } from 'node:fs/promises';
const menu = [
  [
    "Mas de la Fonte Ronde Pom Pon",
    2023
  ],
  [
    "Les Vignobles Foncalieu Réserve de l'Abbé",
    2023
  ],
  [
    "Domaine Bassac Mangalh",
    2023
  ],
  [
    "Château Pesquié Syrah du Pesquié",
    2022
  ],
  [
    "Christina Kuhlbart",
    2025
  ],
  [
    "Château Peyros Héritage",
    2021
  ],
  [
    "Beulah Violetta Stesso Stesso",
    2024
  ],
  [
    "Raúl Pérez Saint Jacques",
    2023
  ],
  [
    "Cauzón Lozano",
    2021
  ],
  [
    "Roman Le Bars Homme de la Roche",
    2025
  ],
  [
    "Niepoort Nat Cool",
    2021
  ],
  [
    "Mauro Franchino Coste della Sesia",
    2024
  ],
  [
    "Oszkár Maurer Crazy Lud",
    2024
  ],
  [
    "Strekov 1075 Fred #12",
    null
  ],
  [
    "Aptsiauri Saperavi",
    2024
  ],
  [
    "Gianni Doglia Genio",
    2025
  ],
  [
    "Vindiou Brèves de Comptoir",
    2023
  ],
  [
    "Domaine Azzara Le Rêve",
    2023
  ],
  [
    "G.D. Vajra Barbera d'Alba",
    2025
  ],
  [
    "Etienne Seignov(e)rt Gentil Monstre",
    2024
  ],
  [
    "Pernot Père et Fils Bourgogne Côte d'Or",
    2023
  ],
  [
    "L'Ile Rouge Confluence",
    2021
  ],
  [
    "Cesar Fernández Díaz Espantaburros",
    2024
  ],
  [
    "Klabjan White Label",
    2021
  ],
  [
    "Clothilde Legrand La Chaintree",
    2015
  ],
  [
    "Bott Frigyes Kekfrankos",
    2023
  ],
  [
    "Les Grillons Esprit Libre",
    2024
  ],
  [
    "Bruno Duchêne La Luna",
    2024
  ],
  [
    "La Prévostura Muntacc",
    2021
  ],
  [
    "Proprietà Sperino Uvaggio",
    2021
  ],
  [
    "Hervé Souhaut La Souteronne",
    2024
  ],
  [
    "Bonnet Cotton Régnié",
    2023
  ],
  [
    "Bencze Birtok Atlas",
    2022
  ],
  [
    "Oszkár Maurer Krisztus",
    2022
  ],
  [
    "Noëlla Morantin Le Printemps",
    2022
  ],
  [
    "La Ferme Pasteur Font du Loup",
    2024
  ],
  [
    "Antoine Sanzay La Paterne",
    2024
  ],
  [
    "Fanny Sabre Anatole",
    2025
  ],
  [
    "Domaine la Luminaille Garance",
    2023
  ],
  [
    "Dard et Ribo Printemps",
    2025
  ],
  [
    "Arpepe Rosso di Valtellina",
    2023
  ],
  [
    "Domaine du Coulet No Wine's Land",
    2023
  ],
  [
    "Giuseppe Cipolla Le Robbe",
    2023
  ],
  [
    "Jules Métras Bijou",
    2021
  ],
  [
    "Les Grillons Calcaires",
    2024
  ],
  [
    "Clos Venturi Brama",
    2024
  ],
  [
    "Tre.mila E.Migrante",
    2022
  ]
];

const inputs = menu.map(([name,year]) => year == null ? {name} : {name,year});
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
