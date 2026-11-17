// Stage 11: subject registry and routes, General Chemistry saved-workspace round trips (with subject identity),
// compatibility of existing Organic Chemistry navigation and saved records, and App wiring.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const clone = (v) => JSON.parse(JSON.stringify(v));

let S, store, lib, libApp, W, SUM, TK, CW;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  W = await loadModule("/src/utils/persistence/generalChemWorkspace.ts");
  SUM = await loadModule("/src/utils/generalChem/summary.ts");
  TK = await loadModule("/src/utils/chartTicks.ts");
  CW = await loadModule("/src/utils/persistence/conformationsWorkspace.ts");
});
after(async () => { await closeEngine(); });

const ORGANIC_IDS = ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"];

describe("subject registry", () => {
  test("[organic] the Organic Chemistry tools, their ids and their order are unchanged", () => {
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ORGANIC_IDS);
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.label), ["Properties", "Ranking", "Spectroscopy", "Conformations", "Reactions", "Multi-Step", "Multi-Catalytic", "Saved"]);
    assert.equal(S.SUBJECT_TOOLS.organic, S.ORGANIC_TOOLS);
  });
  test("[subjects] five subjects; Organic, General, Physics and Biology are available, Biochemistry became available in Stage 17", () => {
    assert.deepEqual(S.SUBJECTS.map((s) => s.id), ["organic", "general", "physics", "biology", "biochemistry"]);
    for (const id of ["organic", "general", "physics", "biology", "biochemistry"]) assert.equal(S.isAvailable(id), true, id);
    assert.deepEqual(S.SUBJECT_TOOLS.biochemistry.map((t) => t.id), ["bcOverview", "bcAminoAcids", "bcProteins", "bcEnzymes", "bcGlycolysis", "bcGluconeogenesis", "bcTca", "bcEtc", "bcMetabolism", "bcSaved"]);
  });
  test("[modes] Workbench: Organic, General, Physics; Interactive Learning: Biology, Biochemistry", () => {
    const by = (mode) => S.SUBJECTS.filter((s) => s.mode === mode).map((s) => s.id);
    assert.deepEqual(by("workbench"), ["organic", "general", "physics"]); // Biology is a learning subject
    assert.deepEqual(by("learning"), ["biology", "biochemistry"]);
  });
  test("[general] tool ids, slugs and groups are unique and General has an Overview, the analyzer and Saved", () => {
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
    for (const subject of S.SUBJECTS) {
      const tools = S.SUBJECT_TOOLS[subject.id];
      assert.equal(new Set(tools.map((t) => t.id)).size, tools.length);
      assert.equal(new Set(tools.map((t) => t.slug)).size, tools.length);
    }
  });
  test("[general] no planned item is presented as a tool: the planned list never duplicates a tool label", () => {
    const labels = new Set(S.GENERAL_TOOLS.map((t) => t.label.toLowerCase()));
    for (const item of S.getSubject("general").planned) assert.ok(!labels.has(item.toLowerCase()));
    assert.ok(!S.getSubject("general").planned.some((p) => /acid|titration/i.test(p)), "acid–base is implemented, so it is not listed as planned");
  });
});

describe("routes", () => {
  test("[routes] every available tool round-trips through its hash", () => {
    for (const subject of ["organic", "general", "physics"]) {
      for (const tool of S.SUBJECT_TOOLS[subject]) {
        const hash = S.routeHash({ subject, toolId: tool.id });
        assert.deepEqual(S.parseRoute(hash), { subject, toolId: tool.id }, hash);
      }
    }
    assert.equal(S.routeHash({ subject: "general", toolId: "gcAcidBase" }), "#/general/acid-base-titration");
    assert.equal(S.routeHash({ subject: "organic", toolId: "multiStep" }), "#/organic/multi-step");
  });
  test("[routes] a bare subject goes to its first tool; planned, unknown and malformed routes are ignored", () => {
    assert.deepEqual(S.parseRoute("#/general"), { subject: "general", toolId: "gcOverview" });
    assert.deepEqual(S.parseRoute("#/organic/"), { subject: "organic", toolId: "analysis" });
    for (const bad of ["", "#", "#/physics/nope", "#/biology/cells", "#/biochemistry/nope", "#/general/nope", "#/../x", "#/General", "general", "#/organic/reactions/extra", "#/organic/<script>"]) {
      assert.equal(S.parseRoute(bad), null, bad);
    }
  });
});

describe("App wiring (source checks for behaviour that must not regress)", () => {
  const app = read("src", "App.tsx");
  test("[organic] the existing organic navigation lines are intact", () => {
    assert.match(app, /onSelectTool=\{\(id\) => switchPage\(id as AppPage\)\}/);
    assert.match(app, /switchPage\(target, \{ keepOpenRequest: true \}\)/);
    assert.match(app, /ready: recovery !== null && activePage === "analysis" && isMainEditorReady/);
  });
  test("[general] subject switching waits for the page being left to save, like tab switching", () => {
    const fn = app.slice(app.indexOf("const switchSubject"), app.indexOf("const openSavedAnalysis"));
    assert.match(fn, /runLeaveHooks\(\)/);
    assert.match(fn, /setIsMainEditorReady\(false\)/);
  });
  test("[general] a saved General record switches subject and keeps its open request", () => {
    assert.match(app, /target === "gcAcidBase"/);
    assert.match(app, /switchSubject\("general", \{ keepOpenRequest: true, tool: target \}\)/);
  });
  test("[general] planned subjects cannot reach a tool panel: only 'general', 'physics', 'biology' and 'biochemistry' have branches", () => {
    assert.match(app, /activeSubject === "general" \? \(/);
    assert.match(app, /activeSubject === "physics" \? \(/);
    assert.match(app, /activeSubject === "biology" \? \(/);
    assert.match(app, /activeSubject === "biochemistry" \? \(/);
  });
  test("[shell] the picker only selects available subjects", () => {
    const picker = read("src", "components", "shell", "SubjectPicker.tsx");
    assert.match(picker, /if \(subject\.status === "planned"\) onPreview\(subject\);\s*else onSelectSubject\?\.\(subject\.id\)/);
  });
});

const inputs = (over = {}) => ({ ...clone(W.DEFAULT_GENCHEM_INPUTS), ...over });
const validators = () => ({
  genchem: { engineVersion: W.GENCHEM_ENGINE_VERSION, validateInputs: W.validateGenChemInputs, validateResults: W.validateGenChemResults },
  conformations: { engineVersion: CW.CONFORMATIONS_ENGINE_VERSION, validateInputs: CW.validateConformationsInputs, validateResults: CW.validateConformationsResults },
});
const ok = (r) => { assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.error)); return r.value; };

describe("General Chemistry inputs validation", () => {
  test("[inputs] defaults validate and come back unchanged; they describe the documented example", () => {
    const v = W.validateGenChemInputs(clone(W.DEFAULT_GENCHEM_INPUTS));
    assert.deepEqual(v, W.DEFAULT_GENCHEM_INPUTS);
    assert.equal(v.subject, "general");
  });
  test("[inputs] each view and weak/strong variants round trip exactly", () => {
    for (const view of ["titration", "solution", "buffer"]) {
      for (const analyte of ["strong-acid", "weak-acid", "strong-base", "weak-base"]) {
        const weak = analyte.startsWith("weak");
        const value = inputs({
          view,
          titration: { analyte, c0: 0.05, v0: 20, ...(weak ? { pK: 9.25 } : {}), ct: 0.1, vt: 7.5 },
          solution: { kind: analyte, concentration: 1e-3, ...(weak ? { pK: 3.2 } : {}), startVolumeMl: 5, dilutedVolumeMl: 50 },
          buffer: { family: weak && analyte === "weak-base" ? "base" : "acid", pK: 4.76, weak: 0.2, conjugate: 0.1 },
        });
        assert.deepEqual(W.validateGenChemInputs(clone(value)), value, `${view} ${analyte}`);
      }
    }
  });
  test("[inputs] malformed or out-of-model inputs are rejected, not coerced", () => {
    const base = W.DEFAULT_GENCHEM_INPUTS;
    const bad = [
      null, [], "x", {}, 5,
      { ...base, subject: "organic" },
      { ...base, tool: "stoichiometry" },
      { ...base, view: "polyprotic" },
      { ...base, titration: { ...base.titration, c0: -1 } },
      { ...base, titration: { ...base.titration, c0: "0.1" } },
      { ...base, titration: { ...base.titration, analyte: "diprotic" } },
      { ...base, titration: { ...base.titration, vt: 1e6 } },
      { ...base, titration: { ...base.titration, pK: 99 } },
      { ...base, solution: { ...base.solution, dilutedVolumeMl: 1 } },
      { ...base, solution: { ...base.solution, concentration: NaN } },
      { ...base, buffer: { ...base.buffer, family: "salt" } },
      { ...base, buffer: { ...base.buffer, weak: 0 } },
    ];
    for (const value of bad) assert.equal(W.validateGenChemInputs(value), null, JSON.stringify(value));
  });
  test("[results] results validate; a damaged summary is refused", () => {
    const r = SUM.summarize(W.DEFAULT_GENCHEM_INPUTS);
    assert.deepEqual(W.validateGenChemResults(clone(r)), r);
    for (const bad of [null, { ...r, pH: 99 }, { ...r, pH: "7" }, { ...r, view: "x" }, { ...r, headline: [1] }, { ...r, engineVersion: 1.5 }]) {
      assert.equal(W.validateGenChemResults(bad), null);
    }
  });
});

describe("General Chemistry in the Saved Analyses library", () => {
  test("[subject] PAGE_SUBJECT: every persisted page names a subject; all existing pages are organic, genchem is general", () => {
    for (const page of ["synthesis", "properties", "reactions", "spectroscopy", "ranking", "multicatalytic", "conformations"]) assert.equal(store.PAGE_SUBJECT[page], "organic", page);
    assert.equal(store.PAGE_SUBJECT.genchem, "general");
  });
  test("[save/open] a saved analysis stores its subject explicitly and reopens with identical inputs", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: (() => { let n = 0; return () => `gcbb${(n += 1).toString().padStart(4, "0")}`; })() });
    const value = inputs({ view: "titration", titration: { analyte: "weak-acid", c0: 0.1, v0: 25, pK: 4.76, ct: 0.1, vt: 12.5 } });
    const results = SUM.summarize(value);
    const saved = ok(await real.save("genchem", {
      name: "Acetic acid titration",
      summary: W.describeGenChemAnalysis(value, results),
      inputs: value,
      results: { computedAt: "2026-11-11T00:00:00.000Z", engineVersion: W.GENCHEM_ENGINE_VERSION, stale: false, status: "complete", data: results },
    }));
    assert.equal(saved.page, "genchem");
    assert.equal(saved.subject, "general");
    const raw = JSON.parse(backend.map.get(saved.id));
    assert.equal(raw.subject, "general");
    assert.equal(raw.page, "genchem");
    assert.equal(raw.inputs.subject, "general");
    const opened = ok(await real.open(saved.id));
    assert.deepEqual(opened.inputs, value);
    assert.equal(opened.results.data.pH, results.pH);
    // reopening recomputes the same headline from the inputs
    assert.deepEqual(SUM.summarize(opened.inputs).headline, results.headline);
    // the list shows it with its subject
    const list = ok(await real.list());
    assert.equal(list.items.find((i) => i.id === saved.id).subject, "general");
  });
  test("[save/open] all three views survive a save and open round trip", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: (() => { let n = 0; return () => `gccc${(n += 1).toString().padStart(4, "0")}`; })() });
    for (const view of ["titration", "solution", "buffer"]) {
      const value = inputs({ view });
      const results = SUM.summarize(value);
      assert.ok(results, view);
      const saved = ok(await real.save("genchem", { name: view, summary: "s", inputs: value, results: { computedAt: "2026-11-11T00:00:00.000Z", engineVersion: 1, stale: false, status: "complete", data: results } }));
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value, view);
    }
  });
  test("[legacy] a record written before Stage 11 (no subject field) is read as Organic Chemistry and still opens", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: () => "legacy000001" });
    const conf = { source: { kind: "smiles", text: "CC1CCCCC1" }, mode: "chair", chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: {} }, torsion: { front: null, rear: null, frontRef: null, rearRef: null, rotation: 0 }, comparison: [] };
    const saved = ok(await real.save("conformations", { name: "Methylcyclohexane", summary: "s", inputs: conf, results: null }));
    const raw = JSON.parse(backend.map.get(saved.id));
    delete raw.subject; // what an older build wrote
    backend.map.set(saved.id, JSON.stringify(raw));
    const list = ok(await real.list());
    assert.equal(list.problems.length, 0, JSON.stringify(list.problems));
    assert.equal(list.items[0].subject, "organic");
    const opened = ok(await real.open(saved.id));
    assert.deepEqual(opened.inputs, conf);
  });
  test("[integrity] a record whose subject contradicts its page is reported as damaged, never opened", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: () => "tamper000001" });
    const value = inputs();
    const saved = ok(await real.save("genchem", { name: "x", summary: "s", inputs: value, results: null }));
    const raw = JSON.parse(backend.map.get(saved.id));
    raw.subject = "organic";
    backend.map.set(saved.id, JSON.stringify(raw));
    const list = ok(await real.list());
    assert.equal(list.items.length, 0);
    assert.equal(list.problems.length, 1);
    assert.match(list.problems[0].message, /subject/);
    assert.equal((await real.open(saved.id)).ok, false);
  });
  test("[integrity] a record with invalid chemistry inputs is not opened", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: () => "badin0000001" });
    const saved = ok(await real.save("genchem", { name: "x", summary: "s", inputs: inputs(), results: null }));
    const raw = JSON.parse(backend.map.get(saved.id));
    raw.inputs.titration.c0 = -5;
    backend.map.set(saved.id, JSON.stringify(raw));
    const opened = await real.open(saved.id);
    assert.equal(opened.ok, false);
  });
  test("[pages] genchem is openable and routes to the General Chemistry analyzer; organic routes are unchanged", () => {
    assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes("genchem"));
    assert.equal(libApp.ANALYSIS_APP_PAGE.genchem, "gcAcidBase");
    assert.equal(libApp.ANALYSIS_APP_PAGE.synthesis, "multiStep");
    assert.equal(libApp.ANALYSIS_APP_PAGE.ranking, "acidBase");
    assert.equal(libApp.ANALYSIS_APP_PAGE.properties, "analysis");
    assert.equal(libApp.ANALYSIS_APP_PAGE.conformations, "conformations");
  });
  test("[app] the app library registers the genchem validators and the page list used by the library", () => {
    const src = read("src", "utils", "persistence", "analysisLibraryApp.ts");
    assert.match(src, /genchem: \{\s*engineVersion: GENCHEM_ENGINE_VERSION,\s*validateInputs: validateGenChemInputs,\s*validateResults: validateGenChemResults,/);
    assert.match(read("src", "utils", "persistence", "analysisLibrary.ts"), /"conformations", "genchem", "equilibrium", "kinetics", "thermo", "stoichiometry", "gaslaws", "electrochem", "mechanics", "circuits", "rc", "forces", "energy", "collisions", "waves", "optics", "interference", "replication", "transcription", "translation", "dogma", "regulation", "genetics", "celldivision", "membrane", "signaling", "neuron", "aminoacids", "proteins", "enzymes", "glycolysis", "gluconeogenesis", "tca", "etc", "metabolism"]/);
  });
  test("[workspace] autosave store keeps the General Chemistry workspace separate from every organic page", async () => {
    const backend = new store.MemoryBackend();
    const ws = new store.WorkspaceStore(backend);
    const value = inputs();
    await ws.save("genchem", { inputs: value, results: null });
    assert.equal((await ws.load("conformations")).kind, "none");
    const loaded = await ws.load("genchem");
    assert.equal(loaded.kind, "ok");
    assert.deepEqual(loaded.record.inputs, value);
  });
});

describe("chart ticks", () => {
  test("[ticks] nice, ascending, inside the domain, and sensible counts", () => {
    assert.deepEqual(TK.niceTicks(0, 14, 7), [0, 2, 4, 6, 8, 10, 12, 14]);
    const t = TK.niceTicks(0, 50, 7);
    assert.deepEqual(t, [0, 10, 20, 30, 40, 50]);
    const u = TK.niceTicks(0, 0.0123, 5);
    assert.ok(u[0] === 0 && u.every((v, i) => i === 0 || v > u[i - 1]) && u[u.length - 1] <= 0.0123 + 1e-12);
    assert.deepEqual(TK.niceTicks(3, 3), [3]);
  });
});
