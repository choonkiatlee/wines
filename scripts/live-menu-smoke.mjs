import { enrichWines } from '../src/index.ts';
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
const inputs = menu.map(([name, year]) => year == null ? {name} : {name,year});
const timestamp = new Date().toISOString();
console.log('LIVE_MENU_START', JSON.stringify({rows:inputs.length,timestamp}));
const compact = await enrichWines(inputs, {concurrency:3});
const exampleIndices = [3,18,40];
const fullInputs = exampleIndices.map(i => inputs[i]);
const full = await enrichWines(fullInputs, {returnAll:true, concurrency:3});
const output = compact.map((row,i)=>({menu:inputs[i],...row}));
const fullOutput = full.map((row,i)=>({menu:fullInputs[i],...row}));
await writeFile('menu-compact.json',JSON.stringify(output,null,2)+'\n');
await writeFile('menu-full-sample.json',JSON.stringify(fullOutput,null,2)+'\n');
const stats = {total:output.length,withMatch:output.filter(x=>x.matches.length>0).length,empty:output.filter(x=>x.matches.length===0).length,upstreamErrors:output.filter(x=>x.error).length,exactYearTop:output.filter(x=>x.matches[0]?.year===x.menu.year).length};
console.log('LIVE_MENU_STATS',JSON.stringify(stats));
for (const [i,row] of output.entries()) console.log('LIVE_MENU_ROW',JSON.stringify({index:i+1,input:row.menu.name,year:row.menu.year??null,error:row.error??null,matches:row.matches.map(m=>({name:m.name,year:m.year,rating:m.rating,url:m.url}))}));
console.log('LIVE_MENU_FULL_SAMPLE',JSON.stringify(fullOutput));
