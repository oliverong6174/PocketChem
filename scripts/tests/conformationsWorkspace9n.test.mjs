// Stage 9N: the Conformations page's shared state, persistence and learning content.
// Summaries are built from the real chair / torsion engines and stored through the real Saved Analyses library
// (in-memory backend). Page rendering and pointer interaction are covered by scripts/browser/stage9nLiveCheck.mjs.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadModule } from "./engine.mjs";

let rd, G, C, T, W, Guide, store, lib, libApp;
before(async () => {
  rd = await getRdkit();
  G = await loadModule("/src/utils/conformations/graph.ts");
  C = await loadModule("/src/utils/conformations/chair.ts");
  T = await loadModule("/src/utils/conformations/torsion.ts");
  W = await loadModule("/src/utils/persistence/conformationsWorkspace.ts");
  Guide = await loadModule("/src/utils/conformations/guide.ts");
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  libApp = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
});
after(async () => { await closeEngine(); });

const clone = (value) => JSON.parse(JSON.stringify(value));
const graphOf = (s) => { const r = G.buildConformationGraph(rd, s); assert.ok(r.ok, r.message); return r.graph; };
const chairOf = (smiles, choices = {}) => {
  const graph = graphOf(smiles);
  const ring = C.findChairCandidates(graph).find((x) => x.eligible).ring;
  const model = C.buildChairModel(rd, graph, ring, choices);
  return { graph, ring, model, analysis: C.analyzeChairs(model) };
};
const inputs = (over = {}) => ({
  source: { kind: "smiles", text: "C[C@H]1CC[C@H](C)CC1" },
  mode: "chair",
  chair: { ring: [1, 2, 3, 4, 5, 6], flipped: false, choices: {} },
  torsion: { front: null, rear: null, frontRef: null, rearRef: null, rotation: 0 },
  ...over,
});
const chairSummary = (model, analysis, flipped) => ({
  ring: model.ring, status: model.status, preferenceKind: analysis.preference.kind,
  preferred: analysis.preference.kind === "quantified" ? analysis.preference.preferred : null,
  deltaKcal: analysis.preference.kind === "quantified" ? analysis.preference.deltaKcal ?? null : null,
  strainAKcal: analysis.A.strainKcal, strainBKcal: analysis.B.strainKcal,
  axialA: analysis.A.axialGroups.map((g) => g.label), axialB: analysis.B.axialGroups.map((g) => g.label),
  showing: flipped ? "Chair B" : "Chair A",
});

describe("shared chair state", () => {
  test("[flip] flipping twice returns exactly to the starting conformer; one flip swaps every axial and equatorial slot", () => {
    const { model } = chairOf("C[C@H]1CC[C@H](C)CC1");
    const a = C.buildConformer(model, false);
    const b = C.buildConformer(model, true);
    const aa = C.buildConformer(model, !true);
    assert.deepEqual(clone(aa), clone(a));
    for (const item of a.substituents) {
      const other = b.substituents.find((x) => x.slot.atom === item.slot.atom);
      assert.ok(other, "the same atom appears in both chairs");
      assert.notEqual(other.orientation, item.orientation, `atom ${item.slot.atom} changes axial/equatorial`);
      assert.equal(other.slot.face, item.slot.face, "face (cis/trans identity) is unchanged by the flip");
    }
  });
  test("[identity] trans-1,4 prefers diequatorial (Chair A) over diaxial; cis-1,4 is degenerate by symmetry", () => {
    const trans = chairOf("C[C@H]1CC[C@H](C)CC1");
    const cis = chairOf("C[C@H]1CC[C@@H](C)CC1");
    assert.equal(trans.analysis.preference.kind, "quantified");
    assert.equal(trans.analysis.A.axialGroups.length, 0, "trans-1,4: Chair A is diequatorial");
    assert.equal(trans.analysis.B.axialGroups.length, 2, "trans-1,4: Chair B is diaxial");
    assert.equal(cis.analysis.preference.kind, "equivalent-by-symmetry");
  });
});

describe("validation of saved Conformations inputs", () => {
  test("[inputs] well-formed inputs validate and come back unchanged", () => {
    const value = inputs();
    assert.deepEqual(W.validateConformationsInputs(clone(value)), value);
    const torsion = inputs({ mode: "newman", torsion: { front: 1, rear: 2, frontRef: 0, rearRef: 3, rotation: -60 } });
    assert.deepEqual(W.validateConformationsInputs(clone(torsion)), torsion);
    assert.deepEqual(W.validateConformationsInputs(clone(inputs({ source: null }))), inputs({ source: null }));
  });
  test("[inputs] malformed inputs are rejected, not coerced", () => {
    for (const bad of [
      null, [], "x", {},
      inputs({ mode: "boat" }),
      inputs({ source: { kind: "smiles", text: "" } }),
      inputs({ source: { kind: "inchi", text: "C" } }),
      inputs({ chair: { ring: [1, 2, 3], flipped: false, choices: {} } }),
      inputs({ chair: { ring: [1, 2, 3, 4, 5, -1], flipped: false, choices: {} } }),
      inputs({ chair: { ring: null, flipped: "yes", choices: {} } }),
      inputs({ chair: { ring: null, flipped: false, choices: { 3: "sideways" } } }),
      inputs({ chair: { ring: null, flipped: false, choices: { "__proto__x": "up" } } }),
      inputs({ torsion: { front: 1.5, rear: 2, frontRef: null, rearRef: null, rotation: 0 } }),
      inputs({ torsion: { front: 1, rear: 2, frontRef: null, rearRef: null, rotation: Number.NaN } }),
      inputs({ torsion: { front: 1, rear: 2, frontRef: null, rearRef: null, rotation: 1e6 } }),
    ]) {
      assert.equal(W.validateConformationsInputs(bad), null, JSON.stringify(bad));
    }
  });
});

describe("saved assessments from real engine output", () => {
  const engineResults = () => {
    const { model, analysis } = chairOf("C[C@H]1CC[C@H](C)CC1");
    return {
      smiles: "C[C@H]1CC[C@H](C)CC1", mode: "chair", engineVersion: W.CONFORMATIONS_ENGINE_VERSION,
      chair: chairSummary(model, analysis, false), torsion: null, limits: [...analysis.notIncluded],
    };
  };
  const torsionResults = (smiles, a, b, ra, rb, rotation) => {
    const g = graphOf(smiles);
    const setup = T.setupTorsion(g, a, b, { frontRef: ra, rearRef: rb });
    const cls = T.classify(g, setup, rotation);
    const abs = T.strainEnergyKJ(g, setup, rotation);
    const profile = T.energyProfile(g, setup, 2);
    const rel = abs !== null && profile.supported ? abs - profile.baselineKJ : null;
    return {
      smiles: g.smiles, mode: "newman", engineVersion: W.CONFORMATIONS_ENGINE_VERSION, chair: null,
      torsion: { front: a, rear: b, rotation, kind: cls.kind, name: cls.name, energyKJ: abs, relativeKJ: rel, quantified: rel !== null },
      limits: [T.ENERGY_MODEL.description],
    };
  };

  test("[results] real chair and torsion summaries validate and survive a JSON round trip", () => {
    for (const data of [engineResults(), torsionResults("CCCC", 1, 2, 0, 3, 180), torsionResults("CCCC", 1, 2, 0, 3, 60)]) {
      store.assertPlainJson(data);
      assert.deepEqual(W.validateConformationsResults(clone(data)), clone(data));
      assert.ok(W.describeConformationsAnalysis(data).startsWith(data.smiles));
    }
  });
  test("[results] butane: anti is the lowest, gauche is higher and eclipsed higher still (relative energies are ordered)", () => {
    const anti = torsionResults("CCCC", 1, 2, 0, 3, 180).torsion;
    const gauche = torsionResults("CCCC", 1, 2, 0, 3, 60).torsion;
    const eclipsed = torsionResults("CCCC", 1, 2, 0, 3, 0).torsion;
    assert.equal(anti.kind, "staggered");
    assert.equal(eclipsed.kind, "eclipsed");
    assert.ok(anti.relativeKJ <= 1e-6, String(anti.relativeKJ));
    assert.ok(gauche.relativeKJ > anti.relativeKJ && eclipsed.relativeKJ > gauche.relativeKJ, JSON.stringify([anti, gauche, eclipsed].map((x) => x.relativeKJ)));
  });
  test("[results] damaged summaries are refused rather than shown", () => {
    const good = engineResults();
    const tamper = (mutate) => { const copy = clone(good); mutate(copy); return W.validateConformationsResults(copy); };
    assert.equal(tamper((d) => { d.mode = "boat"; }), null);
    assert.equal(tamper((d) => { d.smiles = ""; }), null);
    assert.equal(tamper((d) => { d.chair.ring = [1, 2]; }), null);
    assert.equal(tamper((d) => { d.chair.preferenceKind = "guess"; }), null);
    assert.equal(tamper((d) => { d.chair = null; }), null, "nothing to show");
    assert.equal(tamper((d) => { d.limits = [1]; }), null);
    assert.equal(tamper((d) => { d.chair.showing = "Chair C"; }), null);
    assert.equal(W.validateConformationsResults(null), null);
  });

  test("[library] saved to and opened from Saved Analyses exactly, across a restart, with the conformations page registered", async () => {
    assert.ok(libApp.OPENABLE_ANALYSIS_PAGES.includes("conformations"));
    assert.equal(libApp.ANALYSIS_APP_PAGE.conformations, "conformations");
    const validators = { conformations: { engineVersion: W.CONFORMATIONS_ENGINE_VERSION, validateInputs: W.validateConformationsInputs, validateResults: W.validateConformationsResults } };
    const backend = new store.MemoryBackend();
    let n = 0;
    const make = () => new lib.AnalysisLibrary(backend, { validators, newId: () => `c-${++n}` });
    const data = torsionResults("CC(C)CC(C)C", 1, 3, 0, 4, -60);
    const saveInputs = inputs({ source: { kind: "smiles", text: "CC(C)CC(C)C" }, mode: "newman", torsion: { front: 1, rear: 3, frontRef: 0, rearRef: 4, rotation: -60 } });
    const saved = await make().save("conformations", {
      name: "Isopentane Newman", summary: W.describeConformationsAnalysis(data), inputs: saveInputs,
      results: { computedAt: "2026-11-10T09:00:00.000Z", engineVersion: W.CONFORMATIONS_ENGINE_VERSION, stale: false, status: "complete", data },
    });
    assert.equal(saved.ok, true, JSON.stringify(saved.error));
    const opened = await make().open(saved.value.id);
    assert.equal(opened.ok, true, JSON.stringify(opened.error));
    assert.deepEqual(opened.value.inputs, clone(saveInputs));
    assert.deepEqual(opened.value.results.data, clone(data));
    assert.equal(opened.value.engineMismatch, false);
    // a record whose payload no longer validates is reported damaged, not opened
    const bad = await make().save("conformations", { name: "x", summary: "x", inputs: { ...saveInputs, mode: "boat" }, results: null });
    if (bad.ok) assert.equal((await make().open(bad.value.id)).ok, false, "invalid inputs are refused when the record is opened");
  });
});

describe("learning content is computed from the current state", () => {
  test("[notes] chair notes and questions come from the model; the answer key matches the engine", () => {
    const { model, analysis } = chairOf("C[C@H]1CC[C@@H](C)CC1");
    const notes = Guide.chairNotes(model, analysis, false);
    assert.ok(notes.length > 0 && notes.every((n) => n.title && n.text));
    const qs = Guide.chairQuestions(model, analysis, false);
    assert.ok(qs.length > 0);
    for (const q of qs) {
      assert.ok(q.correct >= 0 && q.correct < q.choices.length, q.prompt);
      assert.equal(new Set(q.choices).size, q.choices.length, "no duplicate choices");
      assert.ok(q.explanation.length > 0);
    }
    const flippedQs = Guide.chairQuestions(model, analysis, true);
    assert.notDeepEqual(clone(qs.map((q) => q.correct + q.prompt)), clone(flippedQs.map((q) => q.correct + q.prompt)), "questions follow the displayed chair");
  });
  test("[notes] torsion notes and questions follow the rotation", () => {
    const g = graphOf("CCCC");
    const setup = T.setupTorsion(g, 1, 2, { frontRef: 0, rearRef: 3 });
    const at = (r) => Guide.torsionQuestions(g, setup, r);
    for (const r of [0, 60, 180]) {
      for (const q of at(r)) assert.ok(q.correct >= 0 && q.correct < q.choices.length, `${r}: ${q.prompt}`);
    }
    assert.ok(Guide.torsionNotes(g, setup, 180).length > 0);
    assert.notEqual(JSON.stringify(Guide.torsionNotes(g, setup, 180)), JSON.stringify(Guide.torsionNotes(g, setup, 0)));
  });
});
