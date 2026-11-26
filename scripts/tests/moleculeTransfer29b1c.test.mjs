import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';

let T, rd;
before(async () => { await loadEngine(); T = await loadModule('/src/utils/moleculeTransfer.ts'); rd = await (await loadModule('/src/utils/rdkit.ts')).getRDKit(); });
after(closeEngine);

const canon = (s) => { const m = rd.get_mol(s); try { return m.get_smiles(); } finally { m.delete(); } };

for (const [name, smiles] of [
  ['L-leucine', 'CC(C)C[C@H](N)C(=O)O'],
  ['D-leucine', 'CC(C)C[C@@H](N)C(=O)O'],
  ['glucose (beta-D-pyranose)', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O'],
  ['cholesterol', 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C'],
  ['E-2-butene', 'C/C=C/C'],
  ['Z-2-butene', 'C/C=C\C'],
  ['deuterated methanol', '[2H]OC([2H])([2H])[2H]'],
  ['13C acetic acid anion', 'C[13C](=O)[O-]'],
  ['ammonium chloride (two components)', '[NH4+].[Cl-]'],
  ['benzene', 'c1ccccc1'],
  ['spermidine', 'NCCCCNCCCN'],
]) {
  test(`exportMolecule keeps identity: ${name}`, async () => {
    const out = await T.exportMolecule({ smiles });
    assert.ok(out, 'exported');
    assert.equal(canon(out.smiles), canon(smiles), 'isomeric SMILES unchanged');
    // the generated Molfile must read back to the same structure
    assert.match(out.molfile, /M {2}END/);
    const back = rd.get_mol(out.molfile);
    assert.ok(back, 'molfile reads back');
    try {
      assert.equal(back.get_smiles(), canon(smiles), 'Molfile round-trips to the same isomeric SMILES');
    } finally { back.delete(); }
  });
}

test('a generated Molfile of a stereo structure carries the absolute-stereo flag; achiral ones do not', async () => {
  const flag = (m) => m.split(/\r?\n/)[3].slice(12, 15).trim();
  assert.equal(flag((await T.exportMolecule({ smiles: 'CC(C)C[C@H](N)C(=O)O' })).molfile), '1');
  assert.equal(flag((await T.exportMolecule({ smiles: 'NCCCCNCCCN' })).molfile), '0');
});

test('an existing Molfile is passed through byte for byte', async () => {
  const m = rd.get_mol('C[C@H](N)C(=O)O'); m.set_new_coords(); const molfile = m.get_molblock(); m.delete();
  const out = await T.exportMolecule({ molfile, smiles: 'CC(N)C(=O)O' });
  assert.equal(out.molfile, molfile);
  assert.match(out.smiles, /@/, 'stereo comes from the Molfile, not the achiral SMILES');
});

test('enantiomers stay distinct and never become achiral', async () => {
  const l = await T.exportMolecule({ smiles: 'C[C@H](N)C(=O)O' });
  const d = await T.exportMolecule({ smiles: 'C[C@@H](N)C(=O)O' });
  assert.notEqual(l.smiles, d.smiles);
  assert.match(l.smiles, /@/);
});

test('generic atoms and invalid input', async () => {
  const generic = await T.exportMolecule({ smiles: '*CC(=O)O' });
  assert.ok(generic && /\*/.test(generic.smiles));
  assert.equal(await T.exportMolecule({ smiles: 'not a smiles ((' }), null);
  assert.equal(await T.exportMolecule({}), null);
});

test('transfer inbox is one-shot and addressed', () => {
  const x = { molfile: 'm', smiles: 'C', label: 'methane' };
  T.putMoleculeTransfer('acidBase', 'analysis', x);
  assert.equal(T.peekMoleculeTransfer('spectroscopy'), null);
  const p = T.peekMoleculeTransfer('acidBase');
  assert.equal(p.from, 'analysis');
  assert.equal(T.takeMoleculeTransfer('acidBase', p.sequence + 1), null, 'a stale sequence does not consume');
  assert.ok(T.takeMoleculeTransfer('acidBase', p.sequence));
  assert.equal(T.takeMoleculeTransfer('acidBase'), null, 'consumed once');
});

test('a Molfile with an empty title line is accepted by the conformation tools (header is not trimmed away)', async () => {
  const G = await loadModule('/src/utils/conformations/graph.ts');
  const out = await T.exportMolecule({ smiles: 'CC(C)C[C@H](N)C(=O)O' });
  assert.ok(out.molfile.startsWith('\n') || out.molfile.split(/\r?\n/)[0] === '', 'the title line is empty');
  const built = G.buildConformationGraph(rd, out.molfile);
  assert.equal(built.ok, true, built.message);
});
