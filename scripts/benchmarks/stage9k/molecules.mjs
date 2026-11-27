// Standalone RDKit access for structure validation; no PocketChem imports/predictions.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const here=path.dirname(fileURLToPath(import.meta.url));
export const root=path.resolve(here,'../../..');
const dir=path.join(root,'public/rdkit');
const source=fs.readFileSync(path.join(dir,'RDKit_minimal.js'),'utf8');
const init=new Function('require','__dirname','__filename',source+'\n;return initRDKitModule;')(createRequire(import.meta.url),dir,path.join(dir,'RDKit_minimal.js'));
export const rd=await init({locateFile:n=>path.join(dir,n)});
export function canon(s,stereo=true){
  if(!s || typeof s!=='string') return null;
  const input=stereo?s:s.replace(/@/g,'').replace(/[\\/]/g,'');
  const m=rd.get_mol(input); if(!m)return null;
  try{return m.get_smiles();}finally{m.delete();}
}
export function mirror(s){return s.replace(/@@|@/g,x=>x==='@@'?'@':'@@');}
