// Stage 23: receptor and signal-transduction models. Expectations are written from the textbook pathway logic
// (what must be active, inactive, blocked or persisting), not derived by calling the module under test.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

const S = await loadModule("/src/utils/biology/signaling23.ts");
after(async () => { await closeEngine(); });

const inp = (system, over = {}) => ({ ...S.DEFAULT_SIGNALING, system, ...over });
const ev = (system, over) => S.evaluateSignaling(inp(system, over));
const on = (e, id) => S.isOn(e.current[id]);
const ids = (e) => e.system.nodes.filter((n) => n.kind !== "terminator").map((n) => n.id);
const allOn = (e, list) => list.every((id) => on(e, id));
const noneOn = (e, list) => list.every((id) => !on(e, id));

describe("receptor classes", () => {
  test("four receptor classes with distinct activation mechanisms", () => {
    assert.equal(S.RECEPTOR_CLASSES.length, 4);
    assert.equal(new Set(S.RECEPTOR_CLASSES.map((c) => c.activation)).size, 4);
    const loc = Object.fromEntries(S.RECEPTOR_CLASSES.map((c) => [c.id, c.location]));
    assert.match(loc.nuclear, /Cytosol or nucleus/); assert.match(loc.gpcr, /Plasma membrane/);
    assert.match(S.RECEPTOR_CLASSES.find((c) => c.id === "lgic").activation, /own pore/);
    assert.match(S.RECEPTOR_CLASSES.find((c) => c.id === "gpcr").activation, /GEF/);
    assert.match(S.RECEPTOR_CLASSES.find((c) => c.id === "rtk").activation, /tyrosine/);
  });
  test("every system's classes link to a defined system", () => { for (const c of S.RECEPTOR_CLASSES) assert.ok(S.SYSTEMS[c.system]); });
});

describe("Gs pathway", () => {
  test("ligand present: every step is active in the order receptor, G protein, AC, cAMP, PKA, substrates", () => {
    const e = ev("gs");
    assert.ok(allOn(e, ["lig", "rec", "gp", "ac", "camp", "pka", "tgt"]));
    const order = S.SYSTEMS.gs.nodes.filter((n) => n.kind !== "terminator").map((n) => n.id);
    assert.deepEqual(order, ["lig", "rec", "gp", "ac", "camp", "pka", "tgt"]);
    const steps = S.SYSTEMS.gs.nodes.filter((n) => n.kind !== "terminator").map((n) => n.step);
    assert.deepEqual(steps, [1, 1, 2, 3, 4, 5, 6]);
  });
  test("ligand absent: nothing downstream of the ligand is active", () => assert.ok(noneOn(ev("gs", { ligand: false }), ids(ev("gs")))));
  test("the G protein switches between named GDP- and GTP-bound states", () => {
    const gp = S.SYSTEMS.gs.nodes.find((n) => n.id === "gp");
    assert.match(gp.offState, /GDP/); assert.match(gp.onState, /GTP/); assert.match(gp.onState, /separated from G/);
    assert.match(S.nodeStateText(S.SYSTEMS.gs, "gp", ev("gs", { step: 6 })), /Gαs·GTP/);
    assert.match(S.nodeStateText(S.SYSTEMS.gs, "gp", ev("gs", { ligand: false })), /GDP/);
  });
  test("receptor that cannot bind ligand: no downstream activation, ligand itself still present", () => {
    const e = ev("gs", { perturbations: ["rec-nobind"] });
    assert.equal(e.current.rec, "blocked"); assert.ok(on(e, "lig")); assert.ok(noneOn(e, ["gp", "ac", "camp", "pka", "tgt"]));
  });
  test("G protein that cannot exchange GDP for GTP: receptor active, everything after it inactive", () => {
    const e = ev("gs", { perturbations: ["gp-noexchange"] });
    assert.ok(on(e, "rec")); assert.equal(e.current.gp, "blocked"); assert.ok(noneOn(e, ["ac", "camp", "pka", "tgt"]));
  });
  test("blocking adenylyl cyclase prevents the cAMP increase even though Gs is active", () => {
    const e = ev("gs", { perturbations: ["ac-inhib"] });
    assert.ok(on(e, "gp")); assert.equal(e.current.ac, "blocked"); assert.ok(noneOn(e, ["camp", "pka", "tgt"]));
    assert.equal(S.acContext(e), "blocked");
  });
  test("PKA inhibitor: cAMP rises but substrates are not phosphorylated", () => {
    const e = ev("gs", { perturbations: ["pka-inhib"] });
    assert.ok(on(e, "camp")); assert.ok(noneOn(e, ["pka", "tgt"]));
  });
  test("GTPase-deficient Gαs signals without ligand (constitutive) and is not shut off by removal", () => {
    const off = ev("gs", { ligand: false, perturbations: ["gp-gtpase"] });
    assert.ok(allOn(off, ["gp", "ac", "camp", "pka", "tgt"])); assert.ok(!on(off, "rec"));
    const removed = ev("gs", { phase: "removed", perturbations: ["gp-gtpase"] });
    assert.ok(allOn(removed, ["gp", "camp", "pka"]));
  });
  test("normal termination: after ligand removal every signalling component is off", () => assert.ok(noneOn(ev("gs", { phase: "removed" }), ids(ev("gs")))));
  test("phosphodiesterase inhibited: no change while ligand is present, cAMP and PKA persist after removal, the receptor does not", () => {
    const a = ev("gs", { perturbations: ["pde-inhib"] });
    assert.deepEqual(a.acute, { ...ev("gs").acute, pde: "blocked" });
    const r = ev("gs", { phase: "removed", perturbations: ["pde-inhib"] });
    assert.equal(r.current.camp, "persisting"); assert.equal(r.current.pka, "persisting"); assert.equal(r.current.tgt, "persisting");
    assert.ok(noneOn(r, ["rec", "gp", "ac"]));
  });
  test("phosphatase inhibition keeps only the substrate phosphorylation", () => {
    const r = ev("gs", { phase: "removed", perturbations: ["pp-inhib"] });
    assert.equal(r.current.tgt, "persisting"); assert.ok(noneOn(r, ["camp", "pka"]));
  });
  test("desensitization: prolonged exposure attenuates the signal; blocking GRK/arrestin keeps it fully active", () => {
    const p = ev("gs", { phase: "prolonged" });
    for (const id of ["rec", "gp", "ac", "camp", "pka", "tgt"]) assert.equal(p.current[id], "attenuated", id);
    assert.equal(p.current.lig, "active");
    const nb = ev("gs", { phase: "prolonged", perturbations: ["grk-block"] });
    for (const id of ["rec", "gp", "ac", "camp", "pka", "tgt"]) assert.equal(nb.current[id], "active", id);
  });
  test("steps: nodes beyond the current step have not been reached, others have", () => {
    const e = ev("gs", { step: 2 });
    assert.ok(e.reached.rec && e.reached.gp && !e.reached.ac && !e.reached.tgt && e.reached.gtpase);
    assert.match(S.nodeStateText(S.SYSTEMS.gs, "ac", e), /not reached yet/);
    assert.ok(Object.values(ev("gs", { step: 0, phase: "removed" }).reached).every(Boolean));
  });
});

describe("Gi pathway does not simply raise cAMP", () => {
  test("Gi agonist alone: Gαi·GTP active, adenylyl cyclase not stimulated, cAMP not elevated, PKA off", () => {
    const e = ev("gi");
    assert.ok(on(e, "gp")); assert.ok(noneOn(e, ["ac", "camp", "pka"]));
    assert.equal(S.acContext(e), "inhibited");
    assert.match(S.nodeStateText(S.SYSTEMS.gi, "camp", ev("gi", { step: 7 })), /Gαi·GTP lowers production/);
  });
  test("Gs stimulus alone: cAMP and PKA on", () => {
    const e = ev("gi", { ligand: false, coLigand: true });
    assert.ok(allOn(e, ["gps", "ac", "camp", "pka"])); assert.ok(!on(e, "gp")); assert.equal(S.acContext(e), "stimulated");
  });
  test("both: production stays stimulated but opposed by Gi, and the model does not claim a net level versus basal", () => {
    const e = ev("gi", { coLigand: true });
    assert.equal(S.acContext(e), "stimulated-opposed"); assert.ok(on(e, "camp"));
    assert.match(S.SYSTEMS.gi.limits, /depends on the relative strengths/);
  });
  test("pertussis-toxin-like Gαi block removes the opposition", () => {
    const e = ev("gi", { coLigand: true, perturbations: ["gp-noexchange"] });
    assert.equal(S.acContext(e), "stimulated"); assert.equal(e.current.gp, "blocked");
  });
  test("neither ligand: basal; adenylyl cyclase inhibitor blocks all cAMP production", () => {
    assert.equal(S.acContext(ev("gi", { ligand: false })), "basal");
    const e = ev("gi", { coLigand: true, perturbations: ["ac-inhib"] });
    assert.equal(S.acContext(e), "blocked"); assert.ok(noneOn(e, ["camp", "pka"]));
  });
  test("the Gs pathway and the Gi pathway differ in their G protein's effect on adenylyl cyclase", () => {
    assert.deepEqual(S.SYSTEMS.gs.nodes.find((n) => n.id === "ac").requires, ["gp"]);
    assert.deepEqual(S.SYSTEMS.gi.nodes.find((n) => n.id === "ac").opposedBy, ["gp"]);
    assert.deepEqual(S.SYSTEMS.gi.nodes.find((n) => n.id === "ac").requires, ["gps"]);
  });
});

describe("Gq pathway", () => {
  test("produces IP3 and DAG, releases Ca2+ and activates PKC; no cAMP node exists", () => {
    const e = ev("gq");
    assert.ok(allOn(e, ["gp", "plc", "ip3", "dag", "ca", "caResp", "pkc", "tgt"]));
    assert.ok(!S.SYSTEMS.gq.nodes.some((n) => /cAMP/.test(n.label)));
  });
  test("IP3 and DAG appear at the same event, and IP3 receptor blockade removes Ca2+ and (conventional) PKC but not DAG", () => {
    const steps = Object.fromEntries(S.SYSTEMS.gq.nodes.map((n) => [n.id, n.step]));
    assert.equal(steps.ip3, steps.dag);
    const e = ev("gq", { perturbations: ["ip3r-block"] });
    assert.ok(allOn(e, ["ip3", "dag"])); assert.equal(e.current.ca, "blocked"); assert.ok(noneOn(e, ["caResp", "pkc", "tgt"]));
  });
  test("PLC inhibition removes both messengers and everything downstream", () => {
    const e = ev("gq", { perturbations: ["plc-inhib"] });
    assert.ok(on(e, "gp")); assert.ok(noneOn(e, ["ip3", "dag", "ca", "pkc", "caResp", "tgt"]));
  });
  test("PKC inhibitor keeps the Ca2+-dependent responses", () => {
    const e = ev("gq", { perturbations: ["pkc-inhib"] });
    assert.ok(on(e, "caResp")); assert.ok(!on(e, "tgt"));
  });
  test("conventional PKC needs both Ca2+ and DAG", () => assert.deepEqual([...S.SYSTEMS.gq.nodes.find((n) => n.id === "pkc").requires].sort(), ["ca", "dag"]));
  test("termination: IP3 degradation and Ca2+ pumps blocked make IP3 / Ca2+ persist; DAG kinase blocked keeps DAG", () => {
    assert.equal(ev("gq", { phase: "removed", perturbations: ["ip3ptase-block"] }).current.ip3, "persisting");
    const pump = ev("gq", { phase: "removed", perturbations: ["pump-block"] });
    assert.equal(pump.current.ca, "persisting"); assert.equal(pump.current.caResp, "persisting");
    assert.equal(ev("gq", { phase: "removed", perturbations: ["dagk-block"] }).current.dag, "persisting");
    assert.ok(noneOn(ev("gq", { phase: "removed" }), ids(ev("gq"))));
  });
});

describe("receptor tyrosine kinase cascade (EGFR)", () => {
  const order = ["lig", "rec", "pty", "grb", "sos", "ras", "raf", "mek", "erk", "tgt"];
  test("cascade order and steps are strictly increasing", () => {
    assert.deepEqual(S.SYSTEMS.rtk.nodes.filter((n) => n.kind !== "terminator").map((n) => n.id), order);
    const steps = S.SYSTEMS.rtk.nodes.filter((n) => n.kind !== "terminator").map((n) => n.step);
    assert.deepEqual(steps, [1, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(S.SYSTEMS.rtk.steps, 9);
  });
  test("each kinase requires only the one above it; all active with EGF", () => {
    for (let i = 2; i < order.length; i += 1) assert.deepEqual(S.SYSTEMS.rtk.nodes.find((n) => n.id === order[i]).requires, [order[i - 1]]);
    assert.ok(allOn(ev("rtk"), order));
  });
  test("EGFR kinase inhibitor: dimerized receptor, but no phosphorylation or anything downstream", () => {
    const e = ev("rtk", { perturbations: ["egfr-tki"] });
    assert.ok(on(e, "rec")); assert.equal(e.current.pty, "blocked"); assert.ok(noneOn(e, order.slice(3)));
  });
  test("MEK inhibitor: everything to Raf active, ERK off", () => {
    const e = ev("rtk", { perturbations: ["mek-inhib"] });
    assert.ok(allOn(e, order.slice(0, 7))); assert.equal(e.current.mek, "blocked"); assert.ok(noneOn(e, ["erk", "tgt"]));
  });
  test("constitutive Ras: ERK active without EGF, and an EGFR inhibitor does not stop it; a MEK inhibitor does", () => {
    const noEgf = ev("rtk", { ligand: false, perturbations: ["ras-g12v"] });
    assert.ok(allOn(noEgf, ["ras", "raf", "mek", "erk", "tgt"])); assert.ok(noneOn(noEgf, ["rec", "pty", "grb", "sos"]));
    const withTki = ev("rtk", { perturbations: ["ras-g12v", "egfr-tki"] });
    assert.ok(allOn(withTki, ["ras", "erk", "tgt"]));
    const withMek = ev("rtk", { ligand: false, perturbations: ["ras-g12v", "mek-inhib"] });
    assert.ok(on(withMek, "raf")); assert.ok(noneOn(withMek, ["erk", "tgt"]));
  });
  test("constitutive Ras persists after the ligand is removed; ordinary signalling does not", () => {
    assert.ok(allOn(ev("rtk", { phase: "removed", perturbations: ["ras-g12v"] }), ["ras", "raf", "mek", "erk", "tgt"]));
    assert.ok(noneOn(ev("rtk", { phase: "removed" }), order));
  });
  test("ERK phosphatase blocked: phosphorylated ERK persists after removal; the receptor does not", () => {
    const r = ev("rtk", { phase: "removed", perturbations: ["dusp-block"] });
    assert.equal(r.current.erk, "persisting"); assert.equal(r.current.tgt, "persisting"); assert.ok(!on(r, "rec"));
  });
  test("negative feedback attenuates prolonged signalling unless it is lost", () => {
    const p = ev("rtk", { phase: "prolonged" });
    assert.equal(p.current.rec, "attenuated"); assert.equal(p.current.erk, "attenuated");
    assert.equal(ev("rtk", { phase: "prolonged", perturbations: ["fb-block"] }).current.erk, "active");
  });
  test("the model states its simplifications", () => assert.match(S.SYSTEMS.rtk.limits, /Other RTKs differ/));
});

describe("ligand-gated channel and intracellular receptor", () => {
  test("ligand-gated channel: no second messenger and no kinase in the pathway", () => {
    const kinds = new Set(S.SYSTEMS.lgic.nodes.map((n) => n.kind));
    assert.ok(!kinds.has("kinase") && !kinds.has("messenger") && !kinds.has("gprotein"));
    assert.ok(allOn(ev("lgic"), ["lig", "rec", "flux", "resp"]));
    assert.match(S.SYSTEMS.lgic.nodes.find((n) => n.id === "flux").mechanism, /reversal potential is near 0 mV/);
  });
  test("antagonist blocks opening; pore block still shows binding; AChE inhibition keeps the signal after removal", () => {
    const a = ev("lgic", { perturbations: ["rec-nobind"] }); assert.ok(noneOn(a, ["flux", "resp"]));
    const p = ev("lgic", { perturbations: ["pore-block"] }); assert.ok(on(p, "rec")); assert.ok(!on(p, "resp"));
    const r = ev("lgic", { phase: "removed", perturbations: ["ache-block"] });
    assert.equal(r.current.lig, "persisting"); assert.equal(r.current.resp, "persisting");
    assert.ok(noneOn(ev("lgic", { phase: "removed" }), ["lig", "rec", "flux", "resp"]));
  });
  test("intracellular receptor: hormone, receptor, nucleus, DNA, transcription in order; each defect stops what follows", () => {
    assert.ok(allOn(ev("nuclear"), ["lig", "rec", "nuc", "dna", "tx"]));
    const d = ev("nuclear", { perturbations: ["dna-block"] }); assert.ok(allOn(d, ["rec", "nuc"])); assert.ok(noneOn(d, ["dna", "tx"]));
    const n = ev("nuclear", { perturbations: ["nuc-block"] }); assert.ok(on(n, "rec")); assert.ok(noneOn(n, ["nuc", "dna", "tx"]));
    assert.equal(S.SYSTEMS.nuclear.membraneRow, 0);
  });
});

describe("validation and perturbation summaries", () => {
  const good = () => JSON.parse(JSON.stringify(S.DEFAULT_SIGNALING));
  test("defaults validate for every system", () => { for (const id of S.SYSTEM_IDS) assert.equal(S.validateSignaling({ ...good(), system: id }).ok, true, id); });
  test("unsupported, duplicated, excessive and contradictory perturbations are rejected", () => {
    assert.equal(S.validateSignaling({ ...good(), perturbations: ["ras-g12v"] }).ok, false);
    assert.equal(S.validateSignaling({ ...good(), perturbations: ["ac-inhib", "ac-inhib"] }).ok, false);
    assert.equal(S.validateSignaling({ ...good(), perturbations: ["ac-inhib", "pde-inhib", "pka-inhib", "pp-inhib"] }).ok, false);
    assert.equal(S.validateSignaling({ ...good(), perturbations: ["gp-noexchange", "gp-gtpase"] }).ok, false);
    assert.equal(S.validateSignaling({ ...good(), perturbations: [7] }).ok, false);
    assert.equal(S.validateSignaling({ ...good(), perturbations: ["ac-inhib", "pde-inhib"] }).ok, true);
  });
  test("bad system, phase, step, ligand types and co-ligand misuse are rejected", () => {
    for (const bad of [{ system: "gx" }, { phase: "later" }, { step: -1 }, { step: 7 }, { step: 1.5 }, { ligand: "yes" }, { coLigand: true }]) assert.equal(S.validateSignaling({ ...good(), ...bad }).ok, false, JSON.stringify(bad));
    assert.equal(S.validateSignaling(null).ok, false);
    assert.equal(S.validateSignaling({ ...good(), system: "gi", coLigand: true }).ok, true);
    assert.equal(S.validateSignaling({ ...good(), system: "rtk", step: 9 }).ok, true);
  });
  test("every perturbation targets an existing node of its own system", () => {
    for (const sys of Object.values(S.SYSTEMS)) for (const p of sys.perturbations) assert.ok(sys.nodes.some((n) => n.id === p.target), `${sys.id}/${p.id}`);
    for (const sys of Object.values(S.SYSTEMS)) for (const n of sys.nodes) for (const r of [...n.requires, ...(n.suppressedBy ?? []), ...(n.opposedBy ?? []), n.terminatedBy, n.attenuatedBy].filter(Boolean)) assert.ok(sys.nodes.some((m) => m.id === r), `${sys.id}/${n.id}->${r}`);
  });
  test("perturbation effect lists the direct changes and the fixed uncertainty statement", () => {
    const eff = S.perturbationEffect(inp("gs", { perturbations: ["ac-inhib"] }));
    const changed = eff.changed.map((c) => c.id);
    assert.ok(["ac", "camp", "pka", "tgt"].every((id) => changed.includes(id)));
    assert.ok(!changed.includes("gp") && !changed.includes("rec"));
    assert.match(eff.uncertain, /proliferation, differentiation, survival/);
    assert.equal(S.perturbationEffect(inp("gs")).changed.length, 0);
  });
  test("event captions describe what actually happens, including blocked and inactive steps", () => {
    const sys = S.SYSTEMS.gs;
    assert.match(S.eventCaption(sys, ev("gs"), 2).text, /release GDP/);
    assert.match(S.eventCaption(sys, ev("gs", { perturbations: ["gp-noexchange"] }), 2).text, /blocked here/);
    assert.match(S.eventCaption(sys, ev("gs", { perturbations: ["gp-noexchange"] }), 3).text, /stays inactive because Gαs·βγ is not active/);
    assert.match(S.eventCaption(sys, ev("gs"), 0).title, /Resting/);
  });
  test("amplification text claims no factor; termination summaries exist for every system", () => {
    assert.match(S.AMPLIFICATION_NOTE, /no amplification factor/);
    for (const id of S.SYSTEM_IDS) assert.ok(S.TERMINATION_SUMMARY[id].length >= 1);
    assert.ok(!/\d+\s*[×x]\s*amplif|-fold/.test(JSON.stringify(S.SYSTEMS)));
  });
});
