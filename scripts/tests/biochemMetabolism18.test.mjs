// Stage 18: metabolic network, ledgers, regulation and respiratory-chain model, checked against INDEPENDENTLY typed textbook expectations
// (Lehninger / Berg-Tymoczko style): reaction sequences, enzyme names, ATP and carrier counts, bypass enzymes, proton stoichiometry.
// Expected values are written here by hand; they are never produced by the code under test.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let N, L, R, E, RD;
before(async () => {
  N = await loadModule("/src/utils/biochem/metabolism/network.ts");
  L = await loadModule("/src/utils/biochem/metabolism/ledger.ts");
  R = await loadModule("/src/utils/biochem/metabolism/regulation.ts");
  E = await loadModule("/src/utils/biochem/metabolism/etc.ts");
  RD = await loadModule("/src/utils/rdkit.ts");
});
after(async () => { await closeEngine(); });

const ids = (p) => N.pathwayReactions(p).map((x) => x.reaction.id);
const enz = (p) => N.pathwayReactions(p).map((x) => x.reaction.enzyme);

describe("network integrity", () => {
  test("validateNetwork reports no problems (identities, references, stoichiometry, compartments, atom and charge balance)", () => {
    assert.deepEqual(N.validateNetwork(), []);
  });
  test("every reaction except the transport step balances for atoms and charge, checked with a separate formula parser", () => {
    const parse = (f) => { const o = {}; for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) o[m[1]] = (o[m[1]] ?? 0) + (m[2] ? +m[2] : 1); return o; };
    for (const r of N.REACTIONS) {
      if (r.tags?.includes("transport")) continue;
      const sum = {}; let charge = 0;
      for (const [side, s] of [[r.substrates, -1], [r.products, 1]]) for (const p of side) {
        const m = N.METABOLITES_BY_ID[p.met];
        for (const [el, n] of Object.entries(parse(m.formula))) sum[el] = (sum[el] ?? 0) + s * n * p.n;
        charge += s * m.charge * p.n;
      }
      for (const [el, n] of Object.entries(sum)) assert.equal(Math.round(n * 1e6) / 1e6, 0, `${r.id}: ${el}`);
      assert.equal(charge, 0, `${r.id}: charge`);
    }
  });
  test("a deliberately malformed network is rejected: an unbalanced reaction, a missing metabolite and a bad coefficient are reported", () => {
    const bad = structuredClone(N.REACTIONS_BY_ID.HK);
    const before = N.REACTIONS.length;
    N.REACTIONS.push({ ...bad, id: "BAD1", products: [{ met: "g6p", n: 1 }] }); // missing ADP: unbalanced
    N.REACTIONS.push({ ...bad, id: "BAD2", products: [{ met: "nonexistent", n: 1 }] });
    N.REACTIONS.push({ ...bad, id: "BAD3", products: [{ met: "g6p", n: -1 }, { met: "adp", n: 1 }] });
    const errors = N.validateNetwork();
    N.REACTIONS.length = before;
    assert.ok(errors.some((e) => /BAD1.*does not balance/.test(e)), "unbalanced");
    assert.ok(errors.some((e) => /BAD2.*unknown metabolite/.test(e)), "unknown metabolite");
    assert.ok(errors.some((e) => /BAD3.*bad coefficient/.test(e)), "coefficient");
    assert.deepEqual(N.validateNetwork(), []);
  });
});

describe("glycolysis", () => {
  test("ten reactions in the textbook order, with the right enzymes", () => {
    assert.deepEqual(ids("glycolysis"), ["HK", "PGI", "PFK1", "ALDO", "TPI", "GAPDH", "PGK", "PGM", "ENO", "PK"]);
    assert.deepEqual(enz("glycolysis"), ["hk", "pgi", "pfk1", "aldolase", "tpi", "gapdh", "pgk", "pgm", "eno", "pk"]);
  });
  test("substrates and products of each step (independent list)", () => {
    const want = {
      HK: ["glucose atp", "g6p adp"], PGI: ["g6p", "f6p"], PFK1: ["f6p atp", "f16bp adp"], ALDO: ["f16bp", "dhap g3p"], TPI: ["dhap", "g3p"],
      GAPDH: ["g3p nad pi", "bpg13 h+ nadh"], PGK: ["adp bpg13", "atp pg3"], PGM: ["pg3", "pg2"], ENO: ["pg2", "h2o pep"], PK: ["adp pep", "atp pyruvate"],
    };
    const fix = (s) => s.split(" ").map((x) => (x === "h+" ? "hplus" : x)).sort().join(" ");
    for (const [id, [s, p]] of Object.entries(want)) {
      const r = N.REACTIONS_BY_ID[id];
      assert.equal(r.substrates.map((x) => x.met).sort().join(" "), fix(s), `${id} substrates`);
      assert.equal(r.products.map((x) => x.met).sort().join(" "), fix(p), `${id} products`);
    }
  });
  test("everything after aldolase happens twice per glucose (two triose phosphates)", () => {
    const times = N.pathwayReactions("glycolysis").map((x) => x.role.perGlucose);
    assert.deepEqual(times, [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });
  test("net equation: Glc + 2 ADP + 2 Pi + 2 NAD+ → 2 pyruvate + 2 ATP + 2 NADH + 2 H+ + 2 H2O", () => {
    assert.deepEqual(L.pathwayNet("glycolysis"), { glucose: -1, adp: -2, pi: -2, nad: -2, pyruvate: 2, atp: 2, nadh: 2, hplus: 2, h2o: 2 });
  });
  test("four ATP made, two invested, two net; two NADH", () => {
    assert.deepEqual(L.glycolysisAtpBreakdown(), { invested: 2, produced: 4, net: 2 });
    assert.equal(L.carriersOf(L.pathwayNet("glycolysis")).nadh, 2);
  });
  test("ATP is spent only by hexokinase and PFK-1, and made only by the two kinases that follow (substrate-level phosphorylation)", () => {
    const spend = N.REACTIONS.filter((r) => r.roles.some((x) => x.pathway === "glycolysis") && r.substrates.some((s) => s.met === "atp")).map((r) => r.id);
    assert.deepEqual(spend, ["HK", "PFK1"]);
    const make = N.REACTIONS.filter((r) => r.roles.some((x) => x.pathway === "glycolysis") && r.products.some((s) => s.met === "atp")).map((r) => r.id);
    assert.deepEqual(make, ["PGK", "PK"]);
    assert.deepEqual(N.REACTIONS.filter((r) => r.tags?.includes("substrate-level-phosphorylation") && r.roles.some((x) => x.pathway === "glycolysis")).map((r) => r.id), ["PGK", "PK"]);
  });
  test("the effectively irreversible steps are hexokinase, PFK-1 and pyruvate kinase", () => {
    assert.deepEqual(N.pathwayReactions("glycolysis").filter((x) => x.reaction.reversibility === "irreversible").map((x) => x.reaction.id), ["HK", "PFK1", "PK"]);
  });
  test("carbon counts: 6 → 6 → 6 → 6 → 3 + 3 → 3 …", () => {
    const c = (id) => N.METABOLITES_BY_ID[id].carbons;
    assert.deepEqual(["glucose", "g6p", "f6p", "f16bp", "dhap", "g3p", "bpg13", "pg3", "pg2", "pep", "pyruvate"].map(c), [6, 6, 6, 6, 3, 3, 3, 3, 3, 3, 3]);
  });
  test("every glycolytic reaction is cytosolic", () => { for (const x of N.pathwayReactions("glycolysis")) assert.equal(x.reaction.compartment, "cytosol"); });
  test("cumulative ledger: −2 ATP after PFK-1, back to 0 after phosphoglycerate kinase (investment repaid), +2 after pyruvate kinase", () => {
    assert.equal(L.cumulativeCarriers("glycolysis", 3).atp, -2);
    assert.equal(L.cumulativeCarriers("glycolysis", 7).atp, 0);
    assert.equal(L.cumulativeCarriers("glycolysis", 10).atp, 2);
  });
});

describe("regulation of glycolysis", () => {
  const S = (o) => ({ ...R.NORMAL_SIGNALS, ...o });
  test("PFK-1: ATP inhibits, AMP and fructose 2,6-bisphosphate activate (relative to the reference state)", () => {
    assert.equal(R.enzymeTendency("pfk1", S({ atp: "high" })).tendency, "lower");
    assert.equal(R.enzymeTendency("pfk1", S({ amp: "high" })).tendency, "higher");
    assert.equal(R.enzymeTendency("pfk1", S({ f26bp: "high" })).tendency, "higher");
    assert.equal(R.enzymeTendency("pfk1", S({})).tendency, "reference");
  });
  test("opposing signals are reported as uncertain, not resolved by invention", () => {
    assert.equal(R.enzymeTendency("pfk1", S({ atp: "high", amp: "high" })).tendency, "uncertain");
    assert.equal(R.enzymeTendency("pfk1", S({ atp: "high", f26bp: "high" })).tendency, "uncertain");
  });
  test("pyruvate kinase: ATP inhibits; it has no AMP effect in the curated set", () => {
    assert.equal(R.enzymeTendency("pk", S({ atp: "high" })).tendency, "lower");
    assert.equal(R.enzymeTendency("pk", S({ amp: "high" })).tendency, "reference");
  });
  test("every curated regulatory effect names a real enzyme, a real signal and a kind", () => {
    for (const g of N.REGULATION) { assert.ok(N.ENZYMES_BY_ID[g.enzyme], g.id); assert.ok(g.signal in N.SIGNALS, g.id); assert.ok(["allosteric", "product-feedback", "covalent-indirect", "transcriptional-indirect"].includes(g.kind), g.id); }
  });
  test("indirect (covalent) effects are labelled as such, not as direct allostery", () => {
    for (const id of ["acoa-pdh", "nadh-pdh", "adp-pdh"]) assert.equal(N.REGULATION.find((g) => g.id === id).kind, "covalent-indirect");
    assert.equal(N.REGULATION.find((g) => g.id === "atp-pfk1").kind, "allosteric");
  });
});

describe("gluconeogenesis", () => {
  test("pathway order: the three bypasses are PC+PEPCK, FBPase-1 and G6Pase", () => {
    assert.deepEqual(ids("gluconeogenesis"), ["PC", "MDH-M", "MAL-T", "MDH-C", "PEPCK", "ENO", "PGM", "PGK", "GAPDH", "TPI", "ALDO", "FBP1", "PGI", "G6PASE"]);
    const bypass = N.REACTIONS.filter((r) => r.tags?.includes("bypass")).map((r) => r.id).sort();
    assert.deepEqual(bypass, ["FBP1", "G6PASE", "PC", "PEPCK"]);
  });
  test("bypass enzymes replace the three irreversible kinases: each is not the reverse of the glycolytic enzyme", () => {
    const g = new Set(enz("glycolysis"));
    for (const e of ["pc", "pepck", "fbpase1", "g6pase"]) assert.ok(!g.has(e), e);
    for (const id of ["HK", "PFK1", "PK"]) assert.ok(!N.pathwayReactions("gluconeogenesis").some((x) => x.reaction.id === id), id);
  });
  test("shared reversible reactions are exactly: PGI, aldolase, TPI, GAPDH, PGK, PGM, enolase", () => {
    const glyc = new Set(ids("glycolysis")), shared = ids("gluconeogenesis").filter((i) => glyc.has(i));
    assert.deepEqual(shared.sort(), ["ALDO", "ENO", "GAPDH", "PGI", "PGK", "PGM", "TPI"]);
    for (const i of shared) { assert.equal(N.REACTIONS_BY_ID[i].reversibility, "reversible", i); assert.ok(N.REACTIONS_BY_ID[i].roles.find((r) => r.pathway === "gluconeogenesis").direction === "reverse"); }
  });
  test("two pyruvate → glucose costs 4 ATP + 2 GTP + 2 NADH, and the net equation balances", () => {
    const net = L.pathwayNet("gluconeogenesis");
    assert.deepEqual(net, { pyruvate: -2, atp: -4, adp: 4, gtp: -2, gdp: 2, nadh: -2, nad: 2, hplus: -2, h2o: -6, pi: 6, glucose: 1 });
    const c = L.carriersOf(net);
    assert.equal(c.atp, -4); assert.equal(c.gtp, -2); assert.equal(c.nadh, -2);
  });
  test("energetics differ: glycolysis nets +2 ATP while gluconeogenesis costs 6 nucleoside triphosphates", () => {
    assert.equal(L.carriersOf(L.pathwayNet("glycolysis")).ntpEquivalents, 2);
    assert.equal(L.carriersOf(L.pathwayNet("gluconeogenesis")).ntpEquivalents, -6);
  });
  test("compartments: pyruvate carboxylase in the matrix, glucose-6-phosphatase in the ER lumen, PEPCK in the cytosol", () => {
    assert.equal(N.REACTIONS_BY_ID.PC.compartment, "matrix"); assert.equal(N.REACTIONS_BY_ID.G6PASE.compartment, "er-lumen"); assert.equal(N.REACTIONS_BY_ID.PEPCK.compartment, "cytosol");
  });
  test("reciprocal regulation: fructose 2,6-bisphosphate activates PFK-1 and inhibits FBPase-1; acetyl-CoA activates pyruvate carboxylase", () => {
    const S = (o) => ({ ...R.NORMAL_SIGNALS, ...o });
    assert.equal(R.enzymeTendency("pfk1", S({ f26bp: "high" })).tendency, "higher");
    assert.equal(R.enzymeTendency("fbpase1", S({ f26bp: "high" })).tendency, "lower");
    assert.equal(R.enzymeTendency("pc", S({ acetylcoa: "high" })).tendency, "higher");
    assert.equal(R.enzymeTendency("fbpase1", S({ amp: "high" })).tendency, "lower");
  });
  test("fed and fasting scenarios favour opposite pathways; mixed signals do not claim a direction", () => {
    assert.equal(R.comparePathways(R.signalsFor("fed")).verdict, "favours-glycolysis");
    assert.equal(R.comparePathways(R.signalsFor("fasting")).verdict, "favours-gluconeogenesis");
    assert.equal(R.comparePathways(R.signalsFor("reference")).verdict, "reference");
    assert.equal(R.comparePathways({ ...R.NORMAL_SIGNALS, f26bp: "high", acetylcoa: "high" }).verdict, "mixed-or-uncertain");
  });
  test("every substrate cycle wastes exactly one nucleoside triphosphate (futile cycling)", () => {
    for (const c of R.SUBSTRATE_CYCLES) assert.equal(R.substrateCycleCost(c.id).ntpHydrolysed, 1, c.id);
    assert.deepEqual(R.substrateCycleCost("f6p-f16bp").net, { atp: -1, h2o: -1, adp: 1, pi: 1 });
  });
});

describe("pyruvate oxidation and the citric acid cycle", () => {
  test("PDH: pyruvate + CoA + NAD+ → acetyl-CoA + CO2 + NADH + H+, in the matrix", () => {
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID.PDH), { pyruvate: -1, coa: -1, nad: -1, acetylcoa: 1, co2: 1, nadh: 1, hplus: 1 });
    assert.equal(N.REACTIONS_BY_ID.PDH.compartment, "matrix");
  });
  test("eight cycle reactions in order, with the right enzymes", () => {
    assert.deepEqual(ids("tca"), ["CS", "ACO", "IDH", "AKGDH", "SCS", "SDH", "FUM", "MDH-M"]);
    assert.deepEqual(enz("tca"), ["cs", "aco", "idh", "akgdh", "scs", "sdh", "fum", "mdh-m"]);
  });
  test("carbon counts through one turn: OAA 4 + acetyl 2 → citrate 6 → … → OAA 4, releasing 2 CO2", () => {
    const c = (id) => N.METABOLITES_BY_ID[id].carbons;
    assert.deepEqual(["acetylcoa", "oaa", "citrate", "isocitrate", "akg", "succoa", "succinate", "fumarate", "malate", "oaa"].map(c), [2, 4, 6, 6, 5, 4, 4, 4, 4, 4]);
    assert.equal(L.pathwayNet("tca", "event").co2, 2);
  });
  test("one turn: 3 NADH, 1 FADH2, 1 GTP, 2 CO2 and oaa is regenerated (net zero)", () => {
    const net = L.pathwayNet("tca", "event");
    assert.deepEqual(net, { acetylcoa: -1, nad: -3, fad: -1, gdp: -1, pi: -1, h2o: -2, co2: 2, nadh: 3, hplus: 3, fadh2: 1, gtp: 1, coa: 1 });
    assert.equal(net.oaa, undefined);
    const c = L.carriersOf(net);
    assert.deepEqual([c.nadh, c.fadh2, c.gtp, c.co2], [3, 1, 1, 2]);
  });
  test("per glucose (two acetyl-CoA, two turns) the cycle doubles; pyruvate oxidation adds 2 NADH and 2 CO2 separately, with no double counting", () => {
    const t = L.carriersOf(L.pathwayNet("tca")), p = L.carriersOf(L.pathwayNet("pyruvate-oxidation"));
    assert.deepEqual([t.nadh, t.fadh2, t.gtp, t.co2], [6, 2, 2, 4]);
    assert.deepEqual([p.nadh, p.co2], [2, 2]);
    const total = L.glucoseLedger("malate-aspartate");
    assert.equal(total.co2, 6);
    assert.equal(total.matrixNadh, 8);
  });
  test("complex II is the cycle's succinate dehydrogenase: one enzyme identity in both pathways", () => {
    assert.equal(N.REACTIONS_BY_ID.SDH.enzyme, "sdh");
    assert.equal(N.ENZYMES_BY_ID.sdh.compartment, "inner-membrane");
    assert.equal(E.COMPLEXES.CII.protonsPerPair, 0);
  });
  test("malate dehydrogenase is one reaction with two pathway roles (forward in the cycle, reverse in gluconeogenesis)", () => {
    const roles = N.REACTIONS_BY_ID["MDH-M"].roles.map((r) => `${r.pathway}:${r.direction}`).sort();
    assert.deepEqual(roles, ["gluconeogenesis:reverse", "tca:forward"]);
  });
  test("irreversible cycle steps are citrate synthase, IDH and the α-ketoglutarate dehydrogenase complex", () => {
    assert.deepEqual(N.pathwayReactions("tca").filter((x) => x.reaction.reversibility === "irreversible").map((x) => x.reaction.id), ["CS", "IDH", "AKGDH"]);
  });
  test("cycle regulation: NADH and ATP inhibit IDH, ADP activates it; ADP/NADH/acetyl-CoA act on PDH only through the covalent kinase route", () => {
    const S = (o) => ({ ...R.NORMAL_SIGNALS, ...o });
    assert.equal(R.enzymeTendency("idh", S({ nadh: "high" })).tendency, "lower");
    assert.equal(R.enzymeTendency("idh", S({ adp: "high" })).tendency, "higher");
    assert.equal(R.enzymeTendency("pdh", S({ acetylcoa: "high" })).tendency, "lower");
    assert.equal(R.enzymeTendency("pdh", S({ adp: "high" })).tendency, "higher");
  });
});

describe("respiratory chain and oxidative phosphorylation", () => {
  test("electron path: NADH enters at complex I, succinate at complex II, both meet at Q → III → cyt c → IV → O2", () => {
    assert.deepEqual(E.DONORS.nadh.path, ["NADH", "CI", "Q", "CIII", "cytc", "CIV", "O2"]);
    assert.deepEqual(E.DONORS.succinate.path, ["CII", "Q", "CIII", "cytc", "CIV", "O2"]);
  });
  test("proton stoichiometry: I 4, II 0, III 4, IV 2; NADH 10, FADH2/succinate 6", () => {
    assert.deepEqual([E.COMPLEXES.CI, E.COMPLEXES.CII, E.COMPLEXES.CIII, E.COMPLEXES.CIV].map((c) => c.protonsPerPair), [4, 0, 4, 2]);
    assert.equal(E.protonsPerPair("nadh"), 10); assert.equal(E.protonsPerPair("succinate"), 6);
    assert.equal(N.REACTIONS_BY_ID["ETC-NADH"].protonsPumped, 10); assert.equal(N.REACTIONS_BY_ID["ETC-FADH2"].protonsPumped, 6);
  });
  test("oxygen is reduced to water: ½ O2 per electron pair", () => {
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["ETC-NADH"]), { nadh: -1, hplus: -1, o2: -0.5, nad: 1, h2o: 1 });
    assert.deepEqual(L.reactionNet(N.REACTIONS_BY_ID["ETC-FADH2"]), { fadh2: -1, o2: -0.5, fad: 1, h2o: 1 });
  });
  test("ATP estimates are 2.5 per NADH and 1.5 per FADH2 and are exposed as estimates with a stated H+/ATP assumption", () => {
    assert.equal(L.atpPerNadh(), 2.5); assert.equal(L.atpPerFadh2(), 1.5);
    assert.equal(L.OXPHOS_ASSUMPTIONS.protonsPerAtp, 4);
    assert.ok(E.ETC_ASSUMPTIONS.some((a) => /estimate/i.test(a) && /not universal/i.test(a)));
  });
  test("full oxidation of one glucose: 32 ATP with the malate–aspartate shuttle, 30 with the glycerol-phosphate shuttle (an estimate, not one fixed value)", () => {
    const m = L.glucoseLedger("malate-aspartate"), g = L.glucoseLedger("glycerol-phosphate");
    assert.equal(m.totalAtp, 32); assert.equal(g.totalAtp, 30);
    assert.deepEqual([m.substrateLevel.glycolysis, m.substrateLevel.cycle], [2, 2]);
    assert.deepEqual([m.cytosolicNadh, m.matrixNadh, m.fadh2], [2, 8, 2]);
  });
  test("control: both donors flow; ATP synthesis proceeds", () => {
    const o = E.etcOutcome(["nadh", "succinate"], "control");
    assert.deepEqual([o.electronFlow, o.oxygenUse, o.gradient, o.atpSynthesis], ["normal", "normal", "normal", "normal"]);
  });
  test("rotenone blocks NADH but not succinate; with NADH alone everything stops", () => {
    const both = E.etcOutcome(["nadh", "succinate"], "rotenone");
    assert.equal(both.donors.find((d) => d.donor === "nadh").flows, false);
    assert.equal(both.donors.find((d) => d.donor === "succinate").flows, true);
    assert.equal(both.electronFlow, "falls");
    const alone = E.etcOutcome(["nadh"], "rotenone");
    assert.deepEqual([alone.electronFlow, alone.oxygenUse, alone.atpSynthesis, alone.gradient], ["stops", "stops", "stops", "collapses"]);
    assert.equal(E.etcOutcome(["succinate"], "rotenone").electronFlow, "normal");
  });
  test("malonate blocks only the complex II route", () => {
    assert.equal(E.etcOutcome(["succinate"], "malonate").electronFlow, "stops");
    assert.equal(E.etcOutcome(["nadh"], "malonate").electronFlow, "normal");
  });
  test("cyanide (complex IV) and antimycin (complex III) block both donors; carriers upstream of the block are more reduced, downstream more oxidized", () => {
    for (const c of ["cyanide", "antimycin"]) assert.equal(E.etcOutcome(["nadh", "succinate"], c).electronFlow, "stops", c);
    const o = E.etcOutcome(["nadh"], "cyanide");
    const state = Object.fromEntries(o.redox.map((r) => [r.carrier, r.state]));
    assert.equal(state.NADH, "more reduced"); assert.equal(state.Q, "more reduced"); assert.equal(state.cytc, "more reduced"); assert.equal(state.CIV, "unchanged");
    const a = Object.fromEntries(E.etcOutcome(["nadh"], "antimycin").redox.map((r) => [r.carrier, r.state]));
    assert.equal(a.Q, "more reduced"); assert.equal(a.cytc, "more oxidized");
  });
  test("an uncoupler lets electron transport and O2 use continue (they rise) while the gradient collapses and ATP synthesis falls", () => {
    const o = E.etcOutcome(["nadh"], "uncoupler");
    assert.deepEqual([o.electronFlow, o.oxygenUse, o.gradient, o.atpSynthesis, o.heat], ["rises", "rises", "collapses", "falls", "rises"]);
  });
  test("oligomycin raises the gradient, stops ATP synthesis and slows (not stops) electron transport via respiratory control", () => {
    const o = E.etcOutcome(["nadh"], "oligomycin");
    assert.deepEqual([o.gradient, o.atpSynthesis, o.electronFlow], ["higher", "stops", "falls"]);
  });
  test("inhibition and uncoupling have different consequences for O2 use and gradient (the contrast the lesson depends on)", () => {
    const inh = E.etcOutcome(["nadh"], "cyanide"), unc = E.etcOutcome(["nadh"], "uncoupler");
    assert.notEqual(inh.oxygenUse, unc.oxygenUse);
    assert.equal(inh.oxygenUse, "stops"); assert.equal(unc.oxygenUse, "rises");
    assert.equal(inh.atpSynthesis === "stops" || inh.atpSynthesis === "falls", true);
  });
  test("every scenario that names a complex uses a real one", () => { for (const c of E.CONDITIONS) if (c.target) assert.ok(c.target === "ATPSYN" || c.target in E.COMPLEXES, c.id); });
});

describe("integrated network", () => {
  test("the same metabolite id is used across pathways (pyruvate links glycolysis, gluconeogenesis and pyruvate oxidation; OAA links the cycle and gluconeogenesis)", () => {
    const where = (m) => new Set(N.REACTIONS.filter((r) => [...r.substrates, ...r.products].some((p) => p.met === m)).flatMap((r) => r.roles.map((x) => x.pathway)));
    assert.deepEqual([...where("pyruvate")].sort(), ["glycolysis", "gluconeogenesis", "pyruvate-oxidation"].sort());
    assert.ok(where("oaa").has("tca") && where("oaa").has("gluconeogenesis"));
    assert.ok(where("acetylcoa").has("pyruvate-oxidation") && where("acetylcoa").has("tca"));
    assert.ok(where("nadh").has("oxphos") && where("nadh").has("glycolysis") && where("nadh").has("tca"));
  });
  test("no reaction is described twice: unique (enzyme, substrates, products) among catalytic reactions", () => {
    const keys = N.REACTIONS.filter((r) => !r.tags?.includes("transport")).map((r) => JSON.stringify([r.enzyme, r.substrates.map((p) => p.met).sort(), r.products.map((p) => p.met).sort()]));
    assert.equal(new Set(keys).size, keys.length);
  });
  test("pathway compartments are valid and every reaction's compartment is declared by its pathway", () => {
    for (const r of N.REACTIONS) for (const role of r.roles) assert.ok(N.PATHWAYS[role.pathway].compartments.includes(r.compartment), `${r.id} in ${role.pathway}`);
  });
  test("the ledger never counts a carrier it did not create: glucose → CO2 conserves carbon (6 in, 6 out)", () => {
    assert.equal(L.glucoseLedger("malate-aspartate").co2, 6);
  });
  test("complete aerobic route glucose → 2 pyruvate → 2 acetyl-CoA → 4 CO2 + 2 more: ledger of reduced carriers matches the pathway sums", () => {
    const g = L.carriersOf(L.pathwayNet("glycolysis")), p = L.carriersOf(L.pathwayNet("pyruvate-oxidation")), t = L.carriersOf(L.pathwayNet("tca"));
    assert.equal(g.nadh + p.nadh + t.nadh, 10); assert.equal(t.fadh2, 2);
  });
});

describe("structures (RDKit)", () => {
  // Independent references: D-glucose (2R,3S,4R,5R); D-fructose open chain (3S,4R,5R); D-glyceraldehyde 3-phosphate (R); D-1,3-BPG, D-3PG, D-2PG (R); L-malate (S).
  const CIP = { glucose: ["(R)", "(R)", "(R)", "(S)"], g6p: ["(R)", "(R)", "(R)", "(S)"], f6p: ["(R)", "(R)", "(S)"], f16bp: ["(R)", "(R)", "(S)"], g3p: ["(R)"], bpg13: ["(R)"], pg3: ["(R)"], pg2: ["(R)"], malate: ["(S)"] };
  test("each drawn structure parses, matches the recorded formula (InChI Hill formula) and has the expected CIP labels; achiral ones have none", async () => {
    const rd = await RD.getRDKit();
    for (const m of N.METABOLITES) {
      if (!m.structure) continue;
      const mol = rd.get_mol(m.structure.smiles);
      assert.ok(mol && mol.is_valid(), m.id);
      try {
        assert.equal(mol.get_inchi().split("/")[1], m.formula, `${m.id} formula`);
        const labels = (JSON.parse(mol.get_stereo_tags()).CIP_atoms ?? []).map((x) => x[1]).sort();
        const want = (CIP[m.id] ?? (m.id === "isocitrate" ? null : [])); // isocitrate is drawn without stereochemistry, and says so
        if (want) assert.deepEqual(labels, want.slice().sort(), `${m.id} CIP`);
        else if (m.id === "isocitrate") assert.ok(labels.every((l) => l === "(?)"), "isocitrate: stereocentres left unspecified");
        else assert.deepEqual(labels, [], `${m.id} drawn flat`);
      } finally { mol.delete(); }
    }
  });
  test("metabolites without a verified structure (CoA derivatives, nucleotides) have none: nothing is invented", () => {
    for (const id of ["acetylcoa", "succoa", "atp", "adp", "nad", "nadh", "fad", "coa", "gtp"]) assert.equal(N.METABOLITES_BY_ID[id].structure, undefined, id);
  });
  test("fumarate is drawn as the E (trans) isomer", async () => {
    const rd = await RD.getRDKit();
    const mol = rd.get_mol(N.METABOLITES_BY_ID.fumarate.structure.smiles);
    try { assert.ok(JSON.parse(mol.get_stereo_tags()).CIP_bonds?.some((b) => b[1] === "E") || /\/C=C\//.test(N.METABOLITES_BY_ID.fumarate.structure.smiles)); } finally { mol.delete(); }
  });
});
