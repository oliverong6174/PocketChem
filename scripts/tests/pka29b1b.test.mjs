import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine, loadModule, closeEngine, getRdkit } from './engine.mjs';

// Expectations below are independent textbook chemistry (aqueous, 25 C), expressed as windows.
// Experimental values are read from the locally built reference index, never hard-coded.
const INDEX_PATH = 'public/data/pka-reference.index.json';
const haveIndex = fs.existsSync(INDEX_PATH);
const read = (p) => fs.readFileSync(p, 'utf8');
let ref, pres, acid, base, annotation, rd, index;
before(async () => {
  await loadEngine();
  ref = await loadModule('/src/utils/pkaReference.ts');
  pres = await loadModule('/src/utils/acidBasePresentation.ts');
  acid = await loadModule('/src/utils/ranking/acidBase/analyzeAcidity.ts');
  base = await loadModule('/src/utils/ranking/acidBase/analyzeBasicity.ts');
  annotation = await loadModule('/src/utils/moleculeAnnotation.ts');
  rd = await getRdkit();
  index = haveIndex ? JSON.parse(read(INDEX_PATH)) : null;
});
after(closeEngine);

const lookup = (smiles) => { const m = ref.matchReference(index, ref.pkaKeys(rd, smiles)); return m && { basis: m.basis, constants: ref.summarizeConstants(m.record.r) }; };
const constant = (r, kind, step = 1) => r.constants.find((c) => c.kind === kind && c.step === step);
const within = (value, lo, hi, what) => assert.ok(value >= lo && value <= hi, `${what}: ${value} not in ${lo}..${hi}`);

// ---------- matching policy (synthetic index: exercises the rules, not the data) ----------
const synthetic = (entries) => ({ v: 1, source: {}, e: entries });
test('matching: generic structures, salts, zwitterions and unspecified stereo never inherit a record', () => {
  const idx = synthetic({
    'CC(=O)O': { s: 0, r: [['a1', 4.76, 25, 'Reliable', 'X', '']] },
    'C[C@H](N)C(=O)O': { s: 1, r: [['h1', 2.3, 25, 'Reliable', 'X', '']] },
  });
  const m = (s) => ref.matchReference(idx, ref.pkaKeys(rd, s));
  assert.equal(m('CC(=O)O').basis, 'exact');
  assert.equal(m('*CC(=O)O'), null, 'generic');
  assert.equal(m('CC(=O)[O-].[Na+]'), null, 'salt');
  assert.equal(m('CC(=O)[O-]'), null, 'different protonation state');
  assert.equal(m('CC(N)C(=O)O'), null, 'unspecified stereo must not inherit the L record');
  assert.equal(m('C[C@@H](N)C(=O)O'), null, 'the D enantiomer of a stereo-specific record is not assumed identical');
  assert.equal(m('C[C@H](N)C(=O)O').basis, 'exact');
});
test('matching: a stereo-free record applies to a single stereocentre only (enantiomers), not to diastereomers', () => {
  const idx = synthetic({
    'CC(N)C(=O)O': { s: 0, r: [['a1', 9.9, 25, 'Reliable', 'X', '']] },
    'CC(O)C(C)O': { s: 0, r: [['a1', 14, 25, 'Reliable', 'X', '']] },
  });
  const m = (s) => ref.matchReference(idx, ref.pkaKeys(rd, s));
  assert.equal(m('C[C@H](N)C(=O)O').basis, 'enantiomer');
  assert.equal(m('C[C@@H](N)C(=O)O').basis, 'enantiomer');
  assert.equal(m('C[C@H](O)[C@@H](C)O'), null, 'two stereocentres: diastereomers can differ');
});

// ---------- aggregation ----------
test('aggregation: aqueous 25 C records only, best assessment tier, disagreement is a range and never an average', () => {
  const records = [
    ['a1', 4.76, 25, 'Approximate', 'A', ''], ['a1', 4.74, 25, 'Approximate', 'B', ''],
    ['a1', 4.1, 25, 'Uncertain', 'C', ''],            // lower tier: ignored
    ['a1', 5.25, 25, 'Approximate', 'D', 'D2O'],       // cosolvent/isotopic solvent: ignored
    ['a1', 4.9, 60, 'Approximate', 'E', ''],           // far from 25 C: ignored
    ['a2', 9.0, 25, 'Approximate', 'A', ''], ['a2', 10.2, 25, 'Approximate', 'B', ''],
    ['h1', -6.1, 25, 'Uncertain', 'F', ''],
    ['x9', 1, 25, 'Reliable', 'G', ''],               // unknown type: ignored
  ];
  const out = ref.summarizeConstants(records);
  const a1 = out.find((c) => c.kind === 'acid' && c.step === 1);
  assert.equal(a1.value, 4.75); assert.equal(a1.count, 2); assert.equal(a1.conflict, false);
  const a2 = out.find((c) => c.kind === 'acid' && c.step === 2);
  assert.equal(a2.value, null, 'conflicting measurements must not be averaged'); assert.equal(a2.conflict, true);
  assert.deepEqual([a2.min, a2.max], [9, 10.2]);
  assert.equal(ref.formatConstant(a2), '9 to 10.2');
  assert.equal(out.find((c) => c.kind === 'conjugateAcid').value, -6.1);
  assert.equal(out.length, 3);
  assert.deepEqual(ref.summarizeConstants([['a1', 4.7, 25, 'Reliable', 'A', 'dioxane 10%']]), [], 'cosolvent-only data yields nothing');
});

// ---------- real data ----------
test('reference data: representative molecules match chemistry (values come from the index)', { skip: !haveIndex }, () => {
  within(constant(lookup('CC(=O)O'), 'acid').value, 4.6, 4.9, 'acetic acid');
  within(constant(lookup('OC=O'), 'acid').value, 3.6, 3.9, 'formic acid');
  within(constant(lookup('OC(=O)c1ccccc1'), 'acid').value, 4.1, 4.3, 'benzoic acid');
  within(constant(lookup('Oc1ccccc1'), 'acid').value, 9.8, 10.1, 'phenol');
  within(constant(lookup('CN'), 'conjugateAcid').value, 10.4, 10.9, 'methylamine pKaH');
  within(constant(lookup('CCN'), 'conjugateAcid').value, 10.4, 10.9, 'ethylamine pKaH');
  within(constant(lookup('Nc1ccccc1'), 'conjugateAcid').value, 4.4, 4.8, 'anilinium');
  within(constant(lookup('c1ccncc1'), 'conjugateAcid').value, 5.0, 5.4, 'pyridinium');
});
test('reference data: polyprotic molecules keep every dissociation constant, in order', { skip: !haveIndex }, () => {
  const oxalic = lookup('OC(=O)C(=O)O'); const a1 = constant(oxalic, 'acid', 1).value; const a2 = constant(oxalic, 'acid', 2).value;
  within(a1, 1.1, 1.4, 'oxalic pKa1'); within(a2, 3.6, 4.4, 'oxalic pKa2'); assert.ok(a1 < a2);
  const citric = lookup('OC(=O)CC(O)(CC(O)=O)C(O)=O');
  const [c1, c2, c3] = [1, 2, 3].map((n) => constant(citric, 'acid', n).value);
  assert.ok(c1 < c2 && c2 < c3); within(c1, 2.8 - 0.4, 3.2, 'citric pKa1'); within(c3, 5.0, 6.5, 'citric pKa3');
});
test('reference data: glycine and amino acids expose both macroscopic steps separately; they are not collapsed', { skip: !haveIndex }, () => {
  const gly = lookup('NCC(=O)O');
  within(constant(gly, 'conjugateAcid').value, 2.2, 2.5, 'glycine carboxyl pKaH'); within(constant(gly, 'acid').value, 9.6, 9.9, 'glycine ammonium pKa');
  const ala = lookup('C[C@H](N)C(=O)O');
  within(constant(ala, 'conjugateAcid').value, 2.2, 2.5, 'alanine'); within(constant(ala, 'acid').value, 9.6, 10.0, 'alanine');
  const lys = lookup('NCCCC[C@H](N)C(=O)O');
  assert.equal(lys.constants.filter((c) => c.kind === 'conjugateAcid').length, 2, 'lysine keeps two pKaH steps');
  assert.ok(lys.constants.some((c) => c.conflict), 'lysine measurements disagree and are reported as a range');
});
test('reference data: unsupported cases return nothing', { skip: !haveIndex }, () => {
  assert.equal(lookup('N'), null, 'ammonia is inorganic: not in the organic dataset');
  assert.equal(lookup('*CC(=O)O'), null);
  assert.equal(lookup('[NH3+]CC([O-])=O'), null, 'zwitterion is a different canonical structure');
  assert.equal(lookup('CC(=O)[O-].[Na+]'), null);
  assert.equal(ref.matchReference(index, null), null);
});
test('site assignment: only when structurally unambiguous', { skip: !haveIndex }, async () => {
  const rowsFor = async (smiles) => pres.acidBaseSiteRows(await acid.analyzeAcidity(smiles, []), await base.analyzeBasicity(smiles, []));
  const sites = (rows) => rows.map((r) => ({ id: r.id, kind: r.kind, estimate: r.center, range: r.range }));
  // acetic acid: one aqueous acid site, one pKa -> assigned to the carboxylic O-H, not to the other model sites.
  const aceticRows = await rowsFor('CC(=O)O');
  const acetic = ref.assignToSites(sites(aceticRows), lookup('CC(=O)O').constants);
  assert.equal(acetic.length, 1);
  const chosen = aceticRows.find((r) => r.id === acetic[0].siteId);
  assert.equal(chosen.kind, 'Acid'); assert.match(chosen.label, /carboxylic|O.?H/i);
  // methylamine: pKaH goes to the amine nitrogen
  const mea = ref.assignToSites(sites(await rowsFor('CN')), lookup('CN').constants);
  assert.equal(mea.length, 1); assert.equal(mea[0].constant.kind, 'conjugateAcid');
  // glycine has an acid and a base site AND two macroscopic constants: nothing is site-assigned unless unambiguous per behavior,
  // and a constant is never moved to a site because its number happens to look similar.
  const glyRows = await rowsFor('NCC(=O)O');
  const gly = ref.assignToSites(sites(glyRows), lookup('NCC(=O)O').constants);
  for (const a of gly) {
    const row = glyRows.find((r) => r.id === a.siteId);
    assert.ok(Math.abs(a.constant.value - row.center) <= 4, 'an assigned constant must lie close to the model estimate of its site');
  }
  // synthetic ambiguity: two acid sites in the window -> no assignment
  const two = ref.assignToSites([{ id: 'a', kind: 'Acid', estimate: 4, range: [3, 5] }, { id: 'b', kind: 'Acid', estimate: 10, range: [9, 11] }], [{ kind: 'acid', step: 1, value: 4.2, min: 4.2, max: 4.2, count: 1, assessment: 'Reliable', tempC: 25, conflict: false }]);
  assert.deepEqual(two, []);
  // two constants for one site -> no assignment; a far-off constant -> no assignment; pKb is never assigned
  const c = (kind, step, value) => ({ kind, step, value, min: value, max: value, count: 1, assessment: 'Reliable', tempC: 25, conflict: false });
  const one = [{ id: 'a', kind: 'Acid', estimate: 4, range: [3, 5] }];
  assert.deepEqual(ref.assignToSites(one, [c('acid', 1, 4.1), c('acid', 2, 9.5)]), []);
  assert.deepEqual(ref.assignToSites(one, [c('acid', 1, 12.5)]), []);
  assert.deepEqual(ref.assignToSites([{ id: 'b', kind: 'Base', estimate: 10, range: [9, 11] }], [c('pKb', 1, 3.9)]), []);
});

// ---------- estimates ----------
test('estimated pKa: wide ranges round to integers, narrow to halves; always inside the range; pKb relation', () => {
  assert.equal(pres.representativePka(10.3, [8, 12]), 10);
  assert.equal(pres.representativePka(4.76, [4, 5.5]), 5);
  const r = pres.representativePka(4.3, [4.2, 4.4]); assert.ok(r >= 4.2 && r <= 4.4);
  assert.equal(pres.formatPkaRange([-3, 1]), '−3 to 1');
  assert.equal(pres.formatPkaRange([4, 6]), '4–6');
  assert.equal(pres.pKbFromConjugateAcid(10.5), 3.5);
});
test('site rows expose the engine centre estimate for acids and the conjugate-acid estimate for bases', async () => {
  const acids = await acid.analyzeAcidity('CC(=O)O', []); const bases = await base.analyzeBasicity('CN', []);
  const rows = pres.acidBaseSiteRows(acids, bases);
  assert.equal(rows[0].center, acids[0].estimatedPkaNumber);
  assert.equal(rows.find((r) => r.kind === 'Base').center, bases[0].conjugateAcidPkaNumber);
});

// ---------- highlighting ----------
test('highlighting: a highlighted bond highlights both endpoint atoms (single, double, triple, aromatic)', async () => {
  const bondEndpoints = (smiles) => { const m = rd.get_mol(smiles); try { return annotation.bondEndpointMap(m); } finally { m.delete(); } };
  assert.deepEqual(bondEndpoints('CC=CC#N').get(1), [1, 2]);
  assert.deepEqual(bondEndpoints('CC=CC#N').get(3), [3, 4]);
  assert.ok(bondEndpoints('c1ccccc1').size === 6);
  const circles = (svg) => (svg.match(/<ellipse/g) ?? []).length;
  const bondOnly = await annotation.getHighlightedMoleculeSvg('CC=CC#N', [], [], null, 1);
  assert.ok(circles(bondOnly) >= 2, `double bond should mark both carbons (${circles(bondOnly)})`);
  const triple = await annotation.getHighlightedMoleculeSvg('CC=CC#N', [], [], null, 3);
  assert.ok(circles(triple) >= 2, 'triple bond should mark both C and N');
  const none = await annotation.getHighlightedMoleculeSvg('CC=CC#N', [], [], null, null);
  assert.equal(circles(none), 0, 'no selection, no highlight');
  const system = await annotation.getHighlightedMoleculeSvg('CC=CC#N', [], [], null, null, [], [1]);
  assert.ok(circles(system) >= 2, 'selected system bonds also mark their atoms');
  const unrelated = await annotation.getHighlightedMoleculeSvg('CCCCC=CCCCC', [], [], null, 5);
  assert.equal(circles(unrelated), 2, 'only the two participating atoms, not their neighbours');
});

// ---------- layout and presentation (static) ----------
test('sticky offsets derive from the measured header height; no hard-coded 16px/18px sticky tops remain', () => {
  const shell = read('src/components/shell/AppShell.tsx');
  assert.match(shell, /--shell-h/); assert.match(shell, /ResizeObserver/);
  assert.match(read('src/styles/tokens.css'), /--sticky-top: calc\(var\(--shell-h\)/);
  for (const f of ['src/styles/properties.css', 'src/App.css', 'src/styles/generalChem.css', 'src/styles/ui.css']) {
    const css = read(f);
    for (const block of css.match(/[^{}]*\{[^{}]*position:\s*sticky[^{}]*\}/g) ?? []) {
      if (/\.shell\b|\.shell \{/.test(block) || /bottom:\s*0/.test(block)) continue;
      assert.doesNotMatch(block, /top:\s*(0|16px|18px|76px|96px)\s*;/, `${f}: ${block.trim().slice(0, 80)}`);
    }
  }
});
test('decorative bullet-like separators are gone from the Properties workspace and the Acid/Base data', () => {
  for (const f of ['src/components/properties/AcidBasePanel.tsx', 'src/components/properties/AromaticityPanel.tsx', 'src/components/properties/CounterpartExplorer.tsx', 'src/components/properties/PropertiesResults.tsx', 'src/components/properties/MolecularDepiction.tsx']) {
    assert.ok(!/[·•]/.test(read(f)), f);
  }
  const rows = read('src/utils/propertiesSections.ts');
  assert.match(rows, /Estimated physicochemical tendencies/);
  assert.doesNotMatch(read('src/components/properties/PropertiesResults.tsx'), /estimated, not measured/);
});
test('chemically meaningful dots are preserved', () => {
  for (const f of ['src/components/biochem/ProteinDiagrams.tsx']) assert.match(read(f), /O···H/);
  assert.match(read('src/components/physics/RcPage.tsx'), /e\^\(/);
});
test('the reference index is optional, lazily fetched, git-ignored and never imported into the bundle', () => {
  assert.match(read('.gitignore'), /public\/data\/pka-reference\.index\.json/);
  const panel = read('src/components/properties/AcidBasePanel.tsx');
  assert.match(panel, /loadPkaIndex/); assert.doesNotMatch(panel, /pka-reference\.index\.json/);
  assert.match(read('src/utils/pkaReference.ts'), /return null; \/\/ not installed/);
  assert.doesNotMatch(read('src/utils/pkaReference.ts'), /import .*\.json/);
});
