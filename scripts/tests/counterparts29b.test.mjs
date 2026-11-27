import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';
let C,A;
before(async()=>{await loadEngine(); C=await loadModule('/src/utils/aromaticCounterparts.ts');A=await loadModule('/src/utils/aromaticity.ts');});
after(closeEngine);
test('cyclopentadiene yields a valence-valid 6π aromatic anion and conditional 4π cation',async()=>{
  for(const [target,charge,pi] of [['aromatic',-1,6],['antiaromatic',1,4]]) {
    const result=await C.findAromaticCounterparts('C1C=CC=C1',target);
    assert.equal(result.candidates.length,1);
    const c=result.candidates[0], graph=await A.readAromaticGraph(c.smiles);
    assert.equal(graph.atoms.reduce((n,a)=>n+a.charge,0),charge);
    assert.equal(graph.atoms.reduce((n,a)=>n+a.hydrogens,0),5);
    assert.equal(c.piAfter,pi);assert.equal(c.hydrogenDelta,-1);
    assert.equal(c.bondOrderChanges,0);assert.equal(c.chargeDelta,charge);
    assert.equal(c.cost,3);assert.match(c.assumptions,/planar|spin/i);
  }
});
test('cycloheptatriene yields 6π tropylium but has no supported antiaromatic counterpart',async()=>{
  const aromatic=await C.findAromaticCounterparts('C1C=CC=CC=C1','aromatic');assert.equal(aromatic.candidates.length,1);assert.equal(aromatic.candidates[0].piAfter,6);assert.equal(aromatic.candidates[0].chargeDelta,1);
  const anti=await C.findAromaticCounterparts('C1C=CC=CC=C1','antiaromatic');assert.equal(anti.candidates.length,0);assert.ok(anti.reason.length>0);
});
test('charge dependent aromatic to antiaromatic comparison preserves hydrogen and connectivity',async()=>{
  const original='[CH-]1C=CC=C1';
  const result=await C.findAromaticCounterparts(original,'antiaromatic');assert.equal(result.candidates.length,1);
  const c=result.candidates[0];assert.equal(c.chargeDelta,2);assert.equal(c.hydrogenDelta,0);assert.equal(c.cost,2);assert.equal(c.connectivityPreserved,true);
  const back=await C.findAromaticCounterparts(c.smiles,'aromatic');assert.equal(back.candidates.length,1);
  assert.equal((await A.readAromaticGraph(back.candidates[0].smiles)).smiles,(await A.readAromaticGraph(original)).smiles);
});
test('substituents and unrelated fragments remain intact',async()=>{
  const original='CCC1C=CC=C1.Cl';const before=await A.readAromaticGraph(original);
  const result=await C.findAromaticCounterparts(original,'aromatic');assert.ok(result.candidates.length>0);
  for(const c of result.candidates) {
    const after=await A.readAromaticGraph(c.molfile);
    assert.deepEqual(after.atoms.map(a=>[a.z,a.isotope]),before.atoms.map(a=>[a.z,a.isotope]));
    assert.deepEqual(after.bonds.map(b=>[b.a,b.b,b.order]),before.bonds.map(b=>[b.a,b.b,b.order]));
    const changed=after.atoms.filter((a,i)=>a.charge!==before.atoms[i].charge||a.hydrogens!==before.atoms[i].hydrogens);
    assert.equal(changed.length,1);assert.equal(c.connectivityPreserved,true);
  }
});
test('equal edit costs are retained as choices, sorted deterministically',async()=>{
  const result=await C.findAromaticCounterparts('C1C=CC=C1.CC1C=CC=C1','aromatic');
  assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].cost,result.candidates[1].cost);assert.notEqual(result.candidates[0].smiles,result.candidates[1].smiles);
});
for(const smiles of ['c1ccccc1','C1CCCCC1','c1ccoc1','C1=CC=CC=CC=C1','*C1C=CC=C1','c1ccc2ccccc2c1','C1CC2CCC1C2']) test(`bounded unsupported case ${smiles}`,async()=>{
  for(const target of ['aromatic','antiaromatic']) { const result=await C.findAromaticCounterparts(smiles,target);assert.equal(result.candidates.length,0);assert.match(result.reason,/supported|generic|already/i); }
});
