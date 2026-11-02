// Stage 9B-2B: Multi-Catalytic workspace persistence, Saved Analyses integration and presentation
// wording. Workspaces are built by the real engine; persistence runs on the in-memory backend.
// The React page itself is not rendered here (see the live-browser check for that).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const clone = (value) => JSON.parse(JSON.stringify(value));

let registry;
let engineWs;
let mc;
let store;
let lib;
let libApp;
let controllerModule;
let presentation;
let convergent; // a finished 4-step convergent workspace
let withFailures; // a workspace with a failed and a pending attempt
let assessment;

before(async () => {
  const engine = await loadEngine();
  registry = engine.utils.reactionRegistry;
  engineWs = await loadModule("/src/utils/reactions/engine/reactionWorkspace.ts");
  mc = await loadModule("/src/utils/persistence/multicatalyticWorkspace.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  presentation = await loadModule("/src/utils/reactions/engine/workspacePresentation.ts");

  const created = await engineWs.createWorkspace(["CCCCBr", "CCCCO"]);
  convergent = await engineWs.runWorkspaceScript(created.workspace, [
    { ruleId: "haloalkane-grignard-formation-bromide", reactants: [{ material: 0 }] },
    { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] },
    { ruleId: "aldehyde-organometallic-addition", reactants: [{ attempt: 2, product: 1 }, { attempt: 1, product: 1 }] },
    { ruleId: "secondary-alcohol-oxidation-pcc", reactants: [{ attempt: 3, product: 1 }] },
  ], registry);
  assessment = await engineWs.assessWorkspace(convergent, registry);

  const base = (await engineWs.createWorkspace(["CC(C)CC", "CCO", "CCCCCC"])).workspace;
  withFailures = await engineWs.runWorkspaceScript(base, [
    { ruleId: "alkane-radical-bromination", reactants: [{ material: 0 }] }, // needs-selection
    { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 2 }] }, // no-reaction
    { ruleId: "fischer-esterification", reactants: [{ material: 1 }] }, // needs-input
    { ruleId: "primary-alcohol-mild-oxidation", reactants: [{ material: 1 }] }, // reaction
  ], registry);
});

after(async () => {
  await closeEngine();
});

const summary = (a) => ({ verification: a.verification, compatibility: a.compatibility, selectivity: a.selectivity });
const inputsFor = (workspace, selection = { ruleId: null, lotIds: [] }) => ({ actions: workspace.actions, selection });
const resultsFor = (workspace, a = null) => ({
  inputKey: mc.multicatalyticInputKey(workspace.actions),
  workspace,
  assessment: a,
});
const envelope = (data, extra = {}) => ({ computedAt: "2026-11-01T12:00:00.000Z", engineVersion: mc.MULTICATALYTIC_ENGINE_VERSION, stale: false, status: "workspace", data, ...extra });

describe("real workspaces are plain data and validate", () => {
  test("[engine] a convergent workspace with its assessment round-trips through validation unchanged", () => {
    const data = resultsFor(convergent, summary(assessment));
    store.assertPlainJson(data);
    const restored = mc.validateMulticatalyticResults(clone(data));
    assert.ok(restored);
    assert.deepEqual(restored, clone(data));
  });

  test("[engine] failed and pending attempts survive with their explanations and statuses", () => {
    const restored = mc.validateMulticatalyticResults(clone(resultsFor(withFailures)));
    assert.ok(restored);
    assert.deepEqual(restored.workspace.history.map((step) => step.status), ["needs-selection", "no-reaction", "needs-input", "reaction"]);
    assert.deepEqual(restored.workspace.history.map((step) => step.explanation), withFailures.history.map((step) => step.explanation));
    assert.equal(restored.workspace.history[0].outcomes.length, 4);
  });

  test("[engine] inputs (the action log and selection) validate", () => {
    const inputs = inputsFor(convergent, { ruleId: "secondary-alcohol-oxidation-pcc", lotIds: ["s3.1"] });
    assert.deepEqual(mc.validateMulticatalyticInputs(clone(inputs)), clone(inputs));
  });

  test("malformed inputs are rejected", () => {
    for (const bad of [
      null, [], { actions: "x", selection: { ruleId: null, lotIds: [] } },
      { actions: [{ kind: "material", smiles: "" }], selection: { ruleId: null, lotIds: [] } },
      { actions: [{ kind: "step", request: { ruleId: 3, lotIds: [] } }], selection: { ruleId: null, lotIds: [] } },
      { actions: [{ kind: "teleport" }], selection: { ruleId: null, lotIds: [] } },
      { actions: [], selection: { ruleId: null, lotIds: [1] } },
      { actions: [], selection: null },
    ]) {
      assert.equal(mc.validateMulticatalyticInputs(bad), null, JSON.stringify(bad));
    }
  });
});

describe("a damaged or inconsistent workspace is never shown as whole", () => {
  const tamper = (mutate) => {
    const copy = clone(resultsFor(convergent, summary(assessment)));
    mutate(copy);
    return mc.validateMulticatalyticResults(copy);
  };

  test("a step that names a lot which does not exist", () => {
    assert.equal(tamper((d) => { d.workspace.pool.steps[2].consumedLotIds[0] = "s9.9"; }), null);
  });
  test("a consumed lot without the step that consumed it", () => {
    assert.equal(tamper((d) => { d.workspace.pool.lots[0].consumedByStep = null; }), null);
  });
  test("records that do not match the committed steps", () => {
    assert.equal(tamper((d) => { d.workspace.records.pop(); }), null);
  });
  test("history that claims more completed steps than the shelf recorded", () => {
    assert.equal(tamper((d) => { d.workspace.history[0].status = "no-reaction"; }), null);
  });
  test("a failed attempt that claims to have consumed material", () => {
    const copy = clone(resultsFor(withFailures));
    copy.workspace.history[1].consumedLotIds = ["sm2#1"];
    assert.equal(mc.validateMulticatalyticResults(copy), null);
  });
  test("duplicate lot ids, bad roles and a wrong assessment shape", () => {
    assert.equal(tamper((d) => { d.workspace.pool.lots[1].id = d.workspace.pool.lots[0].id; }), null);
    assert.equal(tamper((d) => { d.workspace.pool.lots[0].role = "catalyst"; }), null);
    assert.equal(tamper((d) => { d.assessment = { verification: 3 }; }), null);
  });
  test("the supplied-copy count must match the starting materials", () => {
    assert.equal(tamper((d) => { d.workspace.pool.suppliedCopies = [1]; }), null);
  });
});

describe("automatic workspace recovery", () => {
  function fakeTimers() {
    const pending = new Map();
    let next = 1;
    return {
      timers: { set: (cb) => { const id = next++; pending.set(id, cb); return id; }, clear: (id) => pending.delete(id) },
      fire() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb()); },
    };
  }
  const controllerFor = (backend, clock) =>
    new controllerModule.WorkspacePersistence({
      store: new store.WorkspaceStore(backend),
      page: "multicatalytic",
      engineVersion: mc.MULTICATALYTIC_ENGINE_VERSION,
      validateInputs: mc.validateMulticatalyticInputs,
      validateResults: mc.validateMulticatalyticResults,
      timers: clock.timers,
    });

  test("[engine] a workspace saved before a restart is restored exactly, with nothing recomputed", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const first = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    assert.deepEqual((await first.recover()).kind, "none");
    first.requestSave(() => ({ inputs: inputsFor(convergent), results: envelope(resultsFor(convergent, summary(assessment))) }));
    clock.fire();
    await first.flush();

    const second = controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers());
    const outcome = await second.recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.resultsDropped, false);
    assert.equal(outcome.engineMismatch, false);
    assert.deepEqual(outcome.results.data.workspace, clone(convergent));
    assert.deepEqual(outcome.results.data.assessment, clone(summary(assessment)));
    assert.deepEqual(outcome.inputs.actions, clone(convergent.actions));
    // Lot identity and provenance are unchanged, so later steps can keep using the same ids.
    assert.deepEqual(outcome.results.data.workspace.pool.lots.map((lot) => lot.id), convergent.pool.lots.map((lot) => lot.id));
  });

  test("[engine] a workspace saved while a step is pending a choice restores as pending, unconsumed", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const first = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await first.recover();
    first.requestSave(() => ({ inputs: inputsFor(withFailures), results: envelope(resultsFor(withFailures), { status: "workspace" }) }));
    clock.fire();
    await first.flush();
    const outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    const restored = outcome.results.data.workspace;
    assert.equal(restored.history[0].status, "needs-selection");
    assert.ok(restored.pool.lots.find((lot) => lot.id === "sm0#1").availability === "live", "the molecule awaiting a choice was not consumed");
  });

  test("results that fail validation are dropped but the action log is kept so the workspace can be recomputed", async () => {
    const disk = new Map();
    const backend = new store.MemoryBackend({ map: disk });
    const bad = clone(resultsFor(convergent));
    bad.workspace.records.pop();
    await new store.WorkspaceStore(backend).save("multicatalytic", { inputs: inputsFor(convergent), results: envelope(bad) });
    const outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.resultsDropped, true);
    assert.equal(outcome.results, null);
    const replayed = await engineWs.replayActions(outcome.inputs.actions, registry);
    assert.ok(replayed.ok);
    assert.deepEqual(replayed.workspace.pool.lots.map((lot) => [lot.id, lot.smiles, lot.availability]), convergent.pool.lots.map((lot) => [lot.id, lot.smiles, lot.availability]));
  });

  test("an engine-version mismatch is flagged and the saved result is not rewritten", async () => {
    const disk = new Map();
    await new store.WorkspaceStore(new store.MemoryBackend({ map: disk })).save("multicatalytic", {
      inputs: inputsFor(convergent),
      results: envelope(resultsFor(convergent), { engineVersion: mc.MULTICATALYTIC_ENGINE_VERSION + 1 }),
    });
    const outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.engineMismatch, true);
    assert.deepEqual(outcome.results.data.workspace, clone(convergent));
  });

  test("clearing deletes the saved workspace", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const controller = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await controller.recover();
    controller.requestSave(() => ({ inputs: inputsFor(convergent), results: envelope(resultsFor(convergent)) }));
    clock.fire();
    await controller.flush();
    assert.equal(disk.size, 1);
    await controller.discard();
    assert.equal(disk.size, 0);
  });
});

describe("Saved Analyses library", () => {
  const validators = () => ({
    multicatalytic: {
      engineVersion: mc.MULTICATALYTIC_ENGINE_VERSION,
      validateInputs: mc.validateMulticatalyticInputs,
      validateResults: mc.validateMulticatalyticResults,
    },
  });
  let counter = 0;
  const makeLibrary = (backend = new store.MemoryBackend()) =>
    new lib.AnalysisLibrary(backend, { validators: validators(), newId: () => `mc-${++counter}` });

  test("[engine] saving and opening a workspace gives back the same steps, lots and assessment", async () => {
    const library = makeLibrary();
    const saved = await library.save("multicatalytic", {
      name: "Octan-4-one via Grignard",
      summary: mc.describeMulticatalyticAnalysis(resultsFor(convergent, summary(assessment))),
      inputs: inputsFor(convergent),
      results: envelope(resultsFor(convergent, summary(assessment))),
    });
    assert.ok(saved.ok, saved.ok ? "" : saved.error.message);
    assert.equal(saved.value.status, "workspace");
    const opened = await library.open(saved.value.id);
    assert.ok(opened.ok);
    assert.equal(opened.value.resultsDropped, false);
    assert.deepEqual(opened.value.results.data.workspace, clone(convergent));
  });

  test("a saved analysis is a copy: later changes to the live workspace do not reach it", async () => {
    const library = makeLibrary();
    const live = clone(convergent);
    const saved = await library.save("multicatalytic", { name: "snapshot", summary: "s", inputs: inputsFor(live), results: envelope(resultsFor(live)) });
    live.pool.lots[0].smiles = "CHANGED";
    const opened = await library.open(saved.value.id);
    assert.equal(opened.value.results.data.workspace.pool.lots[0].smiles, "CCCCBr");
  });

  test("the app registers the page, opens it on the Multi-Catalytic page, and lists it as openable", () => {
    assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes("multicatalytic"));
    assert.equal(libApp.ANALYSIS_APP_PAGE.multicatalytic, "multiCatalytic");
    assert.match(read("src", "components", "SavedAnalysesPage.tsx"), /multicatalytic: "Multi-Catalytic Workspace"/);
    assert.match(read("src", "App.tsx"), /pendingOpen\?\.page === "multiCatalytic"/);
  });

  test("the description counts molecules, completed steps and steps that did not complete", () => {
    assert.equal(
      mc.describeMulticatalyticAnalysis(resultsFor(withFailures)),
      "3 starting molecules · 1 completed step · 3 steps not completed · 3 molecules in inventory",
    );
  });

  test("older saved analyses of other pages still open (the new page changed nothing for them)", async () => {
    const library = new lib.AnalysisLibrary(new store.MemoryBackend(), {
      validators: { ...validators(), ranking: { engineVersion: 1, validateInputs: (x) => x, validateResults: (x) => x } },
      newId: () => `old-${++counter}`,
    });
    const saved = await library.save("ranking", { name: "older record", summary: "r", inputs: { a: 1 }, results: null });
    assert.ok(saved.ok);
    assert.ok((await library.open(saved.value.id)).ok);
  });
});

describe("presentation wording", () => {
  test("a single offered outcome is never described as major", () => {
    assert.match(presentation.selectivityText("single-outcome"), /not ranked/);
    assert.doesNotMatch(presentation.selectivityText("single-outcome"), /major/i);
    assert.doesNotMatch(presentation.selectivityText("unranked"), /major/i);
    assert.match(presentation.selectivityText("major"), /rule's own numeric estimate/);
    assert.equal(presentation.selectivityIsCaution("unranked"), true);
    assert.equal(presentation.selectivityIsCaution("single-outcome"), false);
  });

  test("verification wording never claims experimental validation", () => {
    for (const status of ["verified", "connectivity-only", "failed"]) {
      const wording = presentation.verificationWording(status);
      assert.doesNotMatch(wording.headline, /experiment|proven|confirmed/i);
      if (status !== "failed") assert.match(wording.detail, /not experimental validation/);
    }
  });

  test("[engine] every non-reaction status has a visible heading that says nothing was consumed or run", () => {
    for (const step of withFailures.history) {
      if (step.status === "reaction") continue;
      assert.ok(presentation.STEP_STATUS_HEADING[step.status]);
      assert.match(presentation.STEP_STATUS_HEADING[step.status], /NOTHING WAS CONSUMED|NOT RUN/);
      assert.equal(presentation.isUnresolvedStep(step), true);
      assert.ok(step.explanation.length > 20, `${step.status} has a visible explanation`);
    }
  });

  test("[engine] pendingSelection finds a trailing choice and nothing else", () => {
    const pendingOnly = { ...withFailures, history: withFailures.history.slice(0, 1) };
    assert.equal(presentation.pendingSelection(pendingOnly)?.status, "needs-selection");
    assert.equal(presentation.pendingSelection(withFailures), null, "a later attempt resolved or superseded it");
  });

  test("[engine] lot labels and origins describe provenance in plain words", () => {
    const nonanol = convergent.pool.lots.find((lot) => lot.id === "s3.1");
    assert.equal(presentation.lotLabel(nonanol), "Step 3 product");
    assert.match(presentation.lotOrigin(convergent, nonanol), /Made in step 3 .*from Step 2 product \(s2\.1\) \+ Step 1 product \(s1\.1\)|from Step 1 product \(s1\.1\) \+ Step 2 product \(s2\.1\)/);
    assert.equal(presentation.lotOrigin(convergent, convergent.pool.lots[0]), "Supplied starting material");
    const groups = presentation.inventoryGroups(convergent);
    assert.equal(groups.live.length, 1);
    assert.equal(groups.consumed.length, convergent.pool.lots.length - 1);
  });
});

describe("page structure", () => {
  const panel = read("src", "components", "ReactionWorkspacePanel.tsx");
  const page = read("src", "components", "MultiCatalyticPage.tsx");

  test("the original ordered-sequence tool is still present and uses its own editor", () => {
    assert.match(page, /function OrderedSequencePanel\(\)/);
    assert.match(page, /globalKey="multiCatalyticKetcher"/);
    assert.match(page, /runSequentialSynthesisDetailed/);
    assert.match(panel, /globalKey="multiCatalyticWorkspaceKetcher"/);
  });

  test("restoring a workspace never runs a reaction", () => {
    const restore = panel.slice(panel.indexOf("function applyRecovery("), panel.indexOf("const applyRecoveryRef"));
    assert.ok(restore.length > 200);
    assert.doesNotMatch(restore, /executeWorkspaceStep|runStep|replayActions|predictReaction/);
  });

  test("leaving the page waits for a running step before the final save", () => {
    assert.match(panel, /beforeLeave: async \(\) => \{\s*await inFlightRef\.current/);
  });

  test("steps run through the engine one at a time", () => {
    assert.match(panel, /if \(busyRef\.current\) return;\s*busyRef\.current = true/);
    assert.match(panel, /executeWorkspaceStep\(current, request, reactionRegistry\)/);
  });
});
