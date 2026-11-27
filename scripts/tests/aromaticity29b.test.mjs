import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';
let A;
before(async()=>{await loadEngine(); A=await loadModule('/src/utils/aromaticity.ts');});
after(closeEngine);
// Expectations checked against OpenStax 15.3–15.5 and the RDKit Book; no prediction snapshots.
for(const [name,smiles,electrons] of [
  ['benzene','c1ccccc1',6],['pyridine','n1ccccc1',6],['pyrrole','c1cc[nH]c1',6],['furan','c1ccoc1',6],
  ['cyclopentadienyl anion','[CH-]1C=CC=C1',6],['tropylium','[CH+]1C=CC=CC=C1',6],
  ['naphthalene','c1ccc2ccccc2c1',10],['anthracene','c1ccc2cc3ccccc3cc2c1',14],
  ['toluene','Cc1ccccc1',6],['indole','c1ccc2[nH]ccc2c1',10],
]) test(`aromatic reference: ${name}`,async()=>{
  const a=await A.analyzeAromaticity(smiles);assert.equal(a.systems.length,1);assert.equal(a.systems[0].classification,'aromatic');assert.equal(a.systems[0].piElectrons,electrons);
  assert.ok(a.systems[0].atoms.length>=5);assert.ok(a.systems[0].bonds.length>=5);
});
test('cyclobutadiene is a supported planar 4π antiaromatic teaching case',async()=>{
  const s=(await A.analyzeAromaticity('C1=CC=C1')).systems[0];
  assert.equal(s.classification,'antiaromatic (planar model)');assert.equal(s.piElectrons,4);assert.match(s.geometry,/planar/i);
});
test('cyclopentadienyl cation is conditional on planar singlet, not an assertion about its ground state',async()=>{
  const s=(await A.analyzeAromaticity('[CH+]1C=CC=C1')).systems[0];
  assert.equal(s.classification,'antiaromatic (planar model)');assert.equal(s.piElectrons,4);assert.match(s.explanation,/singlet|spin/i);
});
for(const [name,smiles,pi] of [['cyclohexane','C1CCCCC1',0],['cyclopentadiene','C1C=CC=C1',4],['cyclooctatetraene','C1=CC=CC=CC=C1',8]]) test(`nonaromatic reference: ${name}`,async()=>{
  const s=(await A.analyzeAromaticity(smiles)).systems[0];assert.equal(s.classification,'nonaromatic');assert.equal(s.piElectrons,pi);
  if(name==='cyclooctatetraene') assert.match(s.geometry,/nonplanar|tub/i);
});
test('pyrrole/furan donate one lone pair while pyridine contributes one electron and retains its lone pair',async()=>{
  for(const [smiles,donation] of [['c1cc[nH]c1',2],['c1ccoc1',2],['n1ccccc1',1]]) {
    const s=(await A.analyzeAromaticity(smiles)).systems[0];
    const hetero=s.contributions.find(a=>a.element!=='C');assert.equal(hetero.electrons,donation);assert.match(hetero.reason,/lone pair/i);
  }
});
test('fused systems keep individual rings; separate rings and mixed fused systems remain distinguishable',async()=>{
  const n=(await A.analyzeAromaticity('c1ccc2ccccc2c1')).systems[0];assert.equal(n.rings.length,2);assert.equal(n.atoms.length,10);
  const separate=await A.analyzeAromaticity('c1ccccc1C2CCCCC2');assert.equal(separate.systems.length,2);assert.deepEqual(separate.systems.map(s=>s.classification).sort(),['aromatic','nonaromatic']);
  const mixed=(await A.analyzeAromaticity('c1ccc2c(c1)CCCC2')).systems[0];assert.equal(mixed.classification,'mixed');assert.equal(mixed.piElectrons,null);
});
test('saturated fused, bridged and heterocyclic systems have interrupted cyclic conjugation',async()=>{
  for(const smiles of ['C1CCC2CCCCC2C1','C1CC2CCC1C2','C1COCCO1']) {
    const result=await A.analyzeAromaticity(smiles);
    assert.ok(result.systems.every(s=>s.classification==='nonaromatic'),smiles);
  }
});
test('wildcards, radicals, unsupported conjugated rings and invalid structures never invent antiaromaticity',async()=>{
  const wildcard=await A.analyzeAromaticity('*1=CC=CC=C1');assert.ok(wildcard.systems.every(s=>s.classification==='uncertain'));
  const large=await A.analyzeAromaticity('C1=CC=CC=CC=CC=CC=C1');assert.ok(large.systems.every(s=>s.classification!=='antiaromatic (planar model)'));
  const radical=await A.analyzeAromaticity('[C]1=CC=CC=C1');assert.ok(radical.systems.every(s=>s.classification==='uncertain'));
  await assert.rejects(A.analyzeAromaticity('not a structure'));
  assert.deepEqual((await A.analyzeAromaticity('CCO')).systems,[]);
});
