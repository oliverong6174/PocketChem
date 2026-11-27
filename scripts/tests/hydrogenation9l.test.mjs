import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, closeEngine } from './engine.mjs';
import { runRule, modules } from './fixtures/convergentHelpers.mjs';
let stereo,rd;
before(async()=>{({stereo}=await modules()); const kit=await loadModule('/src/utils/rdkit.ts');rd=await kit.getRDKit();});
after(closeEngine);
test('syn reduction of a fresh small-ring alkene gives the cis meso product',async()=>{
  const inputs=['CC1=C(C)CCC1','C1CC(C)=C(C)C1','C1(C)=C(CCC1)C'];
  const out=(await Promise.all(inputs.map(s=>runRule('alkene-hydrogenation',[s])))).flat();
  assert.ok(out.length);
  const distinct=new Set();
  for(const p of out) {
    const k=await stereo.canonicalizeStereoStructure(p.productSmiles);
    assert.equal((k.isomeric.match(/@@?/g)||[]).length,2);
    const mirror=await stereo.canonicalizeStereoStructure(stereo.invertTetrahedralSmiles(k.isomeric));
    assert.equal(k.isomeric,mirror.isomeric,'cis-1,2-dimethylcyclopentane is meso');
    assert.notEqual(p.productMixture?.kind,'racemic');
    distinct.add(k.isomeric);
  }
  assert.equal(distinct.size,1);
});
test('pre-existing center survives; both new face alternatives are retained',async()=>{
  const out=await runRule('alkene-hydrogenation',['CC1=C(C)CC[C@H]1O']);
  const all=[...new Set(out.flatMap(p=>p.productMixture?.memberSmiles ?? [p.productSmiles]))];
  assert.ok(all.length>=2,'no unsupported diastereofacial ranking');
  assert.ok(out.every(p=>p.productMixture),'the face alternatives must be represented as one mixture');
  for(const p of out)assert.equal(stereo.stereochemicalMixtureCanSatisfyTarget(p.productMixture.kind,await stereo.canonicalizeStereoStructure(p.productSmiles)),false);
  const query=rd.get_qmol('[C;H1](O)');
  const cipAtOH=s=>{const mol=rd.get_mol(s);try{const matches=JSON.parse(mol.get_substruct_matches(query));const idx=matches[0].atoms[0];return JSON.parse(mol.get_stereo_tags()).CIP_atoms.find(a=>a[0]===idx)?.[1];}finally{mol.delete();}};
  try{for(const s of all){assert.equal((s.match(/@@?/g)||[]).length,3);assert.equal(cipAtOH(s),cipAtOH('CC1=C(C)CC[C@H]1O'));}}
  finally{query.delete();}
});
test('unsupported alkene geometry gets an explicit stereo limitation',async()=>{
  for(const p of await runRule('alkene-hydrogenation',['CC=C(C)CC']))
    assert.ok(p.limitations.some(s=>/stereo|configuration/i.test(s)));
});
test('an unspecified pre-existing stereocenter is not silently treated as achiral',async()=>{
  const out=await runRule('alkene-hydrogenation',['CC1=C(C)CCC1O']);
  assert.ok(out.length);
  assert.ok(out.every(p=>p.productMixture?.kind!=='racemic'));
});
