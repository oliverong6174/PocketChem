// Stage 9C: reaction conditions, in-vessel intolerances and the isolation boundary between steps.
// The central claim under test: compatibility within one vessel and across successive isolated
// steps are different questions. An acid-catalyzed step followed by a base-mediated one is not
// called incompatible when the first product is isolated.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let registry;
let model;
let roles;
let ws;
let cat;
let presentation;
let mc;
const byId = (id) => registry.find((rule) => rule.id === id);

before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  model = await loadModule("/src/utils/reactions/engine/conditionModel.ts");
  roles = await loadModule("/src/utils/reactions/engine/catalystRoles.ts");
  ws = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  cat = await loadModule("/src/utils/reactions/engine/workspaceCatalysis.ts");
  presentation = await loadModule("/src/utils/reactions/engine/workspacePresentation.ts");
  mc = await loadModule("/src/utils/persistence/multicatalyticWorkspace.ts");
});

after(async () => {
  await closeEngine();
});

const run = async (starts, script) => {
  const created = await ws.createWorkspace(starts);
  return ws.runWorkspaceScript(created.workspace, script, registry);
};

describe("declared conditions are traceable to the rule's own text", () => {
  test("every curated condition appears literally in the rule's reagents or note", () => {
    assert.ok(model.CURATED_CONDITION_RULE_IDS.length >= 10);
    for (const id of model.CURATED_CONDITION_RULE_IDS) {
      const rule = byId(id);
      assert.ok(rule, id);
      const text = roles.ruleReagentEvidenceText(rule);
      for (const condition of model.curatedConditionsFor(id)) {
        assert.ok(text.includes(condition.evidenceText), `${id}: "${condition.evidenceText}" is not in "${rule.reagents}"`);
      }
    }
  });

  test("[engine] DIBAL states −78 °C; a Grignard formation states dry ether and is anhydrous", () => {
    const dibal = model.describeStepConditions(byId("ester-dibal-reduction"));
    assert.deepEqual(dibal.declared.find((item) => item.dimension === "temperature")?.value, "−78 °C");
    const grignard = model.describeStepConditions(byId("haloalkane-grignard-formation-bromide"));
    assert.ok(grignard.declared.some((item) => item.dimension === "medium" && item.value === "dry ether"));
    assert.equal(grignard.anhydrous, true);
    assert.ok(grignard.declared.some((item) => item.source === "rule-conditions"), "the anhydrous requirement comes from the rule's declared conditions");
  });

  test("[engine] what a rule does not state is listed as not stated, never filled in", () => {
    const profile = model.describeStepConditions(byId("secondary-alcohol-oxidation-pcc"));
    assert.deepEqual(profile.declared.filter((item) => item.source === "registry-text"), []);
    assert.ok(profile.notStated.includes("temperature") && profile.notStated.includes("medium"));
    assert.equal(profile.reagentText, "PCC", "the original reagent text is preserved");
  });

  test("[engine] workup reagents belong to the step that lists them", () => {
    assert.deepEqual(model.describeStepConditions(byId("ester-lah-reduction")).workup.map((role) => role.name), ["H₃O⁺"]);
    assert.deepEqual(model.describeStepConditions(byId("aldehyde-organometallic-addition")).workup.map((role) => role.name), ["H₃O⁺"]);
    assert.deepEqual(model.describeStepConditions(byId("fischer-esterification")).workup, []);
  });
});

describe("in-vessel intolerances come only from declared conditions", () => {
  test("[engine] a Grignard formation cannot coexist with acidic groups and water in one vessel", () => {
    const profile = model.describeStepConditions(byId("haloalkane-grignard-formation-bromide"));
    const labels = profile.intolerances.map((item) => item.label);
    assert.ok(labels.includes("carboxylic acid") && labels.includes("alcohol OH") && labels.includes("water"));
    assert.ok(profile.intolerances.every((item) => item.condition.length > 0 && item.why.length > 0));
  });

  test("[engine] a rule that declares no conditions is unassessed, which is not the same as tolerant", () => {
    const rule = registry.find((candidate) => !candidate.conditions);
    const profile = model.describeStepConditions(rule);
    assert.equal(profile.intolerances, null);
    assert.match(presentation.conditionLines(profile).lines.join(" "), /unassessed \(not the same as tolerant\)/);
  });

  test("[engine] a rule that declares conditions with nothing to exclude says so", () => {
    const profile = model.describeStepConditions(byId("ketone-reduction"));
    assert.deepEqual(profile.intolerances, []);
  });
});

describe("isolation boundary: acid-catalyzed step, then base-mediated step", () => {
  // 1-butene --acid hydration (strong acid)--> 2-butanol; with iodomethane --strong base, Williamson--> 2-methoxybutane
  const script = [
    { ruleId: "alkene-acid-hydration", reactants: [{ material: 0 }] },
    { ruleId: "alcohol-williamson-ether", reactants: [{ attempt: 1, product: 1 }, { material: 1 }] },
  ];

  test("[engine] the two reactions could not share a vessel", () => {
    const result = roles.assessCombination(byId("alkene-acid-hydration"), byId("alcohol-williamson-ether"));
    assert.equal(result.category, "documented-conflict");
    assert.match(result.reasons.join(" "), /acid would quench a strong base/);
  });

  test("[engine] yet run as successive isolated steps, the workspace executes both and reports no conflict", async () => {
    const workspace = await run(["C=CCC", "CI"], script);
    assert.deepEqual(workspace.history.map((step) => step.status), ["reaction", "reaction"]);
    assert.equal(workspace.history[1].outcomes[0].productSmiles, "CCC(C)OC");
    const assessed = await ws.assessWorkspace(workspace, registry);
    assert.equal(assessed.verification.status, "verified");
    // No cross-step warning: per-step compatibility only looks at groups left unreacted inside each step.
    assert.equal(assessed.compatibility.warnings.some((warning) => warning.group === "acid"), false);
    assert.notEqual(assessed.compatibility.worst, "model-constraint");
  });

  test("[engine] the boundary is reported as an isolation requirement, not as a conflict", async () => {
    const workspace = await run(["C=CCC", "CI"], script);
    const result = cat.assessWorkspaceCatalysis(workspace, registry);
    assert.equal(result.boundaries.length, 1);
    const boundary = result.boundaries[0];
    assert.deepEqual([boundary.from, boundary.to, boundary.asRun], [1, 2, "isolated"]);
    assert.equal(boundary.ifCombined, "documented-conflict");
    assert.equal(boundary.isolationRequired, true);
    assert.match(boundary.isolation.statement, /not a conflict/);
    assert.deepEqual(result.vessels, [], "nothing was declared to share a vessel");
    const lines = presentation.catalysisSummaryLines(result).join(" ");
    assert.match(lines, /Steps 1 → 2: these reactions could not share a vessel/);
    assert.match(lines, /this is not a conflict here/);
    assert.doesNotMatch(lines, /incompatible/i);
  });

  test("[engine] only when the user declares one vessel are the steps judged as a one-pot pair", async () => {
    const workspace = await run(["C=CCC", "CI"], script);
    const result = cat.assessWorkspaceCatalysis(workspace, registry, { sharedVessels: [[1, 2]] });
    assert.equal(result.vessels.length, 1);
    assert.equal(result.vessels[0].documentedConflicts, 1);
    assert.match(presentation.catalysisSummaryLines(result).join(" "), /declared to share one vessel and 1 pair has a documented conflict/);
  });

  test("[engine] a declared vessel with no clash is 'no documented conflict', never 'compatible'", async () => {
    const workspace = await run(["CCCCO", "C=CCC"], [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 0 }] },
      { ruleId: "alkene-acid-hydration", reactants: [{ material: 1 }] },
    ]);
    const result = cat.assessWorkspaceCatalysis(workspace, registry, { sharedVessels: [[1, 2]] });
    const text = presentation.catalysisSummaryLines(result).join(" ");
    assert.match(text, /not evidence that the one-pot sequence works/);
    assert.doesNotMatch(text, /\bcompatible\b/i);
  });

  test("[engine] independent branches have no boundary between them", async () => {
    const workspace = await run(["CCCCBr", "CCCCO"], [
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
    ]);
    assert.deepEqual(cat.assessWorkspaceCatalysis(workspace, registry).boundaries, []);
  });

  test("[engine] a join gives one boundary per feeding branch", async () => {
    const workspace = await run(["CCCCBr", "CCCCO"], [
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
      { ruleId: "aldehyde-organometallic-addition", reactants: [{ attempt: 2, product: 1 }, { attempt: 1, product: 1 }] },
    ]);
    const boundaries = cat.assessWorkspaceCatalysis(workspace, registry).boundaries.map((item) => `${item.from}>${item.to}`).sort();
    assert.deepEqual(boundaries, ["1>3", "2>3"]);
  });
});

describe("persistence and presentation of conditions", () => {
  test("[engine] conditions are stored with each attempt, including attempts that did not complete", async () => {
    const workspace = await run(["CCO"], [{ ruleId: "fischer-esterification", reactants: [{ material: 0 }] }]);
    assert.equal(workspace.history[0].status, "needs-input");
    assert.equal(workspace.history[0].conditions.isolation.kind, "isolated-step");
  });

  test("[engine] old saves without conditions validate and are described as unassessed; malformed conditions are rejected", async () => {
    const workspace = await run(["C=CCC"], [{ ruleId: "alkene-acid-hydration", reactants: [{ material: 0 }] }]);
    const old = JSON.parse(JSON.stringify(workspace));
    for (const step of old.history) delete step.conditions;
    assert.ok(mc.validateWorkspaceSnapshot(old));
    assert.match(presentation.conditionLines(undefined).heading, /unassessed/);
    const bad = JSON.parse(JSON.stringify(workspace));
    bad.history[0].conditions.isolation.kind = "one-pot";
    assert.equal(mc.validateWorkspaceSnapshot(bad), null);
  });

  test("[engine] the condition lines keep the reagent text and list what is not stated", () => {
    const lines = presentation.conditionLines(model.describeStepConditions(byId("ester-dibal-reduction")));
    assert.match(lines.heading, /1\) DIBAL-H, −78 °C {2}2\) H₂O/);
    assert.ok(lines.lines.some((line) => line.startsWith("Temperature: −78 °C")));
    assert.ok(lines.lines.some((line) => /Not stated by the registry: .*light/.test(line)));
  });
});
