// Stage 29B-1C: Ketcher stores a pyrrole-type N-H as implicitHCount; dropping it left the ring unreadable.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';

let S;
before(async () => { await loadEngine(); S = await loadModule('/src/utils/ketcherSnapshot.ts'); });
after(closeEngine);

const aromaticRing = (hetero) => JSON.stringify({
  root: { nodes: [{ $ref: 'mol0' }] },
  mol0: {
    type: 'molecule',
    atoms: [hetero, ...[[0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]].map(([x, y]) => ({ label: 'C', location: [x, y, 0] }))],
    bonds: [0, 1, 2, 3, 4].map((i) => ({ type: 4, atoms: [i, (i + 1) % 5] })),
  },
});

test('an aromatic N-H from the editor is kept (pyrrole)', async () => {
  const out = await S.snapshotFromKetText(aromaticRing({ label: 'N', location: [0, 1, 0], implicitHCount: 1 }));
  assert.equal(out?.smiles, 'c1cc[nH]c1');
});

test('no hydrogen is invented when the editor records none', async () => {
  const out = await S.snapshotFromKetText(aromaticRing({ label: 'O', location: [0, 1, 0] }));
  assert.equal(out?.smiles, 'c1ccoc1');
  assert.doesNotMatch(out.molfile, /SGROUP/);
});

// Enhanced stereo: dropping Ketcher's stereoLabel let a racemic or relative drawing be copied as one absolute enantiomer.
const alanine = (stereoLabel) => JSON.stringify({
  root: { nodes: [{ $ref: 'mol0' }] },
  mol0: {
    type: 'molecule',
    atoms: [['C', 0, 0], ['C', 1.3, 0.75], ['N', 1.3, 2.25], ['C', 2.6, 0], ['O', 2.6, -1.5], ['O', 3.9, 0.75]]
      .map(([label, x, y], i) => ({ label, location: [x, y, 0], ...(i === 1 && stereoLabel ? { stereoLabel } : {}) })),
    bonds: [{ type: 1, atoms: [1, 0], stereo: 1 }, { type: 1, atoms: [1, 2] }, { type: 1, atoms: [1, 3] }, { type: 2, atoms: [3, 4] }, { type: 1, atoms: [3, 5] }],
  },
});

for (const [label, group, kind] of [['&1', 'STERAC1', '&1'], ['or1', 'STEREL1', 'o1'], ['abs', 'STEABS', null]]) {
  test(`the editor's stereo label ${label} reaches the Molfile and the copy`, async () => {
    const snapshot = await S.snapshotFromKetText(alanine(label));
    assert.match(snapshot.molfile, new RegExp(`MDLV30/${group} ATOMS=\\(1 2\\)`));
    const copy = await (await loadModule('/src/utils/moleculeTransfer.ts')).exportMolecule({ molfile: snapshot.molfile });
    if (kind) assert.ok(copy.smiles.includes(`|${kind}:1|`), copy.smiles);
    else assert.doesNotMatch(copy.smiles, /\|/);
  });
}

test('a drawing without stereo labels gets no collection block', async () => {
  const snapshot = await S.snapshotFromKetText(alanine(null));
  assert.doesNotMatch(snapshot.molfile, /COLLECTION/);
});
