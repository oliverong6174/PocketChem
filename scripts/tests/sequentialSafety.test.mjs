// Stage 9C: execution safety of the ordered-sequence tool. By default a branch STOPS after a step
// that formed no product (needs input, unsupported, unknown, failed): later steps are "not-run"
// instead of being applied to an unchanged molecule. NO REACTION is a chemical conclusion and still
// lets the molecule continue. The legacy behavior is an explicit diagnostic mode.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine } from "./engine.mjs";

let utils;
let registry;
let byId;

before(async () => {
  ({ utils } = await loadEngine());
  registry = utils.reactionRegistry;
  byId = new Map(registry.map((rule) => [rule.id, rule]));
});

after(async () => {
  await closeEngine();
});

const run = (smiles, ids, rules = registry, options = {}) =>
  utils.runSequentialSynthesisDetailed(smiles, ids, rules, { branchLimit: 12, ...options });
const statuses = (branch) => branch.steps.map((step) => step.status);
const variant = (ruleId, overrides, id) => ({ ...byId.get(ruleId), ...overrides, id });

describe("default policy: a branch stops when an intermediate was not formed", () => {
  test("[engine] an unknown condition: the next step is not run and nothing is applied to the unchanged molecule", async () => {
    const { branches } = await run("CC=C", ["alkene-hydrogenation", "does-not-exist", "alkene-hx-addition-hbr"]);
    assert.equal(branches.length, 1);
    const [branch] = branches;
    assert.deepEqual(statuses(branch), ["reaction", "unknown-rule", "not-run"]);
    assert.equal(branch.steps[2].productSmiles, branch.steps[2].reactantSmiles, "no chemistry was applied");
    assert.match(branch.steps[2].explanation, /Step 2 \(Unknown reaction condition\) did not form a product \(unknown-rule\)/);
    assert.match(branch.steps[2].explanation, /not a product of this step/);
    assert.equal(branch.steps[2].productLabel, "NOT RUN");
    assert.equal(branch.finalSmiles, "CCC", "the last established molecule is what remains");
  });

  test("[engine] a step that needs a structural partner stops the branch (no silent substitution)", async () => {
    const { branches } = await run("CCO", ["fischer-esterification", "primary-alcohol-mild-oxidation"]);
    assert.deepEqual(statuses(branches[0]), ["needs-input", "not-run"]);
    assert.equal(branches[0].finalSmiles, "CCO");
  });

  test("[engine] unknown at the start: every later step is not run, and the root cause is still the one named", async () => {
    const { branches } = await run("CC=C", ["does-not-exist", "alkene-hydrogenation", "alkene-hx-addition-hbr"]);
    assert.deepEqual(statuses(branches[0]), ["unknown-rule", "not-run", "not-run"]);
    assert.match(branches[0].steps[2].explanation, /Step 1/);
    assert.equal(branches[0].finalSmiles, "CC=C");
  });

  test("[engine] a concept-only (unsupported) step stops the branch", async () => {
    const { branches } = await run("CC=C", ["alkene-addition-polymerization", "alkene-hydrogenation"]);
    assert.deepEqual(statuses(branches[0]), ["unsupported", "not-run"]);
  });

  test("[engine] an internal engine failure stops the branch and is not presented as a chemical result", async () => {
    const bad = variant("alkene-hydrogenation", { transform: { type: "reactionSmarts", smarts: "[C:1]>>>>(((" } }, "synthetic-bad-smarts-safety");
    const { branches } = await run("CC=C", [bad.id, "alkene-hx-addition-hbr"], [...registry, bad]);
    assert.deepEqual(statuses(branches[0]), ["execution-error", "not-run"]);
  });

  test("[engine] NO REACTION is a chemical conclusion: the unchanged molecule still continues", async () => {
    const { branches } = await run("CCCCO", ["alkene-hydrogenation", "primary-alcohol-mild-oxidation"]);
    assert.deepEqual(statuses(branches[0]), ["no-reaction", "reaction"]);
    assert.equal(branches[0].steps[1].inputUnresolved, false);
  });

  test("[engine] an ordinary multi-step sequence is unchanged by the policy", async () => {
    const stopped = await run("C=CCC", ["alkene-acid-hydration", "secondary-alcohol-oxidation-pcc", "ketone-reduction"]);
    const legacy = await run("C=CCC", ["alkene-acid-hydration", "secondary-alcohol-oxidation-pcc", "ketone-reduction"], registry, { unresolvedStepPolicy: "continue-provisional" });
    assert.deepEqual(stopped.branches.map((branch) => [statuses(branch), branch.finalSmiles]), legacy.branches.map((branch) => [statuses(branch), branch.finalSmiles]));
  });
});

describe("independent branches continue when an unrelated branch fails", () => {
  // OCC(C)O is methylated at either hydroxyl (two branches). The "partner" rule fits only a free primary
  // OH, so only one branch hits a needs-input stop; the other continues to a real oxidation.
  const methylate = variant(
    "alkene-hydrogenation",
    {
      trigger: { includeSmarts: ["[OX2H]"] },
      transform: { type: "reactionSmarts", smarts: "[OX2H:1]>>[O:1]C", maxProducts: 4 },
      constraints: [],
      competition: undefined,
      selectivityProfile: undefined,
      diagnosticTrigger: undefined,
    },
    "synthetic-methylate-hydroxyl",
  );
  const needsPartner = variant(
    "fischer-esterification",
    { trigger: { includeSmarts: ["[CH2][OX2H]"] }, constraints: [], competition: undefined },
    "synthetic-needs-partner-primary-oh",
  );
  const rules = () => [...registry, methylate, needsPartner];

  test("[engine] one branch stops at needs-input while the other runs its remaining steps", async () => {
    const { branches } = await run("OCC(C)O", [methylate.id, needsPartner.id, "secondary-alcohol-oxidation-pcc"], rules());
    assert.equal(branches.length, 2);
    const byPath = Object.fromEntries(branches.map((branch) => [statuses(branch).join(">"), branch]));
    const stopped = byPath["reaction>needs-input>not-run"];
    const continued = byPath["reaction>no-reaction>reaction"];
    assert.ok(stopped, JSON.stringify(Object.keys(byPath)));
    assert.ok(continued, JSON.stringify(Object.keys(byPath)));
    assert.equal(stopped.steps[0].productSmiles, "OCC(C)OC", "the branch with the free primary OH");
    assert.equal(continued.steps[2].productSmiles, "COCC(C)=O");
  });

  test("[engine] diagnostic mode lets the stopped branch continue provisionally and nothing else changes", async () => {
    const { branches } = await run("OCC(C)O", [methylate.id, needsPartner.id, "secondary-alcohol-oxidation-pcc"], rules(), { unresolvedStepPolicy: "continue-provisional" });
    const paths = branches.map((branch) => statuses(branch).join(">")).sort();
    assert.deepEqual(paths, ["reaction>needs-input>no-reaction", "reaction>no-reaction>reaction"]);
    const provisional = branches.find((branch) => statuses(branch)[1] === "needs-input");
    assert.equal(provisional.steps[2].inputUnresolved, true);
  });
});

describe("diagnostic mode is the previous behavior, explicitly requested", () => {
  test("[engine] later steps run on the unchanged molecule and are marked provisional", async () => {
    const { branches } = await run("CC=C", ["alkene-hydrogenation", "does-not-exist", "alkene-hx-addition-hbr"], registry, { unresolvedStepPolicy: "continue-provisional" });
    assert.deepEqual(statuses(branches[0]), ["reaction", "unknown-rule", "no-reaction"]);
    assert.equal(branches[0].steps[2].inputUnresolved, true);
  });
});

describe("the page wires the policy and names the new state", () => {
  test("[source] default is stop; diagnostic mode is an explicit, unchecked-by-default opt-in", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const page = fs.readFileSync(path.join(root, "src", "components", "MultiCatalyticPage.tsx"), "utf8");
    assert.match(page, /useState\(false\);\s*(\r?\n)*\s*const \[diagnosticMode|const \[diagnosticMode, setDiagnosticMode\] = useState\(false\)/);
    assert.match(page, /unresolvedStepPolicy: diagnosticMode \? "continue-provisional" : "stop"/);
    assert.match(page, /"not-run": "NOT RUN"/);
    assert.match(page, /Diagnostic mode: continue after a step that formed no product/);
  });
});
