import fs from 'node:fs';import path from 'node:path';
import {here,root,canon} from './molecules.mjs';
const exposed=new Map();const files=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.json')&&!p.includes(`${path.sep}results${path.sep}`))files.push(p);}}
for(const stage of ['stage9f','stage9h','stage9i','stage9j'])walk(path.join(root,'scripts/benchmarks',stage));
function add(s,p){if(typeof s!=='string')return;const k=canon(s,false);if(k){if(!exposed.has(k))exposed.set(k,[]);exposed.get(k).push(p);}}
function visit(x,p,key=''){if(Array.isArray(x)){for(const v of x)visit(v,p,key);}else if(x&&typeof x==='object'){for(const [k,v]of Object.entries(x))visit(v,p,k);}else if(/smiles|^reactants$|^product$|^target$|^start$|^forbidden$|^route_must_avoid$|^expected_order$/i.test(key))add(x,p);}
for(const f of files){try{visit(JSON.parse(fs.readFileSync(f,'utf8')),path.relative(root,f).replaceAll('\\','/'));}catch{}}
// Existing snapshot databases also expose molecules; their SMILES fields are scanned.
const cases=JSON.parse(fs.readFileSync(path.join(here,'candidate-cases.json'),'utf8')).cases;
const rows=cases.map(c=>{const primary=c.smiles??c.reactants?.[0]??c.steps?.[0]?.reactants?.[0];
const structures=[primary,...(c.expected?.products?.map(p=>p.smiles)??[]),...(c.steps?.map(s=>s.product)??[])];
return {id:c.id,primary,invalid:structures.filter(s=>!canon(s)),primaryOverlap:exposed.get(canon(primary,false))??[],productOverlaps:structures.slice(1).flatMap(s=>exposed.has(canon(s,false))?[{smiles:s,files:exposed.get(canon(s,false))}]:[])};});
fs.writeFileSync(path.join(here,'overlap.json'),JSON.stringify({method:'Canonical constitutional identity, stereo removed before reparsing. All JSON except result directories in 9F/H/I/J including snapshots. Small shared reagents are not an exclusion; primary substrates are.',scannedFiles:files.map(f=>path.relative(root,f).replaceAll('\\','/')),uniqueExposedConstitutions:exposed.size,rows},null,2)+'\n');
console.log('Scanned',files.length,'files;',exposed.size,'constitutions.');for(const r of rows)if(r.invalid.length||r.primaryOverlap.length)console.log(r.id,JSON.stringify(r));
