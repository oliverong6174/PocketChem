// Stage 9F: nomenclature and formula corrections. Expected names are from IUPAC rules (lowest locants to the substituent set, heteroatom = 1 in
// small heterocycles, oxo for a non-principal aldehyde carbon in the chain), written by hand, not copied from PocketChem output. Structures PocketChem
// cannot name must come back as `unsupported` rather than as a confident wrong name.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let groups;
let nom;

before(async () => {
  await loadEngine();
  groups = await loadModule("/src/utils/functionalGroups/index.ts");
  nom = await loadModule("/src/utils/nomenclatureUtils.ts");
});
after(async () => { await closeEngine(); });

const analyze = async (smiles) => {
  const h = await groups.analyzeFunctionalGroupHierarchy(smiles);
  return nom.analyzeNomenclatureAndProperties(smiles, h.primaryGroups, h.mainGroup);
};
const name = async (smiles) => (await analyze(smiles)).nomenclature.estimatedName;

describe("lowest locants", () => {
  for (const [smiles, expected] of [
    ["CC(C)CC(C)(C)C", "2,2,4-trimethylpentane"],
    ["CC(C)(C)CC(C)C", "2,2,4-trimethylpentane"],
    ["CCC(C)(C)CC(C)C", "2,4,4-trimethylhexane"],
    ["CC(C)C(C)(C)C", "2,2,3-trimethylbutane"],
    ["CCC(C)C(C)C", "2,3-dimethylpentane"],
  ]) test(`${smiles} is ${expected}`, async () => assert.equal(await name(smiles), expected));
});

describe("small heterocycles number the heteroatom as 1 and give the substituents the lowest locants", () => {
  for (const [smiles, expected] of [
    ["CC1OC1(C)C", "2,2,3-trimethyloxirane"],
    ["CCC1(C)CO1", "2-ethyl-2-methyloxirane"],
    ["CC1CN1", "2-methylaziridine"],
    ["CC1CCO1", "2-methyloxetane"],
    ["Cc1cccs1", "2-methylthiophene"],
    ["O=Cc1ccco1", "furan-2-carbaldehyde"],
  ]) test(`${smiles} is ${expected}`, async () => assert.equal(await name(smiles), expected));
});

describe("naphthalene is recognised, with substituent locants", () => {
  for (const [smiles, expected] of [
    ["c1ccc2ccccc2c1", "naphthalene"],
    ["Cc1ccc2ccccc2c1", "2-methylnaphthalene"],
    ["Cc1cccc2ccccc12", "1-methylnaphthalene"],
    ["Brc1cccc2c(Cl)cccc12", "1-bromo-5-chloronaphthalene"],
  ]) test(`${smiles} is ${expected}`, async () => assert.equal(await name(smiles), expected));
});

describe("a non-principal aldehyde in the chain is an oxo group, not a second carbon", () => {
  for (const [smiles, expected] of [
    ["OC(=O)CCC=O", "4-oxobutanoic acid"],
    ["O=CCCC(=O)OC", "methyl 4-oxobutanoate"],
    ["O=CCC(=O)C", "3-oxobutanal"],
  ]) test(`${smiles} is ${expected}`, async () => assert.equal(await name(smiles), expected));
});

describe("structures the builders cannot name are reported as unsupported, not named wrongly", () => {
  for (const [smiles, why] of [
    ["C1CC[C@H]2O[C@H]2C1", "cyclohexene oxide (fused epoxide)"],
    ["CC1CCC2OC2C1", "substituted cyclohexene oxide"],
    ["C12C3C4C1C5C2C3C45", "cubane"],
    ["C1COCCOCCOCCOCCOCCO1", "18-crown-6"],
    ["C1CCC2(C1)CCCCC2", "spiro[4.5]decane"],
    ["C1CCC2(CC1)OCCO2", "spiro ketal"],
    ["CC1=CC[C@@H]2C[C@H]1C2(C)C", "alpha-pinene (bridged, substituted)"],
    ["[2H]C([2H])([2H])C(=O)C([2H])([2H])[2H]", "acetone-d6 (isotope labels)"],
    ["C1CCC(CC1)C1CCCCC1", "bicyclohexyl (ring assembly)"],
    ["c1ccc(cc1)-c1ccccc1", "biphenyl (ring assembly)"],
    ["c1ccc(cc1)Cc1ccccc1", "diphenylmethane"],
    ["C=C1CCCC1", "methylidenecyclopentane (exocyclic C=C)"],
  ]) test(`${why}: status unsupported and no name shown as an answer`, async () => {
    const n = (await analyze(smiles)).nomenclature;
    assert.equal(n.namingStatus, "unsupported", `${why} => ${n.estimatedName}`);
    assert.equal(n.namingConfidence, "Low");
    assert.match(n.estimatedName, /not available/i);
  });
});

describe("negative controls: names that were right stay right", () => {
  for (const [smiles, expected] of [
    ["CCO", /^ethanol/],
    ["Cc1ccccc1", /^toluene/],
    ["COc1ccccc1", /^anisole/],
    ["c1ccc2[nH]cnc2c1", /^benzimidazole/],
    ["c1ccc2ncccc2c1", /^quinoline/],
    ["C1CC2CCC1C2", /^bicyclo\[2\.2\.1\]heptane$/],
    ["CC=CC", /^but-2-ene$/],
    ["C1CCOC1", /^oxolane/],
    ["CCS", /^ethanethiol/],
  ]) test(`${smiles}`, async () => assert.match(await name(smiles), expected));
});

describe("formula, isotopes and degrees of unsaturation", () => {
  const props = async (smiles) => (await analyze(smiles)).properties;
  for (const [smiles, formula, dbe] of [
    ["[13CH4]", "[13C]H4", 0],
    ["[2H]C(Cl)(Cl)Cl", "C[2H]Cl3", 0],
    ["[13CH3]C(=O)O", "C[13C]H4O2", 1],
    ["[2H]O[2H]", "[2H]2O", 0],
    ["CC(=O)[O-]", "C2H3O2", 1],
    ["[NH4+]", "H4N", 0],
    ["c1ccc(cc1)P(c1ccccc1)c1ccccc1", "C18H15P", 12],
    ["CC(=O)O", "C2H4O2", 1],
    ["c1ccccc1", "C6H6", 4],
  ]) test(`${smiles}: ${formula}, DBE ${dbe}`, async () => {
    const p = await props(smiles);
    assert.equal(p.molecularFormula.replace(/[+-]\d*$/, ""), formula);
    assert.equal(p.degreesOfUnsaturation, dbe);
  });
});
