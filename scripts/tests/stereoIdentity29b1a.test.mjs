// Stage 29B-1A: stereochemical identity, amino-acid/carbohydrate name resolution, chirality status,
// bond-orbital consolidation and Properties presentation. Expected values are independent literature
// facts (CIP descriptors of the natural amino acids and glucose forms), not copies of engine output.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine, loadModule, closeEngine } from './engine.mjs';

let resolver, chir, annotation;
before(async () => {
  await loadEngine();
  window.location = { origin: 'http://localhost' };
  const bytes = fs.readFileSync('public/data/chemical-names.index.json.gz');
  globalThis.fetch = async () => new Response(bytes);
  resolver = await loadModule('/src/utils/moleculeNameResolver.ts');
  chir = await loadModule('/src/utils/chiralityUtils.ts');
  annotation = await loadModule('/src/utils/moleculeAnnotation.ts');
});
after(closeEngine);

const resolve = (name) => resolver.resolveMoleculeName(name);
const centers = async (smiles) => (await chir.analyzeChirality(smiles)).map((c) => c.configuration);
const sorted = (a) => [...a].sort().join('');
const mirror = (smiles) => smiles.replace(/@@/g, '#').replace(/@/g, '@@').replace(/#/g, '@');
const quiet = (fn) => async (...a) => { const log = console.log; console.log = () => {}; try { return await fn(...a); } finally { console.log = log; } };
const cc = quiet(centers);

test('L/D amino-acid names resolve to the specific stereoisomer, with the expected CIP labels', async () => {
  // L is S for every proteinogenic amino acid except cysteine (R, because CH2SH outranks COOH).
  const expected = { 'L-alanine': 'S', 'D-alanine': 'R', 'L-valine': 'S', 'L-leucine': 'S', 'D-leucine': 'R', 'L-lysine': 'S', 'D-lysine': 'R', 'L-cysteine': 'R' };
  for (const [name, cip] of Object.entries(expected)) {
    const r = await resolve(name);
    assert.match(r.smiles, /@/, `${name} keeps its stereo marks`);
    assert.deepEqual(await cc(r.smiles), [cip], name);
  }
  assert.equal(sorted(await cc((await resolve('L-threonine')).smiles)), 'RS'); // (2S,3R)
  assert.equal(sorted(await cc((await resolve('L-isoleucine')).smiles)), 'SS'); // (2S,3S)
});

test('glycine has no stereocenter; unqualified leucine/lysine have a potential one, unspecified', async () => {
  const gly = await resolve('glycine');
  assert.deepEqual(await cc(gly.smiles), []);
  for (const name of ['leucine', 'lysine']) {
    const r = await resolve(name);
    assert.doesNotMatch(r.smiles, /@/, `${name} is stored without stereo in the database`);
    assert.deepEqual(await cc(r.smiles), ['unknown'], name);
  }
});

test('the database does not silently assign L to an unqualified name; it offers L and D', async () => {
  for (const name of ['leucine', 'lysine', 'alanine']) {
    const r = await resolve(name);
    const variants = await resolver.findStereoVariants(r);
    assert.deepEqual(variants.map((v) => v.variantLabel), [`L-${r.title}`, `D-${r.title}`], name);
    assert.deepEqual(await Promise.all(variants.map((v) => cc(v.smiles))), [['S'], ['R']], name);
  }
  assert.deepEqual(await resolver.findStereoVariants(await resolve('L-leucine')), []);
  assert.deepEqual(await resolver.findStereoVariants(await resolve('glycine')), []);
});

test('equivalent writings share an identity; stereoisomers do not', async () => {
  const key = (s) => resolver.molecularStructureKey(s);
  assert.equal(await key('C[C@H](N)C(=O)O'), await key('N[C@@H](C)C(=O)O'));
  assert.equal(await key('C[C@H](N)C(=O)O'), await key((await resolve('L-alanine')).smiles));
  assert.notEqual(await key('C[C@H](N)C(=O)O'), await key('C[C@@H](N)C(=O)O'));
  assert.notEqual(await key((await resolve('L-leucine')).smiles), await key((await resolve('D-leucine')).smiles));
  assert.notEqual(await key('CC(C)CC(N)C(=O)O'), await key((await resolve('L-leucine')).smiles));
  assert.equal(await resolver.flatStructureKey((await resolve('L-leucine')).smiles), await resolver.flatStructureKey((await resolve('D-leucine')).smiles));
});

test('residue entries sharing the free amino acid synonym no longer make the name ambiguous', async () => {
  const r = await resolve('L-leucine');
  assert.ok(!r.smiles.includes('*'));
  assert.equal(r.sourceId, 'CHEBI:15603');
});

test('non-amino-acid stereochemistry is preserved (multiple centers, cholesterol, lactic acid)', async () => {
  const chol = await resolve('cholesterol');
  assert.equal((await cc(chol.smiles)).length, 8);
  assert.ok((await cc(chol.smiles)).every((c) => c === 'R' || c === 'S'));
  const lactic = await cc('C[C@H](O)C(=O)O');
  assert.deepEqual(lactic, ['S']); // L-(+)-lactic acid is (S)
  assert.deepEqual(await cc('CC(O)C(=O)O'), ['unknown']);
  assert.deepEqual(await cc('CC(C)C(=O)O'), []); // isobutyric acid is achiral
});

const GLUCOSE_FORMS = {
  'alpha-D-glucopyranose': { smiles: 'OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O', cip: 'RRSSS' }, // (2S,3R,4S,5S,6R)
  'beta-D-glucopyranose': { smiles: 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', cip: 'RRRSS' }, // (2R,3R,4S,5S,6R)
};

test('glucose forms: the D anomers resolve to the literature structures', async () => {
  const key = (s) => resolver.molecularStructureKey(s);
  for (const [name, ref] of Object.entries(GLUCOSE_FORMS)) {
    const r = await resolve(name);
    assert.equal(await key(r.smiles), await key(ref.smiles), name);
    assert.equal(sorted(await cc(r.smiles)), ref.cip, name);
  }
  const open = await resolve('aldehydo-D-glucose');
  assert.equal(sorted(await cc(open.smiles)), 'RRRS'); // (2R,3S,4R,5R)
  assert.match(open.smiles, /C\(=O\)|O=C/); // aldehyde, not a ring
});

test('alpha and beta anomers are different identities; the L series is the exact mirror image', async () => {
  const key = (s) => resolver.molecularStructureKey(s);
  const a = await resolve('alpha-D-glucopyranose'); const b = await resolve('beta-D-glucopyranose');
  assert.notEqual(await key(a.smiles), await key(b.smiles));
  const aL = await resolve('alpha-L-glucopyranose'); const bL = await resolve('beta-L-glucopyranose');
  assert.equal(await key(aL.smiles), await key(mirror(a.smiles)));
  assert.equal(await key(bL.smiles), await key(mirror(b.smiles)));
  assert.notEqual(await key(aL.smiles), await key(a.smiles));
});

test('glucose, D-glucose and L-glucose are not silently collapsed to one form', async () => {
  for (const name of ['glucose', 'D-glucose', 'L-glucose', 'Glucose', 'd-glucose']) {
    await assert.rejects(() => resolve(name), (e) => {
      assert.equal(e.name, 'MoleculeNameAmbiguousError', name);
      assert.ok(e.variants.length >= 3, `${name} offers several forms`);
      return true;
    });
  }
  const dErr = await resolve('D-glucose').catch((e) => e);
  assert.ok(dErr.variants.every((v) => v.variantLabel.includes('D-')), 'D-glucose offers only the D series');
  const labels = dErr.variants.map((v) => v.variantLabel);
  for (const want of ['aldehydo-D-glucose', 'α-D-glucopyranose', 'β-D-glucopyranose']) assert.ok(labels.includes(want), `${want} offered`);
  const lErr = await resolve('L-glucose').catch((e) => e);
  assert.ok(lErr.variants.every((v) => v.variantLabel.includes('L-')), 'L-glucose offers only the L series');
  for (const want of ['aldehydo-L-glucose', 'α-L-glucopyranose', 'β-L-glucopyranose']) assert.ok(lErr.variants.map((v) => v.variantLabel).includes(want), `${want} offered`);
  const both = await resolve('glucose').catch((e) => e);
  assert.ok(both.variants.some((v) => v.variantLabel.includes('L-')) && both.variants.some((v) => v.variantLabel.includes('D-')));
  // Every offered variant is a real, concrete, stereo-specified structure with the glucose formula.
  for (const v of [...dErr.variants, ...lErr.variants]) {
    assert.ok(!v.smiles.includes('*') && /@/.test(v.smiles), v.variantLabel);
    assert.equal(v.molecularFormula, 'C6H12O6', v.variantLabel);
  }
});

test('the same carbohydrate behaviour applies to other sugars; unrelated names are unaffected', async () => {
  for (const name of ['fructose', 'galactose', 'mannose', 'ribose', 'D-ribose']) {
    const e = await resolve(name).catch((x) => x);
    assert.equal(e.name, 'MoleculeNameAmbiguousError', name);
    assert.ok(e.variants.length >= 2, name);
  }
  const fru = await resolve('D-fructose').catch((x) => x);
  assert.ok(fru.variants.map((v) => v.variantLabel).includes('keto-D-fructose'));
  assert.equal((await resolve('2-deoxy-D-ribose')).sourceId, 'CHEBI:28816');
  assert.equal((await resolve('deoxyribose')).sourceId, 'CHEBI:28816');
  assert.equal((await resolve('acetone')).smiles, 'CC(C)=O');
  assert.equal((await resolve('sucrose').catch((e) => e)).name === 'MoleculeNameAmbiguousError', false);
});

test('markup and Greek letters in database names do not block lookup', async () => {
  const a = await resolve('α-D-glucopyranose'); const b = await resolve('alpha-D-glucopyranose');
  assert.equal(a.sourceId, b.sourceId);
  assert.equal((await resolve('L-LEUCINE')).sourceId, 'CHEBI:15603');
  assert.equal((await resolve('l-leucine')).sourceId, 'CHEBI:15603');
  assert.equal((await resolve('(2S)-2,6-diaminohexanoic acid')).sourceId, 'CHEBI:18019');
});

test('bond orbital annotation states each component once', async () => {
  const get = async (smiles) => (await annotation.getMoleculeAnnotation(smiles)).bonds;
  const [single] = await get('CC');
  assert.equal(single.bondType, 'single');
  assert.equal(single.piOverlap, null);
  assert.doesNotMatch(single.explanation, /sigma/i, 'the sigma overlap is not restated in the explanation');
  const [double] = await get('C=C');
  assert.equal(double.bondType, 'double');
  assert.ok(double.piOverlap);
  assert.doesNotMatch(double.explanation, /sigma|overlap/i);
  const [triple] = await get('C#C');
  assert.equal(triple.bondType, 'triple');
  assert.match(triple.piOverlap, /two/);
  assert.doesNotMatch(triple.explanation, /sigma component/i);
});

const read = (p) => fs.readFileSync(p, 'utf8');
test('presentation: redundant reasoning, provenance, notes and per-value badges are gone', () => {
  const results = read('src/components/properties/PropertiesResults.tsx');
  const acid = read('src/components/properties/AcidBasePanel.tsx');
  for (const gone of ['Identity provenance', 'How this name was decided', 'Calculation notes', 'EvidenceTag', 'pr-evidence', 'Detected</span>', 'Calculated</span>']) {
    assert.ok(!results.includes(gone), `PropertiesResults no longer contains ${gone}`);
  }
  assert.ok(!acid.includes('Detailed reasoning'));
  assert.ok(!acid.includes('model estimates. Effects are not'));
  const app = read('src/App.tsx');
  for (const gone of ['Orbital info:', 'Sigma overlap:', 'Assignment source:', 'How the configuration was assigned']) assert.ok(!app.includes(gone), gone);
});

test('presentation: contextual notices that prevent a misleading reading are kept', () => {
  const results = read('src/components/properties/PropertiesResults.tsx');
  assert.match(results, /Generic structure/);
  assert.match(results, /molecular weight, exact mass and DBE are unavailable/i);
  assert.match(results, /Stereochemistry unspecified/);
  assert.match(read('src/utils/propertiesSections.ts'), /Estimated physicochemical tendencies/);
  assert.doesNotMatch(results, /estimated, not measured/);
  assert.match(read('src/components/properties/AcidBasePanel.tsx'), /Aqueous-scale estimates/);
});

test('concepts: molecule and concept information share one split container that stays side by side', () => {
  const app = read('src/App.tsx');
  const start = app.indexOf('className="pr-concept-split"');
  const end = app.indexOf('analysisPanel === "properties"');
  const block = app.slice(start, end);
  assert.ok(block.includes('pr-concept-visual') && block.includes('highlightedMoleculeSvg') && block.includes('pr-concept-info') && block.includes('renderCurrentAnnotationCard'));
  const css = read('src/styles/properties.css');
  assert.match(css, /\.pr-concept-split:has\(\.pr-concept-visual\)\s*\{\s*grid-template-columns:\s*minmax\(260px/);
  assert.match(css, /\.pr-concept-visual\s*\{[^}]*position:\s*sticky/);
});
