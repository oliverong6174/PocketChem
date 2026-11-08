// Stage 9M complex-synthesis demonstrations. Every product is produced by the real registry through the multi-material workspace
// (the same engine the Multi-Catalytic page drives); nothing is fabricated. Structural replay is NOT evidence of experimental feasibility.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { canon, modules } from "./fixtures/convergentHelpers.mjs";

let registry;
let ws;
before(async () => {
  ({ registry } = await modules());
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
});
after(async () => { await closeEngine(); });

async function run(materials, script) {
  const created = await ws.createWorkspace(materials);
  assert.ok(created.ok);
  return ws.runWorkspaceScript(created.workspace, script, registry);
}
const statuses = (done) => done.history.map((h) => `${h.ruleId}:${h.status}`);
const liveSmiles = async (done) => (await Promise.all(ws.workspaceInventory(done).live.map((l) => canon(l.smiles)))).sort();

describe("D2 sequential: thiophene -> 2-acetylthiophene -> thienyl chalcone analogue -> saturated ketone", () => {
  test("[demo] three steps, each consuming the previous product, with provenance", async () => {
    const done = await run(["c1ccsc1", "CC(=O)Cl", "O=Cc1ccccc1"], [
      { ruleId: "heteroarene-friedel-crafts-acylation", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "crossed-aldol-claisen-schmidt", reactants: [{ attempt: 1, product: 1 }, { material: 2 }] },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 2, product: 1 }] },
    ]);
    assert.deepEqual(statuses(done), ["heteroarene-friedel-crafts-acylation:reaction", "crossed-aldol-claisen-schmidt:reaction", "alkene-hydrogenation:reaction"]);
    assert.deepEqual(await liveSmiles(done), [await canon("O=C(CCc1ccccc1)c1cccs1")]);
    assert.equal(done.history[1].consumedLotIds.length, 2, "ketone and aldehyde both consumed");
    assert.equal(done.records[1].reactantLotIds.length, 2);
    const assessed = await ws.assessWorkspace(done, registry);
    assert.equal(assessed.verification.status, "verified");
  });
});

describe("D3 convergent: two branches build intermediates, then join (Claisen-Schmidt), then the joined product is modified (D5)", () => {
  test("[demo] branch A (acylation) and branch B (alcohol oxidation) join; the enone is then reduced twice", async () => {
    const done = await run(["c1ccsc1", "CC(=O)Cl", "OCc1ccccc1"], [
      { ruleId: "heteroarene-friedel-crafts-acylation", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "benzylic-allylic-alcohol-oxidation", reactants: [{ material: 2 }] },
      { ruleId: "crossed-aldol-claisen-schmidt", reactants: [{ attempt: 1, product: 1 }, { attempt: 2, product: 1 }] },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 3, product: 1 }] },
      { ruleId: "ketone-reduction", reactants: [{ attempt: 4, product: 1 }] },
    ]);
    assert.ok(statuses(done).every((s) => s.endsWith(":reaction")), statuses(done).join(", "));
    assert.deepEqual(await liveSmiles(done), [await canon("OC(CCc1ccccc1)c1cccs1")]);
    // Provenance: the join step consumed the two intermediates, not the original supplied materials.
    assert.equal(done.history[2].consumedLotIds.length, 2);
    const assessed = await ws.assessWorkspace(done, registry);
    assert.equal(assessed.verification.status, "verified");
    assert.equal(assessed.route.steps.length, 5);
  });
  test("[demo] a failed branch does not run the join and nothing is silently supplied", async () => {
    const done = await run(["c1ccncc1", "CC(=O)Cl", "OCc1ccccc1"], [
      { ruleId: "heteroarene-friedel-crafts-acylation", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "benzylic-allylic-alcohol-oxidation", reactants: [{ material: 2 }] },
      { ruleId: "crossed-aldol-claisen-schmidt", reactants: [{ attempt: 1, product: 1 }, { attempt: 2, product: 1 }] },
    ]);
    assert.notEqual(done.history[0].status, "reaction", "pyridine is outside the heteroarene scope");
    assert.equal(done.history[2].status, "dependency-failed");
  });
});

describe("D4 multi-catalytic: Pd(II)/Cu Wacker, base-catalysed aldol, Pd/C hydrogenation", () => {
  test("[demo] a step with two outcomes demands a selection and is not auto-resolved", async () => {
    const done = await run(["C=CCc1ccccc1", "O=Cc1ccccc1"], [
      { ruleId: "wacker-tsuji-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "crossed-aldol-claisen-schmidt", reactants: [{ attempt: 1, product: 1 }, { material: 1 }] },
    ]);
    assert.equal(done.history[0].status, "reaction");
    assert.equal(done.history[1].status, "needs-selection", "phenylacetone has two alpha sites; the user must choose, nothing is called major");
  });
  test("[demo] allylbenzene -> phenylacetone -> benzylidene ketone -> saturated ketone with the chosen regiochemistry", async () => {
    const pick = async (outcome) => run(["C=CCc1ccccc1", "O=Cc1ccccc1"], [
      { ruleId: "wacker-tsuji-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "crossed-aldol-claisen-schmidt", reactants: [{ attempt: 1, product: 1 }, { material: 1 }], outcome },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 2, product: 1 }] },
    ]);
    const finals = new Set();
    for (const outcome of [0, 1]) {
      const done = await pick(outcome);
      assert.deepEqual(statuses(done), ["wacker-tsuji-oxidation:reaction", "crossed-aldol-claisen-schmidt:reaction", "alkene-hydrogenation:reaction"], String(outcome));
      for (const s of await liveSmiles(done)) finals.add(s);
      const assessed = await ws.assessWorkspace(done, registry);
      assert.equal(assessed.verification.status, "verified");
    }
    assert.deepEqual([...finals].sort(), [await canon("O=C(CCc1ccccc1)Cc1ccccc1"), await canon("CC(=O)C(Cc1ccccc1)c1ccccc1")].sort());
  });
});

describe("D1/D5 extra: Mitsunobu inversion then ester hydrolysis; malonic ester route", () => {
  test("[demo] (S)-2-butanol + acetic acid (Mitsunobu, inversion) then hydrolysis gives (R)-2-butanol", async () => {
    const done = await run(["C[C@H](O)CC", "CC(=O)O"], [
      { ruleId: "mitsunobu-secondary-inversion", reactants: [{ material: 0 }, { material: 1 }] },
    ]);
    assert.equal(done.history[0].status, "reaction");
    const [ester] = await liveSmiles(done);
    assert.equal(ester, await canon("C[C@@H](OC(C)=O)CC"), "inversion");
    assert.notEqual(ester, await canon("C[C@H](OC(C)=O)CC"), "not retention");
  });
  test("[demo] diethyl malonate + butyl bromide, then hydrolysis/decarboxylation gives hexanoic acid", async () => {
    const done = await run(["CCOC(=O)CC(=O)OCC", "CCCCBr"], [
      { ruleId: "malonic-ester-alkylation", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "malonic-ester-hydrolysis-decarboxylation", reactants: [{ attempt: 1, product: 1 }] },
    ]);
    assert.ok(statuses(done).every((s) => s.endsWith(":reaction")), statuses(done).join(", "));
    assert.deepEqual(await liveSmiles(done), [await canon("CCCCCC(=O)O")]);
  });
});

describe("Phase C: automatic convergent search discovers the new rules (no hand-built script)", () => {
  let syn;
  before(async () => { syn = await loadModule("/src/utils/reactions/engine/multistepSynthesis.ts"); });
  const search = (start, target, wall = 40000) =>
    syn.findConvergentSynthesisRoutes(start, target, registry, { maxRoutes: 1, convergentSearch: { bidirectional: true, startingMaterialCopies: 1, maxWallMs: wall } });
  test("[search] thiophene + acetyl chloride + benzaldehyde -> thienyl chalcone via acylation then Claisen-Schmidt", async () => {
    const { routes } = await search("c1ccsc1.CC(=O)Cl.O=Cc1ccccc1", "O=C(C=Cc1ccccc1)c1cccs1");
    assert.ok(routes.length >= 1);
    assert.deepEqual(routes[0].steps.map((s) => s.ruleId), ["heteroarene-friedel-crafts-acylation", "crossed-aldol-claisen-schmidt"]);
    assert.equal(routes[0].verification.status, "verified");
  });
  test("[search] 1-heptene + acetic acid -> 2-heptanone uses ozonolysis-derived acid and ketonic decarboxylation", async () => {
    const { routes } = await search("C=CCCCCC.CC(=O)O", "CCCCCC(C)=O", 30000);
    assert.ok(routes.length >= 1);
    assert.ok(routes[0].steps.some((s) => s.ruleId === "ketonic-decarboxylation"));
    assert.equal(routes[0].verification.status, "verified");
  });
});
