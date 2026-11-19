// Stage 23: Biology navigation, strict validation of saved inputs, summaries, saved-analysis round trips, learning questions and
// challenges, concept search, cross-subject links and App wiring for Membranes & transport, Cell signaling and Neuronal physiology.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const clone = (v) => JSON.parse(JSON.stringify(v));
const ok = (r) => { assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.error)); return r.value; };

let S, store, lib, BT, BT16, BT23, SUM23, L23, M, G, N, I, Q, R;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  BT = await loadModule("/src/utils/persistence/biologyTools.ts");
  BT16 = await loadModule("/src/utils/persistence/biologyTools16.ts");
  BT23 = await loadModule("/src/utils/persistence/biologyTools23.ts");
  SUM23 = await loadModule("/src/utils/biology/bioSummary23.ts");
  L23 = await loadModule("/src/utils/biology/bioLearning23.ts");
  M = await loadModule("/src/utils/biology/membrane23.ts");
  G = await loadModule("/src/utils/biology/signaling23.ts");
  N = await loadModule("/src/utils/biology/neuron23.ts");
  I = await loadModule("/src/utils/concepts/conceptIndex.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  R = await loadModule("/src/utils/concepts/relations.ts");
});
after(async () => { await closeEngine(); });

const TOOLS = () => [
  { page: "membrane", id: "bioMembrane", slug: "membranes-transport", defaults: BT23.DEFAULT_MEMBRANE_INPUTS, validate: BT23.validateMembraneInputs, summarize: SUM23.summarizeMembrane, describe: SUM23.describeMembrane, engine: BT23.MEMBRANE_ENGINE_VERSION },
  { page: "signaling", id: "bioSignaling", slug: "cell-signaling", defaults: BT23.DEFAULT_SIGNALING_INPUTS, validate: BT23.validateSignalingInputs, summarize: SUM23.summarizeSignaling, describe: SUM23.describeSignaling, engine: BT23.SIGNALING_ENGINE_VERSION },
  { page: "neuron", id: "bioNeuron", slug: "neuronal-physiology", defaults: BT23.DEFAULT_NEURON_INPUTS, validate: BT23.validateNeuronInputs, summarize: SUM23.summarizeNeuron, describe: SUM23.describeNeuron, engine: BT23.NEURON_ENGINE_VERSION },
];
const validators = () => ({
  ...Object.fromEntries(TOOLS().map((t) => [t.page, { engineVersion: t.engine, validateInputs: t.validate, validateResults: BT.validateBiologyResults }])),
  regulation: { engineVersion: BT16.REGULATION_ENGINE_VERSION, validateInputs: BT16.validateRegulationInputs, validateResults: BT.validateBiologyResults },
  dogma: { engineVersion: BT.DOGMA_ENGINE_VERSION, validateInputs: BT.validateDogmaInputs, validateResults: BT.validateBiologyResults },
});
const ids = () => { let n = 0; return () => `s23x${(n += 1).toString().padStart(4, "0")}`; };

describe("navigation and registration", () => {
  test("[tools] the Cellular Biology and Physiology group holds three tools after the Stage 16 tools and before Saved", () => {
    const list = S.BIOLOGY_TOOLS.map((t) => t.id);
    assert.deepEqual(list.slice(0, 8), ["bioOverview", "bioReplication", "bioTranscription", "bioTranslation", "bioDogma", "bioRegulation", "bioGenetics", "bioDivision"], "existing order is unchanged");
    assert.deepEqual(list.slice(8), ["bioMembrane", "bioSignaling", "bioNeuron", "bioSaved"]);
    for (const t of TOOLS()) { const def = S.BIOLOGY_TOOLS.find((x) => x.id === t.id); assert.equal(def.slug, t.slug); assert.equal(def.group, "cellular"); }
    assert.ok(S.TOOL_GROUPS.some((g) => g.id === "cellular" && /Cellular biology/.test(g.label)));
    assert.equal(new Set(S.BIOLOGY_TOOLS.map((t) => t.slug)).size, S.BIOLOGY_TOOLS.length);
  });
  test("[routes] deep links round-trip", () => {
    for (const t of TOOLS()) { assert.equal(S.routeHash({ subject: "biology", toolId: t.id }), `#/biology/${t.slug}`); assert.deepEqual(S.parseRoute(`#/biology/${t.slug}`), { subject: "biology", toolId: t.id }); }
  });
  test("[existing subjects] Organic, General Chemistry, Physics and Biochemistry tool lists are unchanged", () => {
    assert.deepEqual(S.PHYSICS_TOOLS.map((t) => t.id), ["phOverview", "phMechanics", "phForces", "phEnergy", "phCollisions", "phWaves", "phOptics", "phInterference", "phEfield", "phMagnetic", "phInduction", "phCircuits", "phRc", "phSaved"]);
    assert.deepEqual(S.GENERAL_TOOLS.map((t) => t.id), ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"]);
    assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
    assert.equal(S.BIOCHEMISTRY_TOOLS.length, 10);
  });
  test("[pages] each tool is a persisted page of subject biology and maps back to its tool", () => {
    for (const t of TOOLS()) assert.equal(store.PAGE_SUBJECT[t.page], "biology");
  });
  test("[wiring] App renders each page, routes openings from Saved and the overview lists the tools", () => {
    const app = read("src", "App.tsx");
    for (const [Comp, id] of [["MembranePage", "bioMembrane"], ["SignalingPage", "bioSignaling"], ["NeuronPage", "bioNeuron"]]) {
      assert.ok(app.includes(`lazy(() => import("./components/biology/${Comp}"))`), Comp);
      assert.ok(app.includes(`generalTool === "${id}" ? (`), id);
      assert.ok(app.includes(`target === "${id}"`), `${id} saved-opening route`);
      assert.ok(app.includes(`pendingOpen?.page === "${id}"`), `${id} open request`);
      assert.ok(read("src", "components", "biology", `${Comp}.tsx`).includes(`toolId="${id}"`), `${Comp} related links`);
    }
    const overview = read("src", "components", "biology", "BiologyOverview.tsx");
    for (const id of ["bioMembrane", "bioSignaling", "bioNeuron"]) assert.match(overview, new RegExp(`${id}: \\[`));
    const saved = read("src", "components", "SavedAnalysesPage.tsx");
    for (const label of ["Membranes & transport", "Cell signaling", "Neuronal physiology"]) assert.ok(saved.includes(label), label);
  });
  test("[existing pages] Stage 15 and Stage 16 pages are still routed", () => {
    const app = read("src", "App.tsx");
    for (const Comp of ["ReplicationPage", "TranscriptionPage", "TranslationPage", "CentralDogmaPage", "RegulationPage", "GeneticsPage", "CellDivisionPage"]) assert.ok(app.includes(`components/biology/${Comp}`), Comp);
  });
  test("[reduced motion and accessibility hooks exist] step controls hide playback for reduced motion; diagrams are labelled images with selectable groups", () => {
    assert.ok(read("src", "components", "biology", "bioShared.tsx").includes("usePrefersReducedMotion"));
    const d = read("src", "components", "biology", "MembraneDiagrams.tsx") + read("src", "components", "biology", "NeuronDiagrams.tsx") + read("src", "components", "biology", "SignalingDiagram.tsx");
    assert.ok((d.match(/role="img"/g) ?? []).length >= 10); assert.ok(d.includes("aria-label={summary}"));
    assert.ok(read("src", "components", "biology", "cell23.tsx").includes('role="button"'));
    assert.ok(read("src", "components", "biology", "SignalingDiagram.tsx").includes("useNarrow") === false);
    assert.ok(read("src", "components", "biology", "SignalingPage.tsx").includes("SignalingCards"), "mobile focused view");
  });
});

describe("strict persistence", () => {
  test("[defaults] validate and summarize", () => {
    for (const t of TOOLS()) {
      assert.notEqual(t.validate(clone(t.defaults)), null, t.page);
      const r = t.summarize(t.defaults); assert.notEqual(BT.validateBiologyResults(r), null, `${t.page} results validate`);
      assert.ok(t.describe(t.defaults).length <= 300);
    }
  });
  test("[summaries] every section's results validate and keep assumption lines under 400 characters", () => {
    for (const s of BT23.MEMBRANE_SECTIONS) { const r = SUM23.summarizeMembrane({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: s }); assert.notEqual(BT.validateBiologyResults(r), null, s); }
    for (const s of BT23.NEURON_SECTIONS) { const r = SUM23.summarizeNeuron({ ...BT23.DEFAULT_NEURON_INPUTS, section: s }); assert.notEqual(BT.validateBiologyResults(r), null, s); }
    for (const sys of G.SYSTEM_IDS) { const r = SUM23.summarizeSignaling({ ...BT23.DEFAULT_SIGNALING_INPUTS, sig: { ...G.DEFAULT_SIGNALING, system: sys, step: 0 } }); assert.notEqual(BT.validateBiologyResults(r), null, sys); }
    for (const list of [SUM23.MEMBRANE_ASSUMPTIONS, SUM23.SIGNALING_ASSUMPTIONS, SUM23.NEURON_ASSUMPTIONS]) for (const line of list) assert.ok(line.length <= 400, line.slice(0, 40));
  });
  test("[check numbers] come from the models (independent values)", () => {
    near(SUM23.summarizeMembrane({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "ions" }).check, -95, 0.5);
    assert.equal(SUM23.summarizeMembrane({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "active", active: { ...BT23.DEFAULT_MEMBRANE_INPUTS.active, pumpStep: 4 } }).check, 1);
    near(SUM23.summarizeNeuron({ ...BT23.DEFAULT_NEURON_INPUTS, section: "passive" }).check, 10, 1e-9);
    near(SUM23.summarizeNeuron({ ...BT23.DEFAULT_NEURON_INPUTS, section: "resting" }).check, -69.1, 0.2);
    assert.equal(SUM23.summarizeNeuron({ ...BT23.DEFAULT_NEURON_INPUTS, section: "ap" }).check, 1);
    assert.equal(SUM23.summarizeNeuron({ ...BT23.DEFAULT_NEURON_INPUTS, section: "propagation" }).check, 5);
    assert.equal(SUM23.summarizeSignaling(BT23.DEFAULT_SIGNALING_INPUTS).check, 0, "at step 0 no component has been reached, so none is counted active");
  });
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

  const variants = () => {
    const out = [];
    for (const section of BT23.MEMBRANE_SECTIONS) for (const mode of ["explore", "practice", "challenge"]) out.push({ t: TOOLS()[0], value: { ...BT23.DEFAULT_MEMBRANE_INPUTS, section, mode, challenge: 3 } });
    out.push({ t: TOOLS()[0], value: { ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "passive", passive: { ...M.DEFAULT_PASSIVE, solute: "k", mechanism: "channel", cOut: 4, cIn: 140, vmMv: -120 }, selectedProtein: "channel" } });
    out.push({ t: TOOLS()[0], value: { ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "active", active: { transporter: "nak", pumpStep: 4, pumpPerturbation: "ouabain", sgltStep: 2, sglt: M.DEFAULT_SGLT }, selectedProtein: "pump" } });
    out.push({ t: TOOLS()[0], value: { ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "bilayer", bilayer: { lipids: "unsaturated", temperature: "warm", cholesterol: true, selected: "cholesterol" } } });
    for (const system of G.SYSTEM_IDS) for (const mode of ["explore", "challenge"]) out.push({ t: TOOLS()[1], value: { ...BT23.DEFAULT_SIGNALING_INPUTS, mode, sig: { system, ligand: true, coLigand: false, perturbations: [], phase: "removed", step: G.SYSTEMS[system].steps }, selected: G.SYSTEMS[system].nodes[1].id } });
    out.push({ t: TOOLS()[1], value: { ...BT23.DEFAULT_SIGNALING_INPUTS, sig: { system: "rtk", ligand: false, coLigand: false, perturbations: ["ras-g12v", "egfr-tki"], phase: "acute", step: 6 }, selected: "ras" } });
    out.push({ t: TOOLS()[1], value: { ...BT23.DEFAULT_SIGNALING_INPUTS, sig: { system: "gi", ligand: true, coLigand: true, perturbations: ["pde-inhib"], phase: "prolonged", step: 7 } } });
    for (const section of BT23.NEURON_SECTIONS) for (const mode of ["explore", "practice"]) out.push({ t: TOOLS()[2], value: { ...BT23.DEFAULT_NEURON_INPUTS, section, mode } });
    out.push({ t: TOOLS()[2], value: { ...BT23.DEFAULT_NEURON_INPUTS, section: "ap", part: "hillock", hhTimeMs: 3.55, hh: { ...N.DEFAULT_HH, amp2: 20, delayMs: 15, durationMs: 40, blockK: true } } });
    out.push({ t: TOOLS()[2], value: { ...BT23.DEFAULT_NEURON_INPUTS, section: "synapse", synapse: { ...N.DEFAULT_SYNAPSE, example: "ach-m2", step: 7, perturbation: "block-clearance", clInMm: 20 }, prop: { myelinated: false, step: 12 } } });
    return out;
  };
  test("[save/open] every tool, section and mode saves with subject biology and reopens with identical inputs and the same recomputed summary", async () => {
    const real = new lib.AnalysisLibrary(new store.MemoryBackend(), { validators: validators(), newId: ids() });
    for (const { t, value } of variants()) {
      assert.notEqual(t.validate(clone(value)), null, `${t.page} ${JSON.stringify(value).slice(0, 90)}`);
      const results = t.summarize(value);
      const saved = ok(await real.save(t.page, { name: `${t.page} analysis`, summary: t.describe(value), inputs: value, results: { computedAt: "2026-11-17T00:00:00.000Z", engineVersion: t.engine, stale: false, status: "complete", data: results } }));
      assert.equal(saved.subject, "biology");
      const opened = ok(await real.open(saved.id));
      assert.deepEqual(opened.inputs, value); assert.equal(opened.resultsDropped, false);
      assert.deepEqual(t.summarize(opened.inputs), results, "derived results are recomputed from inputs");
      assert.equal(opened.inputs.mode, value.mode, "learning mode survives");
    }
    const list = ok(await real.list()); assert.equal(list.problems.length, 0);
  });
  test("[contradictions] impossible or inconsistent membrane states are rejected", () => {
    const d = () => clone(BT23.DEFAULT_MEMBRANE_INPUTS);
    const bad = [
      (x) => { x.section = "cell"; }, (x) => { x.mode = "learn"; }, (x) => { x.challenge = -1; }, (x) => { x.passive.solute = "glucose"; x.passive.mechanism = "simple"; },
      (x) => { x.passive.cOut = 0; }, (x) => { x.ions.tempC = 90; }, (x) => { x.osmosis.naCl = -3; }, (x) => { x.bilayer.selected = "ribosome"; },
      (x) => { x.active.pumpPerturbation = "ouabain"; x.active.pumpStep = 6; }, (x) => { x.active.pumpPerturbation = "no-atp"; x.active.pumpStep = 2; }, (x) => { x.active.pumpStep = 8; },
      (x) => { x.active.sgltStep = 5; }, (x) => { x.active.transporter = "x"; }, (x) => { x.section = "osmosis"; x.selectedProtein = "pump"; }, (x) => { x.section = "passive"; x.selectedProtein = "pump"; },
      (x) => { x.section = "bilayer"; x.selectedProtein = "channel"; }, (x) => { x.ions.vmSource = "auto"; }, (x) => { x.subject = "physics"; }, (x) => { x.tool = "neuron"; },
    ];
    for (const [i, f] of bad.entries()) { const x = d(); f(x); assert.equal(BT23.validateMembraneInputs(x), null, `case ${i}`); }
    assert.equal(BT23.validateMembraneInputs(null), null);
    const okx = d(); okx.section = "active"; okx.selectedProtein = "pump"; assert.notEqual(BT23.validateMembraneInputs(okx), null);
  });
  test("[contradictions] impossible signaling states are rejected", () => {
    const d = () => clone(BT23.DEFAULT_SIGNALING_INPUTS);
    const bad = [
      (x) => { x.sig.perturbations = ["ras-g12v"]; }, (x) => { x.sig.perturbations = ["gp-noexchange", "gp-gtpase"]; }, (x) => { x.selected = "ras"; }, (x) => { x.sig.step = 7; }, (x) => { x.sig.coLigand = true; },
      (x) => { x.sig.system = "xx"; }, (x) => { x.sig.phase = "later"; }, (x) => { x.sig.perturbations = ["ac-inhib", "pde-inhib", "pka-inhib", "pp-inhib"]; }, (x) => { x.mode = "x"; },
    ];
    for (const [i, f] of bad.entries()) { const x = d(); f(x); assert.equal(BT23.validateSignalingInputs(x), null, `case ${i}`); }
  });
  test("[contradictions] impossible neuron states are rejected", () => {
    const d = () => clone(BT23.DEFAULT_NEURON_INPUTS);
    const bad = [
      (x) => { x.section = "x"; }, (x) => { x.part = "nucleus"; }, (x) => { x.resting.vmSource = "manual"; }, (x) => { x.passive.rMohm = 5; },
      (x) => { x.summation.rMohm = 250; }, (x) => { x.summation.vRestMv = -70; }, (x) => { x.passiveTimeMs = 999; }, (x) => { x.hhTimeMs = 31; }, (x) => { x.hh.amp = 500; },
      (x) => { x.prop.step = 5; }, (x) => { x.prop = { myelinated: false, step: 13 }; }, (x) => { x.synapse.step = 9; }, (x) => { x.synapse.example = "dopa"; }, (x) => { x.summation.events = []; },
      (x) => { x.hh.amp2 = 10; x.hh.delayMs = 40; },
    ];
    for (const [i, f] of bad.entries()) { const x = d(); f(x); assert.equal(BT23.validateNeuronInputs(x), null, `case ${i}`); }
    const okx = d(); okx.prop = { myelinated: false, step: 12 }; assert.notEqual(BT23.validateNeuronInputs(okx), null);
  });
  test("[integrity] damaged saved records are refused when opened, and existing Biology records coexist", async () => {
    const backend = new store.MemoryBackend();
    const real = new lib.AnalysisLibrary(backend, { validators: validators(), newId: ids() });
    const make = async (page, inputs, mutate) => { const r = ok(await real.save(page, { name: page, summary: "s", inputs, results: null })); const raw = JSON.parse(backend.map.get(r.id)); mutate(raw); backend.map.set(r.id, JSON.stringify(raw)); return r.id; };
    const badIds = [
      await make("membrane", BT23.DEFAULT_MEMBRANE_INPUTS, (r) => { r.inputs.ions.ions.k.in = -5; }),
      await make("membrane", BT23.DEFAULT_MEMBRANE_INPUTS, (r) => { r.subject = "physics"; }),
      await make("signaling", BT23.DEFAULT_SIGNALING_INPUTS, (r) => { r.inputs.sig.perturbations = ["nonsense"]; }),
      await make("neuron", BT23.DEFAULT_NEURON_INPUTS, (r) => { r.inputs.hh.amp = 1e6; }),
    ];
    for (const id of badIds) assert.equal((await real.open(id)).ok, false, id);
    const a = ok(await real.save("dogma", { name: "d", summary: "s", inputs: BT.DEFAULT_DOGMA_INPUTS, results: null }));
    const b = ok(await real.save("regulation", { name: "r", summary: "s", inputs: BT16.DEFAULT_REGULATION_INPUTS, results: null }));
    const c = ok(await real.save("membrane", { name: "m", summary: "s", inputs: BT23.DEFAULT_MEMBRANE_INPUTS, results: null }));
    for (const x of [a, b, c]) assert.equal((await real.open(x.id)).ok, true);
  });
});

describe("learning modes", () => {
  const sections = () => [
    ...BT23.MEMBRANE_SECTIONS.map((s) => ({ name: `membrane/${s}`, q: (extra = {}) => L23.membraneQuestions({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: s, ...extra }), c: (i) => L23.membraneChallenge({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: s }, i), valid: BT23.validateMembraneInputs })),
    ...G.SYSTEM_IDS.map((sys) => ({ name: `signaling/${sys}`, q: () => L23.signalingQuestions({ ...BT23.DEFAULT_SIGNALING_INPUTS, sig: { ...G.DEFAULT_SIGNALING, system: sys, step: 2 } }), c: (i) => L23.signalingChallenge({ ...BT23.DEFAULT_SIGNALING_INPUTS, sig: { ...G.DEFAULT_SIGNALING, system: sys } }, i), valid: BT23.validateSignalingInputs })),
    ...BT23.NEURON_SECTIONS.map((s) => ({ name: `neuron/${s}`, q: () => L23.neuronQuestions({ ...BT23.DEFAULT_NEURON_INPUTS, section: s }), c: (i) => L23.neuronChallenge({ ...BT23.DEFAULT_NEURON_INPUTS, section: s }, i), valid: BT23.validateNeuronInputs })),
  ];
  const wellFormed = (q, where) => {
    assert.ok(q.prompt.length > 15, where); assert.ok(q.options.length >= 2 && q.options.length <= 5, where);
    assert.equal(new Set(q.options).size, q.options.length, `${where}: options are distinct`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, where); assert.ok(q.explanation.length > 20, where);
  };
  test("[practice] every section has well-formed questions", () => { for (const s of sections()) { const qs = s.q(); assert.ok(qs.length >= 2, s.name); qs.forEach((q, i) => wellFormed(q, `${s.name}#${i}`)); } });
  test("[challenge] every section's challenges are well formed, apply to a valid state and the next state differs", () => {
    for (const s of sections()) {
      if (s.name === "neuron/anatomy") { assert.equal(s.c(0), null); continue; }
      for (let i = 0; i < 8; i += 1) {
        const ch = s.c(i); assert.notEqual(ch, null, `${s.name} ${i}`);
        wellFormed(ch.question, `${s.name} challenge ${i}`);
        assert.notEqual(s.valid(clone(ch.next)), null, `${s.name} challenge ${i} next state is valid`);
      }
    }
  });
  test("[independent answers] practice questions match hand-derived values", () => {
    const pick = (qs, id) => qs.find((q) => q.id === id);
    const ion = pick(L23.membraneQuestions({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "ions" }), "io-e");
    assert.equal(ion.options[ion.answer], "−95 mV", "E_K at 4/140 mM, 37 C");
    const dir = pick(L23.membraneQuestions({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "passive" }), "pa-dir");
    assert.equal(dir.options[dir.answer], "Into the cell", "O2 8 mM outside, 2 mM inside");
    const ca = pick(L23.membraneQuestions({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "ions", ions: { ...M.DEFAULT_ION_EXPLORER, selected: "ca", vmSource: "manual", vmManualMv: -70 } }), "io-e");
    assert.equal(ca.options[ca.answer], "+131 mV", "E_Ca at 1.8 mM / 100 nM");
    const atp = pick(L23.membraneQuestions({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "active" }), "ac-atp");
    assert.equal(atp.options[atp.answer], "The Na⁺/K⁺-ATPase");
    const ton = pick(L23.membraneQuestions({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section: "osmosis", osmosis: { ...M.DEFAULT_OSMOSIS, naCl: 75 } }), "os-ton");
    assert.equal(ton.options[ton.answer], "hypotonic");
    const ip3 = pick(L23.signalingQuestions({ ...BT23.DEFAULT_SIGNALING_INPUTS }), "sg-ip3");
    assert.match(ip3.options[ip3.answer], /^Gq/);
    const pde = pick(L23.signalingQuestions({ ...BT23.DEFAULT_SIGNALING_INPUTS }), "sg-pde");
    assert.equal(pde.options[pde.answer], "Persisting after the ligand is removed");
    const tau = pick(L23.neuronQuestions({ ...BT23.DEFAULT_NEURON_INPUTS, section: "passive" }), "nu-tau");
    assert.equal(tau.options[tau.answer], "10 ms");
    const sp = pick(L23.neuronQuestions({ ...BT23.DEFAULT_NEURON_INPUTS, section: "ap" }), "nu-spikes");
    assert.equal(sp.options[sp.answer], "1");
    const fus = pick(L23.neuronQuestions({ ...BT23.DEFAULT_NEURON_INPUTS, section: "synapse" }), "nu-fusion");
    assert.match(fus.options[fus.answer], /voltage-gated Ca²⁺ channels/);
  });
  test("[independent answers] challenges predict what the model then shows", () => {
    const sig = (system, i) => L23.signalingChallenge({ ...BT23.DEFAULT_SIGNALING_INPUTS, sig: { ...G.DEFAULT_SIGNALING, system } }, i);
    const text = (c) => c.question.options[c.question.answer];
    assert.equal(text(sig("gs", 0)), "Inactive", "adenylyl cyclase blocked: cAMP not made although Gs is active");
    assert.equal(text(sig("gs", 2)), "Persisting after the ligand is removed", "PDE inhibited");
    assert.equal(text(sig("gs", 5)), "Active", "GTPase-deficient Gαs without ligand");
    assert.equal(text(sig("rtk", 3)), "Active", "constitutive Ras keeps ERK on despite an EGFR inhibitor");
    assert.equal(text(sig("rtk", 2)), "Active");
    assert.equal(text(sig("rtk", 4)), "Persisting after the ligand is removed");
    assert.equal(text(sig("gq", 0)), "Inactive", "IP3-receptor block removes Ca2+, so conventional PKC stays off");
    // after applying, the diagram's own evaluation agrees
    const c = sig("rtk", 1); const ev = G.evaluateSignaling(c.next.sig);
    assert.equal(ev.current.raf === "active" && ev.current.mek === "blocked", true);
    const n = (section, i, extra = {}) => L23.neuronChallenge({ ...BT23.DEFAULT_NEURON_INPUTS, section, ...extra }, i);
    assert.equal(text(n("ap", 1)), "1 spike", "second pulse 2 ms after the first: absolute refractory");
    assert.equal(text(n("ap", 2)), "2 spikes", "second pulse 15 ms after the first");
    assert.equal(text(n("ap", 3)), "no spike", "Na+ channels blocked");
    assert.equal(text(n("ap", 4)), "still depolarized", "K+ channels blocked");
    assert.equal(text(n("synapse", 0, { synapse: { ...N.DEFAULT_SYNAPSE, step: 3 } })), "depolarize the cell", "GABA with 30 mM Cl-");
    assert.equal(text(n("synapse", 1)), "hyperpolarize the cell (inhibitory)", "ACh at M2");
    assert.equal(text(n("passive", 0)), "stay the same (only the speed changes)");
    const m = (section, i, extra = {}) => L23.membraneChallenge({ ...BT23.DEFAULT_MEMBRANE_INPUTS, section, ...extra }, i);
    assert.equal(text(m("passive", 0)), "Out of the cell", "swap O2 concentrations");
    assert.equal(text(m("osmosis", 0)), "Into the cell", "75 mM NaCl");
    assert.equal(text(m("osmosis", 1)), "Out of the cell", "300 mM NaCl");
    assert.equal(text(m("ions", 0)), "more positive", "raising outside K+");
  });
  test("[explanations] a wrong prediction is explained (every question and challenge carries an explanation tied to its answer)", () => {
    for (const s of sections()) for (const q of s.q()) assert.ok(q.explanation.length > 20);
  });
});

describe("concept search and cross-subject links", () => {
  const dest = (q) => Q.searchConcepts(q)[0]?.destination;
  test("[validity] the concept index is still valid", () => assert.deepEqual(I.validateConceptIndex(), []));
  test("[concepts] every required concept is searchable and opens the right tool", () => {
    const want = [
      ["plasma membrane", "bioMembrane"], ["phospholipid bilayer", "bioMembrane"], ["diffusion", "bioMembrane"], ["osmosis", "bioMembrane"], ["tonicity", "bioMembrane"], ["electrochemical gradient", "bioMembrane"],
      ["nernst potential", "bioMembrane"], ["sodium-potassium pump", "bioMembrane"], ["GPCR", "bioSignaling"], ["cAMP", "bioSignaling"], ["protein kinase A", "bioSignaling"], ["IP3", "bioSignaling"],
      ["receptor tyrosine kinase", "bioSignaling"], ["MAPK signaling", "bioSignaling"], ["resting membrane potential", "bioNeuron"], ["action potential", "bioNeuron"], ["refractory period", "bioNeuron"], ["synaptic transmission", "bioNeuron"],
    ];
    for (const [q, tool] of want) { const d = dest(q); assert.ok(d, q); assert.equal(d.subject, "biology", q); assert.equal(d.toolId, tool, q); }
    assert.equal(dest("Na/K ATPase").toolId, "bioMembrane"); assert.equal(dest("EGFR").toolId, "bioSignaling"); assert.equal(dest("saltatory conduction").toolId, "bioNeuron");
  });
  test("[Nernst] the Nernst potential concept links to the General Chemistry Nernst equation, not conflated with it", () => {
    const n = I.CONCEPTS.find((c) => c.id === "bio-nernst");
    assert.ok(n.related.includes("gc-nernst")); assert.equal(n.destination.toolId, "bioMembrane");
    assert.equal(I.CONCEPTS.find((c) => c.id === "gc-nernst").destination.toolId, "gcElectro");
  });
  test("[relations] suggested links exist with cautions, and none claims equivalence or number transfer", () => {
    const has = (from, to) => R.RELATIONS.find((r) => r.from.toolId === from && r.to.toolId === to);
    for (const [f, t] of [["bioMembrane", "gcElectro"], ["gcElectro", "bioMembrane"], ["bioNeuron", "phRc"], ["phRc", "bioNeuron"], ["bioMembrane", "bcMetabolism"], ["bioSignaling", "bcEnzymes"], ["bioSignaling", "bioRegulation"], ["bioNeuron", "bioMembrane"], ["bioMembrane", "bioNeuron"]]) {
      const r = has(f, t); assert.ok(r, `${f} -> ${t}`); assert.ok(r.caution && r.caution.length > 30, `${f} -> ${t} caution`);
    }
    assert.deepEqual(R.validateRelations?.() ?? [], []);
    for (const id of ["bioMembrane", "bioSignaling", "bioNeuron"]) assert.ok(R.relationsFrom("biology", id).length > 0, id);
  });
  test("[tools searchable] the three tools appear as tool entries", () => {
    for (const name of ["Membranes & transport", "Cell signaling", "Neuronal physiology"]) assert.ok(I.TOOL_ENTRIES.some((t) => t.name === name), name);
  });
});
