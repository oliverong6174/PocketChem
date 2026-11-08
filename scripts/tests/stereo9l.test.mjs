import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';
let stereo, names;
before(async () => {
  ({ stereo } = await loadEngine());
});
after(closeEngine);
const key = async s => { const k = await stereo.canonicalizeStereoStructure(s); assert.ok(k); return k; };
test('meso mirror identity is not an enantiomeric pair', async () => {
  const a = await key('C[C@H](O)[C@H](O)C');
  const b = await key('C[C@@H](O)[C@@H](O)C');
  assert.equal(stereo.compareStereoStructureKeys(a, b), 'exact');
  assert.equal(await stereo.areCanonicalEnantiomers(a, b), false);
});
test('atom maps do not change chemical identity or tetrahedral configuration', async () => {
  assert.equal(stereo.compareStereoStructureKeys(await key('[CH3:8][C@H:2](O)CC'), await key('C[C@H](O)CC')), 'exact');
});
test('R/S, E/Z, diastereomers and unspecified stereo remain distinct', async () => {
  for (const [a,b,want] of [
    ['C[C@H](O)CC','C[C@@H](O)CC','stereo-conflict'],
    ['CC/C=C/CC','CC/C=C\\CC','stereo-conflict'],
    ['C[C@H](O)[C@H](O)C','C[C@H](O)[C@@H](O)C','stereo-conflict'],
    ['CC(O)CC','C[C@H](O)CC','connectivity-only'],
    ['[13CH3]CO','CCO','different'],
    ['C[C@H](O)CC','CC[C@@H](O)C','exact'],
  ]) assert.equal(stereo.compareStereoStructureKeys(await key(a), await key(b)),want, `${a} / ${b}`);
});
test('a racemic mixture cannot verify a pure synthesis target', async () => {
  assert.equal(stereo.stereochemicalMixtureCanSatisfyTarget('racemic', await key('C[C@H](O)CC')), false);
  assert.equal(stereo.stereochemicalMixtureCanSatisfyTarget('racemic', await key('CC(O)CC')), true);
});
test('partially specified tetrahedral or alkene geometry cannot prove an enantiomer pair', async () => {
  for(const [a,b] of [
    ['C[C@H](O)C(O)CC','C[C@@H](O)C(O)CC'],
    ['C[C@H](O)CC=CCC','C[C@@H](O)CC=CCC'],
  ])assert.equal(await stereo.areCanonicalEnantiomers(await key(a),await key(b)),false);
  assert.equal(await stereo.areCanonicalEnantiomers(await key('C[C@H](O)C/C=C/CC'),await key('C[C@@H](O)C/C=C/CC')),true);
});
test('name comparison retains stereogenic unit locants and relative contradictions', async () => {
  names = await loadModule('/src/utils/nomenclature/nameEquivalence.ts');
  for (const [a,b] of [
    ['(2R)-hexane-2,4-diol','(4R)-hexane-2,4-diol'],
    ['(2E)-hepta-2,4-diene','(4E)-hepta-2,4-diene'],
    ['cis-(1R,2R)-cyclohexane-1,2-diol','trans-(1R,2R)-cyclohexane-1,2-diol'],
    ['(R)-butan-2-ol','butan-2-ol'],
    ['(2r)-hexane-2,4-diol','(2R)-hexane-2,4-diol'],
    ['rac-but an-2-ol','but an-2-ol'],
  ]) assert.equal(await names.namesEquivalent(a,b), false, `${a} / ${b}`);
  assert.equal(await names.namesEquivalent('(R)-butan-2-ol','(2R)-butan-2-ol'),true);
  assert.equal(await names.namesEquivalent('methyl ethanoate','methyl acetate'),true);
  assert.equal(await names.namesEquivalent('(2R,4S)-hexane-2,4-diol','(4S,2R)-hexane-2,4-diol'),true);
});
test('independently resolved structures recognize the meso names despite descriptor order', async () => {
  names ??= await loadModule('/src/utils/nomenclature/nameEquivalence.ts');
  const structures = new Map([
    ['(2R,3S)-butane-2,3-diol', 'C[C@H](O)[C@H](O)C'],
    ['(2S,3R)-butane-2,3-diol', 'C[C@@H](O)[C@@H](O)C'],
    ['(2R,3R)-butane-2,3-diol', 'C[C@@H](O)[C@H](O)C'],
  ]);
  const resolve = async name => structures.get(name) ?? null;
  assert.equal(await names.namesEquivalent(...[...structures.keys()].slice(0,2), resolve), true);
  assert.equal(await names.namesEquivalent([...structures.keys()][0], [...structures.keys()][2], resolve), false);
});
