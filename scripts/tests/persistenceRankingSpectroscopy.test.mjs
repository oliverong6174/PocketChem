// Phase 4 / Stage 8B-2A: Ranking and Spectroscopy workspace persistence, plus the shared lifecycle
// fixes (unmount flush, leave gate). Fixtures are small; the only real chemistry is one ethanol
// comparison profile and one ethanol spectroscopy prediction, used to prove that real output is
// plain data that the validators accept (a validator that rejected real output would silently
// discard users' work). Persistence itself runs on an in-memory backend with fake timers.
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
let rankingWs;
let spectroWs;
let display;
let modes;
let realProfile;
let realSpectra;

before(async () => {
  await loadEngine();
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  debounced = await loadModule("/src/utils/persistence/debouncedTask.ts");
  gate = await loadModule("/src/utils/persistence/leaveGate.ts");
  editorRestore = await loadModule("/src/utils/persistence/editorRestore.ts");
  ketIdentity = await loadModule("/src/utils/persistence/ketIdentity.ts");
  rankingWs = await loadModule("/src/utils/persistence/rankingWorkspace.ts");
  spectroWs = await loadModule("/src/utils/persistence/spectroscopyWorkspace.ts");
  display = await loadModule("/src/utils/ranking/rankingDisplay.ts");
  modes = await loadModule("/src/utils/ranking/comparisonModes.ts");

  const groups = await loadModule("/src/utils/functionalGroups/index.ts");
  const comparison = await loadModule("/src/utils/ranking/comparisonAnalysis.ts");
  const spectroscopy = await loadModule("/src/utils/spectroscopy/index.ts");
  const hierarchy = await groups.analyzeFunctionalGroupHierarchy("CCO");
  realProfile = await comparison.analyzeComparisonMolecule("CCO", hierarchy);
  realSpectra = await spectroscopy.analyzeMolecularSpectroscopy({
    structure: "CCO",
    functionalGroups: hierarchy.functionalGroups,
    formula: "C2H6O",
    exactMass: 46.0419,
  });
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

function ket(...molecules) {
  const doc = { root: { nodes: molecules.map((_, index) => ({ $ref: `mol${index}` })) } };
  molecules.forEach((molecule, index) => {
    doc[`mol${index}`] = {
      type: "molecule",
      atoms: molecule.atoms.map(([label, x, y, extra]) => ({ label, location: [x, y, 0], ...(extra ?? {}) })),
      bonds: molecule.bonds.map(([a, b, type = 1, stereo]) => ({ type, atoms: [a, b], ...(stereo ? { stereo } : {}) })),
    };
  });
  return JSON.stringify(doc);
}
const water = ket({ atoms: [["O", 0, 0]], bonds: [] });
const halo = (stereo) => ket({ atoms: [["C", 0, 0], ["F", 1, 0], ["Cl", -1, 0.5], ["Br", 0, -1]], bonds: [[0, 1, 1, stereo], [0, 2], [0, 3]] });

/** A molecule whose profile is the real ethanol profile with one chosen mode's score overridden. */
function molecule(id, label, smiles, modeId, score, extra = {}) {
  const profile = clone(realProfile);
  profile.metrics[modeId] = { ...profile.metrics[modeId], score, headline: `${label}: ${score}`, detail: `detail for ${label}`, factors: [`why ${label}`], ...extra };
  return { id, label, smiles, profile };
}
const descMode = () => modes.COMPARISON_MODES.find((mode) => mode.direction === "desc").id;
const noneMode = () => modes.COMPARISON_MODES.find((mode) => mode.direction === "none").id;

function rankingInputs(overrides = {}) {
  return { editorKet: water, editorKey: "O", activeCategory: "Electronic effects", rankingMode: "ewgStrength", ...overrides };
}
function envelope(data, extra = {}) {
  return { computedAt: "2026-10-27T10:00:00.000Z", engineVersion: 1, stale: false, status: "complete", data, ...extra };
}
function controllerFor(page, backend, clock, validateInputs, validateResults) {
  return new controllerModule.WorkspacePersistence({
    store: newStore(backend), page, engineVersion: 1, validateInputs, validateResults, timers: clock.timers,
  });
}

// ---- ranking: order, ties, limits ----------------------------------------------------------------------

describe("ranking workspace", () => {
  const mode = () => descMode();
  const fiveWithTies = () => [
    molecule(11.25, "Molecule A", "CCO", mode(), 5),
    molecule(12.5, "Molecule B", "C[C@H](N)C(=O)O", mode(), 3),
    molecule(13.75, "Molecule C", "[13CH3]C(=O)[O-]", mode(), 5),
    molecule(14, "Molecule D", "C/C=C/C", mode(), 1),
    molecule(15, "Molecule E", "CC(C)(C)Br", mode(), null),
  ];

  test("[ranking] real comparison output is plain data and validates; up to five molecules round-trip exactly", async () => {
    store.assertPlainJson(realProfile);
    const molecules = fiveWithTies();
    const shown = display.deriveRanking(molecules, mode());
    const displayed = display.displayedRankingSnapshot(shown.rankedRows, shown.rankById, mode());
    const results = { molecules, displayed };
    const s = newStore(new store.MemoryBackend());
    assert.deepEqual(await s.save("ranking", { inputs: rankingInputs({ rankingMode: mode() }), results: envelope(results) }), { ok: true });
    const loaded = await s.load("ranking");
    const restored = rankingWs.validateRankingResults(loaded.record.results.data);
    assert.ok(restored);
    assert.equal(restored.molecules.length, 5);
    assert.deepEqual(restored.molecules, clone(molecules));
    // Stereochemistry, isotopes, charges and double-bond geometry are kept byte-for-byte.
    assert.deepEqual(restored.molecules.map((m) => m.smiles), ["CCO", "C[C@H](N)C(=O)O", "[13CH3]C(=O)[O-]", "C/C=C/C", "CC(C)(C)Br"]);
    assert.equal(loaded.record.results.data.molecules[0].profile.metrics[mode()].headline, molecules[0].profile.metrics[mode()].headline);
  });

  test("[ranking] order and ties: the saved ranking equals what the same ordering code derives from the saved profiles", async () => {
    const molecules = fiveWithTies();
    const shown = display.deriveRanking(molecules, mode());
    const displayed = display.displayedRankingSnapshot(shown.rankedRows, shown.rankById, mode());
    // A and C tie for first, B is third (not second), D fourth, E (no score) is unranked and last.
    assert.deepEqual([...shown.rankById.entries()].sort((a, b) => a[0] - b[0]), [[11.25, 1], [12.5, 3], [13.75, 1], [14, 4]]);
    assert.equal(shown.rankedRows.at(-1).molecule.id, 15);
    const restored = rankingWs.validateRankingResults(clone({ molecules, displayed }));
    const again = display.deriveRanking(restored.molecules, mode());
    assert.equal(JSON.stringify(display.displayedRankingSnapshot(again.rankedRows, again.rankById, mode())), JSON.stringify(restored.displayed));
  });

  test("[ranking] compare-only modes keep insertion order and have no ranks", () => {
    const molecules = fiveWithTies().slice(0, 3);
    const shown = display.deriveRanking(molecules, noneMode());
    assert.deepEqual(shown.rankedRows.map((row) => row.molecule.id), molecules.map((m) => m.id));
    assert.equal(shown.rankById.size, 0);
    const snapshot = display.displayedRankingSnapshot(shown.rankedRows, shown.rankById, noneMode());
    assert.deepEqual(snapshot.ranks, []);
    assert.ok(rankingWs.validateRankingResults(clone({ molecules, displayed: snapshot })).displayed);
  });

  test("[ranking] switching modes after a restore needs no recalculation: every mode's metric was saved", () => {
    const restored = rankingWs.validateRankingResults(clone({ molecules: fiveWithTies(), displayed: null }));
    for (const m of modes.COMPARISON_MODES) {
      assert.doesNotThrow(() => display.deriveRanking(restored.molecules, m.id), m.id);
    }
  });

  test("[ranking] validation: limit of five, duplicates, missing modes, unsafe SMILES, damaged shown-ranking", () => {
    const base = () => clone({ molecules: fiveWithTies(), displayed: null });
    assert.ok(rankingWs.validateRankingResults(base()));
    const cases = {
      "six molecules": (r) => { r.molecules.push({ ...r.molecules[0], id: 99, smiles: "CCC" }); },
      "no molecules": (r) => { r.molecules = []; },
      "duplicate id": (r) => { r.molecules[1].id = r.molecules[0].id; },
      "duplicate smiles": (r) => { r.molecules[1].smiles = r.molecules[0].smiles; },
      "smiles with whitespace": (r) => { r.molecules[0].smiles = "CC O"; },
      "empty smiles": (r) => { r.molecules[0].smiles = ""; },
      "missing mode metric": (r) => { delete r.molecules[0].profile.metrics.ewgStrength; },
      "metric score is text": (r) => { r.molecules[0].profile.metrics.ewgStrength.score = "high"; },
      "factors not strings": (r) => { r.molecules[0].profile.metrics.ewgStrength.factors = [1]; },
      "profile has no formula": (r) => { delete r.molecules[0].profile.formula; },
    };
    for (const [label, mutate] of Object.entries(cases)) {
      const damaged = base();
      mutate(damaged);
      assert.equal(rankingWs.validateRankingResults(damaged), null, label);
    }
    const withBadShown = base();
    withBadShown.displayed = { modeId: mode(), order: [1, 2], ranks: [] };
    const kept = rankingWs.validateRankingResults(withBadShown);
    assert.ok(kept, "the molecules survive a damaged shown-ranking");
    assert.equal(kept.displayed, null);
    assert.equal(rankingWs.validateRankingResults(null), null);
  });

  test("[ranking] inputs: category, mode and the drawing are validated", () => {
    assert.ok(rankingWs.validateRankingInputs(rankingInputs()));
    assert.ok(rankingWs.validateRankingInputs(rankingInputs({ editorKet: null, editorKey: null })));
    for (const bad of [rankingInputs({ rankingMode: "nope" }), rankingInputs({ activeCategory: "Nope" }), rankingInputs({ editorKet: "{bad" }), rankingInputs({ editorKet: "x".repeat(1_600_000) }), null]) {
      assert.equal(rankingWs.validateRankingInputs(bad), null);
    }
  });

  test("[ranking] reload and page switching: state comes back from storage alone, and Clear all removes only ranking", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const molecules = fiveWithTies();
    const shown = display.deriveRanking(molecules, mode());
    const results = envelope({ molecules, displayed: display.displayedRankingSnapshot(shown.rankedRows, shown.rankById, mode()) });

    const first = controllerFor("ranking", new store.MemoryBackend({ map: disk }), clock, rankingWs.validateRankingInputs, rankingWs.validateRankingResults);
    await first.recover();
    first.requestSave(() => ({ inputs: rankingInputs({ rankingMode: mode() }), results }));
    first.detach(); // the user switches to another page
    await first.flush();
    // another page's record is untouched by everything below
    await newStore(new store.MemoryBackend({ map: disk })).save("spectroscopy", { inputs: { marker: 1 }, results: null });

    const second = controllerFor("ranking", new store.MemoryBackend({ map: disk }), fakeTimers(), rankingWs.validateRankingInputs, rankingWs.validateRankingResults);
    const outcome = await second.recover(); // the page is opened again / the browser restarted
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.results.data.molecules.length, 5);
    assert.deepEqual(outcome.results.data.molecules.map((m) => m.id), molecules.map((m) => m.id));
    assert.equal(outcome.inputs.rankingMode, mode());
    second.resumeAfterRestore();

    await second.discard(); // Clear all
    assert.equal(disk.has("workspace:ranking"), false);
    assert.equal(JSON.parse(disk.get("workspace:spectroscopy")).inputs.marker, 1);
  });

  test("[ranking] a new molecule added after a restore changes only the saved list; others keep their saved profiles", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const kept = fiveWithTies().slice(0, 2);
    const c = controllerFor("ranking", new store.MemoryBackend({ map: disk }), clock, rankingWs.validateRankingInputs, rankingWs.validateRankingResults);
    await c.recover();
    c.requestSave(() => ({ inputs: rankingInputs(), results: envelope({ molecules: kept, displayed: null }) }));
    clock.fire();
    await c.flush();
    const added = [...kept, molecule(20, "Molecule C", "CCCC", mode(), 2)];
    c.requestSave(() => ({ inputs: rankingInputs(), results: envelope({ molecules: added, displayed: null }) }));
    clock.fire();
    await c.flush();
    const saved = JSON.parse(disk.get("workspace:ranking")).results.data.molecules;
    assert.deepEqual(saved.slice(0, 2), clone(kept));
    assert.equal(saved.length, 3);
  });
});

// ---- spectroscopy ----------------------------------------------------------------------------------------

describe("spectroscopy workspace", () => {
  const inputs = (overrides = {}) => ({ ket: water, key: "O", activeTab: "proton", protonWindow: null, ...overrides });
  const resultsData = () => ({
    inputKey: "CCO", smiles: "CCO", structureSource: "CCO", name: "ethanol", formula: "C2H6O", result: realSpectra,
  });

  test("[spectroscopy] a real prediction is plain data; peaks, intensities and assignments survive a reload exactly", async () => {
    store.assertPlainJson(realSpectra);
    assert.ok(realSpectra.ir.length > 0 && realSpectra.protonNMR.length > 0 && realSpectra.carbonNMR.length > 0, "all spectra come from one run");
    const disk = new Map();
    await newStore(new store.MemoryBackend({ map: disk })).save("spectroscopy", { inputs: inputs(), results: envelope(resultsData()) });
    const restarted = newStore(new store.MemoryBackend({ map: disk }));
    const loaded = await restarted.load("spectroscopy");
    const restored = spectroWs.validateSpectroscopyResults(loaded.record.results.data);
    assert.ok(restored);
    assert.deepEqual(restored.result, clone(realSpectra));
    const peak = restored.result.ir[0];
    assert.equal(peak.label, realSpectra.ir[0].label);
    assert.equal(peak.intensity, realSpectra.ir[0].intensity);
    assert.equal(peak.explanation, realSpectra.ir[0].explanation);
    assert.deepEqual(restored.result.protonNMR.map((s) => [s.shift, s.integration, s.atomIndices]), clone(realSpectra.protonNMR.map((s) => [s.shift, s.integration, s.atomIndices])));
    assert.deepEqual(restored.result.carbonNMR.map((s) => s.shift), realSpectra.carbonNMR.map((s) => s.shift));
    if (realSpectra.massSpec) {
      assert.deepEqual(restored.result.massSpec.peaks.map((p) => [p.mz, p.relativeIntensity, p.label, p.kind]), clone(realSpectra.massSpec.peaks.map((p) => [p.mz, p.relativeIntensity, p.label, p.kind])));
    }
    assert.equal(restored.name, "ethanol");
    assert.equal(restored.formula, "C2H6O");
    assert.equal(restored.structureSource, "CCO", "assignments index into this exact source");
  });

  test("[spectroscopy] no rendered images are stored: the saved record is small and contains no SVG", async () => {
    const s = newStore(new store.MemoryBackend());
    await s.save("spectroscopy", { inputs: inputs(), results: envelope(resultsData()) });
    const text = s.backend?.map?.get("workspace:spectroscopy") ?? JSON.stringify(envelope(resultsData()));
    assert.doesNotMatch(text, /<svg/i);
    assert.ok(text.length < 400_000, `ethanol prediction is ${text.length} characters`);
    const source = read("src", "utils", "persistence", "spectroscopyWorkspace.ts");
    assert.doesNotMatch(source, /Svg\b.*:\s*string/);
  });

  test("[spectroscopy] only computed data is saved: no result means no spectra on restore", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    const c = controllerFor("spectroscopy", new store.MemoryBackend({ map: disk }), clock, spectroWs.validateSpectroscopyInputs, spectroWs.validateSpectroscopyResults);
    await c.recover();
    c.requestSave(() => ({ inputs: inputs(), results: null })); // drawn but never predicted
    clock.fire();
    await c.flush();
    const outcome = await controllerFor("spectroscopy", new store.MemoryBackend({ map: disk }), fakeTimers(), spectroWs.validateSpectroscopyInputs, spectroWs.validateSpectroscopyResults).recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.results, null);
    assert.equal(outcome.resultsDropped, false);
    assert.equal(outcome.inputs.activeTab, "proton");
  });

  test("[spectroscopy] the active tab and the ¹H zoom window are restored; invalid ones are rejected", () => {
    for (const tab of ["proton", "carbon", "ir", "mass"]) assert.ok(spectroWs.validateSpectroscopyInputs(inputs({ activeTab: tab })));
    const zoomed = spectroWs.validateSpectroscopyInputs(inputs({ protonWindow: { min: 1.5, max: 4 } }));
    assert.deepEqual(zoomed.protonWindow, { min: 1.5, max: 4 });
    for (const bad of [inputs({ activeTab: "uv" }), inputs({ protonWindow: { min: "a", max: 1 } }), inputs({ ket: "{bad" }), null]) {
      assert.equal(spectroWs.validateSpectroscopyInputs(bad), null);
    }
  });

  test("[spectroscopy] damaged results are refused as a whole", () => {
    const good = () => clone(resultsData());
    assert.ok(spectroWs.validateSpectroscopyResults(good()));
    const cases = {
      "ir peak without label": (d) => { delete d.result.ir[0].label; },
      "ir atom index negative": (d) => { d.result.ir[0].atomIndices = [-1]; },
      "proton shift not text": (d) => { d.result.protonNMR[0].shift = 4; },
      "carbon list missing": (d) => { delete d.result.carbonNMR; },
      "mass peak kind unknown": (d) => { if (d.result.massSpec) d.result.massSpec.peaks[0].kind = "bogus"; else d.result.massSpec = { formula: "x", molecularIonMz: null, nominalMass: null, basePeakMz: null, notes: [], peaks: [{ mz: 1, relativeIntensity: 1, label: "l", kind: "bogus", explanation: "e" }] }; },
      "mass mz not a number": (d) => { if (d.result.massSpec) d.result.massSpec.peaks[0].mz = "46"; else d.result.massSpec = { formula: "x", molecularIonMz: null, nominalMass: null, basePeakMz: null, notes: [], peaks: [{ mz: "1", relativeIntensity: 1, label: "l", kind: "fragment", explanation: "e" }] }; },
      "no structure source": (d) => { d.structureSource = " "; },
      "result is not an object": (d) => { d.result = 5; },
    };
    for (const [label, mutate] of Object.entries(cases)) {
      const damaged = good();
      mutate(damaged);
      assert.equal(spectroWs.validateSpectroscopyResults(damaged), null, label);
    }
  });

  test("[spectroscopy] editing the structure makes the key differ, so saved spectra are recognised as stale", async () => {
    const keyOf = ketIdentity.ketIdentityKey;
    assert.notEqual(await keyOf(halo(1)), await keyOf(halo(6)), "an inverted stereocentre is a different structure");
    assert.equal(await keyOf(halo(1)), await keyOf(halo(1)));
  });
});

// ---- shared lifecycle: unmount, leave gate, stale restores -----------------------------------------------------

describe("shared lifecycle", () => {
  test("[unmount] a save requested after the page was left is written at once (a late editor read is not lost)", async () => {
    const backend = new store.MemoryBackend();
    const clock = fakeTimers();
    const c = controllerFor("ranking", backend, clock, (raw) => raw, (raw) => raw);
    await c.recover();
    c.requestSave(() => ({ inputs: { n: 1 }, results: null }));
    c.detach(); // flushes the pending save
    await c.flush();
    assert.equal(JSON.parse(backend.map.get("workspace:ranking")).inputs.n, 1);
    c.requestSave(() => ({ inputs: { n: 2 }, results: null })); // a read that finished after the page unmounted
    assert.equal(clock.pendingCount, 0, "no timer that nobody would fire");
    await c.flush();
    assert.equal(JSON.parse(backend.map.get("workspace:ranking")).inputs.n, 2);
  });

  test("[unmount] rapid switching: leave hooks finish the last read and save before the next mount reads storage", async () => {
    const disk = new Map();
    const clock = fakeTimers();
    let latest = { n: 0 };
    const mirror = new debounced.DebouncedTask(async () => { latest = { n: 3 }; controller.requestSave(() => ({ inputs: latest, results: null })); }, 150, clock.timers);
    const controller = controllerFor("ranking", new store.MemoryBackend({ map: disk }), clock, (raw) => raw, (raw) => raw);
    await controller.recover();
    const unregister = gate.registerLeaveHook(async () => { await mirror.flushNow(); await controller.flush(); });
    mirror.schedule(); // an edit a moment before the tab click; the 150 ms timer has not fired yet
    await gate.runLeaveHooks();
    unregister();
    controller.detach();
    const next = controllerFor("ranking", new store.MemoryBackend({ map: disk }), fakeTimers(), (raw) => raw, (raw) => raw);
    const outcome = await next.recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.inputs.n, 3, "the last-moment edit survived the page switch");
  });

  test("[debounce] DebouncedTask coalesces, can be flushed, waits for a running task and swallows its errors", async () => {
    const clock = fakeTimers();
    let runs = 0;
    const task = new debounced.DebouncedTask(async () => { runs += 1; }, 150, clock.timers);
    task.schedule(); task.schedule(); task.schedule();
    assert.equal(clock.pendingCount, 1);
    clock.fire();
    await task.flushNow();
    assert.equal(runs, 1);
    task.schedule();
    await task.flushNow();
    assert.equal(runs, 2);
    assert.equal(task.pending, false);
    await task.flushNow(); // nothing pending
    assert.equal(runs, 2);
    const failing = new debounced.DebouncedTask(async () => { throw new Error("boom"); }, 150, clock.timers);
    failing.schedule();
    await assert.doesNotReject(failing.flushNow());
    task.cancel();
    const replaced = new debounced.DebouncedTask(async () => { runs += 100; }, 150, clock.timers);
    replaced.setTask(async () => { runs += 1; });
    replaced.schedule();
    await replaced.flushNow();
    assert.equal(runs, 3);
  });

  test("[leave] hooks run together, a failing or hung hook cannot block navigation, unregistering works", async () => {
    const calls = [];
    const off1 = gate.registerLeaveHook(async () => { calls.push("a"); });
    const off2 = gate.registerLeaveHook(() => { throw new Error("broken page"); });
    const off3 = gate.registerLeaveHook(() => new Promise(() => undefined)); // never settles
    const started = Date.now();
    await gate.runLeaveHooks(30);
    assert.ok(Date.now() - started < 1000);
    assert.deepEqual(calls, ["a"]);
    off1(); off2(); off3();
    await gate.runLeaveHooks(30);
    assert.deepEqual(calls, ["a"], "no hooks left to run");
  });

  test("[stale] a restore finishing after Clear/Reset is invalidated, and the editor restore never overwrites newer drawing", async () => {
    const waterKey = await ketIdentity.ketIdentityKey(water);
    const editor = (initial) => {
      const state = { ket: initial, sets: 0 };
      return { state, api: { getKet: async () => state.ket, setMolecule: async (k) => { state.sets += 1; state.ket = k; } } };
    };
    const empty = JSON.stringify({ root: { nodes: [] } });

    const fresh = editor(empty);
    assert.deepEqual(await editorRestore.restoreEditorContent(fresh.api, { ket: water, key: waterKey }, () => true), { kind: "restored" });
    assert.equal(fresh.state.ket, water);

    const drawn = editor(halo(1));
    assert.deepEqual(await editorRestore.restoreEditorContent(drawn.api, { ket: water, key: waterKey }, () => true), { kind: "user-content-kept" });
    assert.equal(drawn.state.sets, 0, "the user's drawing is untouched");

    const cleared = editor(empty);
    let current = true;
    const racing = editorRestore.restoreEditorContent({ getKet: cleared.api.getKet, setMolecule: cleared.api.setMolecule }, { ket: water, key: waterKey }, () => current);
    current = false; // Clear/Reset happens while the restore is starting
    assert.equal((await racing).kind, "superseded");
    assert.equal(cleared.state.sets, 0, "nothing was put back after Clear");

    const wrong = editor(empty);
    wrong.api.setMolecule = async () => { wrong.state.ket = halo(1); };
    assert.equal((await editorRestore.restoreEditorContent(wrong.api, { ket: water, key: waterKey }, () => true)).kind, "failed");

    const broken = { getKet: async () => { throw new Error("frame gone"); }, setMolecule: async () => undefined };
    assert.equal((await editorRestore.restoreEditorContent(broken, { ket: water, key: waterKey }, () => true)).kind, "failed");
  });

  test("[failure] malformed, newer-format and oversized ranking/spectroscopy records are handled without throwing", async () => {
    for (const page of ["ranking", "spectroscopy"]) {
      const disk = new Map([[`workspace:${page}`, "{broken"]]);
      const s = newStore(new store.MemoryBackend({ map: disk }));
      assert.equal((await s.load(page)).kind, "corrupt");
      assert.ok(disk.has(`workspace:${page}#rejected`));

      const future = JSON.stringify({ kind: "workspace", id: `workspace:${page}`, page, schemaVersion: 99, appVersion: "x", createdAt: "d", updatedAt: "d", inputs: {}, results: null });
      const disk2 = new Map([[`workspace:${page}`, future]]);
      assert.equal((await newStore(new store.MemoryBackend({ map: disk2 })).load(page)).kind, "incompatible");
      assert.equal(disk2.get(`workspace:${page}#rejected`), future, "newer data is kept aside");

      const tiny = newStore(new store.MemoryBackend(), { maxRecordChars: 300 });
      assert.equal((await tiny.save(page, { inputs: { big: "x".repeat(2000) }, results: null })).code, "too-large");
    }
  });

  test("[failure] quota exceeded on ranking results: reported, inputs kept when only results are too big, page keeps working", async () => {
    const backend = new store.MemoryBackend();
    const clock = fakeTimers();
    const molecules = [molecule(1, "Molecule A", "CCO", descMode(), 1), molecule(2, "Molecule B", "CCC", descMode(), 2)];
    const cap = Math.max(2000, Math.floor(JSON.stringify(molecules).length / 2));
    const s = newStore(backend, { maxRecordChars: cap });
    const c = new controllerModule.WorkspacePersistence({ store: s, page: "ranking", engineVersion: 1, validateInputs: rankingWs.validateRankingInputs, validateResults: rankingWs.validateRankingResults, timers: clock.timers });
    await c.recover();
    c.requestSave(() => ({ inputs: rankingInputs(), results: envelope({ molecules, displayed: null }) }));
    clock.fire();
    await c.flush();
    assert.equal(JSON.stringify(molecules).length > cap, true, "the fixture really is over the cap");
    assert.equal(c.getStatus().resultsOmitted, true);
    const loaded = await s.load("ranking");
    assert.equal(loaded.record.results, null);
    assert.equal(loaded.record.inputs.editorKet, water);

    backend.quotaChars = 5;
    c.requestSave(() => ({ inputs: rankingInputs({ activeCategory: "Stability" }), results: null }));
    clock.fire();
    await c.flush();
    assert.equal(c.getStatus().saveError.code, "quota");
  });

  test("[failure] unavailable storage leaves both pages functional (nothing scheduled, status reports it)", async () => {
    for (const page of ["ranking", "spectroscopy"]) {
      const clock = fakeTimers();
      const c = new controllerModule.WorkspacePersistence({ store: newStore(null), page, engineVersion: 1, validateInputs: (r) => r, validateResults: (r) => r, timers: clock.timers });
      assert.equal((await c.recover()).kind, "unavailable");
      c.requestSave(() => ({ inputs: {}, results: null }));
      assert.equal(clock.pendingCount, 0);
      assert.equal(c.getStatus().available, false);
    }
  });
});

// ---- page integration (source-level; browser behaviour is checked manually) -----------------------------------

describe("page integration", () => {
  const ranking = read("src", "components", "RankingPage.tsx");
  const spectroscopy = read("src", "components", "SpectroscopyPage.tsx");
  const synthesis = read("src", "components", "SynthesisPage.tsx");
  const app = read("src", "App.tsx");

  test("[source] Ranking and Spectroscopy use the shared persistence layer; Multi-Catalytic does not", () => {
    assert.match(ranking, /useWorkspacePersistence/);
    assert.match(ranking, /page: "ranking"/);
    assert.match(spectroscopy, /useWorkspacePersistence/);
    assert.match(spectroscopy, /page: "spectroscopy"/);
    for (const text of [ranking, spectroscopy]) {
      assert.doesNotMatch(text, /indexedDB|localStorage|sessionStorage/);
      assert.match(text, /persistence\.discard\(\)/);
      assert.match(text, /beforeLeave: \(\) => snapshotTask\.flushNow\(\)/);
      assert.match(text, /persistence\.resumeAfterRestore\(\)/);
    }
    assert.doesNotMatch(read("src", "components", "MultiCatalyticPage.tsx"), /persistence|indexedDB/i);
  });

  test("[source] restoring never recomputes: no analysis call in the restore code, previews are only re-rendered", () => {
    const restoreRanking = ranking.slice(ranking.indexOf("function applyRestoredRanking"), ranking.indexOf("function applyRestoredRanking") + 3500);
    assert.doesNotMatch(restoreRanking, /analyzeComparisonMolecule|analyzeFunctionalGroupHierarchy/);
    const restoreSpectra = spectroscopy.slice(spectroscopy.indexOf("function applyRestoredSpectroscopy"), spectroscopy.indexOf("function applyRestoredSpectroscopy") + 3500);
    assert.doesNotMatch(restoreSpectra, /analyzeMolecularSpectroscopy|analyzeNomenclatureAndProperties|analyze\(/);
    assert.match(ranking, /Restored \$\{molecules\.length\} molecule/);
    assert.match(spectroscopy, /saved model predictions, not experimental measurements/);
  });

  test("[source] the ranking order comes from one shared function used by both display and restore", () => {
    assert.match(ranking, /deriveRanking\(comparisonMolecules, rankingMode\)/);
    assert.match(ranking, /deriveRanking\(molecules, inputs\.rankingMode\)/);
    assert.doesNotMatch(ranking, /rankComparisonEntries|function metricsTie/);
  });

  test("[source] autosave watches settled state only (no selections, plots, SVGs or progress)", () => {
    const spectroDeps = spectroscopy.slice(spectroscopy.indexOf("// Autosave"), spectroscopy.indexOf("// Autosave") + 700);
    assert.doesNotMatch(spectroDeps, /selected|Highlighted|Svg|irCurve/);
    const rankingDeps = ranking.slice(ranking.indexOf("// Autosave"), ranking.indexOf("// Autosave") + 500);
    assert.doesNotMatch(rankingDeps, /isAnalyzing|Svg|status/);
  });

  test("[source] the page switch waits for every page's leave hook, and Synthesis/Properties use the same debounced mirror", () => {
    assert.match(app, /runLeaveHooks\(\)\.then/);
    for (const text of [synthesis, app]) {
      assert.match(text, /beforeLeave: \(\) => snapshotTask\.flushNow\(\)/);
      assert.doesNotMatch(text, /SnapshotTimerRef|snapshotTimerRef/);
    }
  });
});
