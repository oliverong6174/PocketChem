// Phase 4 / Stage 8B-3B-2: Properties and Reactions in the Saved Analyses library, and the library
// as a whole across all five analysis pages.
//
// Fixtures are real but tiny: one alanine Properties analysis and four Reactions predictions (a
// stereodefined bromoalkane with its NO REACTION outcomes, ethanol, acetic acid + ethanol on one
// canvas, and ethyl acetate's retrosynthesis), each well under a second. They prove that real output
// is stored and returned unchanged. The library runs on an in-memory backend; fake editors cover the
// transactional open. No synthesis search and no reaction sweep is run.
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
let propertiesWs;
let reactionsWs;
let rankingWs;
let spectroWs;
let synthesisWs;
let controllerModule;
let libApp;
let propsResults;
let fixtures;
let spectra;
let profile;

before(async () => {
  await loadEngine();
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  flow = await loadModule("/src/utils/persistence/useSavedAnalysisOpen.ts");
  transfer = await loadModule("/src/utils/persistence/handoffTransfer.ts");
  propertiesWs = await loadModule("/src/utils/persistence/propertiesWorkspace.ts");
  reactionsWs = await loadModule("/src/utils/persistence/reactionsWorkspace.ts");
  rankingWs = await loadModule("/src/utils/persistence/rankingWorkspace.ts");
  spectroWs = await loadModule("/src/utils/persistence/spectroscopyWorkspace.ts");
  synthesisWs = await loadModule("/src/utils/persistence/synthesisWorkspace.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");

  const annotation = await loadModule("/src/utils/moleculeAnnotation.ts");
  const resonance = await loadModule("/src/utils/resonanceUtils.ts");
  const chirality = await loadModule("/src/utils/chiralityUtils.ts");
  const groups = await loadModule("/src/utils/functionalGroups/index.ts");
  const naming = await loadModule("/src/utils/nomenclatureUtils.ts");
  const acidity = await loadModule("/src/utils/ranking/acidBase/analyzeAcidity.ts");
  const basicity = await loadModule("/src/utils/ranking/acidBase/analyzeBasicity.ts");
  const reactionUtils = await loadModule("/src/utils/reactionUtils.ts");
  const comparison = await loadModule("/src/utils/ranking/comparisonAnalysis.ts");
  const spectroscopy = await loadModule("/src/utils/spectroscopy/index.ts");

  const smiles = "C[C@H](N)C(=O)O";
  const [moleculeAnnotation, resonanceResults, chiralityResults, hierarchy] = await Promise.all([
    annotation.getMoleculeAnnotation(smiles), resonance.analyzeResonance(smiles), chirality.analyzeChirality(smiles), groups.analyzeFunctionalGroupHierarchy(smiles),
  ]);
  const functionalGroups = hierarchy.functionalGroups ?? [];
  const [reactionPathways, moleculeIdentity, acidityResults, basicityResults] = await Promise.all([
    reactionUtils.predictReactionPathways(smiles, functionalGroups),
    naming.analyzeNomenclatureAndProperties(smiles, hierarchy.primaryGroups, hierarchy.mainGroup),
    acidity.analyzeAcidity(smiles, hierarchy.primaryGroups),
    basicity.analyzeBasicity(smiles, hierarchy.primaryGroups),
  ]);
  propsResults = { inputKey: "C[C@H](N)C(=O)O", smiles, molfile: null, functionalGroups, acidityResults, basicityResults, resonanceResults, chiralityResults, moleculeAnnotation, moleculeIdentity, reactionPathways };

  const stereoSmiles = "C[C@H](Br)CC";
  const stereo = await groups.analyzeFunctionalGroupHierarchy(stereoSmiles);
  const stereoPathways = await reactionUtils.predictReactionPathways(stereoSmiles, stereo.primaryGroups);
  const stereoNoReaction = await reactionUtils.predictNoReactionOutcomes(
    stereoSmiles, stereoPathways.filter((p) => p.productSmiles).map((p) => p.ruleId), reactionUtils.reactionRegistry, stereo.functionalGroups ?? stereo.primaryGroups,
  );
  const ethanol = await groups.analyzeFunctionalGroupHierarchy("CCO");
  const ethanolPathways = await reactionUtils.predictReactionPathways("CCO", ethanol.primaryGroups);
  const multiSmiles = "CC(=O)O.OCC";
  const multiPathways = await reactionUtils.predictReactionPathways(multiSmiles, []);
  const retroSmiles = "CC(=O)OCC";
  const retroPathways = await reactionUtils.predictRetrosynthesisPathways(retroSmiles);
  fixtures = { stereoSmiles, stereoPathways, stereoNoReaction, ethanolPathways, multiSmiles, multiPathways, retroSmiles, retroPathways };

  profile = await comparison.analyzeComparisonMolecule("CCO", ethanol);
  spectra = await spectroscopy.analyzeMolecularSpectroscopy({ structure: "CCO", functionalGroups: ethanol.functionalGroups, formula: "C2H6O", exactMass: 46.0419 });
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------------

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
const atom = (label, extra) => ket({ atoms: [[label, 0, 0, extra]], bonds: [] });
const emptyKet = JSON.stringify({ root: { nodes: [] } });
const envelope = (data, extra = {}) => ({ computedAt: "2026-10-30T09:00:00.000Z", engineVersion: 1, stale: false, status: "complete", data, ...extra });
let counter = 0;
const newId = () => `q-${++counter}`;
const allValidators = () => ({
  synthesis: { engineVersion: synthesisWs.SYNTHESIS_ENGINE_VERSION, validateInputs: synthesisWs.validateSynthesisInputs, validateResults: synthesisWs.validateSynthesisResults },
  ranking: { engineVersion: rankingWs.RANKING_ENGINE_VERSION, validateInputs: rankingWs.validateRankingInputs, validateResults: rankingWs.validateRankingResults },
  spectroscopy: { engineVersion: spectroWs.SPECTROSCOPY_ENGINE_VERSION, validateInputs: spectroWs.validateSpectroscopyInputs, validateResults: spectroWs.validateSpectroscopyResults },
  properties: { engineVersion: propertiesWs.PROPERTIES_ENGINE_VERSION, validateInputs: propertiesWs.validatePropertiesInputs, validateResults: propertiesWs.validatePropertiesResults },
  reactions: { engineVersion: reactionsWs.REACTIONS_ENGINE_VERSION, validateInputs: reactionsWs.validateReactionsInputs, validateResults: reactionsWs.validateReactionsResults },
});
const makeLibrary = (backend = new store.MemoryBackend(), options = {}) => new lib.AnalysisLibrary(backend, { validators: allValidators(), newId, ...options });
const ok = (result) => { assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.error)); return result.value; };

const propsInputs = (over = {}) => ({ ket: atom("N"), key: "N", analysisPanel: "concepts", selectedConcept: "chirality", selectedHybridization: "sp3", selectedBondType: "single", ...over });
function propsSave(over = {}) {
  return {
    name: "Alanine properties",
    summary: propertiesWs.describePropertiesAnalysis(propsResults),
    inputs: propsInputs(),
    results: envelope(propsResults),
    ...over,
  };
}
const reactionsInputs = (over = {}) => ({ ket: atom("N"), key: "N", analysisMode: "forward", visibleResultCount: 24, interrupted: null, handoffSeen: "2026-10-29T10:00:00.000Z", ...over });
function reactionsData(kind) {
  const f = fixtures;
  const base = { inputKey: "CC[C@@H](C)Br", mode: "forward", smiles: f.stereoSmiles, molfile: "\n  -ketcher-\n\n  0  0  0  0  0  0  0  0  0  0999 V3000\nM  V30 BEGIN CTAB\nM  V30 END CTAB\nM  END\n", componentMolfiles: [], inputName: "(2S)-2-bromobutane", statusText: "15 supported reaction outcomes found.", pathways: f.stereoPathways, retroPathways: [], noReactionOutcomes: f.stereoNoReaction };
  if (kind === "multi") return { ...base, inputKey: "CC(=O)O.CCO", smiles: f.multiSmiles, componentMolfiles: ["m1", "m2"], inputName: "acetic acid + ethanol", pathways: f.multiPathways, noReactionOutcomes: [] };
  if (kind === "retro") return { ...base, inputKey: "CC(=O)OCC", mode: "retrosynthesis", smiles: f.retroSmiles, pathways: [], retroPathways: f.retroPathways, noReactionOutcomes: [], statusText: "26 verified precursor routes found." };
  return base;
}
function reactionsSave(kind = "forward", over = {}) {
  const data = reactionsData(kind);
  const status = kind === "retro" ? "retro-found" : "forward-found";
  return { name: `Reactions ${kind}`, summary: reactionsWs.describeReactionsAnalysis(data), inputs: reactionsInputs({ analysisMode: data.mode }), results: envelope(data, { status }), ...over };
}

// ---- Properties -----------------------------------------------------------------------------------------

describe("properties saved analyses", () => {
  test("[save/open] structure, groups, acid/base, resonance, chirality, annotation, name, properties and reactions come back exactly", async () => {
    store.assertPlainJson(propsResults);
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("properties", propsSave()));
    assert.equal(saved.page, "properties");
    assert.match(saved.summary, /functional groups?, \d+ stereo results?, \d+ predicted reactions?$/);

    const opened = ok(await makeLibrary(backend).open(saved.id)); // restart
    const data = opened.results.data;
    assert.deepEqual(data, clone(propsResults));
    assert.match(data.smiles, /@/, "the stereocentre survives");
    assert.ok(data.chiralityResults.length > 0 && data.functionalGroups.length > 0);
    assert.deepEqual(data.moleculeIdentity.nomenclature, clone(propsResults.moleculeIdentity.nomenclature), "name and its explanation");
    assert.deepEqual(data.acidityResults, clone(propsResults.acidityResults));
    assert.deepEqual(data.basicityResults, clone(propsResults.basicityResults));
    assert.deepEqual(opened.inputs, clone(propsInputs()));
    assert.equal(opened.engineMismatch, false);
    assert.equal(opened.results.engineVersion, 1);
  });

  test("[structure] disconnected components, charges, isotopes and wedge stereo in the drawing keep their identity", async () => {
    const identity = await loadModule("/src/utils/persistence/ketIdentity.ts");
    const drawing = ket(
      { atoms: [["C", 0, 0], ["F", 1, 0], ["Cl", -1, 0.5], ["Br", 0, -1]], bonds: [[0, 1, 1, 1], [0, 2], [0, 3]] },
      { atoms: [["C", 5, 0, { isotope: 13 }], ["N", 6, 0, { charge: 1 }]], bonds: [[0, 1]] },
    );
    const key = await identity.ketIdentityKey(drawing);
    assert.equal(key.split(".").length, 2, "two separate components");
    const library = makeLibrary();
    const saved = ok(await library.save("properties", propsSave({ inputs: propsInputs({ ket: drawing, key }) })));
    const opened = ok(await library.open(saved.id));
    assert.equal(opened.inputs.ket, drawing, "the drawing is stored byte-for-byte");
    assert.equal(await identity.ketIdentityKey(opened.inputs.ket), key);
  });

  test("[immutable] later edits do not change the record; Rename, Duplicate and Delete work; no recalculation is involved", async () => {
    const library = makeLibrary();
    const live = clone(propsSave());
    const saved = ok(await library.save("properties", live));
    live.results.data.functionalGroups.length = 0;
    live.inputs.analysisPanel = "overview";
    assert.ok(ok(await library.open(saved.id)).results.data.functionalGroups.length > 0);
    ok(await library.rename(saved.id, "Renamed"));
    const copy = ok(await library.duplicate(saved.id));
    assert.deepEqual(ok(await library.open(copy.id)).results, ok(await library.open(saved.id)).results);
    ok(await library.delete(saved.id));
    assert.equal(ok(await library.open(copy.id)).inputs.analysisPanel, "concepts");
  });

  test("[versions] stale and older-engine results keep their flags; damaged results drop but the structure survives", async () => {
    const library = makeLibrary();
    const stale = ok(await library.save("properties", propsSave({ results: envelope(propsResults, { stale: true, engineVersion: 0 }) })));
    const opened = ok(await library.open(stale.id));
    assert.equal(opened.results.stale, true);
    assert.equal(opened.engineMismatch, true);
    assert.equal(opened.results.engineVersion, 0, "never silently upgraded");
    const damaged = ok(await library.save("properties", propsSave({ results: envelope({ ...clone(propsResults), functionalGroups: {} }) })));
    const dropped = ok(await library.open(damaged.id));
    assert.equal(dropped.resultsDropped, true);
    assert.equal(dropped.inputs.ket, atom("N"));
  });

  test("[source] Properties saves a finished analysis, opens in one transaction, and recalculates nothing", () => {
    const app = read("src", "App.tsx");
    const open = app.slice(app.indexOf("async function applySavedAnalysis"), app.indexOf("const savedOpen = useSavedAnalysisOpen"));
    assert.ok(open.length > 1500);
    assert.doesNotMatch(open, /analyzeMolecule|analyzeFunctionalGroupHierarchy|analyzeNomenclatureAndProperties|analyzeAcidity|analyzeBasicity|predictReactionPathways|getMoleculeAnnotation|analyzeResonance|analyzeChirality/);
    assert.match(open, /transferIntoEditors\(/);
    assert.match(open, /Opened saved analysis/);
    assert.match(app, /These results were not recomputed/);
    assert.match(app, /disabled=\{!resultMeta \|\| isAnalyzing \|\| isOpening \|\| saveBusy\}/);
    assert.match(app, /ready: recovery !== null && activePage === "analysis" && isMainEditorReady/);
    assert.match(app, /openRequest: pendingOpen\?\.page === "analysis" \? pendingOpen : null/);
    assert.match(app, /if \(analyzeInFlightRef\.current \|\| openingRef\.current\) return;/);
    assert.match(app, /persistence\.isCurrent\(token\) && !openingRef\.current/, "a drawing restore cannot land during an open");
  });
});

// ---- Reactions ----------------------------------------------------------------------------------------------

describe("reactions saved analyses", () => {
  test("[save/open] predicted products, mixtures, explanations, ordering and NO REACTION outcomes come back exactly", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("reactions", reactionsSave("forward")));
    assert.equal(saved.status, "forward-found");
    assert.match(saved.summary, /^\(2S\)-2-bromobutane · \d+ predicted reactions?, \d+ no-reaction outcomes?$/);
    const opened = ok(await makeLibrary(backend).open(saved.id));
    const data = opened.results.data;
    assert.deepEqual(data, clone(reactionsData("forward")));
    assert.deepEqual(data.pathways.map((p) => p.id), fixtures.stereoPathways.map((p) => p.id), "pathway order");
    assert.deepEqual(data.pathways.map((p) => p.shortExplanation), fixtures.stereoPathways.map((p) => p.shortExplanation));
    assert.deepEqual(data.pathways.filter((p) => p.productMixture).map((p) => p.productMixture), clone(fixtures.stereoPathways.filter((p) => p.productMixture).map((p) => p.productMixture)), "racemic and diastereomeric mixtures with all members");
    assert.deepEqual(data.pathways.map((p) => p.productSmiles), fixtures.stereoPathways.map((p) => p.productSmiles), "stereochemical outcomes");
    assert.match(data.smiles, /@/);
    assert.deepEqual(data.noReactionOutcomes, clone(fixtures.stereoNoReaction));
    assert.equal(opened.inputs.handoffSeen, "2026-10-29T10:00:00.000Z", "the record keeps its own adopted-analysis id");
  });

  test("[modes] a multi-reactant canvas, a needs-input prediction and a retrosynthesis are all saved faithfully", async () => {
    const library = makeLibrary();
    const multi = ok(await library.open(ok(await library.save("reactions", reactionsSave("multi"))).id));
    assert.equal(multi.results.data.smiles.split(".").length, 2);
    assert.deepEqual(multi.results.data.componentMolfiles, ["m1", "m2"]);
    assert.ok(multi.results.data.pathways.some((p) => p.reactantComponents.length === 2));
    const needing = fixtures.ethanolPathways.filter((p) => p.missingReactants.length > 0);
    assert.ok(needing.length > 0);
    const ethanol = reactionsSave("forward", { results: envelope({ ...reactionsData("forward"), smiles: "CCO", inputKey: "CCO", pathways: fixtures.ethanolPathways, noReactionOutcomes: [] }) });
    const opened = ok(await library.open(ok(await library.save("reactions", ethanol)).id));
    assert.deepEqual(opened.results.data.pathways.filter((p) => p.missingReactants.length > 0).map((p) => [p.id, p.productStatus]), clone(needing.map((p) => [p.id, p.productStatus])));
    const retro = ok(await library.open(ok(await library.save("reactions", reactionsSave("retro"))).id));
    assert.equal(retro.results.data.mode, "retrosynthesis");
    assert.deepEqual(retro.results.data.retroPathways, clone(fixtures.retroPathways));
    assert.equal(retro.inputs.analysisMode, "retrosynthesis");
  });

  test("[outcomes] a result with nothing found and an interrupted-run drawing both open without inventing results", async () => {
    const library = makeLibrary();
    const none = reactionsSave("forward", { results: envelope({ ...reactionsData("forward"), pathways: [], noReactionOutcomes: [], statusText: "No supported reactions were found." }, { status: "forward-none" }) });
    const noneOpened = ok(await library.open(ok(await library.save("reactions", none)).id));
    assert.equal(noneOpened.results.status, "forward-none");
    assert.deepEqual(noneOpened.results.data.pathways, []);
    const interrupted = ok(await library.save("reactions", reactionsSave("forward", { results: null, inputs: reactionsInputs({ interrupted: "forward" }) })));
    const opened = ok(await library.open(interrupted.id));
    assert.equal(opened.results, null);
    assert.equal(opened.inputs.interrupted, "forward");
  });

  test("[images] no rendered drawings are stored; they are rebuilt from the saved structures when opened", async () => {
    const backend = new store.MemoryBackend();
    ok(await makeLibrary(backend).save("reactions", reactionsSave("forward")));
    const text = [...backend.map.values()][0];
    assert.doesNotMatch(text, /<svg/i);
    const page = read("src", "components", "ReactionsPage.tsx");
    const open = page.slice(page.indexOf("async function applySavedAnalysis"), page.indexOf("const savedOpen = useSavedAnalysisOpen"));
    for (const call of ["setReactantSvgs({})", "setProductSvgs({})", "setRetroTargetSvgs({})", "setRetroPrecursorSvgs({})"]) assert.ok(open.includes(call), call);
    assert.match(page, /\}, \[visiblePathways, reactionMolfile, reactionSvgSnapshot, reactionComponentMolfiles\]\);/, "the product images are built from the pathways and molfiles on screen");
    assert.match(page, /\}, \[visibleRetroPathways\]\);/);
  });

  test("[handoff] opening a saved analysis never adopts a Properties molecule and never runs a prediction", () => {
    const page = read("src", "components", "ReactionsPage.tsx");
    const open = page.slice(page.indexOf("async function applySavedAnalysis"), page.indexOf("const savedOpen = useSavedAnalysisOpen"));
    assert.ok(open.length > 2500);
    assert.doesNotMatch(open, /initialPathways|initialReactantMolfile|handoffId|handoffSmiles|adoptHandoff/);
    assert.match(open, /setHandoffSeen\(inputs\.handoffSeen\)/);
    assert.doesNotMatch(open, /predictReactionPathways|predictRetrosynthesisPathways|predictNoReactionOutcomes|analyzeFunctionalGroupHierarchy|analyzeReactionMolecule/);
    assert.match(page, /async function adoptHandoff/, "the explicit \"Use in Reactions\" action is still there");
    assert.match(page, /if \(adoptingRef\.current \|\| handoffSeen === handoffId\) return;/);
    assert.match(open, /adoptingRef\.current = true; \/\/ one transfer at a time, shared with "Use in Reactions"/);
    assert.match(page, /ready: recovery !== null && ketcher !== null/);
    assert.match(page, /opened: \{ name: opened\.record\.name/);
    assert.match(page, /saved model predictions and were not recomputed/);
    assert.match(page, /disabled=\{!resultMeta \|\| isAnalyzing \|\| isAdopting \|\| saveBusy\}/);
  });

  test("[precedence] an opened analysis replaces the older automatic workspace in one write and wins on reload", async () => {
    const disk = new Map();
    const workspace = new store.WorkspaceStore(new store.MemoryBackend({ map: disk }));
    await workspace.save("reactions", { inputs: reactionsInputs({ ket: atom("Cl"), key: "Cl", handoffSeen: "H0" }), results: envelope(reactionsData("forward")) });
    const older = disk.get("workspace:reactions");
    const backend = new store.MemoryBackend({ map: disk });
    const controller = new controllerModule.WorkspacePersistence({ store: new store.WorkspaceStore(backend), page: "reactions", engineVersion: 1, validateInputs: reactionsWs.validateReactionsInputs, validateResults: reactionsWs.validateReactionsResults, timers: { set: () => 1, clear: () => undefined } });
    await controller.recover();
    controller.resumeAfterRestore();
    const editor = { ket: atom("Cl"), api: null };
    editor.api = { getKet: async () => editor.ket, setMolecule: async (s) => { editor.ket = s; } };
    const target = atom("N");
    const key = await (await loadModule("/src/utils/persistence/ketIdentity.ts")).ketIdentityKey(target);
    const outcome = await transfer.transferIntoEditors([{ api: editor.api, source: target, expectKey: key }], controller);
    assert.equal(outcome.kind, "adopted");
    assert.equal(disk.get("workspace:reactions"), older, "nothing is written until the one replacing write");
    const opened = reactionsSave("retro");
    controller.requestSave(() => ({ inputs: { ...opened.inputs, handoffSeen: "H-saved" }, results: opened.results }));
    await controller.flush();
    assert.equal(backend.putCount, 1);
    const reload = await new controllerModule.WorkspacePersistence({ store: new store.WorkspaceStore(new store.MemoryBackend({ map: disk })), page: "reactions", engineVersion: 1, validateInputs: reactionsWs.validateReactionsInputs, validateResults: reactionsWs.validateReactionsResults, timers: { set: () => 1, clear: () => undefined } }).recover();
    assert.equal(reload.results.data.mode, "retrosynthesis");
    assert.equal(reload.inputs.handoffSeen, "H-saved");
  });

  test("[versions] stale and older-engine results keep their flags; damaged pathways drop but the drawing survives", async () => {
    const library = makeLibrary();
    const old = ok(await library.save("reactions", reactionsSave("forward", { results: envelope(reactionsData("forward"), { engineVersion: 0, stale: true, status: "forward-found" }) })));
    const opened = ok(await library.open(old.id));
    assert.equal(opened.engineMismatch, true);
    assert.equal(opened.results.stale, true);
    assert.equal(opened.results.engineVersion, 0);
    const bad = reactionsData("forward");
    const damaged = clone(bad);
    delete damaged.pathways[0].shortExplanation;
    const dropped = ok(await library.open(ok(await library.save("reactions", reactionsSave("forward", { results: envelope(damaged, { status: "forward-found" }) }))).id));
    assert.equal(dropped.resultsDropped, true);
    assert.equal(dropped.inputs.ket, atom("N"));
  });
});

// ---- all five pages together ----------------------------------------------------------------------------------

describe("the library across all five pages", () => {
  const synthesisInputs = () => ({ reactantKet: atom("C"), targetKet: atom("O"), reactantKey: "C", targetKey: "O", copies: 1 });
  const rankingInputs = () => ({ editorKet: null, editorKey: null, activeCategory: "Electronic effects", rankingMode: "ewgStrength" });
  const spectroInputs = () => ({ ket: atom("O"), key: "O", activeTab: "proton", protonWindow: null });
  const fiveSaves = () => [
    ["synthesis", { name: "Synthesis", summary: "s", inputs: synthesisInputs(), results: null }],
    ["ranking", { name: "Ranking", summary: "r", inputs: rankingInputs(), results: null }],
    ["spectroscopy", { name: "Spectroscopy", summary: "p", inputs: spectroInputs(), results: envelope({ inputKey: "O", smiles: "CCO", structureSource: "CCO", name: "ethanol", formula: "C2H6O", result: spectra }) }],
    ["properties", propsSave().inputs && { name: "Properties", summary: "q", inputs: propsInputs(), results: envelope(propsResults) }],
    ["reactions", { name: "Reactions", summary: "x", inputs: reactionsInputs(), results: reactionsSave("forward").results }],
  ];

  test("[independence] five records, one per page, list together, open on the right type, and never touch each other or the page workspaces", async () => {
    const disk = new Map();
    const workspace = new store.WorkspaceStore(new store.MemoryBackend({ map: disk }));
    for (const page of ["synthesis", "ranking", "spectroscopy", "properties", "reactions"]) await workspace.save(page, { inputs: { marker: page }, results: null });
    const workspaces = JSON.stringify([...disk.entries()]);

    const library = makeLibrary();
    const ids = {};
    for (const [page, parts] of fiveSaves()) ids[page] = ok(await library.save(page, parts)).id;
    const listed = ok(await library.list());
    assert.deepEqual(listed.items.map((i) => i.page).sort(), ["properties", "ranking", "reactions", "spectroscopy", "synthesis"]);
    for (const [page, id] of Object.entries(ids)) assert.equal(ok(await library.open(id)).record.page, page);

    ok(await library.rename(ids.properties, "Renamed properties"));
    const copy = ok(await library.duplicate(ids.reactions));
    ok(await library.delete(ids.ranking));
    const after = ok(await library.list()).items;
    assert.deepEqual(after.map((i) => i.page).sort(), ["properties", "reactions", "reactions", "spectroscopy", "synthesis"]);
    assert.equal(after.find((i) => i.page === "properties").name, "Renamed properties");
    assert.notEqual(copy.id, ids.reactions);
    assert.equal(JSON.stringify([...disk.entries()]), workspaces, "the automatic workspaces are byte-identical");
  });

  test("[routing] every saved type opens on its own page, and the app wires all six (the Multi-Catalytic workspace was added in Stage 9B-2B)", () => {
    assert.deepEqual({ ...libApp.ANALYSIS_APP_PAGE }, { synthesis: "multiStep", ranking: "acidBase", spectroscopy: "spectroscopy", properties: "analysis", reactions: "reactions", multicatalytic: "multiCatalytic", conformations: "conformations", genchem: "gcAcidBase", equilibrium: "gcEquilibrium", kinetics: "gcKinetics", thermo: "gcThermo", mechanics: "phMechanics", circuits: "phCircuits", rc: "phRc", forces: "phForces", energy: "phEnergy", collisions: "phCollisions", replication: "bioReplication", transcription: "bioTranscription", translation: "bioTranslation", dogma: "bioDogma" });
    assert.deepEqual([...libApp.OPENABLE_ANALYSIS_PAGES].sort(), ["circuits", "collisions", "conformations", "dogma", "energy", "equilibrium", "forces", "genchem", "kinetics", "mechanics", "multicatalytic", "properties", "ranking", "rc", "reactions", "replication", "spectroscopy", "synthesis", "thermo", "transcription", "translation"]);
    const app = read("src", "App.tsx");
    for (const id of Object.values(libApp.ANALYSIS_APP_PAGE)) assert.match(/^(gc|ph|bio)/.test(id) ? read("src", "navigation", "subjects.ts") : app, new RegExp(`\\{ id: "${id}", (slug: "[a-z-]+", )?label:`));
    for (const page of ["acidBase", "spectroscopy", "multiStep", "reactions", "multiCatalytic", "conformations"]) assert.match(app, new RegExp(`openRequest=\\{pendingOpen\\?\\.page === "${page}" \\? pendingOpen : null\\}`));
    assert.match(app, /openRequest: pendingOpen\?\.page === "analysis" \? pendingOpen : null/);
    assert.match(app, /if \(!options\?\.keepOpenRequest\) setPendingOpen\(null\);/);
    assert.match(read("src", "components", "SavedAnalysesPage.tsx"), /OPENABLE_ANALYSIS_PAGES/);
  });

  test("[flow] every page uses the same open flow: refused for another page's record, asks before replacing, reports once", async () => {
    const library = makeLibrary();
    const ids = {};
    for (const [page, parts] of fiveSaves()) ids[page] = ok(await library.save(page, parts)).id;
    for (const page of ["synthesis", "ranking", "spectroscopy", "properties", "reactions"]) {
      const log = { applied: [], handled: [], notices: [] };
      const harness = {
        page, library, onOpenHandled: (id) => log.handled.push(id), busyReason: () => null, hasUnsavedWork: () => true, canSaveCurrent: () => true,
        saveCurrent: async () => true, defaultName: () => "Current", apply: async (o) => { log.applied.push(o.record.page); return true; }, notify: (n) => log.notices.push(n),
      };
      const other = page === "ranking" ? ids.properties : ids.ranking;
      assert.deepEqual(await flow.beginOpenFlow(harness, { id: "r1", recordId: other }), { kind: "refused" }, `${page} refuses another page's record`);
      assert.match(log.notices[0].text, /belongs to another page/);
      const started = await flow.beginOpenFlow(harness, { id: "r2", recordId: ids[page] });
      assert.equal(started.kind, "prompt", `${page} asks before replacing unsaved work`);
      assert.deepEqual(log.applied, []);
      assert.equal(await flow.resolveOpenFlow(harness, { id: "r2", recordId: ids[page] }, started.opened, "cancel"), "cancelled");
      assert.deepEqual(log.applied, [], "cancel changes nothing");
      assert.equal(await flow.resolveOpenFlow(harness, { id: "r2", recordId: ids[page] }, started.opened, "replace"), "applied");
      assert.deepEqual(log.applied, [page]);
      assert.deepEqual(log.handled, ["r1", "r2", "r2"]);
    }
  });

  // single-editor transactions for the two new pages
  for (const page of ["properties", "reactions"]) {
    describe(`${page}: opening into the editor`, () => {
      const OLD = atom("N");
      const source = atom("S");
      let key;
      before(async () => { key = await (await loadModule("/src/utils/persistence/ketIdentity.ts")).ketIdentityKey(source); });
      const fake = (initial, behavior = {}) => {
        const state = { ket: initial, sets: [] };
        return { state, api: { getKet: async () => state.ket, setMolecule: async (s) => { const call = state.sets.length; state.sets.push(s); if (behavior.setMolecule) return behavior.setMolecule(s, state, call); state.ket = s; } } };
      };
      const timers = () => { const pending = new Map(); let n = 1; return { timers: { set: (cb) => { const id = n++; pending.set(id, cb); return id; }, clear: (id) => pending.delete(id) }, fire() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb()); } }; };
      async function live() {
        const disk = new Map();
        await new store.WorkspaceStore(new store.MemoryBackend({ map: disk })).save(page, { inputs: { marker: "workspace" }, results: null });
        const clock = timers();
        const backend = new store.MemoryBackend({ map: disk });
        const controller = new controllerModule.WorkspacePersistence({ store: new store.WorkspaceStore(backend), page, engineVersion: 1, validateInputs: (r) => r, validateResults: (r) => r, timers: clock.timers });
        await controller.recover();
        controller.resumeAfterRestore();
        return { disk, backend, controller, clock, before: disk.get(`workspace:${page}`) };
      }
      const entry = (editor) => [{ api: editor.api, source, expectKey: key }];

      test("success: the structure arrives and is verified; the record is untouched until the one replacing write", async () => {
        const { controller, disk, backend, before: saved } = await live();
        const token = controller.token();
        const editor = fake(OLD);
        assert.equal((await transfer.transferIntoEditors(entry(editor), controller)).kind, "adopted");
        assert.equal(editor.state.ket, source);
        assert.equal(controller.isCurrent(token), false);
        assert.equal(disk.get(`workspace:${page}`), saved);
        assert.equal(backend.putCount, 0);
      });

      test("failure, even after the editor changed: the previous drawing is back and the workspace record is byte-identical", async () => {
        const { controller, disk, before: saved } = await live();
        const editor = fake(OLD, { setMolecule: async (s, state, call) => { if (call === 0) { state.ket = source; throw new Error("failed halfway"); } state.ket = s; } });
        assert.equal((await transfer.transferIntoEditors(entry(editor), controller)).kind, "rolled-back");
        assert.equal(editor.state.ket, OLD);
        assert.equal(controller.isLive, true);
        assert.equal(disk.get(`workspace:${page}`), saved);
      });

      test("an editor that cannot be restored stops saving and keeps the stored workspace; Clear starts over", async () => {
        const { controller, disk, backend, clock, before: saved } = await live();
        const editor = fake(OLD, { setMolecule: async () => { throw new Error("broken"); } });
        assert.equal((await transfer.transferIntoEditors(entry(editor), controller)).kind, "editor-unknown");
        controller.requestSave(() => ({ inputs: { marker: "later" }, results: null }));
        clock.fire();
        await controller.flush();
        assert.equal(backend.putCount, 0);
        assert.equal(disk.get(`workspace:${page}`), saved);
        await controller.discard();
        assert.equal(disk.has(`workspace:${page}`), false);
      });

      test("late asynchronous restoration and pending autosaves cannot overwrite the opened analysis", async () => {
        const { controller, backend, clock } = await live();
        controller.requestSave(() => ({ inputs: { marker: "edited a moment ago" }, results: null }));
        assert.equal((await transfer.transferIntoEditors(entry(fake(OLD)), controller)).kind, "adopted");
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
        assert.equal((await transfer.transferIntoEditors(entry(fake(OLD)), slow)).kind, "adopted");
        release();
        assert.equal((await recovery).kind, "superseded");
      });
    });
  }

  test("[storage] unavailable, full or failing storage and damaged or newer records are reported, never thrown, for the new pages too", async () => {
    const none = makeLibrary(null);
    for (const [page, parts] of fiveSaves()) assert.equal((await none.save(page, parts)).error.code, "unavailable", page);
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const props = ok(await library.save("properties", propsSave()));
    const reactions = ok(await library.save("reactions", reactionsSave("forward")));
    backend.map.set("future", JSON.stringify({ ...JSON.parse(backend.map.get(props.id)), id: "future", schemaVersion: 99 }));
    backend.map.set("broken", "{nope");
    const listed = ok(await library.list());
    assert.deepEqual(listed.items.map((i) => i.id).sort(), [props.id, reactions.id].sort());
    assert.deepEqual(listed.problems.map((p) => p.id).sort(), ["broken", "future"]);
    assert.equal((await library.open("future")).error.code, "incompatible");
    assert.equal((await library.open("broken")).error.code, "damaged");
    backend.quotaChars = 10;
    assert.equal((await library.save("reactions", reactionsSave("forward"))).error.code, "quota");
    assert.equal((await library.duplicate(props.id)).error.code, "quota");
    backend.quotaChars = null;
    assert.equal(ok(await library.open(reactions.id)).results.status, "forward-found", "a failed save changed nothing");
  });

  test("[existing] the Synthesis, Ranking and Spectroscopy library flows are unchanged", () => {
    const synthesis = read("src", "components", "SynthesisPage.tsx");
    assert.match(synthesis, /async function applySavedAnalysis/);
    assert.doesNotMatch(synthesis, /useSavedAnalysisOpen/);
    for (const file of ["RankingPage.tsx", "SpectroscopyPage.tsx"]) {
      const text = read("src", "components", file);
      assert.match(text, /useSavedAnalysisOpen</);
      assert.match(text, /getAppAnalysisLibrary\(\)\.save\(/);
    }
    const users = [];
    for (const file of fs.readdirSync(path.join(root, "src", "components"))) {
      if (file.endsWith(".tsx") && /getAppAnalysisLibrary/.test(read("src", "components", file))) users.push(file);
    }
    assert.deepEqual(users.sort(), ["ConformationsPage.tsx", "RankingPage.tsx", "ReactionWorkspacePanel.tsx", "ReactionsPage.tsx", "SavedAnalysesPage.tsx", "SpectroscopyPage.tsx", "SynthesisPage.tsx"]);
    assert.match(read("src", "App.tsx"), /getAppAnalysisLibrary/, "Properties lives in App.tsx");
    // The Multi-Catalytic page shell and its original ordered-sequence tool still use no library; only the workspace panel does.
    assert.doesNotMatch(read("src", "components", "MultiCatalyticPage.tsx"), /getAppAnalysisLibrary|SavedAnalysisControls/);
  });
});
