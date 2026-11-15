// Stage 20: Properties results grouping on REAL engine output. The grouping must show exactly the engine's values (presentation only),
// label calculated values versus estimates, and list unavailable values instead of inventing "N/A" tiles.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let S, identity;
before(async () => {
  await loadEngine();
  S = await loadModule("/src/utils/propertiesSections.ts");
  const groups = await loadModule("/src/utils/functionalGroups/index.ts");
  const nom = await loadModule("/src/utils/nomenclatureUtils.ts");
  identity = async (smiles) => {
    const h = await groups.analyzeFunctionalGroupHierarchy(smiles);
    const id = await nom.analyzeNomenclatureAndProperties(smiles, h.primaryGroups, h.mainGroup ?? (h.functionalGroups ?? [])[0] ?? null);
    return { id, occurrences: groups.flattenFunctionalGroupOccurrences ? groups.flattenFunctionalGroupOccurrences(h.functionalGroups ?? []) : [] };
  };
});
after(async () => { await closeEngine(); });

const rows = (sections) => sections.sections.flatMap((s) => s.rows);
const byId = (sections, id) => rows(sections).find((r) => r.id === id);

describe("a complete result (acetic acid)", () => {
  test("every engine value appears unchanged, in its own section", async () => {
    const { id } = await identity("CC(=O)O");
    const s = S.buildPropertySections(id);
    const p = id.properties;
    assert.equal(byId(s, "formula").value, p.molecularFormula);
    assert.equal(byId(s, "mw").value, `${p.molecularWeight} g/mol`);
    assert.equal(byId(s, "exactMass").value, String(p.exactMass));
    assert.equal(byId(s, "charge").value, String(p.formalCharge));
    assert.equal(byId(s, "heavy").value, String(p.heavyAtomCount));
    assert.equal(byId(s, "dbe").value, String(p.degreesOfUnsaturation));
    assert.equal(byId(s, "hbd").value, String(p.hydrogenBondDonors));
    assert.equal(byId(s, "hba").value, String(p.hydrogenBondAcceptors));
    assert.equal(byId(s, "solubility").value, p.waterSolubilityTendency.level);
    assert.equal(byId(s, "boiling").value, p.boilingPointTendency.level);
    assert.equal(p.molecularFormula, "C2H4O2");
    assert.equal(p.degreesOfUnsaturation, 1);
  });
  test("calculated values and qualitative estimates are labelled differently", async () => {
    const s = S.buildPropertySections((await identity("CC(=O)O")).id);
    for (const row of rows(s)) assert.equal(row.evidence, ["solubility", "permeability", "boiling", "volatility"].includes(row.id) ? "estimate" : "calculated", row.id);
    const tend = s.sections.find((x) => x.id === "tendencies");
    assert.match(tend.evidenceNote, /not measured/);
    assert.ok(tend.rows.every((r) => r.detail && r.detail.explanation.length > 0), "estimates carry their reasoning");
  });
  test("sections are the three scientific groups, none empty for a complete result, nothing unavailable", async () => {
    const s = S.buildPropertySections((await identity("CC(=O)O")).id);
    assert.deepEqual(s.sections.map((x) => x.id), ["composition", "descriptors", "tendencies"]);
    assert.deepEqual(s.sections.map((x) => x.rows.length), [5, 5, 4]);
    assert.equal(s.unavailable.length, 0);
    assert.equal(s.shown, 14); assert.equal(s.askedFor, 14);
  });
  test("grouping does not modify the engine result", async () => {
    const { id } = await identity("CC(=O)O");
    const before = JSON.stringify(id);
    S.buildPropertySections(id, [{ name: "x", count: 1 }], [{ label: "C1", configuration: "R" }]);
    assert.equal(JSON.stringify(id), before);
  });
});

describe("partial, unsupported and large results", () => {
  test("a value the engine did not provide is listed as unavailable and no row shows N/A", async () => {
    const { id } = await identity("CC(=O)O");
    const partial = JSON.parse(JSON.stringify(id));
    partial.properties.exactMass = null;
    partial.properties.hydrogenBondDonors = undefined;
    partial.properties.waterSolubilityTendency = undefined;
    const s = S.buildPropertySections(partial);
    assert.deepEqual([...s.unavailable].sort(), ["Exact mass", "H-bond donors", "Water solubility"]);
    assert.equal(byId(s, "exactMass"), undefined);
    assert.ok(rows(s).every((r) => r.value !== "N/A" && r.value !== "undefined" && r.value !== "null"));
    assert.equal(s.askedFor, s.shown + 3);
  });
  test("a zero is a value, not a missing value", async () => {
    const { id } = await identity("CC(=O)O");
    const z = JSON.parse(JSON.stringify(id));
    z.properties.formalCharge = 0; z.properties.ringCount = 0; z.properties.rotatableBonds = 0;
    const s = S.buildPropertySections(z);
    assert.equal(byId(s, "charge").value, "0"); assert.equal(byId(s, "rings").value, "0"); assert.equal(byId(s, "rot").value, "0");
    assert.equal(s.unavailable.length, 0);
  });
  test("a large, ring-rich molecule (cholesterol) is grouped with the engine's own numbers", async () => {
    const { id } = await identity("CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C");
    const s = S.buildPropertySections(id);
    assert.equal(byId(s, "formula").value, "C27H46O");
    assert.equal(byId(s, "rings").value, "4");
    assert.equal(byId(s, "heavy").value, "28");
    assert.equal(s.unavailable.length, 0);
  });
  test("a minimal molecule (methane) and a charged species still group without invented values", async () => {
    for (const smiles of ["C", "CC(=O)[O-]"]) {
      const { id } = await identity(smiles);
      const s = S.buildPropertySections(id);
      assert.ok(s.shown >= 8, smiles);
      assert.ok(rows(s).every((r) => r.value.length > 0 && r.value !== "undefined"), smiles);
    }
    const anion = S.buildPropertySections((await identity("CC(=O)[O-]")).id);
    assert.equal(byId(anion, "charge").value, "-1");
  });
});

describe("functional-group and stereocenter lists", () => {
  test("countGroups counts occurrences by name in first-seen order", () => {
    assert.deepEqual(S.countGroups([{ groupName: "Alcohol" }, { groupName: "Alkene" }, { groupName: "Alcohol" }]), [{ name: "Alcohol", count: 2 }, { name: "Alkene", count: 1 }]);
    assert.deepEqual(S.countGroups([]), []);
  });
  test("real occurrences for a multifunctional molecule are counted without loss", async () => {
    const { id, occurrences } = await identity("OCC(=O)C=C");
    const counts = S.countGroups(occurrences);
    assert.equal(counts.reduce((n, g) => n + g.count, 0), occurrences.length);
    assert.ok(counts.length >= 2);
    const s = S.buildPropertySections(id, counts, []);
    assert.deepEqual(s.groups, counts);
  });
  test("stereocenters pass through unchanged", async () => {
    const { id } = await identity("C[C@H](N)C(=O)O");
    const centers = [{ label: "C2", configuration: "S" }];
    assert.deepEqual(S.buildPropertySections(id, [], centers).stereocenters, centers);
  });
});
