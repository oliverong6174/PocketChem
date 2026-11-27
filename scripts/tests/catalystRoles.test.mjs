// Stage 9B-3: catalyst / reagent roles and condition compatibility. Every claim in the curated
// table must be traceable to text already in the rule registry; everything else is unassessed.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let registry;
let roles;
let catalysis;
let engineWs;
let presentation;
let mc;
const byId = (id) => registry.find((rule) => rule.id === id);

before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  roles = await loadModule("/src/utils/reactions/engine/catalystRoles.ts");
  catalysis = await loadModule("/src/utils/reactions/engine/workspaceCatalysis.ts");
  engineWs = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  presentation = await loadModule("/src/utils/reactions/engine/workspacePresentation.ts");
  mc = await loadModule("/src/utils/persistence/multicatalyticWorkspace.ts");
});

after(async () => {
  await closeEngine();
});

const run = async (starts, script) => {
  const created = await engineWs.createWorkspace(starts);
  return engineWs.runWorkspaceScript(created.workspace, script, registry);
};

describe("the curated role table is traceable to the registry", () => {
  test("every curated rule exists, and every piece of evidence appears in that rule's own reagent text or note", () => {
    assert.ok(roles.CURATED_ROLE_RULE_IDS.length >= 25);
    for (const id of roles.CURATED_ROLE_RULE_IDS) {
      const rule = byId(id);
      assert.ok(rule, `${id} is not in the registry`);
      const text = roles.ruleReagentEvidenceText(rule);
      for (const role of roles.curatedRolesFor(id)) {
        if (role.evidenceText !== undefined) {
          assert.ok(text.includes(role.evidenceText), `${id}: evidence "${role.evidenceText}" is not in "${rule.reagents}" / "${rule.reagentNote}"`);
        } else {
          assert.equal(role.source, "textbook", `${id}: only textbook roles may lack evidence text (${role.name})`);
        }
      }
    }
  });

  test("a catalyst claim always comes from registry text, never from the textbook table", () => {
    for (const id of roles.CURATED_ROLE_RULE_IDS) {
      for (const role of roles.curatedRolesFor(id)) {
        if (role.kind === "catalyst" || role.kind === "co-catalyst") {
          assert.equal(role.source, "registry-text", `${id}: ${role.name}`);
          assert.ok(role.evidenceText, `${id}: ${role.name} needs evidence text`);
        }
      }
    }
  });

  test("the registry's own reagent text is preserved byte-for-byte for every rule", () => {
    for (const rule of registry) {
      assert.equal(roles.describeRuleRoles(rule).reagentText, rule.reagents, rule.id);
    }
  });

  test("a rule with no curated entry asserts no role beyond its structural reactants, and says so", () => {
    const rule = byId("ester-acid-hydrolysis");
    assert.ok(rule && !roles.curatedRolesFor(rule.id));
    const profile = roles.describeRuleRoles(rule);
    assert.equal(profile.structured, false);
    assert.equal(profile.catalystIdentity, "unknown", "absence of a curated entry is not 'no catalyst'");
    assert.deepEqual(profile.roles, []);
    const lines = presentation.roleLines(profile);
    assert.match(lines.heading, /unassessed/);
    assert.match(lines.heading, /does not mean it uses none/);
  });

  test("only a minority of the registry is structured: coverage is not overstated", () => {
    const structured = registry.filter((rule) => roles.describeRuleRoles(rule).structured).length;
    assert.ok(structured > 0 && structured < registry.length / 4, `${structured} of ${registry.length}`);
  });
});

describe("catalyst identity is explicit only where the registry gives it", () => {
  const profile = (id) => roles.describeRuleRoles(byId(id));
  test("named: Pd/C, Lindlar catalyst, sulfuric acid", () => {
    assert.equal(profile("alkene-hydrogenation").catalystIdentity, "named");
    assert.equal(profile("alkyne-lindlar-reduction-internal").catalystIdentity, "named");
    assert.equal(profile("fischer-esterification").catalystIdentity, "named");
  });
  test("generic: 'Pd catalyst' and 'acid catalyst' do not identify a species", () => {
    for (const id of ["suzuki-coupling", "heck-coupling", "sonogashira-coupling", "aldehyde-imine-formation", "alkene-acid-hydration"]) {
      assert.equal(profile(id).catalystIdentity, "generic", id);
    }
    const sonogashira = profile("sonogashira-coupling").roles;
    const copper = sonogashira.find((role) => role.name === "CuI");
    assert.equal(copper.kind, "co-catalyst");
    assert.equal(copper.conditional, true, "the registry says CuI is used 'as applicable'");
    assert.equal(sonogashira.find((role) => role.name === "Pd catalyst").identity, "generic");
  });
  test("none: PCC and hydride reductions declare no catalyst, and their reagents are consumed, not catalytic", () => {
    for (const id of ["secondary-alcohol-oxidation-pcc", "ketone-reduction", "ester-lah-reduction", "haloalkane-grignard-formation-bromide"]) {
      assert.equal(profile(id).catalystIdentity, "none", id);
    }
    assert.equal(profile("secondary-alcohol-oxidation-pcc").roles[0].kind, "stoichiometric-reagent");
  });
  test("stoichiometric Hg(OAc)₂ (oxymercuration) is not confused with catalytic Hg²⁺ (alkyne hydration)", () => {
    assert.equal(profile("alkene-oxymercuration-demercuration").roles.find((role) => role.name === "Hg(OAc)₂").kind, "stoichiometric-reagent");
    assert.equal(profile("alkyne-mercury-hydration-terminal").roles.find((role) => role.kind === "catalyst").name, "Hg²⁺ (from HgSO₄)");
  });
  test("listed alternatives stay alternatives (Pt or Pd/C; NaBH₄ or LiAlH₄)", () => {
    const hydrogenation = profile("alkyne-hydrogenation").roles.filter((role) => role.kind === "catalyst");
    assert.deepEqual(hydrogenation.map((role) => role.name), ["Pt", "Pd/C"]);
    assert.equal(new Set(hydrogenation.map((role) => role.alternativeGroup)).size, 1);
    assert.ok(profile("ketone-reduction").roles.filter((role) => role.alternativeGroup === "hydride").length === 2);
  });
  test("structural reactants come from the registry's partner requirements, including copies", () => {
    const acetal = profile("aldehyde-acetal-formation").roles.find((role) => role.kind === "structural-reactant");
    assert.match(acetal.name, /2 molecules/);
    assert.equal(acetal.source, "registry-structure");
    const fischer = profile("fischer-esterification").roles.filter((role) => role.kind === "structural-reactant");
    assert.equal(fischer.length, 1);
  });
});

describe("condition combinations are documented, incomplete or unassessed, never silently compatible", () => {
  test("a clash between declared conditions is a documented conflict", () => {
    const hydrationVsGrignard = roles.assessCombination(byId("alkene-acid-hydration"), byId("haloalkane-grignard-formation-bromide"));
    assert.equal(hydrationVsGrignard.category, "documented-conflict");
    assert.match(hydrationVsGrignard.reasons.join(" "), /acid would quench/);
    const fischerVsLah = roles.assessCombination(byId("fischer-esterification"), byId("ester-lah-reduction"));
    assert.equal(fischerVsLah.category, "documented-conflict");
    const oxidantVsHydride = roles.assessCombination(byId("primary-alcohol-strong-oxidation"), byId("ester-lah-reduction"));
    assert.equal(oxidantVsHydride.category, "documented-conflict");
    assert.match(oxidantVsHydride.reasons.join(" "), /oxidant would destroy/);
    // Symmetric.
    assert.equal(roles.assessCombination(byId("ester-lah-reduction"), byId("fischer-esterification")).category, "documented-conflict");
  });

  test("two rules that declare conditions with no clash are INCOMPLETE, not compatible", () => {
    const result = roles.assessCombination(byId("primary-alcohol-mild-oxidation"), byId("fischer-esterification"));
    assert.equal(result.category, "incomplete");
    assert.match(result.reasons[0], /not evidence of compatibility/);
  });

  test("a rule without declared conditions makes the pair unassessed", () => {
    const rule = registry.find((candidate) => !candidate.conditions);
    const result = roles.assessCombination(rule, byId("fischer-esterification"));
    assert.equal(result.category, "unassessed");
  });

  test("no pair of real rules is ever reported as documented-compatible (none is curated)", () => {
    const declared = registry.filter((rule) => rule.conditions).slice(0, 30);
    const open = registry.filter((rule) => !rule.conditions).slice(0, 10);
    for (const a of [...declared, ...open]) {
      for (const b of [...declared, ...open]) {
        if (a === b) continue;
        assert.notEqual(roles.assessCombination(a, b).category, "documented-compatible");
      }
    }
  });
});

describe("workspace catalysis assessment", () => {
  test("[engine] Sonogashira -> Lindlar -> Pd/C hydrogenation: three catalytic steps, identities reported as they are", async () => {
    const workspace = await run(["Ic1ccccc1", "C#CCCCC"], [
      { ruleId: "sonogashira-coupling", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "alkyne-lindlar-reduction-internal", reactants: [{ attempt: 1, product: 1 }] },
      { ruleId: "alkene-hydrogenation", reactants: [{ attempt: 2, product: 1 }] },
    ]);
    const result = catalysis.assessWorkspaceCatalysis(workspace, registry);
    assert.equal(result.mode, "sequential-isolated");
    assert.deepEqual(result.catalyticStepNumbers, [1, 2, 3]);
    assert.deepEqual(result.distinctCatalystSystems, ["CuI + Pd catalyst", "Lindlar catalyst", "Pd/C"]);
    assert.deepEqual(result.genericCatalystStepNumbers, [1], "the Pd of Sonogashira is not a identified species");
    assert.deepEqual(result.unassessedStepNumbers, []);
    assert.deepEqual(result.claims, { tandem: false, cooperative: false });
    assert.match(result.modeStatement, /not show, and PocketChem does not claim, a one-pot tandem process or cooperative catalysis/);
    assert.equal(result.combinations.length, 3);
    // Lindlar and Pd/C hydrogenation declare no conditions, so combining them is unassessed.
    const pair = result.combinations.find((item) => item.stepNumbers.join() === "2,3");
    assert.equal(pair.category, "unassessed");
    const lines = presentation.catalysisSummaryLines(result).join(" ");
    assert.match(lines, /3 distinct catalyst systems/);
    assert.match(lines, /named only by type/);
    assert.doesNotMatch(lines, /tandem process was|cooperative catalysis was|compatible/i);
  });

  test("[engine] a reagent-only route (Grignard, PCC) has no catalytic step and says so", async () => {
    const workspace = await run(["CCCCBr", "CCCCO"], [
      { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
      { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
      { ruleId: "aldehyde-organometallic-addition", reactants: [{ attempt: 2, product: 1 }, { attempt: 1, product: 1 }] },
      { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 3, product: 1 }] },
    ]);
    const result = catalysis.assessWorkspaceCatalysis(workspace, registry);
    assert.deepEqual(result.catalyticStepNumbers, []);
    assert.equal(result.combinations.length, 0);
    assert.match(presentation.catalysisSummaryLines(result).join(" "), /No completed step has a catalyst declared/);
  });

  test("[engine] steps that were not completed carry roles too, and do not enter the catalysis summary", async () => {
    const workspace = await run(["CCO"], [{ ruleId: "fischer-esterification", reactants: [{ material: 0 }] }]);
    assert.equal(workspace.history[0].status, "needs-input");
    assert.equal(workspace.history[0].roles.catalystIdentity, "named");
    assert.equal(catalysis.assessWorkspaceCatalysis(workspace, registry).steps.length, 0);
  });

  test("[engine] the roles stored with a step win over the current table (restored work is described as saved)", async () => {
    const workspace = await run(["C=CCC"], [{ ruleId: "alkene-hydrogenation", reactants: [{ material: 0 }] }]);
    const saved = JSON.parse(JSON.stringify(workspace));
    saved.history[0].roles.roles[0].name = "Pt (as saved)";
    const result = catalysis.assessWorkspaceCatalysis(saved, registry);
    assert.deepEqual(result.distinctCatalystSystems, ["Pt (as saved)"]);
  });

  test("[engine] a workspace saved before roles existed validates and is described as unassessed", async () => {
    const workspace = await run(["C=CCC"], [{ ruleId: "alkene-hydrogenation", reactants: [{ material: 0 }] }]);
    const old = JSON.parse(JSON.stringify(workspace));
    for (const step of old.history) delete step.roles;
    assert.ok(mc.validateWorkspaceSnapshot(old), "old saved workspaces still open");
    const result = catalysis.assessWorkspaceCatalysis(old, registry);
    assert.equal(result.steps.length, 1, "falls back to the current table only for display; the saved record is unchanged");
    assert.equal(presentation.roleLines(undefined).lines.length, 0);
    assert.match(presentation.roleLines(undefined).heading, /unassessed/);
  });

  test("a malformed roles value is rejected by the workspace validator", async () => {
    const workspace = await run(["C=CCC"], [{ ruleId: "alkene-hydrogenation", reactants: [{ material: 0 }] }]);
    const bad = JSON.parse(JSON.stringify(workspace));
    bad.history[0].roles.roles[0].kind = "magic";
    assert.equal(mc.validateWorkspaceSnapshot(bad), null);
    const bad2 = JSON.parse(JSON.stringify(workspace));
    bad2.history[0].roles.catalystIdentity = "maybe";
    assert.equal(mc.validateWorkspaceSnapshot(bad2), null);
  });
});
