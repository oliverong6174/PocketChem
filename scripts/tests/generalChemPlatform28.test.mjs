// Stage 28: platform wiring, strict persistence, concept search, relations, evidence registry and learning content for Atomic structure,
// Bonding and geometry and Molecular orbitals. Practice and Challenge answers are compared with expectations written here by hand.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
let S, PT, L, CI, REL, Q, LIB, STORE, EV27, EV28, MO;
before(async () => {
  S = await loadModule("/src/navigation/subjects.ts");
  PT = await loadModule("/src/utils/persistence/gcTools28.ts");
  L = await loadModule("/src/utils/generalChem/learning28.ts");
  CI = await loadModule("/src/utils/concepts/conceptIndex.ts");
  REL = await loadModule("/src/utils/concepts/relations.ts");
  Q = await loadModule("/src/utils/concepts/search.ts");
  LIB = await loadModule("/src/utils/persistence/analysisLibraryApp.ts");
  STORE = await loadModule("/src/utils/persistence/workspaceStore.ts");
  EV27 = await loadModule("/src/utils/evidence/evidence27.ts");
  EV28 = await loadModule("/src/utils/evidence/evidence28.ts");
  MO = await loadModule("/src/utils/generalChem/mo28.ts");
});
after(async () => { await closeEngine(); });
const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const NEW_TOOLS = ["gcAtomic", "gcBonding", "gcMO"];
const OLD_TOOLS = ["gcOverview", "gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"];

describe("navigation and wiring", () => {
  test("[tools] the three laboratories join General Chemistry; every existing tool and slug is unchanged; Overview is first and Saved last", () => {
    const ids = S.GENERAL_TOOLS.map((t) => t.id);
    for (const id of [...OLD_TOOLS, ...NEW_TOOLS]) assert.ok(ids.includes(id), id);
    assert.equal(ids[0], "gcOverview"); assert.equal(ids.at(-1), "gcSaved"); assert.equal(new Set(S.GENERAL_TOOLS.map((t) => t.slug)).size, S.GENERAL_TOOLS.length);
    const slug = (id) => S.GENERAL_TOOLS.find((t) => t.id === id).slug;
    assert.deepEqual(["gcStoichiometry", "gcGas", "gcAcidBase", "gcEquilibrium", "gcKinetics", "gcThermo", "gcElectro", "gcSaved"].map(slug), ["stoichiometry", "gas-laws", "acid-base-titration", "equilibrium", "kinetics", "thermodynamics", "electrochemistry", "saved"]);
    assert.deepEqual(NEW_TOOLS.map(slug), ["atomic-structure", "bonding-geometry", "molecular-orbitals"]);
    for (const id of NEW_TOOLS) assert.deepEqual(S.parseRoute(S.routeHash({ subject: "general", toolId: id })), { subject: "general", toolId: id });
  });
  test("[other subjects] Physics, Organic, Biology and Biochemistry tool lists are untouched", () => {
    assert.equal(S.PHYSICS_TOOLS.length, 14); assert.deepEqual(S.ORGANIC_TOOLS.map((t) => t.id), ["analysis", "acidBase", "spectroscopy", "conformations", "reactions", "multiStep", "multiCatalytic", "saved"]);
  });
  test("[planned] periodic trends stays a plan (no tool, no link to it); the tagline names the new areas", () => {
    const sub = S.getSubject("general"); assert.ok(sub.planned.includes("Periodic trends")); assert.match(sub.tagline, /Atomic structure/);
    for (const r of REL.RELATIONS) assert.ok(!/periodic/i.test(r.to.toolId), r.id);
  });
  test("[icons] every new tool icon exists", () => { const icons = read("src", "components", "ui", "Icon.tsx"); for (const id of NEW_TOOLS) assert.match(icons, new RegExp(`\\n  ${S.GENERAL_TOOLS.find((t) => t.id === id).icon}: "`)); });
  test("[app] each page is lazily loaded, gets its own open request and is reachable from Saved", () => {
    const app = read("src", "App.tsx");
    for (const name of ["AtomicStructurePage", "BondingGeometryPage", "MolecularOrbitalsPage"]) { assert.match(app, new RegExp(`const ${name} = lazy`)); assert.match(app, new RegExp(`<${name}\\s`)); }
    for (const id of NEW_TOOLS) { assert.match(app, new RegExp(`target === "${id}"`)); assert.match(app, new RegExp(`pendingOpen\\?\\.page === "${id}"`)); }
  });
  test("[overview] each laboratory is listed with features", () => { const ov = read("src", "components", "generalChem", "GeneralChemistryOverview.tsx"); for (const id of NEW_TOOLS) assert.match(ov, new RegExp(`${id}: \\[`)); });
  test("[no network] none of the new scientific code can reach the network", () => {
    for (const f of ["src/utils/generalChem/quantum28.ts", "src/utils/generalChem/hydrogenic28.ts", "src/utils/generalChem/config28.ts", "src/utils/generalChem/lewis28.ts", "src/utils/generalChem/vsepr28.ts", "src/utils/generalChem/mo28.ts", "src/utils/generalChem/learning28.ts", "src/utils/persistence/gcTools28.ts", "src/utils/evidence/evidence28.ts"]) {
      assert.doesNotMatch(read(...f.split("/")).replace(/ref: "[^"]*"/g, ""), /\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//, f);
    }
  });
  test("[reduced motion and keyboard] the diagrams use no animation loops, and clickable SVG orbitals are keyboard operable", () => {
    for (const f of ["AtomicDiagrams28.tsx", "BondingDiagrams28.tsx", "MODiagrams28.tsx"]) assert.doesNotMatch(read("src", "components", "generalChem", f), /requestAnimationFrame|setInterval|@keyframes|animation:/, f);
    const mo = read("src", "components", "generalChem", "MODiagrams28.tsx"); assert.match(mo, /role="button"/); assert.match(mo, /tabIndex=\{0\}/); assert.match(mo, /e\.key === "Enter"/);
  });
});

describe("persistence: strict validators", () => {
  const D = () => ({ a: clone(PT.DEFAULT_ATOMIC_INPUTS), b: clone(PT.DEFAULT_BONDING_INPUTS), m: clone(PT.DEFAULT_MO_INPUTS) });
  test("[defaults] valid, and a JSON round trip returns the same inputs", () => {
    const d = D(); assert.deepEqual(PT.validateAtomicInputs(clone(d.a)), d.a); assert.deepEqual(PT.validateBondingInputs(clone(d.b)), d.b); assert.deepEqual(PT.validateMOInputs(clone(d.m)), d.m);
  });
  test("[registered] pages are known to the store, the library and the saved-open map, in the General Chemistry subject", () => {
    for (const [page, tool] of [["atomic", "gcAtomic"], ["bonding", "gcBonding"], ["molorbitals", "gcMO"]]) { assert.equal(STORE.PAGE_SUBJECT[page], "general"); assert.ok(LIB.OPENABLE_ANALYSIS_PAGES.includes(page)); assert.equal(LIB.ANALYSIS_APP_PAGE[page], tool); }
    for (const page of ["genchem", "equilibrium", "kinetics", "thermo", "stoichiometry", "gaslaws", "electrochem", "waves", "mechanics", "celldeath"]) assert.ok(LIB.OPENABLE_ANALYSIS_PAGES.includes(page), `existing page ${page}`);
    assert.match(read("src", "utils", "persistence", "analysisLibrary.ts"), /"atomic", "bonding", "molorbitals"/);
  });
  test("[atomic tampering] malformed values are rejected, never coerced", () => {
    const bad = [
      (x) => { x.view = "orbitals"; }, (x) => { x.q.n = 0; }, (x) => { x.q.n = 8; }, (x) => { x.q.l = 7; }, (x) => { x.q.ml = 1.5; }, (x) => { x.q.ms = 0; }, (x) => { x.q.n = "3"; },
      (x) => { x.orbital.n = 4; }, (x) => { x.orbital.n = 1; x.orbital.l = 1; x.orbital.ml = 0; }, (x) => { x.orbital.ml = 2; }, (x) => { x.orbital.basis = "hybrid"; }, (x) => { x.orbital.plane = "zz"; }, (x) => { x.orbital.mode = "charge"; },
      (x) => { x.orbital.enclosurePct = 100; }, (x) => { x.orbital.enclosurePct = 49; }, (x) => { x.orbital.Z = 5; }, (x) => { x.orbital.Z = 1.5; },
      (x) => { x.config.Z = 37; }, (x) => { x.config.Z = 0; }, (x) => { x.config.charge = 9; }, (x) => { x.config.Z = 26; x.config.charge = -1; }, (x) => { x.config.Z = 10; x.config.charge = -1; }, (x) => { x.config.build = [1, 2]; }, (x) => { x.config.build = [3, 0, 0, 0, 0, 0, 0, 0]; }, (x) => { x.config.build = ["2", 0, 0, 0, 0, 0, 0, 0]; },
      (x) => { x.spectra.ni = x.spectra.nf; }, (x) => { x.spectra.ni = 11; }, (x) => { x.spectra.Z = 5; }, (x) => { x.spectra.nf = 0; },
      (x) => { x.learn.mode = "expert"; }, (x) => { x.learn.practice = 99; }, (x) => { x.learn.challenge = -1; }, (x) => { delete x.learn; }, (x) => { x.subject = "physics"; }, (x) => { x.tool = "bonding"; },
    ];
    for (const [k, f] of bad.entries()) { const x = D().a; f(x); assert.equal(PT.validateAtomicInputs(x), null, `atomic case ${k}`); }
    for (const v of [null, [], "x", 5]) assert.equal(PT.validateAtomicInputs(v), null);
  });
  test("[atomic accepts] invalid quantum-number combinations (that is the explainer's point), every view, ions, builds and every supported orbital", () => {
    const x = D().a; x.q = { n: 2, l: 2, ml: 3, ms: -1 }; assert.ok(PT.validateAtomicInputs(x));
    for (const view of PT.ATOMIC_VIEWS) { const y = D().a; y.view = view; assert.ok(PT.validateAtomicInputs(y), view); }
    for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2]]) for (let ml = -l; ml <= l; ml++) { const y = D().a; y.orbital = { ...y.orbital, n, l, ml }; assert.ok(PT.validateAtomicInputs(y), `${n}${l}${ml}`); }
    const c = D().a; c.config = { Z: 29, charge: 2, build: [2, 2, 6, 2, 6, 0, 9, 0] }; assert.ok(PT.validateAtomicInputs(c)); c.config = { Z: 8, charge: -2, build: null }; assert.ok(PT.validateAtomicInputs(c));
    const s = D().a; s.spectra = { Z: 2, ni: 1, nf: 10 }; assert.ok(PT.validateAtomicInputs(s));
  });
  test("[bonding tampering]", () => {
    const bad = [
      (x) => { x.view = "orbitals"; }, (x) => { x.molecule = "c60"; }, (x) => { x.molecule = 5; }, (x) => { x.lewis.bondOrders.pop(); }, (x) => { x.lewis.bondOrders[0] = 4; }, (x) => { x.lewis.bondOrders[0] = 0; }, (x) => { x.lewis.lonePairs[0] = 5; }, (x) => { x.lewis.lonePairs[1] = -1; },
      (x) => { x.lewis.lonePairs.push(0); }, (x) => { x.lewis.structure = 9; }, (x) => { x.vsepr.X = 9; }, (x) => { x.vsepr.E = -1; }, (x) => { x.vsepr.source = "other"; }, (x) => { x.geometry.azimuth = 181; }, (x) => { x.geometry.elevation = 91; },
      (x) => { x.geometry.azimuth = 1.5; }, (x) => { x.geometry.showAngles = "yes"; }, (x) => { x.polarity.a = "Fe"; }, (x) => { x.polarity.b = 5; }, (x) => { x.learn.mode = "x"; }, (x) => { x.tool = "atomic"; }, (x) => { x.subject = "organic"; },
    ];
    for (const [k, f] of bad.entries()) { const x = D().b; f(x); assert.equal(PT.validateBondingInputs(x), null, `bonding case ${k}`); }
  });
  test("[bonding accepts] every molecule with its own curated structures, an unconserved student structure, unsupported domain counts, every view", () => {
    for (const id of ["h2o", "o3", "so4", "c2h4", "xef4", "n2", "co3"]) { const x = D().b; x.molecule = id; x.lewis = PT.lewisStateFor(id); assert.ok(PT.validateBondingInputs(x), id); }
    const x = D().b; x.molecule = "h2o"; x.lewis = { bondOrders: [3, 3], lonePairs: [4, 4, 4], structure: -1 }; assert.ok(PT.validateBondingInputs(x));
    const y = D().b; y.vsepr = { X: 8, E: 8, source: "domains" }; assert.ok(PT.validateBondingInputs(y)); for (const view of PT.BONDING_VIEWS) { const z = D().b; z.view = view; assert.ok(PT.validateBondingInputs(z), view); }
  });
  test("[MO tampering]", () => {
    const bad = [
      (x) => { x.view = "orbitals"; }, (x) => { x.species = "ne3"; }, (x) => { x.occ.pop(); }, (x) => { x.occ[0] = 4; }, (x) => { x.occ[0] = -1; }, (x) => { x.occ[0] = 1.5; }, (x) => { x.occ[0] = "3"; },
      (x) => { x.species = "h2"; }, (x) => { x.overlap.R = 0.1; }, (x) => { x.overlap.R = 7; }, (x) => { x.overlap.R = NaN; }, (x) => { x.overlap.combo = "nonbonding"; }, (x) => { x.overlap.pType = "delta"; }, (x) => { x.learn.practice = 50; }, (x) => { x.tool = "bonding"; },
    ];
    for (const [k, f] of bad.entries()) { const x = D().m; f(x); assert.equal(PT.validateMOInputs(x), null, `MO case ${k}`); }
  });
  test("[MO accepts] every species with its own number of orbitals, including incomplete and over-full occupancies", () => {
    for (const s of MO.DIATOMICS) { const x = D().m; x.species = s.id; x.occ = MO.groundOccupancy(s); assert.ok(PT.validateMOInputs(x), s.id); x.occ = x.occ.map(() => 3); assert.ok(PT.validateMOInputs(x), `${s.id} full`); x.occ = x.occ.map(() => 0); assert.ok(PT.validateMOInputs(x)); }
  });
  test("[results] the stored summary is validated like every other tool's; tampered summaries are rejected", () => {
    for (const [fn, inputs] of [[L.summarizeAtomic, PT.DEFAULT_ATOMIC_INPUTS], [L.summarizeBonding, PT.DEFAULT_BONDING_INPUTS], [L.summarizeMO, PT.DEFAULT_MO_INPUTS]]) {
      const r = fn(inputs); assert.ok(r); assert.deepEqual(PT.validateGcResults28(clone(r)), r); assert.ok(r.headline.length >= 2 && r.assumptions.length >= 2);
      const t = clone(r); t.check = "5"; assert.equal(PT.validateGcResults28(t), null); const u = clone(r); u.headline = "x"; assert.equal(PT.validateGcResults28(u), null);
    }
  });
  test("[derived results are recomputed from the inputs] the summary is deterministic and changes when an input changes", () => {
    const a = L.summarizeAtomic(PT.DEFAULT_ATOMIC_INPUTS); assert.deepEqual(a, L.summarizeAtomic(clone(PT.DEFAULT_ATOMIC_INPUTS)));
    const x = clone(PT.DEFAULT_ATOMIC_INPUTS); x.q.n = 4; assert.notEqual(L.summarizeAtomic(x).check, a.check);
    const m = clone(PT.DEFAULT_MO_INPUTS); m.occ = m.occ.map(() => 0); assert.notEqual(L.summarizeMO(m).check, L.summarizeMO(PT.DEFAULT_MO_INPUTS).check);
  });
  test("[summaries use independent reference numbers] shell n=3 has 18 states; 2p ⟨r⟩ 5 a0; Fe 26 electrons; H-α 656.1 nm; NO3⁻ 24 valence electrons; O2 bond order 2", () => {
    const A = clone(PT.DEFAULT_ATOMIC_INPUTS); assert.equal(L.summarizeAtomic(A).check, 18);
    A.view = "orbital"; near(L.summarizeAtomic(A).check, 5, 1e-12); A.view = "config"; assert.equal(L.summarizeAtomic(A).check, 26); assert.match(L.summarizeAtomic(A).headline.join(" "), /3d⁶ 4s²/);
    A.view = "spectra"; near(L.summarizeAtomic(A).check, 1e9 / (1.097373156816e7 * (5 / 36)), 0.01); A.q = { n: 2, l: 2, ml: 0, ms: 1 }; A.view = "quantum"; assert.equal(L.summarizeAtomic(A).check, -1);
    const B = clone(PT.DEFAULT_BONDING_INPUTS); assert.equal(L.summarizeBonding(B).check, 24); B.view = "geometry"; assert.equal(L.summarizeBonding(B).check, 3); assert.match(L.summarizeBonding(B).headline.join(" "), /trigonal planar/);
    B.view = "polarity"; B.molecule = "co2"; B.lewis = PT.lewisStateFor("co2"); assert.match(L.summarizeBonding(B).headline[0], /nonpolar molecule/); B.view = "hybrid"; assert.match(L.summarizeBonding(B).headline[0], /sp/);
    near(L.summarizeMO(PT.DEFAULT_MO_INPUTS).check, 2, 1e-12);
  });
});

describe("Practice and Challenge answers follow the models", () => {
  const optsOf = (q) => q.options();
  const hand = {
    atomic: {
      practice: { "qn-invalid": 2, "qn-d": 5, "qn-cap": 10, "orb-3p-nodes": 1, "orb-2s-node": 2, "orb-scale": 0.75, "cfg-fe-unpaired": 4, "cfg-cr": 1, "cfg-fe3": 5, "sp-hb": 486.01, "sp-lyman": 0, "sp-he": 30.375, "qn-pauli": 0 },
      challenge: { "ch-3s-nodes": 2, "ch-d-angular": 2, "ch-cu": 1, "ch-cu2": 0, "ch-balmer-edge": 1, "ch-bigger-gap": 1 },
    },
    bonding: {
      practice: { "pr-val-no3": 24, "pr-fc-nh4": 1, "pr-fc-o3": 1, "pr-reson": 1, "pr-bo-no3": 4 / 3, "pr-domain-nh3": 1, "pr-co2": 1, "pr-sigma-c2h4": 5, "pr-hyb-nh3": 2 },
      challenge: { "ch-sf4": 0, "ch-xef4p": 1, "ch-chcl3": 0, "ch-so4": 2 },
    },
    mo: {
      practice: { "pr-bo-o2": 2, "pr-up-o2": 2, "pr-bo-n2p": 2.5, "pr-mag-b2": 0, "pr-anti-o2": 4, "pr-n2-o2": 0, "pr-lewis-o2": 0, "pr-pi-star": 2, "pr-bo-f2": 1 },
      challenge: { "ch-o2m": 1, "ch-o2p": 0, "ch-c2": 1, "ch-he2p": 0.5, "ch-ne2": 0, "ch-c22m": 2 },
    },
  };
  const SETS = () => ({ atomic: [L.ATOMIC_PRACTICE, L.ATOMIC_CHALLENGE], bonding: [L.BONDING_PRACTICE, L.BONDING_CHALLENGE], mo: [L.MO_PRACTICE, L.MO_CHALLENGE] });
  for (const lab of ["atomic", "bonding", "mo"]) {
    test(`[${lab} answers] every question with a hand value gives it (numbers within the question's own tolerance)`, () => {
      const [practice, challenge] = SETS()[lab];
      for (const [kind, list] of [["practice", practice], ["challenge", challenge]]) for (const q of list) {
        if (!(q.id in hand[lab][kind])) continue;
        near(q.answer(), hand[lab][kind][q.id], q.kind === "number" ? Math.max(1e-9, (q.relTol ?? 0) * Math.abs(hand[lab][kind][q.id]) + (q.id === "sp-hb" ? 0.1 : q.id === "sp-he" ? 0.05 : 0)) : 0, `${lab} ${q.id}`);
      }
    });
    test(`[${lab} structure] unique ids, a prompt, an explanation, and choice answers inside the option list`, () => {
      const [practice, challenge] = SETS()[lab];
      for (const list of [practice, challenge]) { assert.equal(new Set(list.map((q) => q.id)).size, list.length); assert.ok(list.length >= 6); for (const q of list) { assert.ok(q.prompt.length > 20 && q.title.length > 3, q.id); assert.ok(q.explain(q.answer()).length > 15, q.id); if (q.kind === "choice") { const o = optsOf(q); assert.ok(o.length >= 2 && Number.isInteger(q.answer()) && q.answer() >= 0 && q.answer() < o.length, `${q.id} answer ${q.answer()} of ${o.length}`); } } }
    });
  }
  test("[shape and polarity choices] the named option is the one the VSEPR model gives", () => {
    const pick = (list, id) => { const q = list.find((x) => x.id === id); return optsOf(q)[q.answer()]; };
    assert.equal(pick(L.BONDING_PRACTICE, "pr-nh3"), "trigonal pyramidal"); assert.equal(pick(L.BONDING_PRACTICE, "pr-sf4"), "seesaw"); assert.equal(pick(L.BONDING_CHALLENGE, "ch-xef4"), "square planar"); assert.equal(pick(L.BONDING_CHALLENGE, "ch-clf3"), "T-shaped"); assert.equal(pick(L.BONDING_CHALLENGE, "ch-brf5"), "square pyramidal");
    assert.equal(pick(L.BONDING_PRACTICE, "pr-co2"), "Nonpolar"); assert.equal(pick(L.BONDING_CHALLENGE, "ch-sf4"), "Polar");
    assert.equal(pick(L.ATOMIC_PRACTICE, "cfg-cr"), "[Ar] 3d⁵ 4s¹"); assert.equal(pick(L.ATOMIC_CHALLENGE, "ch-cu"), "[Ar] 3d¹⁰ 4s¹"); assert.equal(pick(L.ATOMIC_CHALLENGE, "ch-cu2"), "[Ar] 3d⁹"); assert.equal(pick(L.ATOMIC_PRACTICE, "sp-lyman"), "Ultraviolet");
    assert.equal(pick(L.MO_CHALLENGE, "ch-ne2"), "Bond order 0: no net bonding"); assert.equal(pick(L.MO_CHALLENGE, "ch-c22m"), "3"); assert.equal(pick(L.MO_PRACTICE, "pr-mag-b2"), "Paramagnetic");
  });
  test("[setups are valid] every question puts its tool into a state that passes the strict validator", () => {
    for (const q of [...L.ATOMIC_PRACTICE, ...L.ATOMIC_CHALLENGE]) assert.ok(PT.validateAtomicInputs(q.setup(clone(PT.DEFAULT_ATOMIC_INPUTS))), q.id);
    for (const q of [...L.BONDING_PRACTICE, ...L.BONDING_CHALLENGE]) assert.ok(PT.validateBondingInputs(q.setup(clone(PT.DEFAULT_BONDING_INPUTS))), q.id);
    for (const q of [...L.MO_PRACTICE, ...L.MO_CHALLENGE]) { const s = q.setup(clone(PT.DEFAULT_MO_INPUTS)); assert.ok(PT.validateMOInputs(s), q.id); assert.ok(s.occ.every((c) => c === 0), `${q.id} starts empty so the learner fills it`); }
  });
  test("[lessons] Explore lessons exist for every view and quote the current numbers", () => {
    for (const view of PT.ATOMIC_VIEWS) { const x = clone(PT.DEFAULT_ATOMIC_INPUTS); x.view = view; const ls = L.atomicLessons(x); assert.ok(ls.length >= 1 && ls.every((l) => l.body.join(" ").length > 40), view); }
    for (const view of PT.BONDING_VIEWS) { const x = clone(PT.DEFAULT_BONDING_INPUTS); x.view = view; assert.ok(L.bondingLessons(x).length >= 1, view); }
    for (const view of PT.MO_VIEWS) { const x = clone(PT.DEFAULT_MO_INPUTS); x.view = view; assert.ok(L.moLessons(x).length >= 1, view); }
    const ox = L.moLessons(PT.DEFAULT_MO_INPUTS).map((l) => l.body.join(" ")).join(" "); assert.match(ox, /bond order = \(8 − 4\)\/2 = 2/); assert.match(ox, /paramagnetic/);
  });
});

describe("concept search and related learning", () => {
  test("[the index validates] every concept, destination and relation is consistent", () => { assert.deepEqual(CI.validateConceptIndex(), []); assert.deepEqual(REL.validateRelations(), []); });
  test("[search] each requested concept reaches the right laboratory in the top results", () => {
    const cases = [["quantum numbers", "gcAtomic"], ["atomic orbital", "gcAtomic"], ["electron configuration", "gcAtomic"], ["Hund's rule", "gcAtomic"], ["Pauli exclusion", "gcAtomic"], ["photon emission", "gcAtomic"], ["atomic spectra", "gcAtomic"],
      ["Lewis structure", "gcBonding"], ["formal charge", "gcBonding"], ["resonance", "gcBonding"], ["VSEPR", "gcBonding"], ["molecular geometry", "gcBonding"], ["hybridization", "gcBonding"], ["sigma bond", "gcBonding"], ["pi bond", "gcBonding"],
      ["molecular orbital", "gcMO"], ["bond order", "gcMO"], ["paramagnetism", "gcMO"], ["aufbau", "gcAtomic"], ["balmer series", "gcAtomic"], ["sp3", "gcBonding"], ["O2 paramagnetic", "gcMO"], ["dipole moment", "gcBonding"]];
    for (const [query, tool] of cases) { const top = Q.searchConcepts(query, {}).filter((h) => h.destination).slice(0, 4); assert.ok(top.some((h) => h.destination.toolId === tool), `${query} -> ${top.map((h) => h.destination.toolId)}`); }
  });
  test("[ambiguity] 'resonance' and 'orbital' keep notes that separate them from Physics waves and molecular orbitals", () => {
    assert.ok(CI.getConcept("gc-resonance").termNotes.resonance.includes("Physics")); assert.ok(CI.getConcept("gc-atomic-orbital").termNotes.orbital.includes("Molecular"));
    const hit = Q.searchConcepts("resonance", {}).find((h) => h.destination?.toolId === "gcBonding"); assert.ok(hit);
  });
  test("[related links] only implemented destinations; each cross-subject link carries a caution about what is NOT shared", () => {
    const new28 = REL.RELATIONS.filter((r) => NEW_TOOLS.includes(r.from.toolId) || NEW_TOOLS.includes(r.to.toolId));
    assert.ok(new28.length >= 14);
    for (const r of new28) { if (r.from.subject !== r.to.subject) assert.ok(r.caution && r.caution.length > 20, r.id); }
    const has = (from, subject, toolId) => REL.relationsFrom("general", from, 30).some((r) => r.to.subject === subject && r.to.toolId === toolId);
    assert.ok(has("gcAtomic", "physics", "phWaves")); assert.ok(has("gcAtomic", "physics", "phOptics")); assert.ok(has("gcBonding", "organic", "analysis")); assert.ok(has("gcBonding", "organic", "conformations")); assert.ok(has("gcBonding", "organic", "reactions"));
    assert.ok(has("gcMO", "physics", "phMagnetic")); assert.ok(has("gcMO", "organic", "spectroscopy")); assert.ok(has("gcAtomic", "general", "gcBonding")); assert.ok(has("gcBonding", "general", "gcMO"));
  });
  test("[no data is passed between tools] no relation of the new tools moves state", () => { for (const r of REL.RELATIONS.filter((x) => NEW_TOOLS.includes(x.from.toolId))) assert.equal(r.handoff, undefined, r.id); });
});

describe("evidence registry", () => {
  test("[valid] records satisfy the Stage 27 consistency rules and do not collide with Stage 27 ids", () => {
    assert.deepEqual(EV27.validateEvidence(EV28.EVIDENCE28), []); const ids27 = new Set(EV27.EVIDENCE.map((e) => e.id)); for (const e of EV28.EVIDENCE28) assert.ok(!ids27.has(e.id), e.id); assert.equal(new Set(EV28.EVIDENCE28.map((e) => e.id)).size, EV28.EVIDENCE28.length);
    assert.equal(EV27.EVIDENCE.length, 14);
  });
  test("[statuses] the status of each record matches what was actually retrieved: only the NIST-compared atom table is source-verified; the LCAO illustration is not verified", () => {
    const st = Object.fromEntries(EV28.EVIDENCE28.map((e) => [e.id, e.source]));
    assert.equal(st["gc-config-atoms"], "source-verified"); assert.equal(st["gc-mo-lcao"], "not-verified");
    for (const id of ["gc-quantum-orbitals", "gc-hydrogen-spectra", "gc-config-ions", "gc-lewis", "gc-vsepr", "gc-polarity", "gc-hybridization", "gc-mo-diatomics"]) assert.equal(st[id], "partly-verified", id);
    for (const e of EV28.EVIDENCE28) { assert.ok(e.unsupported.length >= 1); assert.ok(e.assumptions.length >= 1); }
    assert.match(EV28.evidence28ById("gc-polarity").assumptions.join(" "), /NOT a dipole moment/); assert.match(EV28.evidence28ById("gc-quantum-orbitals").sourceCovers, /NOT compared/);
  });
  test("[checks exist] every reference-case tag points at a real test title in its Stage 28 test file", () => {
    for (const e of EV28.EVIDENCE28) for (const c of e.checks) { const [prefix, tag] = c.split(":"); assert.ok(["atomic28", "bonding28", "mo28"].includes(prefix), c); assert.ok(read("scripts", "tests", `${prefix}.test.mjs`).includes(tag), `${e.id}: ${c}`); }
  });
  test("[panel] the shared EvidencePanel looks in both registries and every Stage 28 page shows its records", () => {
    assert.match(read("src", "components", "ui", "EvidencePanel.tsx"), /evidence28ById/);
    const pages = { AtomicStructurePage: ["gc-quantum-orbitals", "gc-config-atoms", "gc-config-ions", "gc-hydrogen-spectra"], BondingGeometryPage: ["gc-lewis", "gc-vsepr", "gc-polarity", "gc-hybridization"], MolecularOrbitalsPage: ["gc-mo-diatomics", "gc-mo-lcao"] };
    for (const [page, ids] of Object.entries(pages)) { const src = read("src", "components", "generalChem", `${page}.tsx`); for (const id of ids) { assert.match(src, new RegExp(`<EvidencePanel id="${id}"`)); assert.ok(EV28.evidence28ById(id), id); } }
  });
  test("[reference fixture] the NIST table fixture is kept for tests only and no source file imports it", () => {
    assert.ok(fs.existsSync(path.join(root, "scripts", "reference", "stage28", "nist-ground-states.json")));
    for (const f of fs.readdirSync(path.join(root, "src", "utils", "generalChem"))) if (f.endsWith("28.ts")) assert.doesNotMatch(read("src", "utils", "generalChem", f), /(import|require)[^\n]*(nist-ground-states|reference\/stage28)/, f);
  });
});
