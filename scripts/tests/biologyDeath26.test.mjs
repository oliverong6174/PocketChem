// Stage 26: apoptosis, autophagy and the cell-fate map. Expectations are typed from textbook cell biology
// (BH3-only / BCL-2 / BAX-BAK / MOMP / cytochrome c / APAF1 / caspase-9 / caspase-3,7; Fas–FADD–DISC–caspase-8–BID; ULK1–Beclin1/VPS34–LC3–lysosome).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let D;
before(async () => { D = await loadModule("/src/utils/biology/celldeath26.ts"); });
after(() => closeEngine());

const A = (o = {}, perts = []) => D.evaluateApoptosis({ ...D.DEFAULT_APOPTOSIS, ...o, perturbations: perts });
const U = (o = {}, perts = []) => D.evaluateAutophagy({ ...D.DEFAULT_AUTOPHAGY, ...o, perturbations: perts });

describe("intrinsic apoptosis", () => {
  test("DNA damage with functional p53: PUMA/NOXA → BH3 signal → BAX/BAK → MOMP → cytochrome c → apoptosome → caspase-9 → caspase-3/7", () => {
    const v = A({ dnaDamage: true }).values;
    for (const k of ["pumaNoxa", "bh3Signal", "bh3Effective", "baxBak", "momp", "cytC", "apoptosome", "casp9", "casp37"]) assert.equal(v[k], true, k);
    assert.equal(v.casp8, false); assert.equal(v.receptor, false);
  });
  test("the steps occur in the textbook order and the pathway progress counts consecutive steps", () => {
    assert.deepEqual(D.PATH_STEPS.intrinsic.map((s) => s.node), ["bh3Signal", "bh3Effective", "baxBak", "momp", "cytC", "apoptosome", "casp9", "casp37"]);
    assert.equal(D.pathProgress("intrinsic", A({ dnaDamage: true }).values), 8);
    assert.equal(D.pathProgress("intrinsic", A({ dnaDamage: false }).values), 0);
  });
  test("no stimulus, no apoptosis", () => {
    const ev = A({ dnaDamage: false });
    assert.equal(ev.values.casp37, false);
    assert.ok(ev.outcome.definite.some((s) => /No death stimulus/.test(s)));
  });
  test("each stimulus reaches MOMP through the right BH3-only route; DNA damage needs p53, growth-factor withdrawal does not", () => {
    assert.equal(A({ dnaDamage: true }, ["p53-loss"]).values.momp, false);
    assert.equal(A({ dnaDamage: false, gfWithdrawal: true }, ["p53-loss"]).values.momp, true);
    assert.equal(A({ dnaDamage: false, gfWithdrawal: true }).values.bim, true);
    assert.equal(A({ dnaDamage: false, erStress: true }).values.momp, true);
    assert.equal(A({ dnaDamage: false, mitoStress: true }).values.momp, true);
  });
  test("pro-survival BCL-2 excess neutralises the BH3 signal: no BAX/BAK activation, MOMP, cytochrome c release or caspases", () => {
    const v = A({ dnaDamage: true }, ["bcl2-overexpression"]).values;
    assert.equal(v.bh3Signal, true); assert.equal(v.bh3Effective, false);
    for (const k of ["baxBak", "momp", "cytC", "apoptosome", "casp9", "casp37"]) assert.equal(v[k], false, k);
  });
  test("BAX and BAK are redundant: losing one still permits MOMP, losing both blocks it", () => {
    assert.equal(A({}, ["bax-loss"]).values.momp, true);
    assert.equal(A({}, ["bak-loss"]).values.momp, true);
    assert.equal(A({}, ["bax-loss", "bak-loss"]).values.momp, false);
    assert.ok(A({}, ["bax-loss"]).outcome.definite.some((s) => /remaining one of BAX\/BAK is sufficient/.test(s)));
  });
  test("MOMP is distinct from the later steps: APAF1 loss allows cytochrome c release but no apoptosome, caspase-9 or caspase-3/7", () => {
    const v = A({}, ["apaf1-loss"]).values;
    assert.equal(v.momp, true); assert.equal(v.cytC, true); assert.equal(v.apoptosome, false); assert.equal(v.casp9, false); assert.equal(v.casp37, false);
  });
  test("caspase-9 inhibition stops the intrinsic route after the apoptosome; MOMP-without-caspases is flagged uncertain, not assigned a fate", () => {
    const ev = A({}, ["casp9-inhibited"]);
    assert.equal(ev.values.apoptosome, true); assert.equal(ev.values.casp9, false); assert.equal(ev.values.casp37, false);
    assert.ok(ev.outcome.uncertain.some((s) => /caspase-independent/.test(s)));
    assert.ok(!ev.outcome.definite.some((s) => /survive|die/.test(s) && /will/.test(s)));
  });
});

describe("extrinsic apoptosis", () => {
  const E = (o = {}, perts = []) => A({ dnaDamage: false, deathLigand: true, ...o }, perts);
  test("type I cell: Fas → FADD → DISC → caspase-8 → caspase-3/7 directly, without needing mitochondria", () => {
    const v = E({ typeII: false }, ["bax-loss", "bak-loss"]).values;
    for (const k of ["receptor", "fadd", "disc", "casp8", "casp3Direct", "casp37"]) assert.equal(v[k], true, k);
    assert.equal(v.momp, false); // executioner caspases were reached without any mitochondrial permeabilisation
  });
  test("type II cell: caspase-8 → BID → tBID → BAX/BAK → MOMP → apoptosome → caspase-9 → caspase-3/7; blocking the mitochondrial arm stops execution", () => {
    const ok = E({ typeII: true }).values;
    for (const k of ["casp8", "tbid", "bh3Effective", "momp", "cytC", "apoptosome", "casp9", "casp37"]) assert.equal(ok[k], true, k);
    assert.equal(ok.casp3Direct, false);
    for (const p of [["bcl2-overexpression"], ["bax-loss", "bak-loss"], ["apaf1-loss"], ["bid-loss"]]) assert.equal(E({ typeII: true }, p).values.casp37, false, p.join());
    for (const p of [["bcl2-overexpression"], ["bax-loss", "bak-loss"], ["apaf1-loss"], ["bid-loss"]]) assert.equal(E({ typeII: false }, p).values.casp37, true, `type I ${p.join()}`);
  });
  test("the extrinsic order is receptor, adaptor, DISC, caspase-8, executioner; each step is required by the next", () => {
    assert.deepEqual(D.PATH_STEPS.extrinsic.map((s) => s.node), ["receptor", "fadd", "disc", "casp8", "casp37"]);
    assert.equal(D.pathProgress("extrinsic", E().values), 5);
    for (const p of ["receptor-defective", "fadd-loss", "cflip-high", "casp8-inhibited"]) { const v = E({}, [p]).values; assert.equal(v.casp8, false, p); assert.equal(v.casp37, false, p); }
  });
  test("without the ligand, death-receptor signalling is not activated; intrinsic stimuli do not activate caspase-8 by themselves", () => {
    assert.equal(A({ dnaDamage: true, deathLigand: false }).values.casp8, false);
    assert.equal(A({ dnaDamage: false, deathLigand: false }).values.receptor, false);
  });
  test("extrinsic and intrinsic initiation are distinct: Fas-only and DNA-damage-only runs use different initiator caspases", () => {
    const e = E().values, i = A({ dnaDamage: true }).values;
    assert.equal(e.casp8, true);
    assert.equal(i.casp9, true); assert.equal(i.casp8, false);
  });
  test("death receptors do not all operate identically (caveat shown)", () => {
    assert.match(D.APOPTOSIS_GRAPH.nodes.find((n) => n.id === "receptor").caveat, /do not all operate like Fas/);
  });
});

describe("caspase cascade", () => {
  test("initiator caspases are activated on platforms; executioner caspases by proteolytic cleavage — they are not identical enzymes", () => {
    const by = Object.fromEntries(D.CASPASES.map((c) => [c.id, c]));
    assert.equal(by.casp8.kind, "initiator"); assert.equal(by.casp9.kind, "initiator"); assert.equal(by.casp3.kind, "executioner"); assert.equal(by.casp7.kind, "executioner");
    assert.match(by.casp8.platform, /DISC/); assert.match(by.casp9.platform, /Apoptosome/);
    assert.match(by.casp3.activation, /Cleavage/); assert.match(by.casp8.activation, /proximity/);
  });
  test("executioner activity produces the dismantling consequences; none occur without it", () => {
    const on = A({}).values, off = A({}, ["executioner-inhibited"]).values;
    for (const k of ["lamin", "dnase", "bleb", "ps"]) { assert.equal(on[k], true, k); assert.equal(off[k], false, k); }
    assert.equal(off.momp, true);
  });
  test("executioner caspase activation by an upstream initiator is required: no initiator, no executioner", () => {
    assert.equal(A({}, ["casp9-inhibited"]).values.casp37, false);
    assert.equal(A({ dnaDamage: false, deathLigand: true }, ["casp8-inhibited"]).values.casp37, false);
  });
  test("caspase activation is not described as always irreversible", () => {
    const ev = A({});
    assert.ok(ev.outcome.uncertain.some((s) => /not always|usually, but not always/.test(s)));
  });
});

describe("autophagy", () => {
  test("starvation: mTORC1 off → ULK1 → Beclin1–VPS34 (PI3P) → phagophore → LC3 lipidation → cargo → autophagosome → fusion → degradation → recycling", () => {
    const v = U({ nutrients: false }).values;
    assert.equal(v.mtorc1, false);
    for (const k of ["ulk1", "vps34", "phagophore", "lc3", "cargo", "autophagosome", "fusion", "degradation", "recycled"]) assert.equal(v[k], true, k);
    assert.equal(U({ nutrients: false }).progress, 8);
  });
  test("with nutrients mTORC1 keeps ULK1 off: no autophagy initiation", () => {
    const ev = U({ nutrients: true });
    assert.equal(ev.values.mtorc1, true); assert.equal(ev.values.ulk1, false); assert.equal(ev.values.autophagosome, false); assert.equal(ev.progress, 0);
  });
  test("energy stress (AMPK) also switches mTORC1 off", () => {
    const v = U({ nutrients: true, energyStress: true }).values;
    assert.equal(v.ampk, true); assert.equal(v.mtorc1, false); assert.equal(v.autophagosome, true);
  });
  test("mTORC1 inhibition induces autophagy even with nutrients available", () => {
    assert.equal(U({ nutrients: true }, ["mtor-inhibited"]).values.autophagosome, true);
  });
  test("each component is required in sequence: loss of ULK1, VPS34 or ATG conjugation stops before autophagosome formation", () => {
    for (const p of ["ulk1-loss", "vps34-inhibited", "atg-conjugation-loss"]) { const ev = U({ nutrients: false }, [p]); assert.equal(ev.values.autophagosome, false, p); assert.equal(ev.values.degradation, false, p); }
    assert.equal(U({ nutrients: false }, ["ulk1-loss"]).values.phagophore, false);
    assert.equal(U({ nutrients: false }, ["atg-conjugation-loss"]).values.phagophore, true);
  });
  test("lysosome fusion and acidification: blocking either leaves autophagosomes accumulating without degradation or recycling", () => {
    const f = U({ nutrients: false }, ["fusion-defective"]).values;
    assert.equal(f.autophagosome, true); assert.equal(f.fusion, false); assert.equal(f.accumulating, true); assert.equal(f.recycled, false);
    const a = U({ nutrients: false }, ["v-atpase-inhibited"]).values;
    assert.equal(a.fusion, true); assert.equal(a.degradation, false); assert.equal(a.accumulating, true);
  });
  test("recycling needs cargo; an empty autophagosome degrades nothing", () => {
    const v = U({ nutrients: false, cargoAvailable: false }).values;
    assert.equal(v.autophagosome, true); assert.equal(v.cargo, false); assert.equal(v.recycled, false);
  });
  test("autophagy is not apoptosis: the autophagy graph has no caspase or MOMP node and the model states it activates no caspases", () => {
    const ids = D.AUTOPHAGY_GRAPH.nodes.map((n) => n.id).join(" ");
    assert.doesNotMatch(ids, /casp|momp|cytC|apoptosome/);
    assert.ok(U({ nutrients: false }).outcome.definite.some((s) => /separate pathway from apoptosis/.test(s)));
    assert.equal(A({ dnaDamage: false }).values.autophagosome, undefined);
  });
  test("whether more autophagy kills or protects is not predicted", () => {
    assert.ok(U({ nutrients: false }).outcome.uncertain.some((s) => /survive or contributes to its death/.test(s)));
  });
});

describe("cell-fate map and scenarios", () => {
  const F = (scenario, perturbations = []) => D.evaluateFate({ scenario, perturbations, selected: null });
  const row = (ev, id) => ev.rows.find((r) => r.id === id);
  test("the map is structurally valid and every link carries an evidence label", () => {
    assert.deepEqual(D.validateFateMap(), []);
    for (const l of D.FATE_LINKS) assert.ok(["established", "context-dependent"].includes(l.evidence));
    assert.ok(D.validateFateMap(D.FATE_NODES, [...D.FATE_LINKS, { id: "bad", from: "ghost", to: "arrest", kind: "activates", evidence: "established", text: "" }]).length > 0);
  });
  test("DNA damage: checkpoint and arrest engaged, mitochondrial apoptosis engaged (p53 → PUMA); death receptor not engaged", () => {
    const f = F("dna-damage");
    assert.equal(row(f, "checkpoint").status, "engaged"); assert.equal(row(f, "arrest").status, "engaged"); assert.equal(row(f, "intrinsic").status, "engaged");
    assert.equal(row(f, "extrinsic").status, "not-engaged");
    assert.ok(f.uncertain.some((s) => /repairs and resumes|senescence/.test(s)));
  });
  test("p53 loss under DNA damage: checkpoint arm via ATM still arrests, but PUMA-dependent mitochondrial apoptosis is not reached; fate not decided", () => {
    const f = F("dna-damage", ["p53-loss"]);
    assert.equal(row(f, "arrest").status, "engaged"); assert.notEqual(row(f, "intrinsic").status, "engaged");
    assert.ok(f.uncertain.length > 0);
  });
  test("ATM + p53 defects: arrest is reported blocked (cycle proceeds), not a fate", () => {
    const f = F("dna-damage", ["p53-loss", "atm-defective"]);
    assert.notEqual(row(f, "checkpoint").status, "not-engaged");
  });
  test("nutrient deprivation engages autophagy and lysosomal recycling but derives no apoptosis; apoptosis is only 'possible'", () => {
    const f = F("nutrient-deprivation");
    assert.equal(row(f, "autophagy").status, "engaged"); assert.equal(row(f, "recycling").status, "engaged");
    assert.equal(row(f, "caspases").status, "not-engaged");
    assert.equal(row(f, "intrinsic").status, "possible"); assert.equal(row(f, "intrinsic").evidence, "context-dependent");
  });
  test("ER stress and mitochondrial stress: intrinsic apoptosis engaged under the severe-stress assumption; autophagy only 'possible' (context-dependent)", () => {
    for (const s of ["er-stress", "mito-stress"]) { const f = F(s); assert.equal(row(f, "intrinsic").status, "engaged", s); assert.equal(row(f, "autophagy").status, "possible", s); assert.equal(row(f, "autophagy").evidence, "context-dependent"); }
  });
  test("death-receptor scenario: extrinsic engaged, caspases engaged, BCL-2 excess does not block a type I cell", () => {
    const f = F("death-receptor");
    assert.equal(row(f, "extrinsic").status, "engaged"); assert.equal(row(f, "caspases").status, "engaged");
    assert.equal(row(F("death-receptor", ["bcl2-overexpression"]), "caspases").status, "engaged");
    assert.equal(row(F("death-receptor", ["cflip-high"]), "extrinsic").status, "blocked");
    assert.equal(row(F("death-receptor", ["receptor-defective"]), "caspases").status, "blocked");
  });
  test("lysosomal dysfunction: autophagosomes form but recycling is blocked, and no death is asserted", () => {
    const f = F("lysosomal-dysfunction");
    assert.equal(row(f, "autophagy").status, "engaged"); assert.equal(row(f, "recycling").status, "blocked");
    assert.equal(row(f, "intrinsic").status, "possible");
    assert.ok(f.uncertain.some((s) => /do not|not predicted/.test(s)));
  });
  test("every scenario states that no survival probability, clinical outcome or treatment response is predicted", () => {
    for (const s of D.SCENARIOS) assert.ok(F(s.id).uncertain.some((u) => /no survival probability, clinical outcome, cancer susceptibility or treatment response/.test(u)), s.id);
  });
  test("perturbation sets are validated", () => {
    assert.equal(D.validateFate({ scenario: "dna-damage", perturbations: ["p53-loss"], selected: null }).ok, true);
    assert.equal(D.validateFate({ scenario: "dna-damage", perturbations: ["bax-loss", "bax-loss"], selected: null }).ok, false);
    assert.equal(D.validateFate({ scenario: "x", perturbations: [], selected: null }).ok, false);
    assert.equal(D.validateFate({ scenario: "dna-damage", perturbations: [], selected: "ghost" }).ok, false);
    assert.equal(D.validateFate({ scenario: "dna-damage", perturbations: ["bid-loss"], selected: null }).ok, false); // not in the fate-map catalogue
  });
  test("saved apoptosis and autophagy state validation", () => {
    assert.equal(D.validateApoptosis({ ...D.DEFAULT_APOPTOSIS }).ok, true);
    assert.equal(D.validateApoptosis({ ...D.DEFAULT_APOPTOSIS, step: 99 }).ok, false);
    assert.equal(D.validateApoptosis({ ...D.DEFAULT_APOPTOSIS, path: "extrinsic", step: 6 }).ok, false);
    assert.equal(D.validateApoptosis({ ...D.DEFAULT_APOPTOSIS, perturbations: ["bax-loss", "bak-loss", "p53-loss", "apaf1-loss", "casp9-inhibited"] }).ok, false);
    assert.equal(D.validateAutophagy({ ...D.DEFAULT_AUTOPHAGY }).ok, true);
    assert.equal(D.validateAutophagy({ ...D.DEFAULT_AUTOPHAGY, perturbations: ["zzz"] }).ok, false);
  });
  test("accidental injury-associated death and other regulated forms are stated as not modelled", () => {
    const t = D.CELLDEATH_ASSUMPTIONS.join(" ");
    assert.match(t, /necroptosis, pyroptosis, ferroptosis/); assert.match(t, /accidental/);
  });
});
