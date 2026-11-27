// Stage 26: cell-cycle regulation, checkpoints and replication licensing. Expectations are typed from textbook cell biology
// (RB/E2F, ATM/ATR–CHK–p53–p21, Wee1/Cdc25, MCC–APC/C–securin–separase, ORC/Cdc6/Cdt1/MCM, geminin).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let C;
before(async () => { C = await loadModule("/src/utils/biology/cellcycle26.ts"); });
after(() => closeEngine());

const base = (o = {}) => C.withPhase({ ...C.DEFAULT_CYCLE, ...o }, o.phase ?? C.DEFAULT_CYCLE.phase);
const run = (o = {}, perts = []) => { const i = { ...base(o), ...o, perturbations: perts }; return C.evaluateCycle(i); };
const verdict = (ev, id) => ev.verdicts.find((v) => v.id === id).status;

describe("phases", () => {
  test("five phases that separate growth, replication, checkpoint-controlled transitions and segregation", () => {
    assert.deepEqual([...C.PHASE_IDS], ["G0", "G1", "S", "G2", "M"]);
    assert.equal(C.phaseInfo("S").process, "DNA replication");
    assert.equal(C.phaseInfo("G1").process, "growth");
    assert.equal(C.phaseInfo("M").process, "chromosome segregation");
    assert.match(C.phaseInfo("G1").transitionOut, /restriction point/);
    assert.match(C.phaseInfo("M").transitionOut, /spindle assembly checkpoint/);
  });
});

describe("G1/S control", () => {
  test("a growth-factor-stimulated G1 cell: cyclin D–CDK4/6 → RB phosphorylated → E2F → cyclin E–CDK2 → S entry", () => {
    const v = run().values;
    assert.equal(v.cycD, true); assert.equal(v.cdk46, true); assert.equal(v.rbBrake, false); assert.equal(v.e2f, true); assert.equal(v.cycE, true); assert.equal(v.cdk2e, true); assert.equal(v.g1sPass, true);
    assert.equal(verdict(run(), "g1s"), "proceeds");
  });
  test("without mitogen, cyclin D is missing, RB keeps E2F, and S entry pauses", () => {
    const ev = run({ mitogen: false });
    for (const [k, want] of Object.entries({ cycD: false, cdk46: false, rbBrake: true, e2f: false, cycE: false, cdk2e: false, g1sPass: false })) assert.equal(ev.values[k], want, k);
    assert.equal(verdict(ev, "g1s"), "pauses");
  });
  test("after the restriction point, mitogen withdrawal no longer stops progression", () => {
    const ev = run({ phase: "G1", mitogen: false, pastRestriction: true });
    assert.equal(ev.values.g1sPass, true);
    assert.equal(verdict(ev, "g1s"), "proceeds");
  });
  test("CDK4/6 inhibition pauses even with mitogen; RB loss or constitutive cyclin D bypasses the mitogen requirement", () => {
    assert.equal(verdict(run({}, ["cdk46-inhibited"]), "g1s"), "pauses");
    assert.equal(verdict(run({ mitogen: false }, ["rb-loss"]), "g1s"), "proceeds");
    assert.equal(verdict(run({ mitogen: false }, ["cyclin-d-constitutive"]), "g1s"), "proceeds");
  });
  test("RB loss makes the CDK4/6 inhibitor irrelevant (the brake is already gone)", () => {
    assert.equal(verdict(run({}, ["cdk46-inhibited", "rb-loss"]), "g1s"), "proceeds");
  });
  test("S phase needs licensed origins: licensing defects pause the G1/S transition even when E2F and CDK2 are active", () => {
    const ev = run({}, ["licensing-defective"]);
    assert.equal(ev.values.e2f, true); assert.equal(ev.values.cdk2e, true); assert.equal(ev.values.g1sPass, false);
  });
  test("G0 re-entry depends on mitogens", () => {
    assert.equal(verdict(run({ phase: "G0", mitogen: false }), "g0g1"), "pauses");
    assert.equal(verdict(run({ phase: "G0", mitogen: true }), "g0g1"), "proceeds");
  });
});

describe("cyclin–CDK regulation is more than cyclin presence", () => {
  test("a complex is active only with the cyclin, activating phosphorylation, no inhibitory phosphates and no CKI", () => {
    for (let n = 0; n < 16; n++) {
      const cyclin = !!(n & 1), cak = !!(n & 2), inhibPhos = !!(n & 4), cki = !!(n & 8);
      assert.equal(C.evaluateCdk({ complex: "cdk1b", cyclin, cak, inhibPhos, cki }).values.active, cyclin && cak && !inhibPhos && !cki, `${n}`);
    }
  });
  test("cyclin present but Wee1-type inhibitory phosphates retained: CDK1 is inactive (cyclin B concentration alone does not activate)", () => {
    assert.equal(C.evaluateCdk({ complex: "cdk1b", cyclin: true, cak: true, inhibPhos: true, cki: false }).values.active, false);
    assert.equal(C.evaluateCdk({ complex: "cdk1b", cyclin: true, cak: true, inhibPhos: false, cki: false }).values.active, true);
  });
  test("complexes: D–CDK4/6 inhibited by INK4, E/A–CDK2 by CIP/KIP, B–CDK1 by inhibitory phosphorylation", () => {
    const by = (id) => C.CDK_COMPLEXES.find((c) => c.id === id);
    assert.match(by("cdk46d").inhibitors, /INK4/); assert.match(by("cdk2e").inhibitors, /p21/); assert.match(by("cdk1b").inhibitors, /Wee1/);
    assert.match(by("cdk46d").substrates, /RB/);
  });
});

describe("DNA-damage checkpoint", () => {
  test("double-strand breaks in G1: ATM → CHK2 → p53 → p21, Cdc25 inhibited, CDK2 inactive, G1/S pauses", () => {
    const ev = run({ dsb: true });
    for (const k of ["atm", "chk2", "p53", "p21"]) assert.equal(ev.values[k], true, k);
    assert.equal(ev.values.cdc25, false); assert.equal(ev.values.cdk2e, false);
    assert.equal(verdict(ev, "g1s"), "pauses");
  });
  test("p53 loss alone does not release the G1/S arrest: the ATM–CHK2–Cdc25 arm still holds in this model", () => {
    const ev = run({ dsb: true }, ["p53-loss"]);
    assert.equal(ev.values.p21, false);
    assert.equal(verdict(ev, "g1s"), "pauses");
    assert.ok(ev.outcome.uncertain.some((s) => /does not by itself predict malignancy/.test(s)));
  });
  test("only when every arm is defective does the transition proceed — reported as unresolved, not as a fate", () => {
    const ev = run({ dsb: true }, ["p53-loss", "atm-defective", "chk1-defective"]);
    assert.equal(ev.values.g1sPass, true);
    assert.equal(verdict(ev, "g1s"), "unresolved");
    assert.ok(ev.outcome.uncertain.join(" ").match(/not determined/) || ev.verdicts.find((v) => v.id === "g1s").text.match(/not determined/));
  });
  test("ATM responds to double-strand breaks, ATR to stalled forks", () => {
    const a = run({ phase: "S", replStress: true }).values;
    assert.equal(a.atr, true); assert.equal(a.atm, false); assert.equal(a.chk1, true); assert.equal(a.chk2, false); assert.equal(a.p53, true);
    const b = run({ dsb: true }).values;
    assert.equal(b.atm, true);
  });
  test("damage-signalling is absent without damage", () => {
    const v = run().values;
    for (const k of ["atm", "atr", "chk1", "chk2", "p53", "p21"]) assert.equal(v[k], false, k);
    assert.equal(v.cdc25, true);
  });
  test("the cell fate (repair, senescence, apoptosis) is explicitly not determined", () => {
    const ev = run({ dsb: true });
    assert.ok(ev.outcome.uncertain.some((s) => /repaired|senescence|apoptosis/.test(s)));
  });
});

describe("G2/M control", () => {
  test("normal G2: Wee1 and Cdc25 balance resolves to active cyclin B–CDK1 and mitotic entry", () => {
    const ev = run({ phase: "G2" });
    assert.equal(ev.values.cdk1Inhib, false); assert.equal(ev.values.cdk1Active, true); assert.equal(verdict(ev, "g2m"), "proceeds");
  });
  test("incomplete replication: ATR–CHK1 inhibits Cdc25, Wee1's phosphates stay, CDK1 is inhibited and entry pauses", () => {
    const ev = run({ phase: "G2", replicationComplete: false });
    assert.equal(ev.values.unreplicated, true); assert.equal(ev.values.chk1, true); assert.equal(ev.values.cdc25, false); assert.equal(ev.values.cdk1Inhib, true);
    assert.equal(ev.values.cdk1Active, false); assert.equal(verdict(ev, "g2m"), "pauses");
  });
  test("CHK1 defect or Wee1 inhibition lets a cell with unreplicated DNA reach mitotic entry: unresolved", () => {
    assert.equal(verdict(run({ phase: "G2", replicationComplete: false }, ["chk1-defective"]), "g2m"), "unresolved");
    assert.equal(verdict(run({ phase: "G2", replicationComplete: false }, ["wee1-inhibited"]), "g2m"), "unresolved");
  });
  test("Cdc25 loss blocks mitotic entry even in a healthy cell", () => {
    assert.equal(verdict(run({ phase: "G2" }, ["cdc25-loss"]), "g2m"), "pauses");
  });
  test("damage in G2 holds CDK1 (checkpoint kinases and p21)", () => {
    assert.equal(verdict(run({ phase: "G2", dsb: true }), "g2m"), "pauses");
  });
});

describe("spindle assembly checkpoint and anaphase gating", () => {
  const m = (o = {}, perts = []) => run({ phase: "M", ...o }, perts);
  test("all kinetochores attached: no checkpoint signal, APC/C–Cdc20 active, securin degraded, separase free, cohesin cleaved, anaphase", () => {
    const v = m().values;
    assert.equal(v.sacSignal, false); assert.equal(v.mcc, false); assert.equal(v.apcCdc20, true); assert.equal(v.securinDown, true); assert.equal(v.separase, true); assert.equal(v.cohesinCleaved, true); assert.equal(v.anaphase, true);
  });
  test("an unattached kinetochore: MAD/BUB → MCC sequesters Cdc20, securin is retained, separase is inactive, cohesin stays: no anaphase", () => {
    const ev = m({ allAttached: false });
    for (const [k, want] of Object.entries({ unattached: true, sacSignal: true, mcc: true, apcCdc20: false, securinDown: false, separase: false, cohesinCleaved: false, anaphase: false })) assert.equal(ev.values[k], want, k);
    assert.equal(verdict(ev, "m"), "pauses");
  });
  test("a defective checkpoint lets anaphase start despite an unattached kinetochore: unresolved, with the mitotic-error consequences not determined", () => {
    const ev = m({ allAttached: false }, ["sac-defective"]);
    assert.equal(ev.values.anaphase, true); assert.equal(verdict(ev, "m"), "unresolved");
  });
  test("non-degradable securin or non-cleavable cohesin block anaphase even when everything is attached", () => {
    assert.equal(m({}, ["securin-stable"]).values.anaphase, false);
    assert.equal(m({}, ["cohesin-uncleavable"]).values.anaphase, false);
    assert.equal(m({}, ["securin-stable"]).values.separase, false);
  });
  test("APC/C–Cdc20 needs mitotic CDK1 activity", () => {
    assert.equal(m({}, ["cdc25-loss"]).values.apcCdc20, false);
  });
  test("invariant: with the checkpoint signal ON, anaphase never occurs under any one or two supported perturbations", () => {
    const ids = C.CYCLE_PERTURBATIONS.map((p) => p.id);
    const sets = [[]];
    for (const a of ids) { sets.push([a]); for (const b of ids) if (a < b) sets.push([a, b]); }
    let checked = 0;
    for (const s of sets) {
      const targets = s.map((id) => C.CYCLE_PERTURBATIONS.find((p) => p.id === id).target);
      if (new Set(targets).size !== targets.length) continue;
      const ev = m({ allAttached: false }, s);
      if (ev.values.sacSignal) { assert.equal(ev.values.anaphase, false, s.join("+")); checked += 1; }
    }
    assert.ok(checked > 40);
  });
  test("the model states that attachment and tension are simplified to one condition", () => {
    assert.match(C.cycleNode("allAttached").caveat, /distinct mechanisms/);
    assert.ok(m({ allAttached: false }).outcome.uncertain.some((s) => /tension/.test(s)));
  });
});

describe("invalid and contradictory states", () => {
  test("phase-inconsistent conditions are reported", () => {
    const has = (i, re) => C.cycleConsistency(i).some((e) => re.test(e));
    assert.ok(has({ ...C.DEFAULT_CYCLE, phase: "G0", pastRestriction: true }, /G0/));
    assert.ok(has({ ...C.DEFAULT_CYCLE, phase: "S", pastRestriction: true, replicationComplete: true }, /S phase/));
    assert.ok(has({ ...C.DEFAULT_CYCLE, allAttached: false }, /mitosis/));
    assert.ok(has({ ...C.DEFAULT_CYCLE, replStress: true }, /S or G2/));
    assert.ok(has({ ...C.DEFAULT_CYCLE, phase: "S", pastRestriction: false, replicationComplete: false }, /restriction point/));
  });
  test("withPhase always produces a consistent state", () => {
    for (const from of C.PHASE_IDS) for (const to of C.PHASE_IDS) assert.deepEqual(C.cycleConsistency(C.withPhase(C.withPhase(C.DEFAULT_CYCLE, from), to)), [], `${from}→${to}`);
  });
  test("saved-state validation rejects contradictions, unknown perturbations and perturbation clashes", () => {
    assert.equal(C.validateCycle({ ...C.DEFAULT_CYCLE }).ok, true);
    assert.equal(C.validateCycle({ ...C.DEFAULT_CYCLE, phase: "G0", pastRestriction: true }).ok, false);
    assert.equal(C.validateCycle({ ...C.DEFAULT_CYCLE, perturbations: ["nope"] }).ok, false);
    assert.equal(C.validateCycle({ ...C.DEFAULT_CYCLE, perturbations: ["rb-loss", "rb-loss"] }).ok, false);
    assert.equal(C.validateCycle({ ...C.DEFAULT_CYCLE, perturbations: ["cdk46-inhibited", "rb-loss", "wee1-inhibited", "cdc25-loss", "p53-loss"] }).ok, false);
    assert.equal(C.validateCycle({ ...C.DEFAULT_CYCLE, mitogen: "yes" }).ok, false);
  });
});

describe("replication licensing", () => {
  const L = (phase, perts = []) => C.evaluateLicense({ phase, perturbations: perts });
  test("origins can be licensed in G1 (and at mitotic exit) but not in S, G2 or mitosis", () => {
    assert.equal(L("g1").values.licensingPermitted, true);
    assert.equal(L("mexit").values.licensingPermitted, true);
    for (const p of ["s", "g2", "m"]) assert.equal(L(p).values.licensingPermitted, false, p);
  });
  test("licensing is distinct from firing: licensed origins fire in S, not in G1", () => {
    assert.equal(L("g1").values.firing, false);
    assert.equal(L("s").values.firing, true);
    assert.equal(L("g2").values.firing, false);
    assert.equal(L("g1").origin, "licensed"); assert.equal(L("s").origin, "firing"); assert.equal(L("mexit").origin, "being licensed");
  });
  test("the brakes: geminin appears when APC/C–Cdh1 is off, Cdt1 is destroyed at forks and by CDK, Cdc6 is switched off by CDK", () => {
    assert.equal(L("g1").values.geminin, false); assert.equal(L("s").values.geminin, true);
    assert.equal(L("s").values.cdt1Degraded, true); assert.equal(L("g1").values.cdt1Degraded, false);
    assert.equal(L("s").values.cdc6Active, false);
  });
  test("normal cycles never allow re-licensing in any phase", () => {
    for (const p of C.LICENSE_PHASES) assert.equal(L(p).values.relicensing, false, p);
  });
  test("losing one or two of the three brakes does not allow licensing in S in this model, but the result is flagged uncertain", () => {
    for (const perts of [["geminin-loss"], ["cdt1-stable"], ["cdc6-cdk-resistant"], ["geminin-loss", "cdt1-stable"], ["geminin-loss", "cdc6-cdk-resistant"]]) {
      const e = L("s", perts);
      assert.equal(e.values.licensingPermitted, false, perts.join());
      assert.ok(e.outcome.uncertain.some((u) => /single brake|redundancy/.test(u)), perts.join());
    }
  });
  test("losing all three brakes in S allows inappropriate re-licensing: the hazard that once-per-cycle licensing prevents", () => {
    const e = L("s", ["geminin-loss", "cdt1-stable", "cdc6-cdk-resistant"]);
    assert.equal(e.values.licensingPermitted, true); assert.equal(e.values.relicensing, true); assert.equal(e.origin, "re-licensed (hazard)");
    assert.ok(e.outcome.definite.some((d) => /second time/.test(d)));
  });
  test("DDK is needed to fire licensed origins", () => {
    assert.equal(L("s", ["ddk-inhibited"]).values.firing, false);
  });
  test("saved licensing state validation", () => {
    assert.equal(C.validateLicense({ phase: "s", perturbations: ["geminin-loss"] }).ok, true);
    assert.equal(C.validateLicense({ phase: "x", perturbations: [] }).ok, false);
    assert.equal(C.validateLicense({ phase: "s", perturbations: ["geminin-loss", "geminin-loss"] }).ok, false);
  });
});

describe("assumptions are stated", () => {
  test("no durations or activity levels are produced and fates beyond the model are not decided", () => {
    const text = C.CELLCYCLE_ASSUMPTIONS.join(" ");
    assert.match(text, /No cyclin concentrations/); assert.match(text, /not determined/); assert.match(text, /do not by themselves predict cancer/);
  });
});
