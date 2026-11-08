// Stage 9M batch 2: heteroarene electrophilic substitution and crossed (Claisen-Schmidt) aldol. Real registry, real RDKit, no mocks.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { canon, canonSet, modules, runRule } from "./fixtures/convergentHelpers.mjs";

let registry;
let ws;
before(async () => {
  ({ registry } = await modules());
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
});
after(async () => { await closeEngine(); });

async function products(ruleId, reactants) {
  const out = [];
  for (const pathway of await runRule(ruleId, reactants)) out.push((await canonSet(pathway.productSmiles.split("."))).join("."));
  return [...new Set(out)].sort();
}
async function expectProduct(ruleId, reactants, expected) {
  const got = await products(ruleId, reactants);
  const want = (await canonSet([expected])).join(".");
  assert.ok(got.includes(want), `${ruleId} on ${reactants.join(" + ")}: expected ${want}, got ${got.join(" | ") || "(nothing)"}`);
}
async function expectNothing(ruleId, reactants) {
  assert.deepEqual(await products(ruleId, reactants), [], `${ruleId} must not apply to ${reactants.join(" + ")}`);
}

describe("registry", () => {
  for (const id of ["heteroarene-bromination-nbs", "heteroarene-friedel-crafts-acylation", "heteroarene-vilsmeier-haack", "heteroarene-nitration-acetyl-nitrate", "crossed-aldol-claisen-schmidt", "crossed-aldol-addition-nonenolizable"]) {
    test(`[engine] ${id} is executable and documents limits`, () => {
      const rule = registry.find((item) => item.id === id);
      assert.ok(rule); assert.equal(rule.transform.type, "reactionSmarts");
      assert.ok(rule.limitations.length > 0); assert.ok(rule.conditions);
    });
  }
});

describe("heteroarene alpha substitution", () => {
  test("[engine] NBS brominates furan, thiophene and N-methylpyrrole at C2", async () => {
    await expectProduct("heteroarene-bromination-nbs", ["c1ccoc1"], "Brc1ccco1");
    await expectProduct("heteroarene-bromination-nbs", ["c1ccsc1"], "Brc1cccs1");
    await expectProduct("heteroarene-bromination-nbs", ["Cn1cccc1"], "Cn1cccc1Br");
  });
  test("[engine] 2-methylthiophene brominates only at the free alpha position (C5), not beta", async () => {
    assert.deepEqual(await products("heteroarene-bromination-nbs", ["Cc1cccs1"]), [await canon("Cc1ccc(Br)s1")]);
  });
  test("[engine] acylation with acetyl chloride gives 2-acetyl derivatives; two structurally different rings", async () => {
    await expectProduct("heteroarene-friedel-crafts-acylation", ["c1ccsc1", "CC(=O)Cl"], "CC(=O)c1cccs1");
    await expectProduct("heteroarene-friedel-crafts-acylation", ["c1ccoc1", "O=C(Cl)c1ccccc1"], "O=C(c1ccco1)c1ccccc1");
  });
  test("[engine] Vilsmeier–Haack and acetyl-nitrate nitration", async () => {
    await expectProduct("heteroarene-vilsmeier-haack", ["Cn1cccc1"], "Cn1cccc1C=O");
    await expectProduct("heteroarene-nitration-acetyl-nitrate", ["c1ccsc1"], "O=[N+]([O-])c1cccs1");
  });
  test("[scope] benzene, pyridine, imidazole, thiazole and electron-poor furans are refused", async () => {
    for (const smiles of ["c1ccccc1", "c1ccncc1", "c1cnc[nH]1", "c1cscn1", "O=Cc1ccco1", "O=[N+]([O-])c1cccs1", "N#Cc1ccco1"]) {
      await expectNothing("heteroarene-bromination-nbs", [smiles]);
      await expectNothing("heteroarene-vilsmeier-haack", [smiles]);
    }
  });
  test("[scope] acylation needs the acyl chloride; none is invented", async () => {
    await expectNothing("heteroarene-friedel-crafts-acylation", ["c1ccsc1"]);
    await expectNothing("heteroarene-friedel-crafts-acylation", ["c1ccsc1", "CCO"]);
  });
  test("[engine] no beta product is generated", async () => {
    const got = await products("heteroarene-bromination-nbs", ["c1ccsc1"]);
    assert.deepEqual(got, [await canon("Brc1cccs1")]);
  });
});

describe("crossed aldol with a non-enolizable aldehyde", () => {
  test("[engine] acetone + benzaldehyde gives benzalacetone; acetophenone + benzaldehyde gives chalcone", async () => {
    await expectProduct("crossed-aldol-claisen-schmidt", ["CC(C)=O", "O=Cc1ccccc1"], "CC(=O)C=Cc1ccccc1");
    await expectProduct("crossed-aldol-claisen-schmidt", ["CC(=O)c1ccccc1", "O=Cc1ccccc1"], "O=C(C=Cc1ccccc1)c1ccccc1");
  });
  test("[engine] pivaldehyde (fully substituted alpha carbon) is also a valid electrophile", () =>
    expectProduct("crossed-aldol-claisen-schmidt", ["CC(C)=O", "CC(C)(C)C=O"], "CC(=O)C=CC(C)(C)C"));
  test("[engine] cyclohexanone condenses at its alpha carbon", () =>
    expectProduct("crossed-aldol-claisen-schmidt", ["O=C1CCCCC1", "O=Cc1ccccc1"], "O=C1CCCCC1=Cc1ccccc1"));
  test("[engine] addition rule isolates the beta-hydroxy ketone", () =>
    expectProduct("crossed-aldol-addition-nonenolizable", ["CC(C)=O", "O=Cc1ccccc1"], "CC(=O)CC(O)c1ccccc1"));
  test("[engine] unsymmetrical ketone gives both alpha regioisomers, unranked", async () => {
    const got = await products("crossed-aldol-claisen-schmidt", ["CCC(C)=O", "O=Cc1ccccc1"]);
    assert.equal(got.length, 2, got.join(" | "));
  });
  test("[scope] enolizable aldehydes, aldehyde donors and ketone-only pairs are refused", async () => {
    await expectNothing("crossed-aldol-claisen-schmidt", ["CC(C)=O", "CCC=O"]);
    await expectNothing("crossed-aldol-claisen-schmidt", ["CC=O", "O=Cc1ccccc1"]);
    await expectNothing("crossed-aldol-claisen-schmidt", ["CC(C)=O", "CC(=O)CC"]);
    await expectNothing("crossed-aldol-claisen-schmidt", ["CC(C)=O"]);
    await expectNothing("crossed-aldol-claisen-schmidt", ["O=Cc1ccccc1", "O=Cc1ccccc1"]);
  });
  test("[inventory] both carbonyl compounds are consumed and one product remains", async () => {
    const created = await ws.createWorkspace(["CC(C)=O", "O=Cc1ccccc1"]);
    assert.ok(created.ok);
    const done = await ws.runWorkspaceScript(created.workspace, [{ ruleId: "crossed-aldol-claisen-schmidt", reactants: [{ material: 0 }, { material: 1 }] }], registry);
    assert.equal(done.history[0].status, "reaction");
    const live = ws.workspaceInventory(done).live;
    assert.equal(live.length, 1);
    assert.equal(await canon(live[0].smiles), await canon("CC(=O)C=Cc1ccccc1"));
  });
});
