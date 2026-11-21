// Stage 26: organelles and protein trafficking. Expectations are typed from cell-biology knowledge (secretory pathway order, signal requirements,
// import machinery), not read back from the module under test.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";
import { after } from "node:test";

let T, M;
before(async () => {
  T = await loadModule("/src/utils/biology/trafficking26.ts");
  M = await loadModule("/src/utils/biology/mechanism26.ts");
});
after(() => closeEngine());

const visited = (trace) => trace.steps.map((s) => s.at);
const idx = (trace, comp) => visited(trace).indexOf(comp);

describe("shared mechanism validation", () => {
  test("every Stage 26 graph is structurally valid", async () => {
    const C = await loadModule("/src/utils/biology/cellcycle26.ts");
    const D = await loadModule("/src/utils/biology/celldeath26.ts");
    for (const g of [T.QC_GRAPH, C.CYCLE_GRAPH, C.CDK_GRAPH, C.LICENSE_GRAPH, D.APOPTOSIS_GRAPH, D.AUTOPHAGY_GRAPH]) {
      const v = M.validateGraph(g);
      assert.deepEqual(v.errors, [], g.id);
      assert.equal(v.order.length, g.nodes.length);
    }
  });
  test("the validator rejects duplicates, unknown references, cycles and malformed nodes", () => {
    const n = (id, kind, expr) => ({ id, label: id, module: "m", kind, expr, where: "", role: "", evidence: "established" });
    assert.ok(M.validateGraph({ id: "x", nodes: [n("a", "input"), n("a", "input")] }).errors.some((e) => /duplicate/.test(e)));
    assert.ok(M.validateGraph({ id: "x", nodes: [n("a", "derived", "ghost")] }).errors.some((e) => /unknown node ghost/.test(e)));
    assert.ok(M.validateGraph({ id: "x", nodes: [n("a", "derived", "b"), n("b", "derived", "a")] }).errors.some((e) => /cycle/.test(e)));
    assert.ok(M.validateGraph({ id: "x", nodes: [n("a", "input", "b"), n("b", "input")] }).errors.some((e) => /must not have a rule/.test(e)));
    assert.ok(M.validateGraph({ id: "x", nodes: [n("a", "derived")] }).errors.some((e) => /no rule/.test(e)));
  });
  test("graph evaluation applies all / any / not and forced perturbations", () => {
    const g = { id: "t", nodes: [
      { id: "a", label: "a", module: "m", kind: "input", default: true, where: "", role: "", evidence: "established" },
      { id: "b", label: "b", module: "m", kind: "input", default: false, where: "", role: "", evidence: "established" },
      { id: "c", label: "c", module: "m", kind: "derived", expr: M.all("a", M.not("b")), where: "", role: "", evidence: "established" },
    ] };
    assert.equal(M.evaluateGraph(g, {}).values.c, true);
    assert.equal(M.evaluateGraph(g, { b: true }).values.c, false);
    assert.equal(M.evaluateGraph(g, {}, [{ id: "p", label: "", target: "c", force: false, kind: "loss", explanation: "" }]).values.c, false);
  });
  test("perturbation sets that act on the same component are rejected", () => {
    const cat = [{ id: "x", target: "n", force: false }, { id: "y", target: "n", force: true }, { id: "z", target: "m", force: false }];
    assert.equal(M.validatePerturbations(["x", "y"], cat, 4).ok, false);
    assert.equal(M.validatePerturbations(["x", "x"], cat, 4).ok, false);
    assert.equal(M.validatePerturbations(["x", "z"], cat, 4).ok, true);
    assert.equal(M.validatePerturbations(["q"], cat, 4).ok, false);
    assert.equal(M.validatePerturbations(["x", "z"], cat, 1).ok, false);
  });
});

describe("transport graph and cargo classification", () => {
  test("every route follows only allowed compartment transitions and ends at its destination", () => {
    assert.deepEqual(T.validateRoutes(), []);
  });
  test("a corrupted route is detected as an invalid compartment transition", () => {
    const bad = JSON.parse(JSON.stringify(T.CARGOS));
    const sec = bad.find((c) => c.id === "secreted");
    sec.steps.find((s) => s.id === "to-golgi").at = "lysosome"; // ER-derived carrier cannot go straight to a lysosome
    assert.ok(T.validateRoutes(bad).some((e) => /invalid compartment transition/.test(e)));
    const bad2 = JSON.parse(JSON.stringify(T.CARGOS));
    bad2.find((c) => c.id === "nuclear").steps.find((s) => s.id === "pass").at = "er";
    assert.ok(T.validateRoutes(bad2).length > 0);
  });
  test("direct jumps that skip the vesicle or pore machinery are not valid transitions", () => {
    assert.equal(T.isValidTransition("er", "golgi-cis"), false); // needs a COPII carrier
    assert.equal(T.isValidTransition("er", "v-copii"), true);
    assert.equal(T.isValidTransition("cytosol", "lysosome"), false);
    assert.equal(T.isValidTransition("cytosol", "nucleus"), false); // must pass the pore
    assert.equal(T.isValidTransition("npc", "nucleus"), true);
    assert.equal(T.isValidTransition("cytosol", "mito-matrix"), false); // two membranes
    assert.equal(T.isValidTransition("golgi-trans", "er"), false); // retrograde goes by COPI from the cis face in this model
    assert.equal(T.isValidTransition("lysosome", "golgi-cis"), false);
  });
  test("only secreted, membrane and lysosomal cargo enter the ER and Golgi", () => {
    const enters = (id) => T.traceCargo(id, []).steps.some((s) => s.at === "er");
    assert.deepEqual(["cytosolic", "secreted", "membrane", "lysosomal", "nuclear", "mitochondrial"].filter(enters).sort(), ["lysosomal", "membrane", "secreted"]);
    for (const id of ["cytosolic", "nuclear", "mitochondrial"]) assert.ok(!T.traceCargo(id, []).steps.some((s) => /golgi/.test(s.at)), id);
  });
  test("each cargo ends at its expected destination", () => {
    const dest = { cytosolic: "cytosol", secreted: "extracellular", membrane: "pm", lysosomal: "lysosome", nuclear: "nucleus", mitochondrial: "mito-matrix" };
    for (const [id, d] of Object.entries(dest)) { const t = T.traceCargo(id, []); assert.equal(t.final, d, id); assert.equal(t.status, "destination"); }
  });
});

describe("secretory pathway order and topology", () => {
  test("secreted protein: ER → COPII carrier → cis → medial → trans Golgi → secretory carrier → outside", () => {
    const t = T.traceCargo("secreted", []);
    const order = ["er", "v-copii", "golgi-cis", "golgi-medial", "golgi-trans", "v-secretory", "extracellular"].map((c) => idx(t, c));
    assert.ok(order.every((v) => v >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
  test("SRP recognition precedes ER targeting, which precedes translocation and folding quality control", () => {
    const ids = T.traceCargo("secreted", []).steps.map((s) => s.id);
    assert.ok(ids.indexOf("recognise") < ids.indexOf("target") && ids.indexOf("target") < ids.indexOf("translocate") && ids.indexOf("translocate") < ids.indexOf("fold-qc") && ids.indexOf("fold-qc") < ids.indexOf("export"));
  });
  test("the ER step uses SRP and Sec61; export uses the COPII coat; the Golgi stage glycan processing", () => {
    const steps = T.traceCargo("secreted", []).steps;
    const m = (id) => steps.find((s) => s.id === id).machinery.join(" ");
    assert.match(m("recognise"), /SRP/); assert.match(m("target"), /Sec61/); assert.match(m("export"), /Sar1/); assert.match(m("export"), /Sec23/);
    assert.match(steps.find((s) => s.id === "golgi").processing, /glycan/i);
  });
  test("soluble cargo is released outside; membrane cargo ends in the membrane with its lumenal domain outside", () => {
    assert.equal(T.traceCargo("secreted", []).final, "extracellular");
    const t = T.traceCargo("membrane", []);
    assert.equal(t.final, "pm");
    const at = (id) => T.topologyAt("membrane", t, t.steps.findIndex((s) => s.id === id));
    assert.equal(at("fold-qc").nDomain, "ER lumen");
    assert.equal(at("to-golgi").nDomain, "Golgi lumen");
    assert.equal(at("fuse").nDomain, "extracellular space");
  });
  test("membrane topology never flips: the cytosolic domain always faces the cytosol once inserted", () => {
    const t = T.traceCargo("membrane", []);
    const ins = t.steps.findIndex((s) => s.id === "translocate");
    for (let i = ins; i < t.steps.length; i++) assert.equal(T.topologyAt("membrane", t, i).cDomain, "cytosol");
    assert.equal(T.topologyAt("secreted", T.traceCargo("secreted", []), 3), null); // soluble: no topology
  });
});

describe("nuclear and mitochondrial import", () => {
  test("nuclear import: importin binding, pore docking, passage, Ran-GTP release, in that order", () => {
    const ids = T.traceCargo("nuclear", []).steps.map((s) => s.id);
    assert.deepEqual(ids, ["translate", "bind", "dock", "pass", "release"]);
    const steps = T.traceCargo("nuclear", []).steps;
    assert.match(steps.find((s) => s.id === "bind").machinery.join(), /Importin-α/);
    assert.match(steps.find((s) => s.id === "release").machinery.join(), /Ran-GTP/);
    assert.equal(T.cargoById("nuclear").translatedAt.includes("Free ribosome"), true);
  });
  test("mitochondrial matrix import crosses TOM then TIM23 and needs the membrane potential", () => {
    const t = T.traceCargo("mitochondrial", []);
    assert.deepEqual(visited(t).filter((c, i, a) => a.indexOf(c) === i), ["cytosol", "mito-ims", "mito-matrix"]);
    assert.match(t.steps.find((s) => s.id === "tom").machinery.join(), /TOM40/);
    assert.match(t.steps.find((s) => s.id === "tim23").machinery.join(), /membrane potential/);
  });
  test("nuclear and mitochondrial import use different machinery", () => {
    const m = (id) => T.cargoById(id).steps.flatMap((s) => s.machinery).join(" ");
    assert.doesNotMatch(m("mitochondrial"), /importin|\bRan\b/i);
    assert.doesNotMatch(m("nuclear"), /TOM|TIM/);
  });
});

describe("lysosomal sorting", () => {
  test("hydrolase gets an M6P tag in the Golgi, is bound by M6P receptors at the TGN, and travels by clathrin/AP-1 carriers via an endosome", () => {
    const ids = T.traceCargo("lysosomal", []).steps.map((s) => s.id);
    assert.ok(ids.indexOf("m6p-tag") < ids.indexOf("tgn-bind") && ids.indexOf("tgn-bind") < ids.indexOf("clathrin") && ids.indexOf("clathrin") < ids.indexOf("endosome") && ids.indexOf("endosome") < ids.indexOf("lysosome"));
    const s = T.traceCargo("lysosomal", []).steps;
    assert.match(s.find((x) => x.id === "m6p-tag").machinery.join(), /phosphotransferase/i);
    assert.match(s.find((x) => x.id === "clathrin").machinery.join(), /AP-1/);
  });
  test("without the M6P tag the hydrolase is secreted by the default route, not retained or degraded", () => {
    const t = T.traceCargo("lysosomal", ["m6p-blocked"]);
    assert.equal(t.status, "detour");
    assert.equal(t.final, "extracellular");
    assert.ok(!visited(t).includes("lysosome"));
    assert.ok(visited(t).includes("golgi-trans"));
  });
});

describe("perturbations are derived from the route and affect only the cargos that depend on them", () => {
  test("SRP disabled: every SRP-dependent cargo stays in the cytosol; others are unaffected", () => {
    for (const id of ["secreted", "membrane", "lysosomal"]) { const t = T.traceCargo(id, ["srp-disabled"]); assert.equal(t.final, "cytosol", id); assert.equal(t.status, "retained"); assert.ok(!visited(t).includes("er")); }
    for (const id of ["cytosolic", "nuclear", "mitochondrial"]) { const t = T.traceCargo(id, ["srp-disabled"]); assert.equal(t.status, "destination", id); assert.deepEqual(t.applied, []); }
  });
  test("ER export impaired: secretory cargo is retained in the ER and never reaches the Golgi", () => {
    for (const id of ["secreted", "membrane", "lysosomal"]) { const t = T.traceCargo(id, ["er-export-impaired"]); assert.equal(t.final, "er", id); assert.ok(!visited(t).some((c) => /golgi|copii/.test(c))); }
    assert.equal(T.traceCargo("nuclear", ["er-export-impaired"]).status, "destination");
  });
  test("defective NLS recognition: nuclear protein stays cytosolic; Ran gradient loss stalls it at the pore", () => {
    assert.equal(T.traceCargo("nuclear", ["nuclear-targeting-defective"]).final, "cytosol");
    const stalled = T.traceCargo("nuclear", ["ran-gradient-lost"]);
    assert.equal(stalled.final, "npc");
    assert.equal(stalled.status, "retained");
    assert.equal(T.traceCargo("secreted", ["nuclear-targeting-defective", "ran-gradient-lost"]).status, "destination");
  });
  test("mitochondrial: defective presequence keeps the precursor in the cytosol; lost potential stops it at the TIM23 stage after TOM", () => {
    assert.equal(T.traceCargo("mitochondrial", ["mts-defective"]).final, "cytosol");
    const t = T.traceCargo("mitochondrial", ["mito-potential-lost"]);
    assert.equal(t.final, "mito-ims");
    assert.ok(t.steps.some((s) => s.id === "tom"));
  });
  test("with several perturbations only the earliest blocking step applies and the rest are explained", () => {
    const t = T.traceCargo("secreted", ["er-export-impaired", "srp-disabled", "nuclear-targeting-defective"]);
    assert.equal(t.blockedBy, "srp-disabled");
    assert.equal(t.final, "cytosol");
    assert.ok(t.outcome.definite.some((s) => /no step of this route depends on it/.test(s)));
    assert.ok(t.outcome.definite.some((s) => /already stopped earlier/.test(s)));
  });
  test("every perturbed outcome lists what the model does not conclude", () => {
    for (const p of T.TRAFF_PERTURBATIONS) for (const c of T.CARGOS) {
      const t = T.traceCargo(c.id, [p.id]);
      if (t.status !== "destination") assert.ok(t.outcome.uncertain.length > 0 && /not modelled/.test(t.outcome.uncertain.join(" ")), `${c.id}/${p.id}`);
    }
  });
});

describe("vesicular trafficking", () => {
  test("six distinct stages with the selection/budding/transport/tethering/docking/fusion distinction", () => {
    assert.deepEqual([...T.VESICLE_STAGES], ["selection", "budding", "transport", "tethering", "docking", "fusion"]);
    const texts = T.VESICLE_STAGES.map((s) => T.VESICLE_STAGE_DISTINCTION[s]);
    assert.equal(new Set(texts).size, 6);
    assert.match(T.VESICLE_STAGE_DISTINCTION.tethering, /not fusion/);
    assert.match(T.VESICLE_STAGE_DISTINCTION.docking, /does not complete/);
  });
  test("COPII leaves the ER for the Golgi (anterograde) and COPI returns from the Golgi to the ER (retrograde)", () => {
    const a = T.vesicleRoute("copii"), b = T.vesicleRoute("copi");
    assert.deepEqual([a.donor, a.acceptor], ["er", "golgi-cis"]);
    assert.deepEqual([b.donor, b.acceptor], ["golgi-cis", "er"]);
    assert.match(a.stage.budding.machinery.join(), /Sec13\/Sec31/);
    assert.match(a.stage.selection.machinery.join(), /Sar1/);
    assert.match(b.stage.budding.machinery.join(), /Arf1/); assert.match(b.stage.budding.machinery.join(), /Coatomer/);
    assert.match(b.stage.selection.machinery.join(), /KKXX|KDEL/);
  });
  test("each route's donor/acceptor pair matches a transition of the transport graph, and carries a caveat on destination", () => {
    for (const r of T.VESICLE_ROUTES) {
      const t = T.TRANSITIONS.find((x) => x.id === r.transition);
      assert.ok(t, r.id); assert.equal(t.from, r.donor, r.id);
      assert.ok(r.caveat.length > 40);
    }
    assert.match(T.vesicleRoute("copii").caveat, /does not decide/);
    assert.equal(T.vesicleRoute("clathrin-ap2").donor, "pm");
  });
  test("tethering uses Rab GTPases; fusion uses SNAREs (v-SNARE and t-SNARE pairing at docking)", () => {
    for (const r of T.VESICLE_ROUTES) { assert.ok(r.stage.fusion.machinery.join().match(/SNARE/i), r.id); assert.ok(r.stage.docking.machinery.join().match(/SNARE/i), r.id); }
    assert.match(T.vesicleRoute("copii").rab, /Rab1/);
  });
});

describe("endosomes and lysosomes", () => {
  test("transferrin recycles and is not degraded; LDL is degraded in the lysosome but its receptor recycles", () => {
    const tf = T.traceEndocytosis("transferrin", []);
    assert.ok(tf.path.includes("recycle") && !tf.path.includes("lysosome") && !tf.degrades);
    const ldl = T.traceEndocytosis("ldl", []);
    assert.ok(ldl.path.includes("lysosome") && ldl.degrades);
    assert.match(T.endoCargo("ldl").summary, /receptor recycles/);
  });
  test("not all internalised material is destroyed: IgA is transcytosed undegraded", () => {
    const t = T.traceEndocytosis("iga", []);
    assert.ok(t.path.includes("transcytosed") && !t.path.includes("lysosome") && !t.degrades);
  });
  test("endosomes acidify progressively: early > late > lysosome pH (ranges)", () => {
    const num = (s) => Number(String(T.endoStage(s).ph).match(/[0-9.]+/)[0]);
    assert.ok(num("early") > num("late") && num("late") > num("lysosome"));
  });
  test("V-ATPase inhibition stops acidification: acid-dependent ligand release fails and hydrolases do not degrade", () => {
    const t = T.traceEndocytosis("ldl", ["v-atpase-inhibited"]);
    assert.equal(t.acidified, false);
    assert.equal(t.degrades, false);
    assert.ok(t.statements.some((s) => /release of the ligand from the receptor/.test(s)));
    assert.ok(T.traceEndocytosis("transferrin", ["v-atpase-inhibited"]).statements.some((s) => /fails/.test(s)));
    assert.ok(t.uncertain.length > 0);
  });
  test("blocking M6P tagging reduces hydrolase supply, flagged with uncertainty, without inventing a disease", () => {
    const t = T.traceEndocytosis("ldl", ["m6p-blocked"]);
    assert.equal(t.hydrolaseSupply, false);
    assert.ok(t.uncertain.some((s) => /not modelled/.test(s)));
  });
});

describe("protein quality control", () => {
  const ev = (o) => T.evaluateQc({ defect: true, aggregates: false, perturbations: [], ...o }).values;
  test("a normally folding protein passes quality control and is exported, with no degradation", () => {
    const v = ev({ defect: false });
    assert.equal(v.folded, true); assert.equal(v.exported, true); assert.equal(v.misfolded, false); assert.equal(v.proteasomeDeg, false); assert.equal(v.lysoDeg, false);
  });
  test("a misfolded protein is retained, retrotranslocated by ERAD and degraded by the proteasome", () => {
    const v = ev({});
    assert.equal(v.exported, false); assert.equal(v.misfolded, true); assert.equal(v.retro, true); assert.equal(v.proteasomeDeg, true); assert.equal(v.lysoDeg, false);
  });
  test("proteasomal and lysosomal degradation are distinct routes", () => {
    const agg = ev({ aggregates: true });
    assert.equal(agg.retro, false); assert.equal(agg.proteasomeDeg, false); assert.equal(agg.lysoDeg, true);
    const sol = ev({});
    assert.equal(sol.proteasomeDeg, true); assert.equal(sol.lysoDeg, false);
  });
  test("ERAD impairment: no retrotranslocation; lysosomal back-up (if available) degrades; if also impaired the protein accumulates", () => {
    const a = ev({ perturbations: ["erad-impaired"] });
    assert.equal(a.retro, false); assert.equal(a.lysoDeg, true); assert.equal(a.accumulates, false);
    const b = ev({ perturbations: ["erad-impaired", "lysosome-route-impaired"] });
    assert.equal(b.accumulates, true);
  });
  test("proteasome inhibition: the protein is retrotranslocated and ubiquitinated but not degraded", () => {
    const v = ev({ perturbations: ["proteasome-inhibited"] });
    assert.equal(v.retro, true); assert.equal(v.proteasomeDeg, false); assert.equal(v.accumulates, true);
  });
  test("chaperone loss prevents folding even for a normal protein", () => {
    assert.equal(ev({ defect: false, perturbations: ["chaperone-loss"] }).folded, false);
  });
  test("saved quality-control state validation rejects contradictions", () => {
    assert.equal(T.validateQc({ defect: false, aggregates: true, perturbations: [] }).ok, false);
    assert.equal(T.validateQc({ defect: true, aggregates: false, perturbations: ["nope"] }).ok, false);
    assert.equal(T.validateQc({ defect: true, aggregates: false, perturbations: ["erad-impaired"] }).ok, true);
  });
});

describe("organelle laboratory", () => {
  const need = ["plasma-membrane", "cytosol", "nucleus", "nuclear-envelope", "nuclear-pore", "rough-er", "smooth-er", "golgi", "mitochondrion", "lysosome", "endosome", "peroxisome", "ribosomes", "cytoskeleton"];
  test("all required organelles are present with functions", () => {
    for (const id of need) { const o = T.organelleById(id); assert.ok(o && o.functions.length >= 2, id); }
  });
  test("double-membrane organelles are nucleus, envelope and mitochondrion; lysosome and Golgi are single-membrane", () => {
    for (const id of ["nucleus", "nuclear-envelope", "mitochondrion"]) assert.equal(T.organelleById(id).boundary, "double membrane");
    for (const id of ["lysosome", "golgi", "peroxisome"]) assert.equal(T.organelleById(id).boundary, "single membrane");
  });
  test("processes through an organelle are derived from the routes", () => {
    const names = (id) => T.processesThrough(id).map((p) => p.cargo).sort();
    assert.deepEqual(names("golgi"), ["lysosomal", "membrane", "secreted"]);
    assert.deepEqual(names("nucleus"), ["nuclear"]);
    assert.deepEqual(names("mitochondrion"), ["mitochondrial"]);
    assert.deepEqual(names("lysosome"), ["lysosomal"]);
  });
  test("the schematic status of the geometry is stated", () => {
    assert.ok(T.TRAFFICKING_ASSUMPTIONS.some((a) => /schematic/i.test(a) && /not measurements/i.test(a)));
  });
});
