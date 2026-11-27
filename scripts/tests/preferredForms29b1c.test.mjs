// Stage 29B-1C: representative-form defaults and biomolecule name coverage.
// Expected structures are hand-written literature SMILES, not copies of resolver output.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';

let resolver;
before(async () => {
  await loadEngine();
  window.location = { origin: 'http://localhost' };
  const bytes = fs.readFileSync('public/data/chemical-names.index.json.gz');
  globalThis.fetch = async () => new Response(bytes);
  resolver = await loadModule('/src/utils/moleculeNameResolver.ts');
});
after(closeEngine);

const resolve = (name) => resolver.resolveMoleculeName(name);
const key = (s) => resolver.molecularStructureKey(s);
const same = async (name, smiles) => {
  const r = await resolve(name);
  assert.equal(await key(r.smiles), await key(smiles), `${name} -> ${r.title}`);
  return r;
};

const BETA_D_GLC = 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O';
const ALPHA_D_GLC = 'OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O';

test('unqualified glucose loads beta-D-glucopyranose and keeps every other form reachable', async () => {
  for (const name of ['glucose', 'D-glucose', 'Glucose']) {
    const r = await same(name, BETA_D_GLC);
    assert.equal(r.variantLabel, 'β-D-glucopyranose', name);
    assert.ok(r.representative, 'marked as a representative choice');
    const labels = r.forms.map((f) => f.variantLabel);
    assert.deepEqual(labels.slice(0, 3), ['β-D-glucopyranose', 'α-D-glucopyranose', 'aldehydo-D-glucose'], 'common forms first');
    assert.ok(labels.some((l) => l.includes('furanose')), `${name}: furanose forms offered`);
    assert.equal(labels.some((l) => l.includes('L-')), name !== 'D-glucose', `${name}: L series only when not stated`);
    assert.equal(new Set(r.forms.map((f) => f.sourceId)).size, r.forms.length, 'no duplicate forms');
  }
});

test('an explicit specification always wins over the preference', async () => {
  await same('alpha-D-glucopyranose', ALPHA_D_GLC);
  await same('α-D-glucose', ALPHA_D_GLC);
  await same('beta-L-glucopyranose', 'OC[C@@H]1O[C@H](O)[C@@H](O)[C@H](O)[C@H]1O');
  const l = await same('L-glucose', 'OC[C@@H]1O[C@H](O)[C@@H](O)[C@H](O)[C@H]1O');
  assert.ok(l.forms.every((f) => f.variantLabel.includes('L-')), 'L-glucose never offers or loads D');
  for (const name of ['open-chain D-glucose', 'acyclic D-glucose', 'aldehydo-D-glucose']) {
    const r = await same(name, 'O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO');
    assert.equal(r.representative, undefined, name);
  }
  await same('D-leucine', 'CC(C)C[C@@H](N)C(=O)O');
  await same('D-lysine', 'NCCCC[C@@H](N)C(=O)O');
});

test('unqualified amino acids load the L form and offer D and the unspecified record', async () => {
  for (const [name, smiles] of [['leucine', 'CC(C)C[C@H](N)C(=O)O'], ['alanine', 'C[C@H](N)C(=O)O'], ['cysteine', 'N[C@@H](CS)C(=O)O'], ['lysine', 'NCCCC[C@H](N)C(=O)O']]) {
    const r = await same(name, smiles);
    assert.deepEqual(r.forms.map((f) => f.variantLabel), [`L-${name}`, `D-${name}`, `${name}, stereochemistry unspecified`]);
    assert.doesNotMatch(r.forms[2].smiles, /@/);
  }
  assert.equal((await resolve('glycine')).forms, undefined);
  assert.equal((await resolve('DL-leucine')).smiles.includes('@'), false, 'a racemic name is not narrowed to L');
});

test('other defensible defaults', async () => {
  await same('galactose', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@H]1O');
  await same('mannose', 'OC[C@H]1O[C@H](O)[C@@H](O)[C@@H](O)[C@@H]1O');
  await same('fructose', 'OC[C@@]1(O)OC[C@@H](O)[C@@H](O)[C@@H]1O');
  await same('ribose', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O');
  await same('lactic acid', 'C[C@H](O)C(=O)O');
  await same('AMP', 'Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)O)[C@@H](O)[C@H]1O');
  await same('GMP', 'Nc1nc2c(ncn2[C@@H]2O[C@H](COP(=O)(O)O)[C@@H](O)[C@H]2O)c(=O)[nH]1');
  const d = await resolve('vitamin D');
  assert.equal(d.title, 'calciol', 'vitamin D is not a hydroxylated metabolite');
  assert.equal(d.molecularFormula, 'C27H44O');
  assert.equal((await resolve('vitamin C')).title, 'L-ascorbic acid');
  assert.equal((await resolve('thiamine')).molecularFormula, 'C12H17N4OS');
  assert.equal((await resolve('retinol')).title, 'all-trans-retinol');
  assert.equal((await resolve('maltose')).title, 'β-maltose');
  assert.equal((await resolve('lactose')).title, 'β-lactose');
  assert.equal((await resolve('vitamin B12')).molecularFormula, 'C63H88CoN14O14P');
});

test('real ambiguity stays a selector, and families stay families', async () => {
  for (const name of ['vitamin B3', 'arabinose']) {
    await assert.rejects(() => resolve(name), (e) => e.name === 'MoleculeNameAmbiguousError' && e.variants.length >= 2, name);
  }
  const k = await resolve('vitamin K');
  assert.equal(resolver.isGenericResolution(k), true);
  assert.equal(k.forms, undefined);
});

test('priority biomolecules resolve to concrete structures', async () => {
  const names = ['sucrose', 'maltose', 'lactose', 'glutathione', 'deoxyribose', 'adenosine', 'AMP', 'ADP', 'ATP', 'cAMP', 'cGMP', 'GMP', 'GDP', 'GTP',
    'putrescine', 'spermidine', 'spermine', 'cadaverine', 'NAD+', 'NADH', 'NADP+', 'NADPH', 'FAD', 'FMN', 'coenzyme A', 'acetyl-CoA',
    'pyruvate', 'lactate', 'citrate', 'alpha-ketoglutarate', 'succinate', 'fumarate', 'malate', 'oxaloacetate',
    'cholesterol', 'palmitic acid', 'oleic acid', 'vitamin A', 'vitamin B1', 'vitamin B2', 'niacin', 'vitamin B6', 'vitamin B12', 'folic acid', 'biotin',
    'vitamin C', 'vitamin D', 'vitamin E', 'vitamin K1', 'cortisol', 'dopamine', 'testosterone', 'estradiol',
    'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'proline', 'phenylalanine', 'tyrosine', 'tryptophan', 'serine', 'threonine',
    'cysteine', 'methionine', 'asparagine', 'glutamine', 'aspartic acid', 'glutamic acid', 'lysine', 'arginine', 'histidine'];
  const failures = [];
  for (const name of names) {
    try {
      const r = await resolve(name);
      if (resolver.isGenericResolution(r) || !(await key(r.smiles))) failures.push(`${name}: not a concrete readable structure`);
    } catch (error) { failures.push(`${name}: ${error.name}`); }
  }
  assert.deepEqual(failures, []);
});

// The packed ChEBI SMILES lack aromatic [nH]; the resolver restores it only when the recorded formula confirms it.
for (const [name, smiles] of [
  ['L-tryptophan', 'N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O'],
  ['uracil', 'O=c1cc[nH]c(=O)[nH]1'],
  ['guanosine 5-monophosphate', 'Nc1nc2c(ncn2[C@@H]2O[C@H](COP(=O)(O)O)[C@@H](O)[C@H]2O)c(=O)[nH]1'],
  ['riboflavin', 'Cc1cc2nc3c(=O)[nH]c(=O)nc-3n(C[C@H](O)[C@H](O)[C@H](O)CO)c2cc1C'],
  ['indole', 'c1ccc2[nH]ccc2c1'],
]) {
  test(`aromatic N-H is restored: ${name}`, async () => {
    const r = await same(name === 'guanosine 5-monophosphate' ? 'GMP' : name, smiles);
    assert.match(r.structureNote ?? '', /N–H/);
  });
}

test('a tautomer choice is disclosed, and readable structures carry no note', async () => {
  const his = await resolve('L-histidine');
  assert.ok(await key(his.smiles));
  assert.match(his.structureNote ?? '', /tautomer/);
  assert.equal((await resolve('adenosine')).structureNote, undefined);
});

test('a structure whose formula cannot be confirmed is left exactly as stored', async () => {
  const NH = await loadModule('/src/utils/aromaticNH.ts');
  const rd = await (await loadModule('/src/utils/rdkit.ts')).getRDKit();
  assert.equal(NH.restoreAromaticNH(rd, 'c1ccnc1', 'C4H9N'), null, 'wrong formula');
  assert.equal(NH.restoreAromaticNH(rd, 'c1ccnc1', null), null, 'no formula to check against');
  assert.equal(NH.restoreAromaticNH(rd, 'c1ccnc1', 'C4H5N').smiles, 'c1cc[nH]c1');
});
