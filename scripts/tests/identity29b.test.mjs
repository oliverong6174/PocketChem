import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';

let resolver, nom, input, sections;
before(async()=>{
  await loadEngine();
  window.location={origin:'http://localhost'};
  const bytes=fs.readFileSync('public/data/chemical-names.index.json.gz');
  globalThis.fetch=async()=>new Response(bytes);
  resolver=await loadModule('/src/utils/moleculeNameResolver.ts');
  nom=await loadModule('/src/utils/nomenclatureUtils.ts');
  input=await loadModule('/src/utils/moleculeInput.ts');
  sections=await loadModule('/src/utils/propertiesSections.ts');
});
after(closeEngine);
const analyze=(s)=>nom.analyzeNomenclatureAndProperties(s,[],null);

test('recognized entry without systematic name retains source identity independently',async()=>{
  const r=await resolver.resolveMoleculeName('vitamin K');
  assert.equal(r.sourceId,'CHEBI:28384');
  const id=await resolver.resolveStructureIdentity(r.smiles,await analyze(r.smiles),r);
  assert.equal(id.sourceIdentity.resolvedName,'vitamin K');
  assert.equal(id.sourceIdentity.originalQuery,'vitamin K');
  assert.equal(id.sourceIdentity.confidence,'Database match');
  assert.equal(id.sourceIdentity.fullySpecified,false);
  assert.equal(id.structureDerivedNomenclature.namingStatus,'unsupported');
  assert.doesNotMatch(id.nomenclature.displayName,/not available/i);
});
test('wildcards never provide whole molecule mass or DBE and are excluded from heavy atoms',async()=>{
  for(const s of ['*C','*C1=C(C)C(=O)c2ccccc2C1=O']) {
    const id=await analyze(s);
    assert.equal(id.properties.fullySpecified,false);
    assert.equal(id.properties.molecularWeight,null);
    assert.equal(id.properties.exactMass,null);
    assert.equal(id.properties.degreesOfUnsaturation,null);
    assert.equal(id.properties.unspecifiedAtomCount,1);
    assert.equal(id.properties.heavyAtomCount,s==='*C'?1:13);
    assert.ok(sections.buildPropertySections(id).sections.find(s=>s.id==='tendencies').rows.length===0);
  }
});
test('variable formula family without wildcard is still generic, and concrete variants are real',async()=>{
  const r=await resolver.resolveMoleculeName('menaquinone');
  const id=await resolver.resolveStructureIdentity(r.smiles,await analyze(r.smiles),r);
  assert.equal(id.properties.fullySpecified,false);
  assert.equal(id.properties.molecularWeight,null);
  const generic=await resolver.resolveMoleculeName('vitamin K');
  const variants=await resolver.findConcreteNameVariants(generic);
  assert.ok(variants.some(v=>v.title==='phylloquinone'));
  for(const variant of variants) {
    assert.ok(variant.sourceId.startsWith('CHEBI:'));
    assert.doesNotMatch(variant.smiles,/\*/);
    assert.doesNotMatch(variant.molecularFormula,/[Rn()]/);
  }
});
test('isomeric canonical matching keeps equivalent drawings, separates charge/stereo/isotopes',async()=>{
  const r=await resolver.resolveMoleculeName('ethanol');
  for(const s of ['CCO','OCC','[H]OC([H])([H])C']) {
    const id=await resolver.resolveStructureIdentity(s,await analyze(s),r);
    assert.equal(id.sourceIdentity.resolvedName,'ethanol');
  }
  for(const [a,b] of [['CCO','CC[O-]'],['F[C@H](Cl)Br','F[C@@H](Cl)Br'],['CCO','[13CH3]CO'],['CC(O)C(=O)O','C[C@H](O)C(=O)O']]) {
    const original={...r,smiles:a};
    const changed=await resolver.resolveStructureIdentity(b,await analyze(b),original);
    assert.equal(changed.sourceIdentity,undefined,`${a} differs from ${b}`);
  }
});
for(const name of ['aspirin','propan-2-ol','acetaminophen','cholesterol','phylloquinone']) test(`database identity preserved and serializable: ${name}`,async()=>{
  const r=await resolver.resolveMoleculeName(name);
  const id=await resolver.resolveStructureIdentity(r.smiles,await analyze(r.smiles),r);
  const restored=JSON.parse(JSON.stringify(id));
  const again=await resolver.resolveStructureIdentity(r.smiles,await analyze(r.smiles),restored.sourceIdentity.resolution);
  assert.equal(again.sourceIdentity.sourceId,r.sourceId);
  assert.equal(again.sourceIdentity.originalQuery,name);
});
test('ambiguous input stays rejected and explicit SMILES has no invented database provenance',async()=>{
  await assert.rejects(input.resolveMoleculeInput('CO',{resolveName:async()=>({...await resolver.resolveMoleculeName('ethanol'),query:'CO'})}),e=>e.code==='ambiguous');
  const manual=await input.resolveMoleculeInput('smiles:CCO');
  assert.equal(manual.nameResolution,null);
  const id=await resolver.resolveStructureIdentity(manual.smiles,await analyze(manual.smiles),null);
  assert.equal(id.sourceIdentity,undefined);
});
