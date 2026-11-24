// Phase 4 / Stage 8B-3B-1: Ranking and Spectroscopy in the Saved Analyses library.
//
// The library, its IndexedDB store and its transactional opening are the ones from Stage 8B-3A; these
// tests add the two pages' validators, summaries and open flow. Fixtures are small: one real ethanol
// comparison profile and one real ethanol spectroscopy prediction (both well under a second; they
// prove real output is stored and returned unchanged), a handful of cloned profiles for ties, and
// fake Ketcher editors. No synthesis search and no reaction sweep is run.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const clone = (value) => JSON.parse(JSON.stringify(value));

let store;
let lib;
let flow;
let transfer;
let rankingWs;
let spectroWs;
let display;
let modes;
let controllerModule;
let libApp;
let ketIdentity;
let realProfile;
let realSpectra;
let rdkit;

before(async () => {
  await loadEngine();
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  flow = await loadModule("/src/utils/persistence/useSavedAnalysisOpen.ts");
  transfer = await loadModule("/src/utils/persistence/handoffTransfer.ts");
  rankingWs = await loadModule("/src/utils/persistence/rankingWorkspace.ts");
  spectroWs = await loadModule("/src/utils/persistence/spectroscopyWorkspace.ts");
  display = await loadModule("/src/utils/ranking/rankingDisplay.ts");
  modes = await loadModule("/src/utils/ranking/comparisonModes.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  ketIdentity = await loadModule("/src/utils/persistence/ketIdentity.ts");
  const rdkitModule = await loadModule("/src/utils/rdkit.ts");
  rdkit = await rdkitModule.getRDKit();

  const groups = await loadModule("/src/utils/functionalGroups/index.ts");
  const comparison = await loadModule("/src/utils/ranking/comparisonAnalysis.ts");
  const spectroscopy = await loadModule("/src/utils/spectroscopy/index.ts");
  const hierarchy = await groups.analyzeFunctionalGroupHierarchy("CCO");
  realProfile = await comparison.analyzeComparisonMolecule("CCO", hierarchy);
  realSpectra = await spectroscopy.analyzeMolecularSpectroscopy({
    structure: "CCO", functionalGroups: hierarchy.functionalGroups, formula: "C2H6O", exactMass: 46.0419,
  });
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------------

function ket(label, x = 0) {
  return JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms: [{ label, location: [x, 0, 0] }], bonds: [] } });
}
const emptyKet = JSON.stringify({ root: { nodes: [] } });
let counter = 0;
const newId = () => `p-${++counter}`;
const validators = () => ({
  ranking: { engineVersion: rankingWs.RANKING_ENGINE_VERSION, validateInputs: rankingWs.validateRankingInputs, validateResults: rankingWs.validateRankingResults },
  spectroscopy: { engineVersion: spectroWs.SPECTROSCOPY_ENGINE_VERSION, validateInputs: spectroWs.validateSpectroscopyInputs, validateResults: spectroWs.validateSpectroscopyResults },
});
const makeLibrary = (backend = new store.MemoryBackend(), options = {}) => new lib.AnalysisLibrary(backend, { validators: validators(), newId, ...options });
const ok = (result) => { assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.error)); return result.value; };
const failed = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code, result.error.message); };
// Results saved by the CURRENT engine of the page they belong to (Stage 9G raised the ranking and spectroscopy versions to 2).
const envelope = (data, extra = {}) => ({ computedAt: "2026-10-29T09:00:00.000Z", engineVersion: "spectra" in data || "result" in data ? spectroWs.SPECTROSCOPY_ENGINE_VERSION : rankingWs.RANKING_ENGINE_VERSION, stale: false, status: "complete", data, ...extra });

const descMode = () => modes.COMPARISON_MODES.find((mode) => mode.direction === "desc").id;
const noneMode = () => modes.COMPARISON_MODES.find((mode) => mode.direction === "none").id;
function molecule(id, label, smiles, modeId, score) {
  const profile = clone(realProfile);
  profile.metrics[modeId] = { ...profile.metrics[modeId], score, headline: `${label}: ${score}`, detail: `detail for ${label}`, factors: [`why ${label}`] };
  return { id, label, smiles, profile };
}
const fiveMolecules = () => [
  molecule(11.25, "Molecule A", "CCO", descMode(), 5),
  molecule(12.5, "Molecule B", "C[C@H](N)C(=O)O", descMode(), 3),
  molecule(13.75, "Molecule C", "[13CH3]C(=O)[O-]", descMode(), 5),
  molecule(14, "Molecule D", "C/C=C/C", descMode(), 1),
  molecule(15, "Molecule E", "CC(C)(C)Br", descMode(), null),
];
function rankingSave(overrides = {}) {
  const molecules = overrides.molecules ?? fiveMolecules();
  const modeId = overrides.rankingMode ?? descMode();
  const shown = display.deriveRanking(molecules, modeId);
  const data = { molecules, displayed: display.displayedRankingSnapshot(shown.rankedRows, shown.rankById, modeId) };
  const inputs = { editorKet: ket("N"), editorKey: "N", activeCategory: modes.getComparisonMode(modeId).category, rankingMode: modeId };
  return { name: "Five molecules", summary: rankingWs.describeRankingAnalysis(data, modeId), inputs, results: envelope(data), data };
}
const spectroInputs = (over = {}) => ({ ket: ket("O"), key: "O", activeTab: "ir", protonWindow: { min: 1, max: 4 }, ...over });
const spectroData = () => ({ inputKey: "O", smiles: "CCO", structureSource: "CCO", name: "ethanol", formula: "C2H6O", result: realSpectra });
function spectroSave(overrides = {}) {
  const data = spectroData();
  return { name: "Ethanol spectra", summary: spectroWs.describeSpectroscopyAnalysis(data), inputs: spectroInputs(), results: envelope(data), ...overrides };
}

// ---- Ranking in the library -----------------------------------------------------------------------

describe("ranking saved analyses", () => {
  test("[save/open] five molecules with ties, an unranked entry, profiles and explanations come back exactly", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const save = rankingSave();
    const saved = ok(await library.save("ranking", save));
    assert.equal(saved.page, "ranking");
    assert.match(saved.summary, /^5 molecules \(CCO, C\[C@H\]\(N\)C\(=O\)O,/);
    assert.match(saved.summary, /ranked by /);

    const reopened = ok(await makeLibrary(backend).open(saved.id)); // a later visit / restart
    const data = reopened.results.data;
    assert.deepEqual(data.molecules, clone(save.data.molecules));
    assert.deepEqual(data.molecules.map((m) => m.smiles), ["CCO", "C[C@H](N)C(=O)O", "[13CH3]C(=O)[O-]", "C/C=C/C", "CC(C)(C)Br"], "stereo, isotope, charge and E/Z are kept");
    assert.deepEqual(data.molecules.map((m) => m.profile.metrics[descMode()].factors), save.data.molecules.map((m) => [`why ${m.label}`]), "explanations");
    assert.deepEqual(data.displayed, clone(save.data.displayed), "the ranking as it was shown, with ties");
    assert.deepEqual(reopened.inputs, clone(save.inputs));
    assert.equal(reopened.engineMismatch, false);
    assert.equal(reopened.resultsDropped, false);
  });

  test("[order] the opened profiles sort to the saved order: A and C tie for first, B is third, D fourth, E unranked", async () => {
    const library = makeLibrary();
    const saved = ok(await library.save("ranking", rankingSave()));
    const opened = ok(await library.open(saved.id));
    const again = display.deriveRanking(opened.results.data.molecules, opened.inputs.rankingMode);
    assert.deepEqual([...again.rankById.entries()].sort((a, b) => a[0] - b[0]), [[11.25, 1], [12.5, 3], [13.75, 1], [14, 4]]);
    assert.equal(again.rankedRows.at(-1).molecule.id, 15);
    assert.equal(JSON.stringify(display.displayedRankingSnapshot(again.rankedRows, again.rankById, opened.inputs.rankingMode)), JSON.stringify(opened.results.data.displayed));
  });

  test("[settings] compare-only modes, the category and the drawing come back; real ethanol output validates", async () => {
    store.assertPlainJson(realProfile);
    const library = makeLibrary();
    const compare = rankingSave({ rankingMode: noneMode(), molecules: fiveMolecules().slice(0, 3) });
    const saved = ok(await library.save("ranking", compare));
    const opened = ok(await library.open(saved.id));
    assert.equal(opened.inputs.rankingMode, noneMode());
    assert.deepEqual(opened.results.data.displayed.ranks, []);
    assert.match(saved.summary, /compared by /);
    const real = rankingSave({ molecules: [{ id: 1, label: "Molecule A", smiles: "CCO", profile: clone(realProfile) }] });
    assert.deepEqual(ok(await library.open(ok(await library.save("ranking", real)).id)).results.data.molecules[0].profile, clone(realProfile));
  });

  test("[immutable] editing or clearing the live comparison never changes a saved analysis; Rename, Duplicate and Delete work", async () => {
    const records = new Map();
    const workspace = new store.WorkspaceStore(new store.MemoryBackend({ map: records }));
    const library = makeLibrary();
    const save = rankingSave();
    const live = clone(save);
    const saved = ok(await library.save("ranking", live));
    live.data.molecules.length = 0; // the user clears and keeps working
    live.results.status = "changed";
    await workspace.save("ranking", { inputs: live.inputs, results: null });
    assert.equal(ok(await library.open(saved.id)).results.data.molecules.length, 5);

    const renamed = ok(await library.rename(saved.id, "Renamed"));
    assert.equal(renamed.name, "Renamed");
    assert.deepEqual(ok(await library.open(saved.id)).results.data, clone(save.data));
    const copy = ok(await library.duplicate(saved.id));
    assert.notEqual(copy.id, saved.id);
    assert.deepEqual(ok(await library.open(copy.id)).results, ok(await library.open(saved.id)).results);
    ok(await library.delete(saved.id));
    assert.equal(ok(await library.open(copy.id)).results.data.molecules.length, 5);
    assert.equal((await workspace.load("ranking")).kind, "ok", "the page workspace is separate");
  });

  test("[versions] older-engine results are flagged; damaged profiles drop the results but keep the drawing; a newer format is not opened", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const old = ok(await library.save("ranking", { ...rankingSave(), results: envelope(rankingSave().data, { engineVersion: 0 }) }));
    const opened = ok(await library.open(old.id));
    assert.equal(opened.engineMismatch, true);
    assert.equal(opened.results.engineVersion, 0, "not silently upgraded");

    const damaged = rankingSave();
    delete damaged.results.data.molecules[0].profile.metrics[descMode()];
    const bad = ok(await library.save("ranking", damaged));
    const dropped = ok(await library.open(bad.id));
    assert.equal(dropped.resultsDropped, true);
    assert.equal(dropped.results, null);
    assert.equal(dropped.inputs.editorKet, ket("N"));

    backend.map.set("future", JSON.stringify({ ...JSON.parse(backend.map.get(old.id)), id: "future", schemaVersion: 99 }));
    failed(await library.open("future"), "incompatible");
    assert.equal(ok(await library.list()).problems[0].id, "future");
  });
});

// ---- Spectroscopy in the library ------------------------------------------------------------------------

describe("spectroscopy saved analyses", () => {
  test("[save/open] IR, ¹H, ¹³C and mass data, assignments, intensities, name, formula, tab and zoom come back exactly", async () => {
    store.assertPlainJson(realSpectra);
    assert.ok(realSpectra.ir.length > 0 && realSpectra.protonNMR.length > 0 && realSpectra.carbonNMR.length > 0);
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("spectroscopy", spectroSave()));
    assert.match(saved.summary, /^ethanol \(C2H6O\) · predicted IR \d+ bands, ¹H \d+ signals, ¹³C \d+ signals, MS \d+ peaks$/);

    const opened = ok(await makeLibrary(backend).open(saved.id));
    const data = opened.results.data;
    assert.deepEqual(data.result, clone(realSpectra));
    assert.equal(data.name, "ethanol");
    assert.equal(data.formula, "C2H6O");
    assert.equal(data.structureSource, "CCO");
    assert.deepEqual(data.result.ir.map((p) => [p.label, p.intensity, p.explanation]), realSpectra.ir.map((p) => clone([p.label, p.intensity, p.explanation])));
    assert.deepEqual(data.result.protonNMR.map((s) => [s.shift, s.integration, s.multiplicity, s.atomIndices]), clone(realSpectra.protonNMR.map((s) => [s.shift, s.integration, s.multiplicity, s.atomIndices])));
    assert.deepEqual(data.result.carbonNMR.map((s) => [s.shift, s.atomIndices]), clone(realSpectra.carbonNMR.map((s) => [s.shift, s.atomIndices])));
    if (realSpectra.massSpec) assert.deepEqual(data.result.massSpec.peaks.map((p) => [p.mz, p.relativeIntensity, p.kind]), clone(realSpectra.massSpec.peaks.map((p) => [p.mz, p.relativeIntensity, p.kind])));
    assert.equal(opened.inputs.activeTab, "ir");
    assert.deepEqual(opened.inputs.protonWindow, { min: 1, max: 4 });
  });

  test("[assignments] every saved atom index points at an atom of the saved structure source", async () => {
    const library = makeLibrary();
    const opened = ok(await library.open(ok(await library.save("spectroscopy", spectroSave())).id));
    const data = opened.results.data;
    const mol = rdkit.get_mol(data.structureSource);
    const atomCount = mol.get_num_atoms();
    mol.delete();
    const indices = [
      ...data.result.ir.flatMap((p) => [...(p.atomIndices ?? []), ...(p.vibrationAtomIndices ?? [])]),
      ...data.result.protonNMR.flatMap((s) => s.atomIndices ?? []),
      ...data.result.carbonNMR.flatMap((s) => s.atomIndices ?? []),
    ];
    assert.ok(indices.length > 0, "the prediction has atom assignments");
    assert.ok(indices.every((index) => Number.isInteger(index) && index >= 0 && index < atomCount), `indices ${JSON.stringify([...new Set(indices)])} vs ${atomCount} atoms`);
  });

  test("[only computed] nothing is invented: an inputs-only snapshot opens with no spectra, and no rendered images are stored", async () => {
    const library = makeLibrary();
    const inputsOnly = ok(await library.save("spectroscopy", spectroSave({ results: null, summary: "structure only" })));
    const opened = ok(await library.open(inputsOnly.id));
    assert.equal(opened.results, null);
    assert.equal(opened.inputs.activeTab, "ir");
    const backend = new store.MemoryBackend();
    ok(await makeLibrary(backend).save("spectroscopy", spectroSave()));
    const text = [...backend.map.values()][0];
    assert.doesNotMatch(text, /<svg/i);
    assert.ok(text.length < 500_000);
  });

  test("[stale/versions] a stale snapshot stays stale, an older engine is flagged, damaged spectra drop but the structure survives", async () => {
    const library = makeLibrary();
    const stale = ok(await library.save("spectroscopy", spectroSave({ results: envelope(spectroData(), { stale: true, engineVersion: 0 }) })));
    const opened = ok(await library.open(stale.id));
    assert.equal(opened.results.stale, true);
    assert.equal(opened.engineMismatch, true);
    assert.equal(stale.stale, true);

    const damaged = spectroSave();
    damaged.results = envelope({ ...spectroData(), result: { ...clone(realSpectra), ir: [{ label: 5 }] } });
    const dropped = ok(await library.open(ok(await library.save("spectroscopy", damaged)).id));
    assert.equal(dropped.resultsDropped, true);
    assert.equal(dropped.inputs.ket, ket("O"));
  });

  test("[immutable] a saved spectroscopy analysis is unaffected by later workspace edits; duplicate keeps every result", async () => {
    const library = makeLibrary();
    const live = spectroSave();
    const liveCopy = clone(live);
    const saved = ok(await library.save("spectroscopy", liveCopy));
    liveCopy.results.data.result.ir.length = 0;
    liveCopy.inputs.activeTab = "mass";
    assert.equal(ok(await library.open(saved.id)).results.data.result.ir.length, realSpectra.ir.length);
    const copy = ok(await library.duplicate(saved.id));
    assert.deepEqual(ok(await library.open(copy.id)).results, ok(await library.open(saved.id)).results);
    ok(await library.delete(copy.id));
    assert.equal(ok(await library.open(saved.id)).inputs.activeTab, "ir");
  });
});

// ---- the shared open flow: unsaved work, races, rollback ----------------------------------------------------

describe("shared open flow", () => {
  function pageHarness(library, overrides = {}) {
    const log = { applied: [], handled: [], notices: [], saved: [] };
    const page = {
      page: "ranking",
      library,
      onOpenHandled: (id) => log.handled.push(id),
      busyReason: () => null,
      hasUnsavedWork: () => false,
      canSaveCurrent: () => true,
      saveCurrent: async (name) => { log.saved.push(name); return true; },
      defaultName: () => "Current ranking",
      apply: async (opened) => { log.applied.push(opened.record.id); return true; },
      notify: (item) => log.notices.push(item),
      ...overrides,
    };
    return { page, log };
  }
  const request = (recordId, id = "open-1") => ({ id, recordId });

  test("[flow] an empty workspace opens at once; the request is reported handled exactly once", async () => {
    const library = makeLibrary();
    const saved = ok(await library.save("ranking", rankingSave()));
    const { page, log } = pageHarness(library);
    assert.deepEqual(await flow.beginOpenFlow(page, request(saved.id)), { kind: "applied" });
    assert.deepEqual(log.applied, [saved.id]);
    assert.deepEqual(log.handled, ["open-1"]);
  });

  test("[unsaved work] the user is asked; Replace opens, Cancel changes nothing, Save-first saves then opens, a failed save opens nothing", async () => {
    const library = makeLibrary();
    const saved = ok(await library.save("ranking", rankingSave()));
    const { page, log } = pageHarness(library, { hasUnsavedWork: () => true });
    const started = await flow.beginOpenFlow(page, request(saved.id));
    assert.equal(started.kind, "prompt");
    assert.deepEqual(log.applied, [], "nothing replaced yet");
    assert.deepEqual(log.handled, [], "still waiting for the answer");

    assert.equal(await flow.resolveOpenFlow(page, request(saved.id), started.opened, "cancel"), "cancelled");
    assert.deepEqual(log.applied, []);
    assert.deepEqual(log.handled, ["open-1"]);

    log.handled.length = 0;
    assert.equal(await flow.resolveOpenFlow(page, request(saved.id), started.opened, "save-first"), "applied");
    assert.equal(log.saved.length, 1);
    assert.match(log.saved[0], /^Current ranking \(before opening Five molecules\)$/);
    assert.deepEqual(log.applied, [saved.id]);

    log.applied.length = 0;
    log.handled.length = 0;
    const failing = pageHarness(library, { hasUnsavedWork: () => true, saveCurrent: async () => false });
    assert.equal(await flow.resolveOpenFlow(failing.page, request(saved.id), started.opened, "save-first"), "not-saved");
    assert.deepEqual(failing.log.applied, [], "if the current workspace cannot be saved nothing is replaced");

    const replace = pageHarness(library, { hasUnsavedWork: () => true });
    assert.equal(await flow.resolveOpenFlow(replace.page, request(saved.id), started.opened, "replace"), "applied");
    assert.deepEqual(replace.log.saved, [], "Replace does not save");
  });

  test("[refused] a busy page, another page's record, a missing record and a damaged record never touch the workspace", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("ranking", rankingSave()));
    const spectra = ok(await library.save("spectroscopy", spectroSave()));
    backend.map.set("broken", "{nope");
    for (const [recordId, harness, pattern] of [
      [saved.id, pageHarness(library, { busyReason: () => "Wait for the current analysis to finish." }), /Wait for the current analysis/],
      [spectra.id, pageHarness(library), /belongs to another page/],
      ["missing", pageHarness(library), /no longer exists/],
      ["broken", pageHarness(library), /could not be read/],
    ]) {
      assert.deepEqual(await flow.beginOpenFlow(harness.page, request(recordId)), { kind: "refused" });
      assert.deepEqual(harness.log.applied, []);
      assert.deepEqual(harness.log.handled, ["open-1"]);
      assert.match(harness.log.notices[0].text, pattern);
      assert.equal(harness.log.notices[0].tone, "warn");
    }
  });

  test("[failure] when applying fails the page keeps its workspace and the request is still reported handled once", async () => {
    const library = makeLibrary();
    const saved = ok(await library.save("spectroscopy", spectroSave()));
    const { page, log } = pageHarness(library, { page: "spectroscopy", apply: async () => false });
    assert.deepEqual(await flow.beginOpenFlow(page, request(saved.id)), { kind: "failed" });
    assert.deepEqual(log.handled, ["open-1"]);
  });

  test("[storage] unavailable or failing storage is reported on the page, not thrown", async () => {
    const harness = pageHarness(makeLibrary(null));
    assert.deepEqual(await flow.beginOpenFlow(harness.page, request("x")), { kind: "refused" });
    assert.match(harness.log.notices[0].text, /not available/);
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("ranking", rankingSave()));
    backend.failWith = new store.PersistenceError("io", "disk error");
    const second = pageHarness(library);
    assert.deepEqual(await flow.beginOpenFlow(second.page, request(saved.id)), { kind: "refused" });
    assert.match(second.log.notices[0].text, /disk error/);
    backend.failWith = null;
    backend.quotaChars = 10;
    failed(await library.save("ranking", rankingSave()), "quota");
  });

  // single-editor transactions, for both pages
  for (const [page, source] of [["ranking", ket("O")], ["spectroscopy", ket("S")]]) {
    describe(`${page}: opening into the editor`, () => {
      const OLD = ket("N");
      function fakeEditor(initial, behavior = {}) {
        const state = { ket: initial, sets: [] };
        return {
          state,
          api: {
            getKet: async () => state.ket,
            setMolecule: async (structure) => {
              const call = state.sets.length;
              state.sets.push(structure);
              if (behavior.setMolecule) return behavior.setMolecule(structure, state, call);
              state.ket = structure;
            },
          },
        };
      }
      const timers = () => {
        const pending = new Map();
        let next = 1;
        return { timers: { set: (cb) => { const id = next++; pending.set(id, cb); return id; }, clear: (id) => pending.delete(id) }, fire() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb()); } };
      };
      async function live() {
        const disk = new Map();
        await new store.WorkspaceStore(new store.MemoryBackend({ map: disk })).save(page, { inputs: { marker: "workspace" }, results: null });
        const clock = timers();
        const backend = new store.MemoryBackend({ map: disk });
        const controller = new controllerModule.WorkspacePersistence({
          store: new store.WorkspaceStore(backend), page, engineVersion: 1,
          validateInputs: (raw) => raw, validateResults: (raw) => raw, timers: clock.timers,
        });
        await controller.recover();
        controller.resumeAfterRestore();
        return { disk, backend, controller, clock, before: disk.get(`workspace:${page}`) };
      }
      let key;
      before(async () => { key = await ketIdentity.ketIdentityKey(source); });
      const entry = (editor) => [{ api: editor.api, source, expectKey: key }];

      test("success: the editor shows the saved structure; the old callbacks are invalid; the record is untouched until the one replacing write", async () => {
        const { controller, disk, backend, before: saved } = await live();
        const token = controller.token();
        const editor = fakeEditor(OLD);
        const outcome = await transfer.transferIntoEditors(entry(editor), controller);
        assert.equal(outcome.kind, "adopted");
        assert.equal(editor.state.ket, source);
        assert.equal(controller.isCurrent(token), false);
        assert.equal(disk.get(`workspace:${page}`), saved);
        assert.equal(backend.putCount, 0);
      });

      test("failure (even after the editor changed): the previous drawing is back, verified, and the workspace record is byte-identical", async () => {
        const { controller, disk, before: saved } = await live();
        const editor = fakeEditor(OLD, { setMolecule: async (s, state, call) => { if (call === 0) { state.ket = source; throw new Error("failed halfway"); } state.ket = s; } });
        const token = controller.token();
        assert.equal((await transfer.transferIntoEditors(entry(editor), controller)).kind, "rolled-back");
        assert.equal(editor.state.ket, OLD);
        assert.equal(controller.isCurrent(token), true);
        assert.equal(controller.isLive, true);
        assert.equal(disk.get(`workspace:${page}`), saved);
      });

      test("failure with an editor that cannot be restored: saving stops, the stored workspace stays, Clear starts over", async () => {
        const { controller, disk, backend, clock, before: saved } = await live();
        const editor = fakeEditor(OLD, { setMolecule: async () => { throw new Error("editor broken"); } });
        assert.equal((await transfer.transferIntoEditors(entry(editor), controller)).kind, "editor-unknown");
        controller.requestSave(() => ({ inputs: { marker: "later" }, results: null }));
        clock.fire();
        await controller.flush();
        assert.equal(backend.putCount, 0);
        assert.equal(disk.get(`workspace:${page}`), saved);
        await controller.discard();
        assert.equal(disk.has(`workspace:${page}`), false);
      });

      test("races: a pending autosave is dropped, and a recovery still loading is superseded by the opened analysis", async () => {
        const { controller, backend, clock } = await live();
        controller.requestSave(() => ({ inputs: { marker: "edited a moment ago" }, results: null }));
        assert.equal((await transfer.transferIntoEditors(entry(fakeEditor(OLD)), controller)).kind, "adopted");
        clock.fire();
        await controller.flush();
        assert.equal(backend.putCount, 0);

        const disk = new Map();
        await new store.WorkspaceStore(new store.MemoryBackend({ map: disk })).save(page, { inputs: { marker: "old" }, results: null });
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        class Slow extends store.MemoryBackend { async get(k) { await gate; return super.get(k); } }
        const slow = new controllerModule.WorkspacePersistence({ store: new store.WorkspaceStore(new Slow({ map: disk })), page, engineVersion: 1, validateInputs: (r) => r, validateResults: (r) => r, timers: timers().timers });
        const recovery = slow.recover();
        assert.equal((await transfer.transferIntoEditors(entry(fakeEditor(OLD)), slow)).kind, "adopted");
        release();
        assert.equal((await recovery).kind, "superseded", "an older restoration cannot overwrite the opened analysis");
      });
    });
  }
});

// ---- wiring (source-level; browser behaviour is checked manually) -----------------------------------------------

describe("navigation and page wiring", () => {
  const app = read("src", "App.tsx");
  const ranking = read("src", "components", "RankingPage.tsx");
  const spectroscopy = read("src", "components", "SpectroscopyPage.tsx");
  const synthesis = read("src", "components", "SynthesisPage.tsx");

  test("[navigation] each saved type opens on its own page; the page ids exist in the navigation", () => {
    assert.deepEqual({ ...libApp.ANALYSIS_APP_PAGE }, { synthesis: "multiStep", ranking: "acidBase", spectroscopy: "spectroscopy", properties: "analysis", reactions: "reactions", multicatalytic: "multiCatalytic", conformations: "conformations", genchem: "gcAcidBase", equilibrium: "gcEquilibrium", kinetics: "gcKinetics", thermo: "gcThermo", stoichiometry: "gcStoichiometry", gaslaws: "gcGas", electrochem: "gcElectro", atomic: "gcAtomic", bonding: "gcBonding", molorbitals: "gcMO", mechanics: "phMechanics", circuits: "phCircuits", rc: "phRc", forces: "phForces", energy: "phEnergy", collisions: "phCollisions", waves: "phWaves", optics: "phOptics", interference: "phInterference", efield: "phEfield", magnetic: "phMagnetic", induction: "phInduction", replication: "bioReplication", transcription: "bioTranscription", translation: "bioTranslation", dogma: "bioDogma", regulation: "bioRegulation", genetics: "bioGenetics", celldivision: "bioDivision", membrane: "bioMembrane", signaling: "bioSignaling", neuron: "bioNeuron", aminoacids: "bcAminoAcids", proteins: "bcProteins", enzymes: "bcEnzymes", glycolysis: "bcGlycolysis", gluconeogenesis: "bcGluconeogenesis", tca: "bcTca", etc: "bcEtc", metabolism: "bcMetabolism", fattyacids: "bcFattyAcids", aminometabolism: "bcAminoMetabolism", fuelmetabolism: "bcFuel", organelles: "bioOrganelles", cellcycle: "bioCellCycle", celldeath: "bioCellDeath" });
    assert.deepEqual([...libApp.OPENABLE_ANALYSIS_PAGES], ["synthesis", "ranking", "spectroscopy", "properties", "reactions", "multicatalytic", "conformations", "genchem", "equilibrium", "kinetics", "thermo", "stoichiometry", "gaslaws", "electrochem", "atomic", "bonding", "molorbitals", "mechanics", "circuits", "rc", "forces", "energy", "collisions", "waves", "optics", "interference", "efield", "magnetic", "induction", "replication", "transcription", "translation", "dogma", "regulation", "genetics", "celldivision", "membrane", "signaling", "neuron", "aminoacids", "proteins", "enzymes", "glycolysis", "gluconeogenesis", "tca", "etc", "metabolism", "fattyacids", "aminometabolism", "fuelmetabolism", "organelles", "cellcycle", "celldeath"]);
    for (const id of Object.values(libApp.ANALYSIS_APP_PAGE)) assert.match(/^(gc|ph|bio|bc)/.test(id) ? read("src", "navigation", "subjects.ts") : app, new RegExp(`\\{ id: "${id}", (slug: "[a-z-]+", )?label:`));
    assert.match(app, /const target = ANALYSIS_APP_PAGE\[analysis\.page as keyof typeof ANALYSIS_APP_PAGE\];/);
    assert.match(app, /switchPage\(target, \{ keepOpenRequest: true \}\)/);
    assert.match(app, /openRequest=\{pendingOpen\?\.page === "acidBase" \? pendingOpen : null\}/);
    assert.match(app, /openRequest=\{pendingOpen\?\.page === "spectroscopy" \? pendingOpen : null\}/);
    assert.match(app, /openRequest=\{pendingOpen\?\.page === "multiStep" \? pendingOpen : null\}/);
    assert.match(app, /if \(!options\?\.keepOpenRequest\) setPendingOpen\(null\);/, "any other navigation forgets a pending open");
  });

  test("[wiring] both pages use the shared flow, wait for recovery and the editor, and register their validators in one library", () => {
    for (const text of [ranking, spectroscopy]) {
      assert.match(text, /useSavedAnalysisOpen</);
      assert.match(text, /ready: recovery !== null && ketcher !== null/);
      assert.match(text, /transferIntoEditors\(/);
      assert.match(text, /getAppAnalysisLibrary\(\)\.save\(/);
      assert.doesNotMatch(text, /\.update\(/, "Save never overwrites");
      assert.match(text, /Save Analysis/);
      assert.match(text, /ReplaceWorkspacePrompt/);
      assert.match(text, /persistence\.isCurrent\(token\) && !openingRef\.current/, "a drawing restore cannot land during an open");
    }
    const hook = read("src", "utils", "persistence", "useSavedAnalysisOpen.ts");
    assert.match(hook, /if \(handledRef\.current === args\.openRequest\.id\) return;/);
    const registry = read("src", "utils", "persistence", "analysisLibraryApp.ts");
    for (const page of ["synthesis", "ranking", "spectroscopy"]) assert.match(registry, new RegExp(`${page}: \\{`));
  });

  test("[no recalculation] opening a saved Ranking or Spectroscopy analysis runs no prediction", () => {
    const rankingOpen = ranking.slice(ranking.indexOf("async function applySavedAnalysis"), ranking.indexOf("const savedOpen = useSavedAnalysisOpen"));
    const spectraOpen = spectroscopy.slice(spectroscopy.indexOf("async function applySavedAnalysis"), spectroscopy.indexOf("const savedOpen = useSavedAnalysisOpen"));
    assert.ok(rankingOpen.length > 1500 && spectraOpen.length > 1500);
    assert.doesNotMatch(rankingOpen, /analyzeComparisonMolecule|analyzeFunctionalGroupHierarchy|getMoleculeSvg|addCurrentMoleculeToComparison/);
    assert.doesNotMatch(spectraOpen, /analyzeMolecularSpectroscopy|analyzeNomenclatureAndProperties|analyzeFunctionalGroupHierarchy|analyze\(|getMoleculeSvg/);
    assert.match(rankingOpen, /The profiles were not recalculated|Nothing was recalculated/);
    assert.match(spectroscopy, /not experimental measurements, and they were not recomputed/);
    assert.match(rankingOpen, /svgAttemptedRef\.current\.clear\(\)/, "previews are redrawn from the saved SMILES");
    assert.match(spectraOpen, /svgAttemptedRef\.current = null/, "the structure preview is redrawn from the saved SMILES");
  });

  test("[safety] Save Analysis needs a finished analysis and reads the latest editor first; opening is blocked while one runs", () => {
    assert.match(ranking, /disabled=\{!resultMeta \|\| comparisonMolecules\.length === 0 \|\| isAnalyzing \|\| isOpening \|\| saveBusy\}/);
    assert.match(spectroscopy, /disabled=\{!resultMeta \|\| !result \|\| isAnalyzing \|\| isOpening \|\| saveBusy\}/);
    for (const [text, capture] of [[ranking, "captureRanking()"], [spectroscopy, "captureSpectroscopy()"]]) {
      const body = text.slice(text.indexOf("async function saveCurrentAnalysis"), text.indexOf("/** Replaces the"));
      assert.ok(body.indexOf("snapshotTask.flushNow()") >= 0 && body.indexOf("snapshotTask.flushNow()") < body.indexOf(capture));
    }
    assert.match(ranking, /if \(isAnalyzing \|\| openingRef\.current\) return;/);
    assert.match(spectroscopy, /if \(!ketcher \|\| isAnalyzing \|\| openingRef\.current\) return;/);
  });

  test("[scope] Multi-Catalytic stays outside the library; the Synthesis library flow is unchanged", () => {
    assert.doesNotMatch(read("src", "components", "MultiCatalyticPage.tsx"), /getAppAnalysisLibrary|SavedAnalysisControls/);
    assert.match(synthesis, /transferIntoEditors\(/);
    assert.match(synthesis, /async function applySavedAnalysis/);
    assert.doesNotMatch(synthesis, /useSavedAnalysisOpen/, "Synthesis keeps its Stage 8B-3A flow");
  });
});
