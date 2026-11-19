// Stage 25: fatty-acid, ketone-body, amino-acid and urea-cycle models on the shared metabolic network, checked against INDEPENDENTLY typed
// expectations (textbook sequences, hand-derived counts and formulas). Expected values are never produced by the code under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let N, L, LP, NI, F, LR, RD, PV;
before(async () => {
  N = await loadModule("/src/utils/biochem/metabolism/network.ts");
  L = await loadModule("/src/utils/biochem/metabolism/ledger.ts");
  LP = await loadModule("/src/utils/biochem/metabolism/lipids.ts");
  NI = await loadModule("/src/utils/biochem/metabolism/nitrogen.ts");
  F = await loadModule("/src/utils/biochem/metabolism/fuel.ts");
  LR = await loadModule("/src/utils/biochem/metabolism/learning25.ts");
  PV = await loadModule("/src/utils/biochem/metabolism/provenance.ts");
  RD = await loadModule("/src/utils/rdkit.ts");
});
after(async () => { await closeEngine(); });

const sat = (n) => ({ kind: "saturated", carbons: n });
const parse = (f) => { const o = {}; for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) o[m[1]] = (o[m[1]] ?? 0) + (m[2] ? +m[2] : 1); return o; };
const enzymeIds = (steps) => steps.map((s) => N.REACTIONS_BY_ID[s.reactionId]?.enzyme ?? LP.reactionOfId(s.reactionId).enzyme);

describe("network extension and shared identities", () => {
  test("validateNetwork reports no problems, including every generated chain-length reaction (C4 to C18, even and odd) and every FAS round", () => {
    assert.deepEqual(N.validateNetwork(), []);
  });
  test("every registered reaction balances atoms and charge, checked with a separate parser (including the ACP pseudo-element Q)", () => {
    for (const r of N.REACTIONS) {
      if (r.tags?.includes("transport")) continue;
      const sum = {}; let charge = 0;
      for (const [side, s] of [[r.substrates, -1], [r.products, 1]]) for (const p of side) {
        const m = N.METABOLITES_BY_ID[p.met]; assert.ok(m && m.formula, `${r.id}: ${p.met}`);
        for (const [el, n] of Object.entries(parse(m.formula))) sum[el] = (sum[el] ?? 0) + s * n * p.n;
        charge += s * m.charge * p.n;
      }
      for (const [el, n] of Object.entries(sum)) assert.equal(Math.round(n * 1e6) / 1e6, 0, `${r.id}: ${el}`);
      assert.equal(charge, 0, `${r.id}: charge`);
    }
  });
  test("shared metabolites are defined once: acetyl-CoA, oxaloacetate, α-ketoglutarate, succinyl-CoA, fumarate, ATP, NADH, FADH2, NADPH and CoA", () => {
    for (const id of ["acetylcoa", "oaa", "akg", "succoa", "fumarate", "atp", "nadh", "fadh2", "nadph", "coa"]) assert.equal(N.METABOLITES.filter((m) => m.id === id).length, 1, id);
    assert.equal(N.METABOLITES.filter((m) => /^acetyl-coa$/i.test(m.name)).length, 1);
    assert.equal(N.METABOLITES.filter((m) => /^oxaloacetate$/i.test(m.name)).length, 1);
    const users = (m) => new Set(F.metaboliteRoles(m).flatMap((r) => r.pathways));
    for (const p of ["pyruvate-oxidation", "tca", "beta-oxidation", "ketogenesis", "ketolysis", "fa-synthesis"]) assert.ok(users("acetylcoa").has(p), `acetyl-CoA in ${p}`);
    assert.ok(users("fumarate").has("tca") && users("fumarate").has("urea-cycle"));
    assert.ok(users("succoa").has("ketolysis") && users("succoa").has("propionate") && users("succoa").has("tca"));
    assert.ok(users("oaa").has("transamination") && users("oaa").has("gluconeogenesis"));
    assert.deepEqual(F.REQUIRED_SHARED.slice().sort(), ["acetylcoa", "atp", "coa", "fadh2", "fumarate", "nadh", "nadph", "oaa", "akg", "succoa"].sort());
  });
  test("amino acids reuse the Stage 17 table: 20 ids aa-X with identical formulas", async () => {
    const aa = await loadModule("/src/utils/biochem/aminoAcids.ts");
    for (const a of aa.AMINO_ACID_LIST) { const m = N.METABOLITES_BY_ID[`aa-${a.one}`]; assert.equal(m.formula, a.formula); assert.equal(m.structure.smiles, a.smiles); }
    assert.equal(N.METABOLITES.filter((m) => m.id.startsWith("aa-")).length, 20);
  });
  test("a compartment of every reaction is declared by each pathway it belongs to; compartments and transport are valid", () => {
    for (const r of N.REACTIONS) for (const role of r.roles) assert.ok(N.PATHWAYS[role.pathway].compartments.includes(r.compartment), `${r.id} in ${role.pathway}`);
    for (const r of N.REACTIONS.filter((x) => x.transport)) for (const t of r.transport) { assert.notEqual(t.from, t.to); assert.ok(N.METABOLITES_BY_ID[t.met].compartments.includes(t.from) && N.METABOLITES_BY_ID[t.met].compartments.includes(t.to), r.id); }
  });
  test("a deliberately broken reaction is rejected (unbalanced, unknown metabolite, unavailable transport)", () => {
    const bad = structuredClone(N.REACTIONS_BY_ID.ACC); bad.products = [{ met: "malonylcoa", n: 2 }, { met: "adp", n: 1 }, { met: "pi", n: 1 }];
    assert.notEqual(N.reactionBalance(bad).atoms.C, 0);
    const worse = structuredClone(N.REACTIONS_BY_ID.CPS1); worse.substrates = [{ met: "nitrogen-gas", n: 1 }];
    assert.equal(N.reactionBalance(worse), null);
    const moved = structuredClone(N.REACTIONS_BY_ID["CIT-EXPORT"]); moved.transport = [{ met: "citrulline", from: "blood", to: "matrix" }];
    assert.ok(!N.METABOLITES_BY_ID.citrulline.compartments.includes(moved.transport[0].from));
  });
});

describe("fatty-acid activation and the carnitine shuttle", () => {
  test("activation: ATP → AMP + PPi (1 bond), pyrophosphatase (2 bonds), 1 ATP molecule consumed but 2 ATP equivalents", () => {
    const a = LP.activation(16);
    assert.equal(a.atpMolecules, 1); assert.equal(a.synthetaseBonds, 1); assert.equal(a.bondsAfterPyrophosphatase, 2); assert.equal(a.atpEquivalents, 2);
    assert.equal(a.synthetase.amp, 1); assert.equal(a.synthetase.ppi, 1); assert.equal(a.synthetase.atp, -1);
    assert.deepEqual(N.REACTIONS_BY_ID["ACS:16"].substrates.map((p) => p.met).sort(), ["atp", "coa", "fa-16"]);
    for (const n of [4, 8, 12, 18]) assert.equal(LP.activation(n).atpEquivalents, 2);
  });
  test("activation is separate from β-oxidation: its reactions are not in the cycle pathway", () => {
    const cycle = N.pathwayReactions("beta-oxidation").map((x) => x.reaction.id);
    for (const id of ["ACS:16", "PPASE", "ADK", "CPT1:16"]) assert.ok(!cycle.includes(id), id);
  });
  test("shuttle order: activated → CPT I → translocase → CPT II; compartments; malonyl-CoA acts on CPT I", () => {
    const s = LP.carnitineShuttle(16);
    assert.deepEqual(s.steps.map((x) => x.reactionId), ["ACS:16", "CPT1:16", "CACT:16", "CPT2:16"]);
    assert.equal(N.REACTIONS_BY_ID["CPT1:16"].compartment, "omm"); assert.equal(N.REACTIONS_BY_ID["CACT:16"].compartment, "inner-membrane"); assert.equal(N.REACTIONS_BY_ID["CPT2:16"].compartment, "matrix");
    assert.deepEqual(N.REACTIONS_BY_ID["CACT:16"].transport.map((t) => [t.met, t.from, t.to]), [["acylcarnitine-16", "ims", "matrix"], ["carnitine", "matrix", "ims"]]);
    assert.ok(N.REACTIONS_BY_ID["CPT1:16"].tags.includes("regulatory")); assert.equal(N.REACTIONS_BY_ID["CPT1:16"].enzyme, "cpt1");
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["CPT1:16"]), { "acylcoa-16": -1, carnitine: -1, "acylcarnitine-16": 1, coa: 1 });
  });
  test("the shuttle is not applied to every chain: short and medium chains do not need it, C12 is borderline, C14+ require it", () => {
    for (const n of [4, 6, 8, 10]) assert.equal(N.carnitineRequirement(n), "no");
    assert.equal(N.carnitineRequirement(12), "partly");
    for (const n of [14, 16, 18]) assert.equal(N.carnitineRequirement(n), "yes");
    assert.equal(LP.fattyAcidInfo(8).activationCompartment, "matrix"); assert.equal(LP.fattyAcidInfo(16).activationCompartment, "omm");
  });
});

describe("β-oxidation reaction identities, counts and ATP estimates", () => {
  test("the cycle is dehydrogenation (FAD), hydration, dehydrogenation (NAD+), thiolysis, with the textbook cofactors", () => {
    const seq = LP.oxidationSequence(sat(16)).slice(0, 4);
    assert.deepEqual(enzymeIds(seq), ["acad", "ech", "hadh", "thiolase"]);
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["ACAD:16"]), { "acylcoa-16": -1, fad: -1, "enoylcoa-16": 1, fadh2: 1 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["ECH:16"]), { "enoylcoa-16": -1, h2o: -1, "hydroxyacylcoa-16": 1 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["HADH:16"]), { "hydroxyacylcoa-16": -1, nad: -1, "ketoacylcoa-16": 1, nadh: 1, hplus: 1 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["THIOL:16"]), { "ketoacylcoa-16": -1, coa: -1, "acylcoa-14": 1, acetylcoa: 1 });
  });
  test("chain shortens by two per cycle and the visible chain equals the ledger's", () => {
    const s = LP.oxidationSequence(sat(16));
    assert.equal(s.length, 28);
    for (let cyc = 1; cyc <= 7; cyc++) assert.equal(s[(cyc - 1) * 4].chainBefore, 16 - 2 * (cyc - 1));
    assert.deepEqual([0, 4, 8, 12, 28].map((k) => LP.oxidationStateAfter(sat(16), k).chain), [16, 14, 12, 10, 2]);
    const st = LP.oxidationStateAfter(sat(16), 8);
    assert.deepEqual([st.nadh, st.fadh2, st.acetylCoA], [2, 2, 2]);
  });
  test("even chains C4 to C18: cycles n/2−1, acetyl-CoA n/2, NADH = FADH2 = cycles (typed formulas)", () => {
    for (let n = 4; n <= 18; n += 2) {
      const t = LP.oxidationTotals(sat(n));
      assert.equal(t.cycles, n / 2 - 1, `C${n} cycles`); assert.equal(t.acetylCoA, n / 2); assert.equal(t.nadh, n / 2 - 1); assert.equal(t.fadh2, n / 2 - 1);
      assert.equal(t.atp.total, 10 * (n / 2) + 4 * (n / 2 - 1) - 2, `C${n} ATP`);
      assert.equal(t.atpDirectlyFromBetaOxidation, 0);
    }
  });
  test("palmitate reference: 7 cycles, 8 acetyl-CoA, 7 NADH, 7 FADH2, activation 2, 106 ATP equivalents; stearate 120; butyrate 22", () => {
    const t = LP.oxidationTotals(sat(16));
    assert.deepEqual([t.cycles, t.acetylCoA, t.nadh, t.fadh2, t.activationAtpEquivalents, t.atp.total], [7, 8, 7, 7, 2, 106]);
    assert.deepEqual([t.atp.fromNadh, t.atp.fromFadh2, t.atp.fromAcetylCoA], [17.5, 10.5, 80]);
    assert.equal(LP.oxidationTotals(sat(18)).atp.total, 120); assert.equal(LP.oxidationTotals(sat(4)).atp.total, 22);
    assert.equal(LP.acetylCoaCycleAtp(), 10);
  });
  test("last cycle uses the shared thiolase (ACAT) in reverse, giving two acetyl-CoA from acetoacetyl-CoA", () => {
    const s = LP.oxidationSequence(sat(4));
    assert.equal(s.length, 4); assert.equal(s[3].reactionId, "ACAT"); assert.equal(s[3].direction, "reverse");
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.ACAT, "reverse"), { acetoacetylcoa: -1, coa: -1, acetylcoa: 2 });
  });
  test("odd chain C15: exact products (6 cycles, 6 acetyl-CoA, 1 propionyl-CoA, 6 NADH, 6 FADH2) but no ATP value; C17 and C5 likewise", () => {
    const t = LP.oxidationTotals(sat(15));
    assert.deepEqual([t.cycles, t.acetylCoA, t.propionylCoA, t.nadh, t.fadh2], [6, 6, 1, 6, 6]); assert.equal(t.atp, null);
    assert.deepEqual([LP.oxidationTotals(sat(17)).cycles, LP.oxidationTotals(sat(17)).propionylCoA, LP.oxidationTotals(sat(5)).cycles, LP.oxidationTotals(sat(5)).acetylCoA], [7, 1, 1, 1]);
    assert.equal(LP.oxidationSupport(sat(15)).atpSupported, false);
  });
  test("propionyl-CoA → succinyl-CoA: PCC (biotin, 1 ATP), epimerase, mutase (B12); net propionyl-CoA + CO2 + ATP + H2O → succinyl-CoA + ADP + Pi", () => {
    const p = LP.propionateRoute();
    assert.deepEqual(p.steps.map((r) => r.id), ["PCC", "MCEE", "MUT"]);
    assert.deepEqual(p.net, { propionylcoa: -1, co2: -1, atp: -1, h2o: -1, succoa: 1, adp: 1, pi: 1 });
    assert.equal(p.atpSpent, 1); assert.deepEqual(p.cofactors.map((c) => c.cofactor).join("|").includes("B₁₂") && p.cofactors.map((c) => c.cofactor).join("|").includes("Biotin"), true);
  });
  test("oleate (cis-Δ9): isomerase replaces one dehydrogenation at C12; 8 cycles, 9 acetyl-CoA, 8 NADH, 7 FADH2, 118.5", () => {
    const seq = LP.oxidationSequence({ kind: "oleate" });
    assert.equal(seq.filter((s) => s.phase === "isomerase").length, 1); assert.equal(seq.find((s) => s.phase === "isomerase").chainBefore, 12);
    const t = LP.oxidationTotals({ kind: "oleate" });
    assert.deepEqual([t.cycles, t.acetylCoA, t.nadh, t.fadh2, t.atp.total], [8, 9, 8, 7, 118.5]);
  });
  test("unsupported cases are rejected: C2, C3, C20, C19 saturated; polyunsaturated, very-long, branched are listed as unsupported", () => {
    for (const n of [2, 3, 20, 19, 1.5, 0]) { assert.equal(LP.oxidationSupport(sat(n)).supported, false, String(n)); assert.equal(LP.oxidationTotals(sat(n)), null); assert.deepEqual(LP.oxidationSequence(sat(n)), []); }
    assert.ok(["linoleate", "very-long", "branched"].every((id) => LP.UNSUPPORTED_CASES.some((c) => c.id === id)));
    assert.throws(() => LP.fattyAcidInfo(15));
  });
});

describe("fatty-acid synthesis", () => {
  test("palmitate: 8 acetyl units, 7 malonyl-CoA, 7 rounds, 14 NADPH, 7 ATP for malonyl-CoA, 8 ATP for acetyl-CoA export, 15 total", () => {
    const s = LP.synthesisLedger(16);
    assert.deepEqual([s.acetylUnits, s.malonylCoA, s.rounds, s.nadphConsumed, s.atpForMalonylCoA, s.atpForAcetylCoAExport, s.atpTotalFromAcetylSource], [8, 7, 7, 14, 7, 8, 15]);
    assert.deepEqual([s.nadphFromMalicEnzyme, s.nadphOtherSources], [8, 6]);
  });
  test("cytosolic-source net equals the hand-balanced textbook equation: 8 AcCoA + 7 ATP + 14 NADPH + 14 H+ + H2O → palmitate + 8 CoA + 7 ADP + 7 Pi + 14 NADP+", () => {
    assert.deepEqual(LP.synthesisLedger(16, "cytosolic").net, { "fa-16": 1, acetylcoa: -8, atp: -7, adp: 7, pi: 7, nadph: -14, nadp: 14, hplus: -14, coa: 8, h2o: -1 });
  });
  test("ATP and NADPH are separate ledger rows; NADPH is not NADH and is never added to the NADH ledger", () => {
    const l = F.pathwayLedger("fa-synthesis").ledgers;
    assert.equal(l.nadph, -6); assert.equal(l.redox.nadh, -8); assert.equal(l.energy.atp, -15);
    assert.notEqual(N.METABOLITES_BY_ID.nadph.id, N.METABOLITES_BY_ID.nadh.id);
  });
  test("round reactions use NADPH in the two reductions; condensation releases CO2; the hydroxy intermediate is the D isomer (named), unlike β-oxidation's L", () => {
    assert.ok(N.REACTIONS_BY_ID["KR:16"].substrates.some((p) => p.met === "nadph")); assert.ok(N.REACTIONS_BY_ID["ER:16"].substrates.some((p) => p.met === "nadph"));
    assert.ok(N.REACTIONS_BY_ID["KS:16"].products.some((p) => p.met === "co2"));
    assert.ok(/^D-/.test(N.METABOLITES_BY_ID["acp-hydroxy-16"].name) && /^L-/.test(N.METABOLITES_BY_ID["hydroxyacylcoa-16"].name));
    assert.equal(N.REACTIONS_BY_ID["KS:16"].compartment, "cytosol"); assert.equal(N.REACTIONS_BY_ID["ACS:16"].compartment === "cytosol", false);
    assert.equal(LP.synthesisSequence(16).length, 44); assert.equal(LP.synthesisLedger(15), null);
  });
  test("acetyl-CoA carboxylase makes malonyl-CoA with biotin chemistry (CO2 + ATP); malonyl-CoA is the species CPT I is regulated by", () => {
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.ACC), { acetylcoa: -1, co2: -1, atp: -1, h2o: -1, malonylcoa: 1, adp: 1, pi: 1 });
  });
});

describe("regulation of lipid metabolism (qualitative)", () => {
  test("fed: ACC and malonyl-CoA higher, CPT I lower, synthesis favoured over oxidation", () => {
    const r = LP.lipidRegulation(LP.LIPID_PRESETS.find((p) => p.id === "fed").conditions);
    assert.deepEqual([r.acc, r.malonylCoA, r.cpt1, r.synthesis, r.oxidation], ["higher", "higher", "lower", "higher", "lower"]);
  });
  test("fasting and low energy: ACC lower, CPT I higher; reference gives no change; conflicting signals are uncertain", () => {
    const f = LP.lipidRegulation(LP.LIPID_PRESETS.find((p) => p.id === "fasting").conditions);
    assert.deepEqual([f.acc, f.cpt1, f.oxidation], ["lower", "higher", "higher"]);
    assert.equal(LP.lipidRegulation(LP.LIPID_PRESETS.find((p) => p.id === "low-energy").conditions).cpt1, "higher");
    const ref = LP.lipidRegulation(LP.NORMAL_LIPID_CONDITIONS); assert.deepEqual([ref.acc, ref.cpt1], ["reference", "reference"]);
    assert.equal(LP.lipidRegulation({ ...LP.NORMAL_LIPID_CONDITIONS, hormone: "insulin", energy: "low" }).acc, "uncertain");
    assert.equal(LP.lipidRegulation({ ...LP.NORMAL_LIPID_CONDITIONS, acylCoa: "high" }).acc, "lower");
  });
});

describe("ketone bodies", () => {
  test("ketogenesis order and net: 2 acetyl-CoA + H2O → acetoacetate + 2 CoA; β-hydroxybutyrate adds NADH; acetone is a side branch excluded from the sum", () => {
    assert.deepEqual(LP.KETOGENESIS_STEPS, ["ACAT", "HMGCS2", "HMGCL", "BDH1", "KB-EXPORT"]);
    assert.deepEqual(N.pathwayReactions("ketogenesis").map((x) => x.reaction.id).slice(0, 5), ["ACAT", "HMGCS2", "HMGCL", "BDH1", "KB-EXPORT"]);
    assert.deepEqual(LP.ketogenesisNet("acetoacetate"), { acetylcoa: -2, h2o: -1, acetoacetate: 1, coa: 2 });
    assert.deepEqual(LP.ketogenesisNet("bhb"), { acetylcoa: -2, h2o: -1, bhb: 1, coa: 2, nad: 1, nadh: -1, hplus: -1 });
    assert.equal(N.REACTIONS_BY_ID.ACETONE.branchOf, "BDH1");
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.ACETONE), { acetoacetate: -1, acetone: 1, co2: 1 });
  });
  test("identities: acetoacetate C4H6O3 and D-β-hydroxybutyrate C4H8O3 are different species; HMG-CoA C27H44N7O20P3S", () => {
    assert.equal(N.METABOLITES_BY_ID.acetoacetate.formula, "C4H6O3"); assert.equal(N.METABOLITES_BY_ID.bhb.formula, "C4H8O3");
    assert.equal(N.METABOLITES_BY_ID.hmgcoa.formula, "C27H44N7O20P3S");
    assert.equal(N.METABOLITES_BY_ID.acetoacetylcoa.formula, N.chainFormula("ketoacylcoa", 4));
  });
  test("ketolysis via SCOT then thiolase: BHB + NAD+ + succinyl-CoA + CoA → 2 acetyl-CoA + succinate + NADH + H+; ATP-equivalent estimates 19 (acetoacetate) and 21.5 (β-HB)", () => {
    assert.deepEqual(LP.KETOLYSIS_STEPS, ["KB-IMPORT", "BDH1", "SCOT", "ACAT"]);
    assert.deepEqual(LP.ketolysisNet("bhb"), { bhb: -1, nad: -1, nadh: 1, hplus: 1, succinate: 1, succoa: -1, coa: -1, acetylcoa: 2 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.SCOT), { acetoacetate: -1, succoa: -1, acetoacetylcoa: 1, succinate: 1 });
    assert.equal(LP.ketoneOxidationAtp("acetoacetate").total, 19); assert.equal(LP.ketoneOxidationAtp("bhb").total, 21.5);
  });
  test("tissue restrictions: SCOT extrahepatic only (liver lacks it); HMG-CoA synthase and lyase liver only; red blood cells use none", () => {
    assert.deepEqual(N.ENZYMES_BY_ID.scot.tissues, ["extrahepatic"]); assert.deepEqual(N.ENZYMES_BY_ID.hmgcs2.tissues, ["liver"]); assert.deepEqual(N.ENZYMES_BY_ID.hmgcl.tissues, ["liver"]);
    assert.deepEqual(F.tissuesOf(N.REACTIONS_BY_ID.SCOT), ["extrahepatic"]); assert.deepEqual(F.tissuesOf(N.REACTIONS_BY_ID.HMGCS2), ["liver"]);
    const t = Object.fromEntries(LP.KETONE_TISSUES.map((x) => [x.id, x]));
    assert.deepEqual([t.liver.makes, t.liver.uses, t["heart-muscle"].makes, t["heart-muscle"].uses, t.rbc.makes, t.rbc.uses], [true, false, false, true, false, false]);
    assert.equal(N.REACTIONS_BY_ID["KB-EXPORT"].compartment, "blood"); assert.equal(N.REACTIONS_BY_ID["KB-IMPORT"].compartment, "matrix");
  });
  test("acetyl-CoA is one identity across β-oxidation, ketogenesis, ketolysis, PDH and citrate synthase", () => {
    for (const id of ["PDH", "CS", "NAGS", "HMGCS2", "HMGCL", "ACAT", "ACC"]) assert.ok([...N.REACTIONS_BY_ID[id].substrates, ...N.REACTIONS_BY_ID[id].products].some((p) => p.met === "acetylcoa"), id);
    assert.ok(N.REACTIONS_BY_ID["THIOL:16"].products.some((p) => p.met === "acetylcoa"));
    const a = F.acetylCoaSources(); assert.equal(a.cycleAtpPerAcetylCoA, 10); assert.deepEqual([a.carbohydrate.upstreamPerAcetylCoA, a.acetoacetate.upstreamPerAcetylCoA, a.bhb.upstreamPerAcetylCoA], [6, -0.5, 0.75]);
  });
});

describe("amino-acid catabolism", () => {
  const classes = () => { const o = { glucogenic: [], ketogenic: [], both: [] }; for (const a of NI.AMINO_CATABOLISM) o[NI.classifyAminoAcid(a.one)].push(a.one); for (const k of Object.keys(o)) o[k].sort(); return o; };
  test("standard classification (typed from textbook): leucine and lysine ketogenic only; I, F, T, W, Y both; the other 13 glucogenic", () => {
    assert.deepEqual(classes(), { ketogenic: ["K", "L"], both: ["F", "I", "T", "W", "Y"], glucogenic: ["A", "C", "D", "E", "G", "H", "M", "N", "P", "Q", "R", "S", "V"] });
    assert.equal(NI.AMINO_CATABOLISM.length, 20);
  });
  test("carbon-skeleton destinations (curated): Ala→pyruvate, Asp/Asn→OAA, Glu/Gln/Pro/His/Arg→α-KG, Val/Met→succinyl-CoA, Phe/Tyr→fumarate + acetoacetate", () => {
    const d = (o) => NI.AMINO_CATABOLISM_BY_ONE[o].endpoints.slice().sort();
    assert.deepEqual(d("A"), ["pyruvate"]); assert.deepEqual(d("D"), ["oaa"]); assert.deepEqual(d("N"), ["oaa"]);
    for (const o of ["E", "Q", "P", "H", "R"]) assert.deepEqual(d(o), ["akg"], o);
    for (const o of ["V", "M"]) assert.deepEqual(d(o), ["succoa"], o);
    for (const o of ["F", "Y"]) assert.deepEqual(d(o), ["acetoacetate", "fumarate"], o);
    assert.deepEqual(d("L"), ["acetoacetate", "acetylcoa"]);
    assert.ok(d("I").includes("succoa") && d("I").includes("acetylcoa")); assert.ok(d("T").includes("pyruvate") && d("T").includes("acetylcoa"));
  });
  test("exclusively ketogenic amino acids have no glucogenic endpoint; mixed ones are not assigned a single endpoint", () => {
    for (const o of ["L", "K"]) assert.ok(NI.AMINO_CATABOLISM_BY_ONE[o].endpoints.every((e) => !NI.ENDPOINTS[e].glucogenic));
    for (const o of ["I", "F", "T", "W", "Y"]) assert.ok(NI.AMINO_CATABOLISM_BY_ONE[o].endpoints.length >= 2, o);
  });
  test("transamination: ALT and AST stoichiometry; no ammonium; the six selectable substrates balance with Stage 17 formulas", () => {
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.ALT), { "aa-A": -1, akg: -1, pyruvate: 1, "aa-E": 1 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.AST), { "aa-D": -1, akg: -1, oaa: 1, "aa-E": 1 });
    for (const one of NI.TRANSAMINATION_ONES) { const t = NI.transamination(one); assert.equal(t.balanced, true, one); assert.equal(t.ammoniumReleased, 0, one); assert.equal(t.net["aa-E"], 1); assert.equal(t.net.akg, -1); }
    assert.equal(N.ENZYMES_BY_ID.alt.note.includes("B₆"), true);
  });
  test("PLP mechanism: eight stages, amino group on the amino acid, then PMP, then glutamate; free ammonia is never released", () => {
    const m = NI.plpMechanism("Alanine", "pyruvate");
    assert.equal(m.length, 8); assert.ok(m.every((s) => s.freeAmmonia === false));
    assert.deepEqual([m[0].aminoGroupOn, m[4].aminoGroupOn, m[7].aminoGroupOn], ["amino acid", "enzyme-bound PLP/PMP", "glutamate"]);
    assert.ok(NI.plpCoenzyme.vitamin.includes("B₆"));
  });
  test("oxidative deamination: Glu + NAD+ + H2O → α-KG + NH4+ + NADH (matrix); NADP variant; reverse is reductive amination; distinct from transamination", () => {
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.GDH), { "aa-E": -1, nad: -1, h2o: -1, akg: 1, nh4: 1, nadh: 1 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["GDH-NADP"]), { "aa-E": -1, nadp: -1, h2o: -1, akg: 1, nh4: 1, nadph: 1 });
    assert.equal(N.REACTIONS_BY_ID.GDH.compartment, "matrix"); assert.equal(N.REACTIONS_BY_ID["GDH-NADP"].branchOf, "GDH");
    const am = NI.glutamateDehydrogenase("nadp", "amination"); assert.equal(am.ammonium, -1); assert.equal(am.reducedCarrier, -1);
    assert.equal(NI.glutamateDehydrogenase().ammonium, 1);
    assert.equal(NI.transamination("A").ammoniumReleased, 0);
    assert.deepEqual(NI.transdeamination("A").net, { "aa-A": -1, nad: -1, h2o: -1, pyruvate: 1, nh4: 1, nadh: 1 });
    assert.equal(F.pathwayLedger("deamination").ledgers.nadph, 0);
  });
});

describe("urea cycle", () => {
  test("five principal reactions in order, plus transporters and pyrophosphatase: CPS I, OTC, (citrulline out), ASS, PPase, ASL, arginase, (ornithine in)", () => {
    assert.deepEqual(NI.UREA_CORE, ["CPS1", "OTC", "CIT-EXPORT", "ASS", "PPASE", "ASL", "ARG1", "ORN-IMPORT"]);
    assert.deepEqual(NI.UREA_CORE.filter((id) => !N.REACTIONS_BY_ID[id].tags?.includes("transport") && id !== "PPASE").map((id) => N.REACTIONS_BY_ID[id].enzyme), ["cps1", "otc", "ass", "asl", "arg1"]);
  });
  test("compartments: CPS I and OTC in the matrix; ASS, ASL, arginase in the cytosol; transport across the inner membrane", () => {
    assert.deepEqual(["CPS1", "OTC"].map((id) => N.REACTIONS_BY_ID[id].compartment), ["matrix", "matrix"]);
    assert.deepEqual(["ASS", "ASL", "ARG1"].map((id) => N.REACTIONS_BY_ID[id].compartment), ["cytosol", "cytosol", "cytosol"]);
    assert.deepEqual(["CIT-EXPORT", "ORN-IMPORT"].map((id) => N.REACTIONS_BY_ID[id].compartment), ["inner-membrane", "inner-membrane"]);
    assert.deepEqual(N.REACTIONS_BY_ID["CIT-EXPORT"].transport, [{ met: "citrulline", from: "matrix", to: "cytosol" }]);
    assert.deepEqual(N.REACTIONS_BY_ID["ORN-IMPORT"].transport, [{ met: "ornithine", from: "cytosol", to: "matrix" }]);
  });
  test("net: CO2 + NH4+ + Asp + 3 ATP + 3 H2O... (typed): ornithine is regenerated (not in the net), urea and fumarate form", () => {
    assert.deepEqual(NI.ureaNet(), { co2: -1, nh4: -1, "aa-D": -1, atp: -3, h2o: -3, amp: 1, adp: 2, pi: 4, hplus: 1, urea: 1, fumarate: 1 });
    assert.equal(NI.ureaNet().ornithine, undefined); assert.equal(NI.ureaNet().citrulline, undefined);
  });
  test("three ATP molecules but four high-energy bonds; ATP → AMP + PPi at ASS; per step 2 + 1 + 1", () => {
    const e = NI.ureaEnergy();
    assert.deepEqual([e.atpMolecules, e.highEnergyBonds, e.amp, e.adp], [3, 4, 1, 2]);
    assert.deepEqual(e.perStep.map((s) => [s.reactionId, s.atp, s.bonds]), [["CPS1", -2, -2], ["ASS", -1, -1], ["PPASE", 0, -1]]);
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.ASS), { citrulline: -1, "aa-D": -1, atp: -1, argsucc: 1, amp: 1, ppi: 1 });
  });
  test("nitrogen sources: ammonium nitrogen via carbamoyl phosphate and aspartate nitrogen; both end in urea; carbon from CO2; tracing agrees with formulas at every step", () => {
    const urea = NI.ureaTrace(7).find((s) => s.metabolite === "urea");
    assert.deepEqual(urea.nitrogens.map((n) => n.source).sort(), ["Aspartate", "NH₄⁺ (carbamoyl phosphate)"]);
    assert.ok(urea.carbonSource.includes("CO₂"));
    assert.deepEqual(NI.ureaTrace(2).find((s) => s.metabolite === "citrulline").nitrogens.map((n) => n.id).sort(), ["N-NH4", "N-orn-alpha", "N-orn-delta"]);
    assert.deepEqual(NI.ureaTrace(4).find((s) => s.metabolite === "argsucc").nitrogens.length, 4);
    for (let s = 0; s <= 8; s++) assert.equal(NI.ureaTraceConsistent(s), true, `step ${s}`);
    assert.deepEqual(NI.ureaTrace(6).find((s) => s.metabolite === "fumarate").nitrogens, []);
    assert.equal(NI.ureaTrace(8).some((s) => s.metabolite === "ornithine"), true);
  });
  test("fumarate connection: fumarate → malate → OAA → aspartate gives 1 NADH, shown separately from the 3-ATP accounting", () => {
    const c = NI.fumarateConnection();
    assert.equal(c.nadh, 1); assert.equal(c.atpEstimate, 2.5); assert.equal(c.estimatedNetBondEquivalents, 1.5);
    assert.deepEqual(c.net, { fumarate: -1, h2o: -1, nad: -1, "aa-E": -1, nadh: 1, hplus: 1, "aa-D": 1, akg: 1 });
    assert.equal(NI.ureaEnergy().atpMolecules, 3);
  });
  test("CPS I regulation: N-acetylglutamate required (absent → lower); arginine stimulates NAGS (higher); NAG formed from acetyl-CoA + glutamate", () => {
    assert.equal(NI.ureaRegulation({ nagPresent: false, arginine: "normal" }).cps1, "lower");
    assert.equal(NI.ureaRegulation({ nagPresent: true, arginine: "normal" }).cps1, "reference");
    assert.deepEqual(["nags", "cps1"].map((k) => NI.ureaRegulation({ nagPresent: true, arginine: "high" })[k]), ["higher", "higher"]);
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.NAGS), { acetylcoa: -1, "aa-E": -1, nag: 1, coa: 1 });
    assert.ok(NI.UREA_CAVEATS.some((c) => /patient/.test(c)));
  });
});

describe("integrated network ledgers and scenarios", () => {
  test("carbon and nitrogen bookkeeping: every non-transport reaction conserves skeleton carbon and non-carrier nitrogen", () => {
    for (const r of N.REACTIONS) { if (r.tags?.includes("transport")) continue; const l = F.reactionLedgers(r); assert.equal(l.carbon.net, 0, `${r.id} C`); assert.equal(Math.abs(l.nitrogen.net) < 1e-9, true, `${r.id} N`); }
  });
  test("nitrogen disposal is not an ATP-producing pathway; urea cycle consumes ATP; separate NADPH row", () => {
    const u = F.pathwayLedger("urea-cycle").ledgers;
    assert.ok(u.energy.atp < 0 && u.energy.highEnergyBonds === -4); assert.deepEqual([u.nitrogen.consumed, u.nitrogen.produced, u.nitrogen.urea, u.nitrogen.ammonium], [2, 2, 1, -1]); assert.equal(u.carbon.co2, -1);
    for (const p of ["transamination", "deamination", "urea-cycle"]) assert.ok(F.pathwayLedger(p).ledgers.energy.atp <= 0, p);
  });
  test("no double counting: a pathway listed twice adds once; energy carriers are summed from stoichiometry", () => {
    assert.deepEqual(F.combinedLedger(["glycolysis", "glycolysis"]).net, F.combinedLedger(["glycolysis"]).net);
    assert.equal(F.combinedLedger(["glycolysis", "pyruvate-oxidation", "tca"]).ledgers.redox.nadh, 10); assert.equal(F.combinedLedger(["glycolysis", "pyruvate-oxidation", "tca"]).ledgers.redox.fadh2, 2);
  });
  test("substrate comparison under the Stage 18 convention: glucose 32, palmitate 106, acetoacetate 19, β-hydroxybutyrate 21.5; glycerol-phosphate shuttle gives glucose 30", () => {
    assert.deepEqual(F.substrateComparison().map((r) => [r.id, r.atp]), [["glucose", 32], ["palmitate", 106], ["acetoacetate", 19], ["bhb", 21.5]]);
    assert.equal(F.substrateComparison("glycerol-phosphate")[0].atp, 30);
  });
  test("scenarios: supported behaviour, tissue distinctions, and unknown states are 'not determined' rather than invented", () => {
    assert.equal(F.stateOf("fed", "beta-oxidation", "liver"), "tends-suppressed"); assert.equal(F.stateOf("fed", "fa-synthesis", "liver"), "tends-active");
    assert.equal(F.stateOf("fasting-fao", "beta-oxidation", "liver"), "tends-active"); assert.equal(F.stateOf("fasting-fao", "fa-synthesis", "liver"), "tends-suppressed");
    assert.equal(F.stateOf("fasting-fao", "ketogenesis", "liver"), "tends-active"); assert.equal(F.stateOf("fasting-fao", "ketogenesis", "extrahepatic"), "absent");
    assert.equal(F.stateOf("ketolysis", "ketolysis", "liver"), "absent"); assert.equal(F.stateOf("ketolysis", "ketolysis", "extrahepatic"), "tends-active");
    assert.equal(F.stateOf("nitrogen-disposal", "urea-cycle", "liver"), "tends-active");
    assert.equal(F.stateOf("baseline", "urea-cycle", "liver"), "not-determined");
    assert.ok(F.FUEL_SCENARIOS.every((s) => s.missing.length > 0 && s.statements.length > 0));
    assert.equal(F.FUEL_SCENARIOS_BY_ID.weekend, undefined);
  });
});

describe("structures (RDKit) and provenance", () => {
  // Independent references: L-carnitine (R); D-β-hydroxybutyrate (R); L-ornithine, L-citrulline, N-acetyl-L-glutamate (S); L-argininosuccinate (S,S).
  const CIP = { carnitine: ["(R)"], bhb: ["(R)"], ornithine: ["(S)"], citrulline: ["(S)"], nag: ["(S)"], argsucc: ["(S)", "(S)"], acetoacetate: [], acetone: [], urea: [], cp: [], "fa-16": [] };
  test("new drawn structures parse, match their recorded Hill formula and carry the expected CIP labels", async () => {
    const rd = await RD.getRDKit();
    for (const [id, want] of Object.entries(CIP)) {
      const m = N.METABOLITES_BY_ID[id]; const mol = rd.get_mol(m.structure.smiles); assert.ok(mol && mol.is_valid(), id);
      try { assert.equal(mol.get_inchi().split("/")[1], m.formula, `${id} formula`); assert.deepEqual((JSON.parse(mol.get_stereo_tags()).CIP_atoms ?? []).map((x) => x[1]).sort(), want, `${id} CIP`); } finally { mol.delete(); }
    }
  });
  test("fatty acids C4 to C18 (even and odd) have the recorded formulas; oleate keeps its cis (Z) double bond", async () => {
    const rd = await RD.getRDKit();
    for (let n = 4; n <= 18; n++) { const m = N.chainMetabolite("fa", n); const mol = rd.get_mol(m.structure.smiles); try { assert.equal(mol.get_inchi().split("/")[1], `C${n}H${2 * n}O2`, `C${n}`); assert.equal(m.formula, `C${n}H${2 * n}O2`); } finally { mol.delete(); } }
    const o = rd.get_mol("CCCCCCCC/C=C\\CCCCCCCC(=O)O"); try { assert.equal(o.get_inchi().split("/")[1], "C18H34O2"); assert.ok(/\/b\d+-\d+-/.test(o.get_inchi()) && o.get_inchi().includes("/b10-9-")); } finally { o.delete(); }
  });
  test("α-keto acids of the selectable transamination substrates have the typed formulas", async () => {
    const rd = await RD.getRDKit();
    const want = { pyruvate: "C3H4O3", oaa: "C4H4O5", kic: "C6H10O3", kiv: "C5H8O3", kmv: "C6H10O3", hpp: "C9H8O4" };
    for (const t of NI.TRANSAMINATION_SUBSTRATES) { const mol = rd.get_mol(t.keto.smiles); try { assert.equal(mol.get_inchi().split("/")[1], want[t.keto.id], t.keto.id); assert.equal(t.keto.formula, want[t.keto.id]); } finally { mol.delete(); } }
  });
  test("CoA derivatives have no invented atom-level structure; charged carnitine is stored as the zwitterion", () => {
    for (const id of ["acetoacetylcoa", "hmgcoa", "malonylcoa", "propionylcoa", "acylcoa-16", "nadph", "nadp"]) assert.equal(N.METABOLITES_BY_ID[id].structure, undefined, id);
    assert.equal(N.METABOLITES_BY_ID.carnitine.structure.form, "zwitterion"); assert.equal(N.METABOLITES_BY_ID.carnitine.charge, 0);
  });
  test("provenance table stays valid and the Stage 25 claims are honestly marked as not independently checked", () => {
    assert.deepEqual(PV.validateProvenance(), []);
    const c = PV.CLAIMS.filter((x) => ["lipid", "ketone", "amino", "urea"].includes(x.topic));
    assert.ok(c.length >= 10); assert.ok(c.every((x) => x.status === "unverified" && x.sourceIds.length === 0 && x.caveat));
  });
});

describe("learning content follows the engines", () => {
  const sets = () => [...LR.fattyAcidQuestions({ chain: 16, substrate: "saturated", step: 5 }), ...LR.fattyAcidQuestions({ chain: 8, substrate: "saturated", step: 0 }), ...LR.aminoQuestions({ aa: "L", ureaStep: 4, substrate: "A" }), ...LR.fuelQuestions({ scenario: "fasting-fao" }),
    ...LR.fattyAcidChallenges().map((c) => c.question), ...LR.aminoChallenges().map((c) => c.question), ...LR.fuelChallenges().map((c) => c.question)];
  test("every question has an answer inside its options, distinct options and an explanation", () => {
    for (const q of sets()) { assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id); assert.equal(new Set(q.options).size, q.options.length, q.id); assert.ok(q.options.length >= 3 && q.explanation.length > 20, q.id); }
  });
  test("required practice questions exist with independently known answers", () => {
    const by = (id, list) => list.find((q) => q.id === id);
    const fa = LR.fattyAcidQuestions({ chain: 16, substrate: "saturated", step: 0 });
    assert.equal(by("fa-cycles-pal", fa).options[by("fa-cycles-pal", fa).answer], "7");
    assert.match(by("fa-activation-cost", fa).options[by("fa-activation-cost", fa).answer], /AMP \+ PPi/);
    assert.equal(by("fa-nadph", fa).options[by("fa-nadph", fa).answer], "NADPH");
    assert.equal(by("fa-pal-total", fa).options[by("fa-pal-total", fa).answer], "106");
    assert.match(by("ketone-where", fa).options[by("ketone-where", fa).answer], /liver/);
    const am = LR.aminoQuestions({ aa: "A", ureaStep: 0, substrate: "A" });
    assert.match(by("aa-transfer", am).options[by("aa-transfer", am).answer], /amino group/);
    assert.match(by("aa-plp", am).options[by("aa-plp", am).answer], /B₆/);
    assert.match(by("urea-sources", am).options[by("urea-sources", am).answer], /ammonium.*aspartate/i);
    assert.match(by("urea-bonds", am).options[by("urea-bonds", am).answer], /PPi/);
    assert.equal(by("aa-ketogenic", am).options[by("aa-ketogenic", am).answer], "Leucine");
  });
  test("challenge reveals set the state the answer describes", () => {
    const ch = LR.fattyAcidChallenges().find((c) => c.question.id === "fa-ch-fed");
    assert.equal(ch.question.options[ch.question.answer], "Lower"); assert.deepEqual(ch.reveal.conditions, LP.LIPID_PRESETS.find((p) => p.id === "fed").conditions);
    const nag = LR.aminoChallenges()[0]; assert.equal(nag.reveal.nag, false); assert.equal(nag.question.options[nag.question.answer], "Lower");
  });
});
