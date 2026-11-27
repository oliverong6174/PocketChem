// Phase 4 / Stage 8B-2B: Reactions workspace persistence.
//
// The fixtures are real but tiny predictions (a stereodefined bromoalkane, ethanol, acetic acid plus
// ethanol on one canvas, and the retrosynthesis of ethyl acetate; each runs in well under a second).
// They prove that real engine output is plain data the validators accept; persistence itself runs on
// an in-memory backend with fake timers. No synthesis search or reaction sweep is run.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

let store;
let controllerModule;
let debounced;
let gate;
let editorRestore;
let ketIdentity;
let ws;
let fixtures;

before(async () => {
  await loadEngine();
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  debounced = await loadModule("/src/utils/persistence/debouncedTask.ts");
  gate = await loadModule("/src/utils/persistence/leaveGate.ts");
  editorRestore = await loadModule("/src/utils/persistence/editorRestore.ts");
  ketIdentity = await loadModule("/src/utils/persistence/ketIdentity.ts");
  ws = await loadModule("/src/utils/persistence/reactionsWorkspace.ts");
  const reactionUtils = await loadModule("/src/utils/reactionUtils.ts");
  const groups = await loadModule("/src/utils/functionalGroups/index.ts");

  const stereoSmiles = "C[C@H](Br)CC";
  const stereo = await groups.analyzeFunctionalGroupHierarchy(stereoSmiles);
  const stereoPathways = await reactionUtils.predictReactionPathways(stereoSmiles, stereo.primaryGroups);
  const stereoNoReaction = await reactionUtils.predictNoReactionOutcomes(
    stereoSmiles,
    stereoPathways.filter((p) => p.productSmiles).map((p) => p.ruleId),
    reactionUtils.reactionRegistry,
    stereo.functionalGroups ?? stereo.primaryGroups,
  );
  const ethanol = await groups.analyzeFunctionalGroupHierarchy("CCO");
  const ethanolPathways = await reactionUtils.predictReactionPathways("CCO", ethanol.primaryGroups);
  const multiSmiles = "CC(=O)O.OCC";
  const multiPathways = await reactionUtils.predictReactionPathways(multiSmiles, []);
  const retroSmiles = "CC(=O)OCC";
  const retroPathways = await reactionUtils.predictRetrosynthesisPathways(retroSmiles);
  fixtures = { stereoSmiles, stereoPathways, stereoNoReaction, ethanolPathways, multiSmiles, multiPathways, retroSmiles, retroPathways };
});

after(async () => {
  await closeEngine();
});

// ---- helpers ----------------------------------------------------------------------------------

function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    timers: {
      set: (callback) => { const id = next++; pending.set(id, callback); return id; },
      clear: (id) => pending.delete(id),
    },
    get pendingCount() { return pending.size; },
    fire() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((cb) => cb()); },
  };
}

const newStore = (backend, options) => new store.WorkspaceStore(backend, options);
const clone = (value) => JSON.parse(JSON.stringify(value));
const water = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms: [{ label: "O", location: [0, 0, 0] }], bonds: [] } });
const emptyKet = JSON.stringify({ root: { nodes: [] } });

const inputs = (overrides = {}) => ({ ket: water, key: "O", analysisMode: "forward", visibleResultCount: 12, interrupted: null, ...overrides });
const envelope = (data, extra = {}) => ({ computedAt: "2026-10-27T12:00:00.000Z", engineVersion: 1, stale: false, status: "forward-found", data, ...extra });

function resultData(mode, overrides = {}) {
  const f = fixtures;
  const forward = {
    inputKey: "CC[C@@H](C)Br", mode: "forward", smiles: f.stereoSmiles, molfile: "\n  -ketcher-\n\n  0  0  0  0  0  0  0  0  0  0999 V3000\nM  V30 BEGIN CTAB\nM  V30 END CTAB\nM  END\n",
    componentMolfiles: [], inputName: "(2S)-2-bromobutane", statusText: "15 supported reaction outcomes found.",
    pathways: f.stereoPathways, retroPathways: [], noReactionOutcomes: f.stereoNoReaction,
  };
  const multi = { ...forward, inputKey: "CC(=O)O.CCO", smiles: f.multiSmiles, componentMolfiles: ["m1", "m2"], inputName: "acetic acid + ethanol", pathways: f.multiPathways, noReactionOutcomes: [] };
  const retro = { ...forward, inputKey: "CC(=O)OCC", mode: "retrosynthesis", smiles: f.retroSmiles, pathways: [], retroPathways: f.retroPathways, noReactionOutcomes: [], statusText: "26 verified precursor routes found." };
  return { ...{ forward, multi, retro }[mode], ...overrides };
}

function controllerFor(backend, clock, overrides = {}) {
  return new controllerModule.WorkspacePersistence({
    store: newStore(backend), page: "reactions", engineVersion: 1,
    validateInputs: ws.validateReactionsInputs, validateResults: ws.validateReactionsResults, timers: clock.timers, ...overrides,
  });
}

// ---- save and restore: reactants, products, stereo, explanations ------------------------------------

describe("reactions workspace content", () => {
  test("[results] real forward, multi-reactant and retrosynthesis output is plain data and validates", () => {
    for (const mode of ["forward", "multi", "retro"]) {
      const data = resultData(mode);
      store.assertPlainJson(data);
      assert.ok(ws.validateReactionsResults(clone(data)), mode);
    }
    assert.ok(fixtures.stereoPathways.length > 0 && fixtures.retroPathways.length > 0 && fixtures.multiPathways.length > 0);
  });

  test("[results] a forward analysis survives a simulated browser restart exactly (products, mixtures, explanations, order)", async () => {
    const disk = new Map();
    const data = resultData("forward");
    await newStore(new store.MemoryBackend({ map: disk })).save("reactions", { inputs: inputs(), results: envelope(data) });
    const loaded = await newStore(new store.MemoryBackend({ map: disk })).load("reactions");
    const restored = ws.validateReactionsResults(loaded.record.results.data);
    assert.ok(restored);
    assert.deepEqual(restored, clone(data));
    assert.deepEqual(restored.pathways.map((p) => p.id), fixtures.stereoPathways.map((p) => p.id), "pathway order");
    assert.deepEqual(restored.pathways.map((p) => p.shortExplanation), fixtures.stereoPathways.map((p) => p.shortExplanation), "explanations");
    assert.deepEqual(restored.pathways.map((p) => [p.course, p.chapter, p.mechanism, p.productStatus]), fixtures.stereoPathways.map((p) => [p.course, p.chapter, p.mechanism, p.productStatus]), "classification");
    assert.deepEqual(restored.noReactionOutcomes, clone(fixtures.stereoNoReaction), "NO REACTION outcomes");
  });

  test("[stereo] the stereodefined input and every product keep their stereodescriptors byte-for-byte", () => {
    const restored = ws.validateReactionsResults(clone(resultData("forward")));
    assert.match(restored.smiles, /@/);
    const products = restored.pathways.map((p) => p.productSmiles).filter(Boolean);
    const originals = fixtures.stereoPathways.map((p) => p.productSmiles).filter(Boolean);
    assert.deepEqual(products, originals);
    assert.ok(products.length > 0);
    const mixtures = restored.pathways.filter((p) => p.productMixture);
    assert.deepEqual(mixtures.map((p) => p.productMixture), clone(fixtures.stereoPathways.filter((p) => p.productMixture).map((p) => p.productMixture)), "racemic and diastereomeric mixtures with all members");
  });

  test("[multi] disconnected reactants stay separate and every component molfile is kept", () => {
    const restored = ws.validateReactionsResults(clone(resultData("multi")));
    assert.equal(restored.smiles.split(".").length, 2);
    assert.deepEqual(restored.componentMolfiles, ["m1", "m2"]);
    assert.ok(restored.pathways.some((p) => p.reactantComponents.length === 2), "the two-component reaction keeps both reactants");
  });

  test("[needs-input] pathways that still need a reactant keep that status and the missing-reactant list", () => {
    const needing = fixtures.ethanolPathways.filter((p) => p.missingReactants.length > 0);
    assert.ok(needing.length > 0, "ethanol alone has reactions that need another reactant");
    const data = resultData("forward", { smiles: "CCO", inputKey: "CCO", pathways: fixtures.ethanolPathways, noReactionOutcomes: [] });
    const restored = ws.validateReactionsResults(clone(data));
    assert.deepEqual(restored.pathways.filter((p) => p.missingReactants.length > 0).map((p) => [p.id, p.productStatus, p.missingReactants.map((m) => m.label)]), clone(needing.map((p) => [p.id, p.productStatus, p.missingReactants.map((m) => m.label)])));
  });

  test("[retro] retrosynthetic routes keep precursors, confidence, alternatives and explanations", () => {
    const restored = ws.validateReactionsResults(clone(resultData("retro")));
    assert.equal(restored.mode, "retrosynthesis");
    assert.deepEqual(restored.retroPathways, clone(fixtures.retroPathways));
    assert.deepEqual(restored.retroPathways.map((p) => p.precursorComponents), fixtures.retroPathways.map((p) => p.precursorComponents));
    assert.equal(restored.pathways.length, 0);
  });

  test("[outcomes] no-reaction and unsupported outcomes are saved as results, errors and unknown kinds are not", () => {
    for (const kind of ["forward-found", "forward-none", "retro-found", "retro-none"]) assert.equal(ws.isReactionsOutcomeKind(kind), true, kind);
    for (const kind of ["error", "failed", "running", "interrupted", ""]) assert.equal(ws.isReactionsOutcomeKind(kind), false, kind);
    const none = resultData("forward", { pathways: [], noReactionOutcomes: [], statusText: "No supported reactions were found." });
    assert.deepEqual(ws.validateReactionsResults(clone(none)).pathways, []);
    const noneOnlyNoReaction = resultData("forward", { pathways: [], statusText: "No supported reactions were found." });
    assert.equal(ws.validateReactionsResults(clone(noneOnlyNoReaction)).noReactionOutcomes.length, fixtures.stereoNoReaction.length);
  });

  test("[validation] damaged results, a result mixing both modes, and unsafe inputs are refused", () => {
    const good = () => clone(resultData("forward"));
    assert.ok(ws.validateReactionsResults(good()));
    const cases = {
      "pathway without id": (d) => { delete d.pathways[0].id; },
      "pathway without explanation": (d) => { delete d.pathways[0].shortExplanation; },
      "limitations not strings": (d) => { d.pathways[0].limitations = [1]; },
      "bad product mixture": (d) => { const p = d.pathways.find((x) => x.productMixture); p.productMixture.memberSmiles = "x"; },
      "bad course": (d) => { d.pathways[0].course = "ochem-9"; },
      "retro results inside a forward analysis": (d) => { d.retroPathways = clone(fixtures.retroPathways); },
      "no-reaction outcome damaged": (d) => { d.noReactionOutcomes[0].ruleIds = "x"; },
      "empty smiles": (d) => { d.smiles = " "; },
      "unknown mode": (d) => { d.mode = "sideways"; },
      "molfiles not strings": (d) => { d.componentMolfiles = [1]; },
      "oversized molfile": (d) => { d.molfile = "x".repeat(1_100_000); },
      "too many pathways": (d) => { d.pathways = Array.from({ length: 501 }, () => d.pathways[0]); },
      "not an object": () => null,
    };
    for (const [label, mutate] of Object.entries(cases)) {
      const damaged = good();
      const value = mutate(damaged) === null ? null : damaged;
      assert.equal(ws.validateReactionsResults(value), null, label);
    }
    assert.ok(ws.validateReactionsInputs(inputs()));
    assert.ok(ws.validateReactionsInputs(inputs({ analysisMode: "retrosynthesis", interrupted: "retrosynthesis", ket: null, key: null })));
    for (const bad of [inputs({ analysisMode: "x" }), inputs({ interrupted: "x" }), inputs({ visibleResultCount: 0 }), inputs({ visibleResultCount: 1.5 }), inputs({ ket: "{bad" }), inputs({ ket: "x".repeat(1_600_000) }), null]) {
      assert.equal(ws.validateReactionsInputs(bad), null);
    }
  });
});

// ---- exact restoration, stale results, interrupted work ---------------------------------------------------

describe("reactions recovery behavior", () => {
  test("[restore] a reload returns the saved analysis from storage alone, with the saved mode and expansion", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const first = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await first.recover();
    first.requestSave(() => ({ inputs: inputs({ analysisMode: "retrosynthesis", visibleResultCount: 24 }), results: envelope(resultData("retro"), { status: "retro-found" }) }));
    clock.fire();
    await first.flush();

    const second = controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers());
    const outcome = await second.recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.inputs.analysisMode, "retrosynthesis");
    assert.equal(outcome.inputs.visibleResultCount, 24);
    assert.equal(outcome.results.status, "retro-found");
    assert.deepEqual(outcome.results.data.retroPathways.map((p) => p.id), fixtures.retroPathways.map((p) => p.id));
    assert.equal(outcome.engineMismatch, false);
  });

  test("[stale] saved results are current only when the saved drawing is the structure they came from", () => {
    const data = resultData("forward");
    assert.equal(ws.restoredResultsAreStale(inputs({ key: data.inputKey }), { stale: false, data }), false);
    assert.equal(ws.restoredResultsAreStale(inputs({ key: "CCCC" }), { stale: false, data }), true, "different structure");
    assert.equal(ws.restoredResultsAreStale(inputs({ key: null }), { stale: false, data }), true, "no saved drawing");
    assert.equal(ws.restoredResultsAreStale(inputs({ key: data.inputKey }), { stale: true, data }), true, "already stale");
  });

  test("[stale] an edited structure has a different identity, so edited input never inherits old results", async () => {
    const mol = (isotope) => JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms: [{ label: "C", location: [0, 0, 0], ...(isotope ? { isotope } : {}) }, { label: "C", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] } });
    assert.notEqual(await ketIdentity.ketIdentityKey(mol(13)), await ketIdentity.ketIdentityKey(mol(0)));
    assert.equal(await ketIdentity.ketIdentityKey(mol(0)), await ketIdentity.ketIdentityKey(mol(0)));
  });

  test("[interrupted] a prediction that was running is recorded as interrupted, never as a finished result", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const first = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await first.recover();
    first.requestSave(() => ({ inputs: inputs({ interrupted: "forward" }), results: null })); // page reloaded mid-calculation
    clock.fire();
    await first.flush();
    const outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.results, null, "no result is invented");
    assert.equal(outcome.inputs.interrupted, "forward");
    assert.equal(outcome.inputs.ket, water, "the drawing is still recovered");
  });

  test("[interrupted] an inputs-only record (a drawing but no prediction yet) restores no results", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const first = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await first.recover();
    first.requestSave(() => ({ inputs: inputs(), results: null }));
    clock.fire();
    await first.flush();
    const outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.results, null);
    assert.equal(outcome.resultsDropped, false);
  });

  test("[versions] results from another engine version are flagged and kept as saved; damaged results are dropped but the drawing survives", async () => {
    const disk = new Map();
    await newStore(new store.MemoryBackend({ map: disk })).save("reactions", { inputs: inputs(), results: envelope(resultData("forward"), { engineVersion: 0 }) });
    let outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.engineMismatch, true);
    assert.equal(outcome.results.engineVersion, 0, "not silently upgraded");

    const damaged = clone(resultData("forward"));
    delete damaged.pathways[0].id;
    const disk2 = new Map();
    await newStore(new store.MemoryBackend({ map: disk2 })).save("reactions", { inputs: inputs(), results: envelope(damaged) });
    outcome = await controllerFor(new store.MemoryBackend({ map: disk2 }), fakeTimers()).recover();
    assert.equal(outcome.resultsDropped, true);
    assert.equal(outcome.results, null);
    assert.equal(outcome.inputs.ket, water);
  });

  test("[lifecycle] nothing is written between reading the saved record and the page applying it", async () => {
    const disk = new Map();
    await newStore(new store.MemoryBackend({ map: disk })).save("reactions", { inputs: inputs(), results: envelope(resultData("forward")) });
    const backend = new store.MemoryBackend({ map: disk });
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.requestSave(() => null); // the page's still-empty default state
    assert.equal(clock.pendingCount, 0);
    await controller.flush();
    assert.equal(backend.putCount, 0);
    assert.ok(disk.has("workspace:reactions"));
  });
});

// ---- clear, discard, stale async restores --------------------------------------------------------------

describe("reactions clear, discard and stale restoration", () => {
  test("[clear] Clear Analysis deletes only the reactions record and cancels a pending save", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    await newStore(new store.MemoryBackend({ map: disk })).save("ranking", { inputs: { marker: "r" }, results: null });
    await newStore(new store.MemoryBackend({ map: disk })).save("synthesis", { inputs: { marker: "s" }, results: null });
    const c = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await c.recover();
    c.requestSave(() => ({ inputs: inputs(), results: envelope(resultData("forward")) }));
    clock.fire();
    await c.flush();
    assert.ok(disk.has("workspace:reactions"));

    c.requestSave(() => ({ inputs: inputs({ analysisMode: "retrosynthesis" }), results: null }));
    const token = c.token();
    await c.discard();
    clock.fire();
    await c.flush();
    assert.equal(c.isCurrent(token), false);
    assert.equal(disk.has("workspace:reactions"), false, "the pending save cannot resurrect cleared work");
    assert.equal(JSON.parse(disk.get("workspace:ranking")).inputs.marker, "r", "other pages are untouched");
    assert.equal(JSON.parse(disk.get("workspace:synthesis")).inputs.marker, "s");
  });

  test("[discard] discarding while a slow restore is still reading wins: the late record is never applied", async () => {
    const disk = new Map();
    await newStore(new store.MemoryBackend({ map: disk })).save("reactions", { inputs: inputs(), results: envelope(resultData("forward")) });
    let release;
    const gateOpen = new Promise((resolve) => { release = resolve; });
    class SlowBackend extends store.MemoryBackend {
      async get(key) { await gateOpen; return super.get(key); }
    }
    const c = controllerFor(new SlowBackend({ map: disk }), fakeTimers());
    const recovery = c.recover();
    const discarding = c.discard();
    release();
    assert.equal((await recovery).kind, "superseded");
    await discarding;
    assert.equal(disk.has("workspace:reactions"), false);
  });

  test("[stale-restore] a drawing made before the saved one arrives wins, and the editor is never overwritten", async () => {
    const waterKey = await ketIdentity.ketIdentityKey(water);
    const drawn = { ket: JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms: [{ label: "N", location: [0, 0, 0] }], bonds: [] } }), sets: 0 };
    const api = { getKet: async () => drawn.ket, setMolecule: async () => { drawn.sets += 1; } };
    assert.deepEqual(await editorRestore.restoreEditorContent(api, { ket: water, key: waterKey }, () => true), { kind: "user-content-kept" });
    assert.equal(drawn.sets, 0);
    const empty = { ket: emptyKet, sets: 0 };
    let current = true;
    const slow = { getKet: async () => empty.ket, setMolecule: async (k) => { empty.sets += 1; empty.ket = k; } };
    const racing = editorRestore.restoreEditorContent(slow, { ket: water, key: waterKey }, () => current);
    current = false;
    assert.equal((await racing).kind, "superseded");
    assert.equal(empty.sets, 0, "nothing is put back after Clear");
  });

  test("[switching] a last-moment edit is read and saved before the page unmounts; a late read is written at once", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const controller = controllerFor(new store.MemoryBackend({ map: disk }), clock);
    await controller.recover();
    let snapshotKet = null;
    const mirror = new debounced.DebouncedTask(async () => {
      snapshotKet = water;
      controller.requestSave(() => ({ inputs: inputs({ ket: snapshotKet }), results: null }));
    }, 150, clock.timers);
    const unregister = gate.registerLeaveHook(async () => { await mirror.flushNow(); await controller.flush(); });
    mirror.schedule(); // edit just before the tab click
    await gate.runLeaveHooks();
    unregister();
    controller.detach();
    const next = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(next.kind, "restored");
    assert.equal(next.inputs.ket, water);

    controller.requestSave(() => ({ inputs: inputs({ analysisMode: "retrosynthesis" }), results: null })); // a read finishing after unmount
    await controller.flush();
    assert.equal(JSON.parse(disk.get("workspace:reactions")).inputs.analysisMode, "retrosynthesis");
  });
});

// ---- storage failures and bad records -------------------------------------------------------------------

describe("reactions storage failures", () => {
  test("[records] corrupt, wrong-page, newer-format and oversized reactions records never throw", async () => {
    const disk = new Map([["workspace:reactions", "{broken"]]);
    assert.equal((await newStore(new store.MemoryBackend({ map: disk })).load("reactions")).kind, "corrupt");
    assert.ok(disk.has("workspace:reactions#rejected"));

    const record = { kind: "workspace", id: "workspace:reactions", page: "reactions", schemaVersion: 1, appVersion: "x", createdAt: "d", updatedAt: "d", inputs: {}, results: null };
    const wrongPage = new Map([["workspace:reactions", JSON.stringify({ ...record, page: "ranking" })]]);
    assert.equal((await newStore(new store.MemoryBackend({ map: wrongPage })).load("reactions")).kind, "corrupt");

    const future = JSON.stringify({ ...record, schemaVersion: 99 });
    const newer = new Map([["workspace:reactions", future]]);
    assert.equal((await newStore(new store.MemoryBackend({ map: newer })).load("reactions")).kind, "incompatible");
    assert.equal(newer.get("workspace:reactions#rejected"), future, "newer data is kept aside, not deleted");

    const tiny = newStore(new store.MemoryBackend(), { maxRecordChars: 400 });
    assert.equal((await tiny.save("reactions", { inputs: inputs(), results: envelope(resultData("forward")) })).code, "too-large");
  });

  test("[records] unusable saved inputs are set aside and the page starts clean", async () => {
    const disk = new Map();
    await newStore(new store.MemoryBackend({ map: disk })).save("reactions", { inputs: { analysisMode: "sideways" }, results: null });
    const outcome = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.kind, "rejected");
  });

  test("[quota] results too large to store are dropped but the drawing is kept, and the page is told; a full quota is reported", async () => {
    const backend = new store.MemoryBackend();
    const clock = fakeTimers();
    const data = resultData("forward");
    const cap = Math.max(3000, Math.floor(JSON.stringify(data).length / 2));
    const s = newStore(backend, { maxRecordChars: cap });
    const c = new controllerModule.WorkspacePersistence({ store: s, page: "reactions", engineVersion: 1, validateInputs: ws.validateReactionsInputs, validateResults: ws.validateReactionsResults, timers: clock.timers });
    await c.recover();
    c.requestSave(() => ({ inputs: inputs(), results: envelope(data) }));
    clock.fire();
    await c.flush();
    assert.equal(c.getStatus().resultsOmitted, true);
    const loaded = await s.load("reactions");
    assert.equal(loaded.record.results, null);
    assert.equal(loaded.record.inputs.ket, water);

    backend.quotaChars = 5;
    c.requestSave(() => ({ inputs: inputs({ visibleResultCount: 24 }), results: null }));
    clock.fire();
    await c.flush();
    assert.equal(c.getStatus().saveError.code, "quota");
  });

  test("[unavailable] without IndexedDB the page still works: nothing is scheduled and the status says so", async () => {
    const clock = fakeTimers();
    const c = new controllerModule.WorkspacePersistence({ store: newStore(null), page: "reactions", engineVersion: 1, validateInputs: (r) => r, validateResults: (r) => r, timers: clock.timers });
    assert.equal((await c.recover()).kind, "unavailable");
    c.requestSave(() => ({ inputs: {}, results: null }));
    assert.equal(clock.pendingCount, 0);
    assert.equal(c.getStatus().available, false);
  });
});

// ---- page integration (source-level; browser behaviour is checked manually) ----------------------------------

describe("reactions page integration", () => {
  const page = read("src", "components", "ReactionsPage.tsx");

  test("[source] the page uses the shared persistence layer, the leave gate and the resume-after-restore rule", () => {
    assert.match(page, /useWorkspacePersistence/);
    assert.match(page, /page: "reactions"/);
    assert.match(page, /beforeLeave: \(\) => snapshotTask\.flushNow\(\)/);
    assert.match(page, /persistence\.resumeAfterRestore\(\)/);
    assert.doesNotMatch(page, /indexedDB|localStorage|sessionStorage/);
  });

  test("[source] restoring never reruns a prediction", () => {
    const start = page.indexOf("function applyRestoredReactions");
    const restore = page.slice(start, start + 4500);
    assert.doesNotMatch(restore, /predictReactionPathways|predictRetrosynthesisPathways|predictNoReactionOutcomes|analyzeFunctionalGroupHierarchy|analyzeReactionMolecule/);
    assert.match(page, /previously computed model predictions and were not recomputed/);
  });

  test("[source] restoring the drawing is not mistaken for an edit, and a newer drawing discards the restored results", () => {
    const handler = page.slice(page.indexOf("const handleReactionCanvasChange"), page.indexOf("const handleReactionCanvasChange") + 400);
    assert.match(handler, /restoringRef\.current \|\| pendingEditorRef\.current/);
    assert.match(page, /user-content-kept[\s\S]{0,200}discardShownResults/);
  });

  test("[source] Clear Analysis discards the saved workspace; an unfinished prediction is saved as interrupted, not as a result", () => {
    assert.match(page.slice(page.indexOf("async function clearAnalysis"), page.indexOf("async function clearAnalysis") + 500), /persistence\.discard\(\)/);
    assert.match(page, /interrupted: latest\.isAnalyzing \? latest\.analysisMode : null/);
    assert.match(page, /if \(meta && !latest\.isAnalyzing && latest\.reactionSmiles\)/);
  });

  test("[source] autosave watches settled state only (no rendered drawings, status text or progress)", () => {
    const deps = page.slice(page.indexOf("// Autosave"), page.indexOf("// Autosave") + 600);
    assert.doesNotMatch(deps, /Svgs|reactionStatus|reactionError/);
    assert.match(deps, /visibleResultCount/);
  });

  test("[source] the reaction engine and the other pages' storage are untouched by this stage", () => {
    assert.doesNotMatch(read("src", "components", "MultiCatalyticPage.tsx"), /persistence|indexedDB/i);
    const framework = read("src", "utils", "persistence", "workspacePersistence.ts") + read("src", "utils", "persistence", "workspaceStore.ts");
    assert.doesNotMatch(framework, /reactionsWorkspace|ReactionPathway|NoReactionOutcome/, "no Reactions-specific code in the shared layer");
  });
});

// ---- Properties molecule: offered, never applied automatically; adopted transactionally --------------------------

describe("reactions: \"Use in Reactions\" is an explicit, transactional action", () => {
  let transfer;
  before(async () => {
    transfer = await loadModule("/src/utils/persistence/handoffTransfer.ts");
  });

  const mol = (label, x = 0) => JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms: [{ label, location: [x, 0, 0] }], bonds: [] } });
  const OLD = mol("N"); // what the Reactions editor holds before the transfer
  const INCOMING = mol("O"); // the molecule from Properties
  const savedInputs = (overrides = {}) => inputs({ ket: OLD, key: "N", handoffSeen: "H0", ...overrides });
  const savedRecord = async (disk, handoffSeen = "H0") => {
    await newStore(new store.MemoryBackend({ map: disk })).save("reactions", {
      inputs: savedInputs({ handoffSeen }), results: envelope(resultData("forward")),
    });
  };
  const page = () => read("src", "components", "ReactionsPage.tsx");

  /** A Ketcher stand-in: setMolecule/getKet over one document, with injectable failures. */
  function fakeEditor(initial, behavior = {}) {
    const state = { ket: initial, sets: [], gets: 0 };
    const api = {
      getKet: async () => {
        state.gets += 1;
        if (behavior.getKet) return behavior.getKet(state);
        return state.ket;
      },
      setMolecule: async (structure) => {
        const call = state.sets.length;
        state.sets.push(structure);
        if (behavior.setMolecule) return behavior.setMolecule(structure, state, call);
        state.ket = structure === "" ? emptyKet : structure;
      },
    };
    return { state, api };
  }
  async function recovered(disk, backendClass = store.MemoryBackend, clock = fakeTimers()) {
    const backend = new backendClass({ map: disk });
    const controller = controllerFor(backend, clock);
    const outcome = await controller.recover();
    if (outcome.kind === "restored") controller.resumeAfterRestore();
    return { controller, backend, clock, outcome };
  }

  test("[offer] a Properties analysis is offered only until this workspace has adopted it", () => {
    assert.equal(ws.handoffOfferAvailable(null, null), false, "no Properties analysis");
    assert.equal(ws.handoffOfferAvailable("H1", null), true, "a new analysis");
    assert.equal(ws.handoffOfferAvailable("H1", "H0"), true, "a newer analysis than the one adopted before");
    assert.equal(ws.handoffOfferAvailable("H1", "H1"), false, "repeated visits do not offer (or apply) the same transfer again");
  });

  test("[inputs] the adopted-analysis id is saved, defaults to none for older records, and is bounded", () => {
    assert.equal(ws.validateReactionsInputs(inputs({ handoffSeen: "2026-10-27T12:00:00.000Z" })).handoffSeen, "2026-10-27T12:00:00.000Z");
    const legacy = inputs();
    delete legacy.handoffSeen;
    assert.equal(ws.validateReactionsInputs(legacy).handoffSeen, null);
    assert.equal(ws.validateReactionsInputs(inputs({ handoffSeen: 5 })), null);
    assert.equal(ws.validateReactionsInputs(inputs({ handoffSeen: "x".repeat(201) })), null);
  });

  test("[normal navigation] opening the page restores the saved workspace and saving resumes at once, whatever Properties holds", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const { controller, outcome } = await recovered(disk);
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.results.data.mode, "forward");
    assert.equal(ws.handoffOfferAvailable("H1", outcome.inputs.handoffSeen), true, "the new analysis is offered...");
    assert.equal(controller.isLive, true, "...but the page restores its own work and carries on normally");
    controller.detach(); // rapid page switch right after restoring
    await controller.flush();
    const next = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(next.kind, "restored");
    assert.equal(next.results.data.pathways.length, fixtures.stereoPathways.length);
  });

  test("[success] the editor gets the molecule, the old callbacks are invalidated, and the record is untouched until the one replacing write", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller, backend, clock } = await recovered(disk);
    const token = controller.token();
    const editor = fakeEditor(OLD);

    const outcome = await transfer.transferIntoEditor(editor.api, INCOMING, controller);
    assert.equal(outcome.kind, "adopted");
    assert.equal(editor.state.ket, INCOMING);
    assert.equal(controller.isCurrent(token), false, "anything started for the old workspace is now stale");
    assert.equal(controller.isLive, true);
    assert.equal(disk.get("workspace:reactions"), before, "nothing has been deleted or overwritten yet");
    assert.equal(backend.putCount, 0);

    controller.requestSave(() => ({ inputs: savedInputs({ ket: outcome.ket, key: outcome.key, handoffSeen: "H1" }), results: null }));
    await controller.flush();
    assert.equal(backend.putCount, 1, "a single put replaces the record");
    const saved = JSON.parse(disk.get("workspace:reactions"));
    assert.equal(saved.inputs.handoffSeen, "H1");
    assert.equal(saved.inputs.ket, INCOMING);
    assert.equal(saved.results, null, "no old prediction is stored for the new molecule");
    clock.fire();
  });

  test("[failure] a load that throws leaves the editor and the saved workspace exactly as they were", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller, backend } = await recovered(disk);
    const token = controller.token();
    const editor = fakeEditor(OLD, { setMolecule: async (structure, state, call) => { if (call === 0) throw new Error("Ketcher refused the molecule"); state.ket = structure === "" ? emptyKet : structure; } });

    const outcome = await transfer.transferIntoEditor(editor.api, INCOMING, controller);
    assert.equal(outcome.kind, "rolled-back");
    assert.equal(editor.state.ket, OLD);
    assert.equal(controller.isCurrent(token), true, "the old workspace's callbacks are still valid");
    assert.equal(controller.isLive, true, "saving carries on");
    assert.equal(disk.get("workspace:reactions"), before, "byte-for-byte unchanged");
    assert.equal(backend.putCount, 0);
  });

  test("[failure] a partly applied load followed by an error is rolled back and verified", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller } = await recovered(disk);
    const editor = fakeEditor(OLD, {
      setMolecule: async (structure, state, call) => {
        if (call === 0) { state.ket = INCOMING; throw new Error("failed halfway, after the canvas changed"); }
        state.ket = structure === "" ? emptyKet : structure;
      },
    });
    const outcome = await transfer.transferIntoEditor(editor.api, INCOMING, controller);
    assert.equal(outcome.kind, "rolled-back");
    assert.equal(editor.state.ket, OLD, "the previous drawing is back");
    assert.deepEqual(editor.state.sets, [INCOMING, OLD]);
    assert.equal(disk.get("workspace:reactions"), before);
    assert.equal(controller.isLive, true);
  });

  test("[failure] a load that 'succeeds' without a real structure counts as failed; an empty previous editor is restored empty", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const { controller } = await recovered(disk);
    const empty = fakeEditor(emptyKet, { setMolecule: async (structure, state, call) => { state.ket = call === 0 ? emptyKet : (structure === "" ? emptyKet : structure); } });
    const outcome = await transfer.transferIntoEditor(empty.api, INCOMING, controller);
    assert.equal(outcome.kind, "rolled-back");
    assert.deepEqual(empty.state.sets, [INCOMING, ""], "rolling back an empty editor clears it");
    assert.equal(empty.state.ket, emptyKet);
  });

  test("[failure] if the previous drawing cannot be put back, saving stops and the stored workspace is kept; Clear starts over", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller, backend, clock } = await recovered(disk);
    const editor = fakeEditor(OLD, { setMolecule: async (structure, state, call) => { state.ket = INCOMING; throw new Error(`broken editor (call ${call})`); } });
    const outcome = await transfer.transferIntoEditor(editor.api, INCOMING, controller);
    assert.equal(outcome.kind, "editor-unknown");
    assert.equal(controller.isLive, false);
    controller.requestSave(() => ({ inputs: savedInputs({ ket: INCOMING }), results: null }));
    assert.equal(clock.pendingCount, 0);
    await controller.flush();
    assert.equal(backend.putCount, 0);
    assert.equal(disk.get("workspace:reactions"), before, "the stored workspace survives");
    await controller.discard(); // the user clears: only now is it deleted
    assert.equal(disk.has("workspace:reactions"), false);
    assert.equal(controller.isLive, true);
  });

  test("[failure] an editor that cannot even be read leaves the workspace alone", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller } = await recovered(disk);
    const dead = fakeEditor(OLD, { getKet: async () => { throw new Error("frame gone"); }, setMolecule: async () => { throw new Error("frame gone"); } });
    const outcome = await transfer.transferIntoEditor(dead.api, INCOMING, controller);
    assert.equal(outcome.kind, "editor-unknown");
    assert.equal(disk.get("workspace:reactions"), before);
  });

  test("[pending save] a save scheduled before the transfer cannot land during it; after a failure normal saving resumes, after a success the old save is gone", async () => {
    // failure: the old workspace's pending change is dropped while suspended, and requested again afterwards
    const disk = new Map();
    await savedRecord(disk);
    let { controller, backend, clock } = await recovered(disk);
    controller.requestSave(() => ({ inputs: savedInputs({ visibleResultCount: 24 }), results: envelope(resultData("forward")) }));
    assert.equal(clock.pendingCount, 1);
    const failing = fakeEditor(OLD, { setMolecule: async (s, state, call) => { if (call === 0) throw new Error("no"); state.ket = s === "" ? emptyKet : s; } });
    assert.equal((await transfer.transferIntoEditor(failing.api, INCOMING, controller)).kind, "rolled-back");
    clock.fire();
    await controller.flush();
    assert.equal(backend.putCount, 0, "the dropped save did not slip through");
    controller.requestSave(() => ({ inputs: savedInputs({ visibleResultCount: 24 }), results: envelope(resultData("forward")) }));
    clock.fire();
    await controller.flush();
    assert.equal(backend.putCount, 1);
    assert.equal(JSON.parse(disk.get("workspace:reactions")).inputs.visibleResultCount, 24);

    // success: the old workspace's pending save never lands, only the new workspace is written
    const disk2 = new Map();
    await savedRecord(disk2);
    ({ controller, backend, clock } = await recovered(disk2));
    controller.requestSave(() => ({ inputs: savedInputs({ visibleResultCount: 48 }), results: null }));
    const ok = fakeEditor(OLD);
    const adopted = await transfer.transferIntoEditor(ok.api, INCOMING, controller);
    clock.fire();
    await controller.flush();
    assert.equal(backend.putCount, 0, "the stale pending save was discarded");
    controller.requestSave(() => ({ inputs: savedInputs({ ket: adopted.ket, key: adopted.key, handoffSeen: "H1" }), results: null }));
    await controller.flush();
    assert.equal(JSON.parse(disk2.get("workspace:reactions")).inputs.visibleResultCount, 12, "the new workspace's own value, not the stale 48");
  });

  test("[late restoration] a record that finishes loading during a successful transfer is dropped", async () => {
    const disk = new Map();
    await savedRecord(disk);
    let release;
    const gateOpen = new Promise((resolve) => { release = resolve; });
    class SlowBackend extends store.MemoryBackend {
      async get(key) { await gateOpen; return super.get(key); }
    }
    const controller = controllerFor(new SlowBackend({ map: disk }), fakeTimers());
    const recovery = controller.recover(); // still reading
    const outcome = await transfer.transferIntoEditor(fakeEditor(OLD).api, INCOMING, controller);
    assert.equal(outcome.kind, "adopted");
    release();
    assert.equal((await recovery).kind, "superseded", "the late record can never overwrite the choice");
  });

  test("[late restoration] a record that finishes loading while the transfer is in flight is held back, then applied only if the transfer fails", async () => {
    const disk = new Map();
    await savedRecord(disk);
    let releaseLoad;
    const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
    class SlowBackend extends store.MemoryBackend {
      async get(key) { await loadGate; return super.get(key); }
    }
    const controller = controllerFor(new SlowBackend({ map: disk }), fakeTimers());
    const recovery = controller.recover();
    let releaseSet;
    const setGate = new Promise((resolve) => { releaseSet = resolve; });
    const editor = fakeEditor(OLD, { setMolecule: async (structure, state, call) => { if (call === 0) { await setGate; throw new Error("failed"); } state.ket = structure === "" ? emptyKet : structure; } });
    const transferring = transfer.transferIntoEditor(editor.api, INCOMING, controller);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.currentPhase, "suspended");
    releaseLoad();
    const outcome = await recovery; // the record arrives mid-transfer
    assert.equal(outcome.kind, "restored");
    assert.equal(controller.currentPhase, "suspended", "still no writes while the transfer runs");
    controller.resumeAfterRestore(); // the page's recovery effect
    releaseSet();
    assert.equal((await transferring).kind, "rolled-back");
    assert.equal(controller.isLive, true, "the recovered previous workspace is live and can be applied");
    assert.equal(outcome.results.data.pathways.length, fixtures.stereoPathways.length);
  });

  test("[reload] after a successful transfer the adopted molecule comes back with no old predictions and is not offered again", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const { controller } = await recovered(disk);
    const adopted = await transfer.transferIntoEditor(fakeEditor(OLD).api, INCOMING, controller);
    controller.requestSave(() => ({ inputs: savedInputs({ ket: adopted.ket, key: adopted.key, handoffSeen: "H1" }), results: null }));
    await controller.flush();
    const next = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(next.kind, "restored");
    assert.equal(next.inputs.ket, INCOMING);
    assert.equal(next.results, null);
    assert.equal(ws.handoffOfferAvailable("H1", next.inputs.handoffSeen), false);
    assert.equal(ws.handoffOfferAvailable("H2", next.inputs.handoffSeen), true);
  });

  test("[reload] after a failed transfer the previous workspace, structures and predictions, comes back unchanged and the offer returns", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller } = await recovered(disk);
    const failing = fakeEditor(OLD, { setMolecule: async (s, state, call) => { if (call === 0) { state.ket = INCOMING; throw new Error("x"); } state.ket = s === "" ? emptyKet : s; } });
    assert.equal((await transfer.transferIntoEditor(failing.api, INCOMING, controller)).kind, "rolled-back");
    await controller.flush();
    assert.equal(disk.get("workspace:reactions"), before);
    const next = await controllerFor(new store.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(next.kind, "restored");
    assert.equal(next.inputs.ket, OLD);
    assert.deepEqual(next.results.data.pathways.map((p) => p.id), fixtures.stereoPathways.map((p) => p.id));
    assert.equal(ws.handoffOfferAvailable("H1", next.inputs.handoffSeen), true);
  });

  test("[storage] if the replacing write fails the old record is still intact and the error is reported; without storage the transfer still works", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const before = disk.get("workspace:reactions");
    const { controller, backend } = await recovered(disk);
    const adopted = await transfer.transferIntoEditor(fakeEditor(OLD).api, INCOMING, controller);
    backend.quotaChars = 5;
    controller.requestSave(() => ({ inputs: savedInputs({ ket: adopted.ket, key: adopted.key, handoffSeen: "H1" }), results: null }));
    await controller.flush();
    assert.equal(controller.getStatus().saveError.code, "quota");
    assert.equal(disk.get("workspace:reactions"), before, "a failed put changes nothing");

    const none = controllerFor(null, fakeTimers());
    const nothing = fakeEditor(OLD);
    // a store without IndexedDB: the controller is already disabled, the transfer itself still completes
    const stored = new controllerModule.WorkspacePersistence({ store: newStore(null), page: "reactions", engineVersion: 1, validateInputs: (r) => r, validateResults: (r) => r, timers: fakeTimers().timers });
    assert.equal((await stored.recover()).kind, "unavailable");
    assert.equal((await transfer.transferIntoEditor(nothing.api, INCOMING, stored)).kind, "adopted");
    assert.equal(stored.isLive, false, "still no saving, and no exception");
    void none;
  });

  test("[controller] suspend/resume/replaceWorkspace: suspension is reversible, replacement keeps the record until overwritten", async () => {
    const disk = new Map();
    await savedRecord(disk);
    const { controller, clock } = await recovered(disk);
    controller.suspend();
    controller.suspend(); // idempotent
    assert.equal(controller.currentPhase, "suspended");
    controller.requestSave(() => ({ inputs: savedInputs(), results: null }));
    assert.equal(clock.pendingCount, 0);
    controller.resume();
    assert.equal(controller.isLive, true);
    controller.resume(); // harmless
    controller.suspend();
    controller.replaceWorkspace();
    assert.equal(controller.isLive, true);
    assert.ok(disk.has("workspace:reactions"), "not deleted by replacing");
  });

  test("[duplicate] a second press while a transfer runs, or after it succeeded, does nothing", () => {
    const text = page();
    const body = text.slice(text.indexOf("async function adoptHandoff"), text.indexOf("// ---- Saved Analyses (Stage 8B-3B-2)"));
    assert.match(body, /if \(adoptingRef\.current \|\| handoffSeen === handoffId\) return;/);
    assert.match(text, /disabled=\{!ketcher \|\| isAnalyzing \|\| isAdopting\}/);
  });

  test("[source] the page never discards the saved workspace to adopt; it uses the transaction and defers a late recovery", () => {
    const text = page();
    const body = text.slice(text.indexOf("async function adoptHandoff"), text.indexOf("// ---- Saved Analyses (Stage 8B-3B-2)"));
    assert.ok(body.length > 800);
    assert.doesNotMatch(body, /persistence\.discard\(\)/, "adopting must not delete the old workspace");
    assert.match(body, /transferIntoEditor\(api, source, persistence\)/);
    assert.doesNotMatch(body, /predictReaction|predictRetro|predictNoReaction|analyzeReactionMolecule|analyzeFunctionalGroupHierarchy/);
    assert.match(body, /outcome\.kind === "rolled-back"/);
    assert.match(body, /discardShownResults\("The molecule from Properties could not be loaded\."\)/, "unknown editor state clears the cards on screen");
    assert.match(text, /if \(adoptingRef\.current\) \{\s*\/\/ A molecule is being adopted right now[\s\S]{0,200}deferredRecoveryRef\.current = outcome;/);
    assert.match(text, /persistence\.isCurrent\(token\) && !adoptingRef\.current/);
  });

  test("[source] old prediction cards cannot appear for the adopted molecule: every previous result is replaced on success", () => {
    const text = page();
    const body = text.slice(text.indexOf("async function adoptHandoff"), text.indexOf("// ---- Saved Analyses (Stage 8B-3B-2)"));
    const success = body.slice(body.indexOf("deferredRecoveryRef.current = null;\n    pendingEditorRef.current = null;"));
    for (const call of ["setReactionSmiles(\"\")", "setReactionComponentMolfiles([])", "setRetroPathways([])", "setNoReactionOutcomes([])", "setReactantSvgs({})", "setProductSvgs({})", "setRetroTargetSvgs({})", "setRetroPrecursorSvgs({})", "setPathways(initialPathways)", "setReactionMolfile(initialReactantMolfile)", "setHandoffSeen(handoffId)"]) {
      assert.ok(success.includes(call), call);
    }
    assert.doesNotMatch(success, /setPathways\((?!initialPathways)/);
  });

  test("[source] opening the page seeds nothing from the Properties props and Clear makes the offer available again", () => {
    const text = page();
    assert.match(text, /useState<ReactionPathway\[\]>\(\[\]\)/);
    assert.doesNotMatch(text, /chooseReactionsStartup|holdSavesRef|mountHandoffId/);
    const clear = text.slice(text.indexOf("async function clearAnalysis"), text.indexOf("async function clearAnalysis") + 700);
    assert.match(clear, /persistence\.discard\(\)/);
    assert.match(clear, /setHandoffSeen\(null\)/);
    const app = read("src", "App.tsx");
    const frame = app.slice(app.indexOf("<ReactionsPage"), app.indexOf("<ReactionsPage") + 700);
    assert.match(frame, /initialPathways=\{reactionPathways\}/);
    assert.match(frame, /handoffId=/);
  });

  test("[source] the shared helper stays page-agnostic and touches no chemistry", () => {
    const helper = read("src", "utils", "persistence", "handoffTransfer.ts");
    assert.doesNotMatch(helper, /reaction|predict|rdkit/i);
    assert.match(helper, /controller\.suspend\(\)/);
    assert.doesNotMatch(helper, /discard\(/, "the helper never deletes the saved workspace");
  });
});
