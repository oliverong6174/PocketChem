import type { GBand, GEdge, GNode, GText, Visual } from "./GraphDiagram";
import { PATHWAYS, metaboliteOf, pathwayReactions, type PathwayId } from "../../../utils/biochem/metabolism/network";
import { FATTY_ACID_NAME } from "../../../utils/biochem/metabolism/network";
import { carnitineRequirement } from "../../../utils/biochem/metabolism/network";
import { AMINO_CATABOLISM_BY_ONE, ENDPOINTS, classifyAminoAcid, type EndpointId } from "../../../utils/biochem/metabolism/nitrogen";
import { MAP_FOCUS, groupOf, type GroupId, type MapFocus } from "../../../utils/biochem/metabolism/fuel";
import { AMINO_ACID_LIST } from "../../../utils/biochem/aminoAcids";

/** Diagram specifications built from the shared model state. A step of 0 shows the starting species; steps beyond the current one are drawn dashed. */
export interface Spec { width: number; height: number; nodes: GNode[]; edges: GEdge[]; bands: GBand[]; texts: GText[]; label: string }
const st = (s: number, step: number): Visual => (s === 0 ? "normal" : step === 0 ? "future" : s < step ? "done" : s === step ? "active" : "future");
const N = (id: string, x: number, y: number, w: number, h: number, lines: string[], extra: Partial<GNode> = {}): GNode => ({ id, x, y, w, h, lines, ...extra });
const E = (id: string, from: string, to: string, label: string | undefined, extra: Partial<GEdge> = {}): GEdge => ({ id, from, to, label, ...extra });

// ---- activation and carnitine shuttle ---------------------------------------------------------------------------------------------------------

export function shuttleSpec(n: number, step: number, selected: string | null): Spec {
  const req = carnitineRequirement(n), name = `C${n}`;
  const bands: GBand[] = [
    { id: "cyt", x: 10, y: 10, w: 205, h: 330, label: "Cytosol", tone: "a" }, { id: "omm", x: 220, y: 10, w: 110, h: 330, label: "Outer membrane", tone: "c" },
    { id: "ims", x: 335, y: 10, w: 170, h: 330, label: "Intermembrane space", tone: "d" }, { id: "imm", x: 510, y: 10, w: 110, h: 330, label: "Inner membrane", tone: "c" },
    { id: "mat", x: 625, y: 10, w: 305, h: 330, label: "Matrix", tone: "b" },
  ];
  const sel = (id: string) => selected === id;
  if (req === "no") {
    const nodes: GNode[] = [
      N("fa", 25, 70, 150, 46, [`${name} fatty acid`, "free"], { kind: "lipid", state: st(0, step), selected: sel("fa") }),
      N("acsm", 640, 70, 150, 46, ["Acyl-CoA synthetase", "(medium chain)"], { kind: "enzyme", state: st(1, step), selected: sel("acs") }),
      N("acylm", 640, 190, 160, 46, [`${name}-CoA`, "in the matrix"], { kind: "lipid", state: st(1, step), selected: sel("acylm") }),
      N("beta", 800, 270, 120, 40, ["→ β-oxidation"], { kind: "product", state: st(2, step) }),
    ];
    const edges: GEdge[] = [
      E("cross", "fa", "acsm", "crosses membranes without carnitine", { via: [[300, 93], [560, 93]], kind: "transport", state: st(1, step), labelPos: [430, 80] }),
      E("act", "acsm", "acylm", "ATP → AMP + PPi", { state: st(1, step), selected: sel("acs") }),
      E("tobeta", "acylm", "beta", undefined, { state: st(2, step) }),
    ];
    return { width: 940, height: 350, nodes, edges, bands, texts: [{ x: 235, y: 300, text: `${name} is short or medium chain: CPT I, the translocase and CPT II are not required.`, size: 12 }], label: `Medium-chain fatty acid ${name} enters the matrix without the carnitine shuttle` };
  }
  const nodes: GNode[] = [
    N("fa", 25, 60, 150, 46, [`${name} fatty acid`, "free"], { kind: "lipid", state: st(0, step) }),
    N("acs", 226, 60, 98, 46, ["Acyl-CoA", "synthetase"], { kind: "enzyme", state: st(1, step), selected: sel("acs") }),
    N("acylc", 25, 160, 150, 46, [`${name}-CoA`, "(cytosolic face)"], { kind: "lipid", state: st(1, step) }),
    N("cpt1", 226, 160, 98, 46, ["CPT I", "(malonyl-CoA ⊣)"], { kind: "enzyme", state: st(2, step), selected: sel("cpt1") }),
    N("carnims", 345, 160, 150, 46, [`${name}-carnitine`], { kind: "carrier", state: st(2, step) }),
    N("cact", 516, 160, 98, 46, ["Translocase", "(antiport)"], { kind: "enzyme", state: st(3, step), selected: sel("cact") }),
    N("carnm", 640, 160, 150, 46, [`${name}-carnitine`, "(matrix)"], { kind: "carrier", state: st(3, step) }),
    N("cpt2", 798, 160, 122, 46, ["CPT II"], { kind: "enzyme", state: st(4, step), selected: sel("cpt2") }),
    N("acylm", 700, 270, 160, 46, [`${name}-CoA`, "→ β-oxidation"], { kind: "product", state: st(4, step) }),
    N("carnfreeM", 640, 62, 150, 40, ["Free carnitine", "(matrix)"], { kind: "carrier", state: st(3, step) }),
    N("carnfreeI", 345, 62, 150, 40, ["Free carnitine", "(IMS)"], { kind: "carrier", state: st(3, step) }),
  ];
  const edges: GEdge[] = [
    E("a1", "fa", "acs", "ATP", { state: st(1, step), selected: sel("acs") }), E("a2", "acs", "acylc", "AMP + PPi", { state: st(1, step), selected: sel("acs"), via: [[275, 133]] }),
    E("b1", "acylc", "cpt1", undefined, { state: st(2, step), selected: sel("cpt1") }), E("b2", "cpt1", "carnims", undefined, { state: st(2, step), selected: sel("cpt1") }),
    E("c1", "carnims", "cact", undefined, { state: st(3, step), selected: sel("cact"), kind: "transport" }), E("c2", "cact", "carnm", "in", { state: st(3, step), selected: sel("cact"), kind: "transport" }),
    E("c3", "carnfreeM", "cact", "out", { via: [[565, 82]], state: st(3, step), kind: "transport", selected: sel("cact"), labelPos: [585, 72] }), E("c4", "cact", "carnfreeI", undefined, { via: [[565, 100], [420, 100]], state: st(3, step), kind: "transport", selected: sel("cact") }),
    E("c5", "carnfreeI", "cpt1", undefined, { state: st(3, step), kind: "transport", via: [[275, 82]] }),
    E("d1", "carnm", "cpt2", undefined, { state: st(4, step), selected: sel("cpt2") }), E("d2", "cpt2", "acylm", undefined, { state: st(4, step), selected: sel("cpt2") }), E("d3", "cpt2", "carnfreeM", "carnitine freed", { state: st(4, step), kind: "transport", via: [[860, 82]], labelPos: [830, 72] }),
  ];
  return { width: 940, height: 350, nodes, edges, bands, texts: [{ x: 15, y: 330, text: "Activation is step 1 (outer membrane); transport steps 2 to 4. Carnitine is consumed by CPT I (CoA released) and regenerated by CPT II (CoA used). Dashed items have not happened yet.", size: 12 }], label: `Carnitine shuttle for ${name} acyl groups: acyl-CoA to acylcarnitine, translocation, back to acyl-CoA in the matrix` };
}

// ---- β-oxidation cycle ---------------------------------------------------------------------------------------------------------------------

/** One β-oxidation cycle at chain length L. `done` = number of the cycle's four reactions already performed (0..4); `isomerase` replaces the first reaction for oleate. */
export function betaSpec(L: number, done: number, opts: { isomerase?: boolean; selected?: string | null; odd?: boolean } = {}): Spec {
  const stepOf = (i: number): Visual => (i < done ? "done" : i === done ? "active" : "future");
  const last = L === (opts.odd ? 5 : 4);
  const sel = opts.selected ?? null;
  const nodes: GNode[] = [
    N("s0", 70, 20, 250, 48, [`Acyl-CoA (C${L})`, last && !opts.odd ? "butyryl-CoA" : "start of the cycle"], { kind: "lipid", state: done === 0 ? "active" : "done" }),
    N("s1", 70, 120, 250, 48, [opts.isomerase ? `trans-Δ2-Enoyl-CoA (C${L})` : `trans-Δ2-Enoyl-CoA (C${L})`, opts.isomerase ? "after the isomerase" : "C2=C3 double bond"], { kind: "lipid", state: done >= 1 ? (done === 1 ? "active" : "done") : "future" }),
    N("s2", 70, 220, 250, 48, [`L-3-Hydroxyacyl-CoA (C${L})`, "OH on C3"], { kind: "lipid", state: done >= 2 ? (done === 2 ? "active" : "done") : "future" }),
    N("s3", 70, 320, 250, 48, [`3-Ketoacyl-CoA (C${L})`, last && !opts.odd ? "acetoacetyl-CoA" : "C=O on C3"], { kind: "lipid", state: done >= 3 ? (done === 3 ? "active" : "done") : "future" }),
    N("s4", 70, 430, 250, 48, last ? (opts.odd ? ["Propionyl-CoA (C3)", "leaves β-oxidation"] : ["Acetyl-CoA (C2)", "the second acetyl-CoA"]) : [`Acyl-CoA (C${L - 2})`, "two carbons shorter"], { kind: "lipid", state: done >= 4 ? "active" : "future" }),
    N("ac", 420, 430, 190, 48, ["Acetyl-CoA (C2)", "released by thiolysis"], { kind: "shared", state: done >= 4 ? "active" : "future" }),
  ];
  const e = (id: string, from: string, to: string, label: string, i: number, extra: Partial<GEdge> = {}): GEdge => E(id, from, to, label, { state: stepOf(i), selected: sel === id, ...extra });
  const edges: GEdge[] = [
    e("acad", "s0", "s1", opts.isomerase ? "Enoyl-CoA isomerase" : "Acyl-CoA dehydrogenase", 0, { labelPos: [195, 100] }),
    e("ech", "s1", "s2", "Enoyl-CoA hydratase", 1, { labelPos: [195, 200] }),
    e("hadh", "s2", "s3", "Hydroxyacyl-CoA dehydrogenase", 2, { labelPos: [195, 300] }),
    e("thiol", "s3", "s4", last ? "Thiolase (ACAT)" : "Thiolase", 3, { labelPos: [195, 410] }),
    E("branch", "s3", "ac", "+ acetyl-CoA", { state: stepOf(3), via: [[515, 344]], labelPos: [575, 332] }),
  ];
  if (!last) edges.push(E("loop", "s4", "s0", "next cycle", { kind: "link", noArrow: false, via: [[30, 454], [30, 44]], state: done >= 4 ? "active" : "future", labelPos: [30, 250] }));
  const texts: GText[] = [
    { x: 335, y: 100, text: opts.isomerase ? "no FAD reduced (this step is skipped)" : "FAD → FADH₂   (+1 FADH₂)", size: 12, fill: done > 0 ? "#0f172a" : "#64748b" },
    { x: 335, y: 200, text: "+ H₂O", size: 12 }, { x: 335, y: 300, text: "NAD⁺ → NADH + H⁺   (+1 NADH)", size: 12, fill: done > 2 ? "#0f172a" : "#64748b" },
    { x: 335, y: 400, text: "+ CoA-SH (thiolysis)", size: 12 },
  ];
  return { width: 640, height: 500, nodes, edges, bands: [], texts, label: `One β-oxidation cycle at C${L}: dehydrogenation, hydration, dehydrogenation, thiolysis` };
}

// ---- fatty-acid synthesis ----------------------------------------------------------------------------------------------------------------------

export type SynthPhase = "supply" | "acc" | "load" | "condense" | "reduce1" | "dehydrate" | "reduce2" | "release" | "start";
export function synthesisSpec(phase: SynthPhase, round: number, source: "mitochondrial-citrate" | "cytosolic", selected: string | null): Spec {
  const on = (...p: SynthPhase[]): Visual => (p.includes(phase) ? "active" : phase === "start" ? "normal" : "normal");
  const bands: GBand[] = [{ id: "mat", x: 10, y: 10, w: 200, h: 440, label: "Mitochondrial matrix", tone: "b" }, { id: "cyt", x: 220, y: 10, w: 710, h: 440, label: "Cytosol", tone: "a" }];
  const nodes: GNode[] = [
    N("citm", 30, 60, 160, 46, ["Citrate", "(from the cycle)"], { kind: "shared", state: source === "cytosolic" ? "dim" : on("supply") }),
    N("citc", 250, 60, 140, 46, ["Citrate", "(cytosol)"], { kind: "shared", state: source === "cytosolic" ? "dim" : on("supply") }),
    N("acly", 440, 60, 170, 46, ["ATP-citrate lyase", "+ ATP + CoA (+ OAA)"], { kind: "enzyme", state: source === "cytosolic" ? "dim" : on("supply"), selected: selected === "ACLY" }),
    N("acc", 250, 180, 150, 46, ["Acetyl-CoA", "(cytosol)"], { kind: "shared", state: on("supply", "acc") }),
    N("accE", 440, 180, 180, 46, ["Acetyl-CoA carboxylase", "+ CO₂ + ATP (biotin)"], { kind: "enzyme", state: on("acc"), selected: selected === "ACC" }),
    N("mal", 680, 180, 140, 46, ["Malonyl-CoA"], { kind: "lipid", state: on("acc", "load") }),
    N("fas", 430, 300, 330, 100, [`Fatty-acid synthase (ACP-bound chain C${Math.max(2, 2 * (round + 1))})`, "condensation → reduction → dehydration → reduction", `round ${round} of 7`], { kind: "enzyme", state: on("load", "condense", "reduce1", "dehydrate", "reduce2"), selected: selected === "FAS" }),
    N("pal", 800, 330, 120, 46, ["Palmitate", "(C16:0)"], { kind: "product", state: on("release") }),
    N("oaa", 250, 310, 160, 46, ["OAA → malate →", "pyruvate (+ NADPH)"], { kind: "carbon", state: source === "cytosolic" ? "dim" : on("supply") }),
    N("nadph", 250, 385, 190, 44, ["NADPH × 2 per round", "(malic enzyme, PPP)"], { kind: "carrier", state: on("reduce1", "reduce2") }),
  ];
  const e = (id: string, from: string, to: string, label: string | undefined, vis: Visual, extra: Partial<GEdge> = {}): GEdge => E(id, from, to, label, { state: vis, ...extra });
  const edges: GEdge[] = [
    e("exp", "citm", "citc", undefined, source === "cytosolic" ? "dim" : on("supply"), { kind: "transport" }), e("lyase", "citc", "acly", undefined, source === "cytosolic" ? "dim" : on("supply")),
    e("ac1", "acly", "acc", undefined, source === "cytosolic" ? "dim" : on("supply"), { via: [[485, 140], [325, 140]] }),
    e("c1", "acc", "accE", undefined, on("acc")), e("c2", "accE", "mal", undefined, on("acc")), e("c3", "mal", "fas", "+ ACP", on("load", "condense"), { via: [[750, 250]] }),
    e("c4", "fas", "pal", undefined, on("release")), e("c5", "nadph", "fas", undefined, on("reduce1", "reduce2"), { kind: "cofactor" }),
    e("c6", "acc", "fas", "primer (once)", on("load"), { kind: "link", labelPos: [400, 262] }),
  ];
  return { width: 940, height: 468, nodes, edges, bands, texts: [{ x: 230, y: 458, text: "Synthesis is cytosolic and ACP-bound; it is not β-oxidation run backward (see the list below).", size: 12 }], label: "De novo fatty-acid synthesis: citrate export, acetyl-CoA carboxylase, fatty-acid synthase rounds and release of palmitate" };
}

// ---- ketone bodies --------------------------------------------------------------------------------------------------------------------------------

export function ketoneSpec(mode: "ketogenesis" | "ketolysis", form: "acetoacetate" | "bhb", step: number, selected: string | null): Spec {
  const g = (i: number): Visual => (mode === "ketogenesis" ? st(i, step) : "dim");
  const k = (i: number): Visual => (mode === "ketolysis" ? st(i, step) : "dim");
  const bands: GBand[] = [
    { id: "liv", x: 10, y: 10, w: 330, h: 440, label: "Liver mitochondria: ketogenesis", tone: "c" }, { id: "blood", x: 350, y: 10, w: 220, h: 440, label: "Blood", tone: "d" },
    { id: "ext", x: 580, y: 10, w: 350, h: 440, label: "Extrahepatic mitochondria: ketolysis", tone: "b" },
  ];
  const nodes: GNode[] = [
    N("l-ac", 40, 40, 150, 44, ["Acetyl-CoA ×2", "(from β-oxidation)"], { kind: "shared", state: g(0) }),
    N("l-aacoa", 40, 130, 150, 44, ["Acetoacetyl-CoA"], { kind: "ketone", state: g(1), selected: selected === "ACAT" }),
    N("l-hmg", 40, 220, 150, 44, ["HMG-CoA"], { kind: "ketone", state: g(2), selected: selected === "HMGCS2" }),
    N("l-aa", 40, 310, 150, 44, ["Acetoacetate"], { kind: "ketone", state: g(3), selected: selected === "HMGCL" }),
    N("l-bhb", 190, 380, 140, 44, ["β-Hydroxybutyrate"], { kind: "ketone", state: form === "bhb" ? g(4) : "dim", selected: selected === "BDH1" }),
    N("l-acetone", 215, 316, 115, 40, ["Acetone", "(minor)"], { kind: "carrier", state: g(4) === "dim" ? "dim" : "future" }),
    N("b-aa", 375, 290, 170, 44, ["Acetoacetate", "(blood)"], { kind: "ketone", state: mode === "ketogenesis" ? st(5, step) : form === "acetoacetate" ? st(1, step) : "dim" }),
    N("b-bhb", 375, 380, 170, 44, ["β-Hydroxybutyrate", "(blood)"], { kind: "ketone", state: form === "bhb" ? (mode === "ketogenesis" ? st(5, step) : st(1, step)) : "dim" }),
    N("e-aa", 610, 290, 150, 44, ["Acetoacetate"], { kind: "ketone", state: form === "bhb" ? k(2) : k(1) }),
    N("e-aacoa", 610, 200, 150, 44, ["Acetoacetyl-CoA"], { kind: "ketone", state: k(3), selected: selected === "SCOT" }),
    N("e-ac", 610, 110, 150, 44, ["Acetyl-CoA ×2"], { kind: "shared", state: k(4) }),
    N("e-tca", 610, 40, 150, 40, ["Citric acid cycle"], { kind: "product", state: k(4) }),
    N("e-bhb", 780, 380, 140, 44, ["β-Hydroxybutyrate"], { kind: "ketone", state: form === "bhb" ? k(2) : "dim" }),
    N("e-succ", 790, 200, 130, 44, ["Succinyl-CoA →", "succinate"], { kind: "carrier", state: k(3) }),
  ];
  const e = (id: string, from: string, to: string, label: string | undefined, vis: Visual, extra: Partial<GEdge> = {}): GEdge => E(id, from, to, label, { state: vis, selected: selected === id, ...extra });
  const edges: GEdge[] = [
    e("ACAT", "l-ac", "l-aacoa", "ACAT (thiolase)", g(1)), e("HMGCS2", "l-aacoa", "l-hmg", "HMG-CoA synthase", g(2), { labelPos: [235, 184] }), e("HMGCL", "l-hmg", "l-aa", "HMG-CoA lyase", g(3), { labelPos: [225, 276] }),
    e("BDH1", "l-aa", "l-bhb", "BDH1 + NADH", form === "bhb" ? g(4) : "dim", { labelPos: [95, 382] }), e("ACETONE", "l-aa", "l-acetone", undefined, g(4) === "dim" ? "dim" : "future", { kind: "link", noArrow: false }),
    e("KB-EXPORT", "l-aa", "b-aa", "export", mode === "ketogenesis" ? st(5, step) : "dim", { kind: "transport", labelPos: [350, 295] }), e("KB-EXPORT-B", "l-bhb", "b-bhb", "export", form === "bhb" && mode === "ketogenesis" ? st(5, step) : "dim", { kind: "transport", labelPos: [350, 395] }),
    e("KB-IMPORT", "b-aa", "e-aa", "uptake", mode === "ketolysis" && form === "acetoacetate" ? st(1, step) : "dim", { kind: "transport", selected: selected === "KB-IMPORT", labelPos: [585, 295] }),
    e("KB-IMPORT-B", "b-bhb", "e-bhb", "uptake", mode === "ketolysis" && form === "bhb" ? st(1, step) : "dim", { kind: "transport", labelPos: [585, 395] }),
    e("BDH1-R", "e-bhb", "e-aa", "BDH1 (NAD⁺ → NADH)", form === "bhb" ? k(2) : "dim", { labelPos: [840, 345] }),
    e("SCOT", "e-aa", "e-aacoa", "SCOT (succinyl-CoA donates CoA)", k(3), { labelPos: [690, 255] }), e("SCOT-S", "e-succ", "e-aacoa", undefined, k(3), { kind: "cofactor" }),
    e("ACAT-R", "e-aacoa", "e-ac", "thiolase (+ CoA)", k(4), { labelPos: [690, 165] }), e("TCA", "e-ac", "e-tca", "citrate synthase", k(4)),
  ];
  return { width: 940, height: 460, nodes, edges, bands, texts: [{ x: 20, y: 440, text: "Liver: little SCOT, so no ketolysis here.", size: 12, weight: 700 }, { x: 590, y: 440, text: "These tissues have SCOT but little HMG-CoA synthase.", size: 12, weight: 700 }], label: "Ketone bodies: hepatic ketogenesis, transport in blood and extrahepatic ketolysis" };
}

// ---- urea cycle -------------------------------------------------------------------------------------------------------------------------------------

export function ureaSpec(step: number, selected: string | null): Spec {
  const bands: GBand[] = [{ id: "mat", x: 10, y: 10, w: 255, h: 420, label: "Mitochondrial matrix", tone: "b" }, { id: "cyt", x: 285, y: 10, w: 650, h: 420, label: "Cytosol", tone: "a" }];
  const live = (s: number): Visual => st(s, step);
  const nodes: GNode[] = [
    N("src", 25, 40, 215, 54, ["NH₄⁺ + CO₂ + 2 ATP"], { kind: "nitrogen", state: "normal", badge: "N", badgeKind: "nitrogen-nh4", selected: selected === "CPS1" }),
    N("cp", 25, 130, 215, 50, ["Carbamoyl phosphate"], { kind: "nitrogen", state: live(1), badge: "N", badgeKind: "nitrogen-nh4" }),
    N("cit-m", 25, 225, 215, 50, ["Citrulline (matrix)"], { kind: "nitrogen", state: live(2), selected: selected === "OTC" }),
    N("orn-m", 25, 340, 215, 50, ["Ornithine (matrix)"], { kind: "nitrogen", state: step >= 8 ? "active" : "normal", selected: selected === "ORN-IMPORT" }),
    N("cit-c", 315, 225, 170, 50, ["Citrulline", "(cytosol)"], { kind: "nitrogen", state: live(3), selected: selected === "CIT-EXPORT" }),
    N("asp", 535, 100, 190, 50, ["Aspartate"], { kind: "nitrogen", state: "normal", badge: "N", badgeKind: "nitrogen-asp" }),
    N("argsucc", 535, 225, 190, 50, ["Argininosuccinate"], { kind: "nitrogen", state: live(4), selected: selected === "ASS" }),
    N("fum", 775, 225, 140, 50, ["Fumarate"], { kind: "shared", state: live(6), selected: selected === "ASL" }),
    N("arg", 535, 340, 190, 50, ["Arginine"], { kind: "nitrogen", state: live(6) }),
    N("urea", 775, 340, 140, 50, ["Urea"], { kind: "product", state: live(7), selected: selected === "ARG1" }),
    N("orn-c", 315, 340, 170, 50, ["Ornithine", "(cytosol)"], { kind: "nitrogen", state: live(7) }),
  ];
  const e = (id: string, from: string, to: string, label: string | undefined, s: number, extra: Partial<GEdge> = {}): GEdge => E(id, from, to, label, { state: live(s), selected: selected === id, ...extra });
  const edges: GEdge[] = [
    e("CPS1", "src", "cp", "CPS I (⊕ NAG)", 1, { labelPos: [195, 114] }), e("OTC", "cp", "cit-m", "OTC", 2, { labelPos: [165, 206] }),
    E("orn-otc", "orn-m", "cit-m", undefined, { state: live(2), kind: "cofactor" }),
    e("CIT-EXPORT", "cit-m", "cit-c", "citrulline out", 3, { kind: "transport", labelPos: [275, 215] }),
    e("ASS", "cit-c", "argsucc", "ASS (ATP → AMP + PPi)", 4, { labelPos: [510, 215] }), E("asp-ass", "asp", "argsucc", "+ aspartate N", { state: live(4), kind: "cofactor", labelPos: [630, 190] }),
    e("ASL", "argsucc", "arg", "ASL", 6, { labelPos: [555, 312] }), E("asl-fum", "argsucc", "fum", "fumarate", { state: live(6), labelPos: [750, 215] }),
    e("ARG1", "arg", "urea", "arginase (+ H₂O)", 7, { labelPos: [750, 330] }), E("arg-orn", "arg", "orn-c", "ornithine regenerated", { state: live(7), labelPos: [510, 332] }),
    e("ORN-IMPORT", "orn-c", "orn-m", "ornithine in", 8, { kind: "transport", via: [[275, 365]], labelPos: [277, 408] }),
  ];
  const texts: GText[] = [{ x: 300, y: 318, text: step >= 5 ? "PPi → 2 Pi (pyrophosphatase)" : "", size: 12, weight: 700 }, { x: 20, y: 437, text: "N badges: blue = nitrogen from NH₄⁺, orange = nitrogen from aspartate.", size: 12 }];
  return { width: 940, height: 450, nodes, edges, bands, texts, label: "Urea cycle across the mitochondrial matrix and cytosol, with nitrogen sources marked" };
}

// ---- amino-acid carbon-skeleton map -------------------------------------------------------------------------------------------------------------

const END_ORDER: EndpointId[] = ["pyruvate", "oaa", "akg", "fumarate", "succoa", "acetylcoa", "acetoacetate"];
export function aminoMapSpec(one: string): Spec {
  const sel = AMINO_CATABOLISM_BY_ONE[one];
  const targets = new Set<EndpointId>(sel.endpoints);
  const bands: GBand[] = [
    { id: "g", x: 10, y: 150, w: 440, h: 210, label: "Glucogenic only", tone: "b" }, { id: "b", x: 460, y: 150, w: 280, h: 210, label: "Glucogenic and ketogenic", tone: "c" }, { id: "k", x: 750, y: 150, w: 180, h: 210, label: "Ketogenic only", tone: "e" },
  ];
  const nodes: GNode[] = END_ORDER.map((id, i) => N(`end-${id}`, 12 + i * 132, 30, 124, 56, [ENDPOINTS[id].label.split(" / ")[0], ENDPOINTS[id].glucogenic ? "gluconeogenic" : "ketogenic"], { kind: ENDPOINTS[id].glucogenic ? "shared" : "ketone", selected: targets.has(id), state: targets.has(id) ? "normal" : "dim" }));
  const groups: Record<string, string[]> = { glucogenic: [], both: [], ketogenic: [] };
  for (const a of AMINO_ACID_LIST) groups[classifyAminoAcid(a.one)].push(a.one);
  const place = (list: string[], x0: number, perRow: number, y0: number) => list.forEach((o, i) => { const a = AMINO_ACID_LIST.find((z) => z.one === o)!; nodes.push(N(`aa-${o}`, x0 + (i % perRow) * 70, y0 + Math.floor(i / perRow) * 50, 62, 40, [a.three, o], { kind: "nitrogen", selected: o === one, state: o === one ? "normal" : "normal" })); });
  place(groups.glucogenic, 22, 6, 180); place(groups.both, 472, 4, 180); place(groups.ketogenic, 762, 2, 180);
  const edges: GEdge[] = sel.endpoints.map((id) => E(`e-${id}`, `aa-${one}`, `end-${id}`, undefined, { selected: true, kind: ENDPOINTS[id].glucogenic ? "link" : "regulation", noArrow: false, via: undefined }));
  const texts: GText[] = [{ x: 14, y: 372, text: "Entry points (top row); the selected amino acid's arrows go to its entry points. Curated relationships: no intermediate enzymes are shown.", size: 12 }];
  return { width: 940, height: 385, nodes, edges: edges.map((x) => ({ ...x, kind: "main" as const, noArrow: false })), bands, texts, label: `Carbon-skeleton destination of ${AMINO_ACID_LIST.find((a) => a.one === one)!.name} among central metabolism entry points` };
}

// ---- integrated fuel map --------------------------------------------------------------------------------------------------------------------------

export const HUBS: Array<{ id: string; x: number; y: number }> = [
  { id: "pyruvate", x: 445, y: 50 }, { id: "acetylcoa", x: 445, y: 180 }, { id: "oaa", x: 445, y: 310 }, { id: "akg", x: 445, y: 420 }, { id: "succoa", x: 445, y: 520 }, { id: "fumarate", x: 445, y: 640 },
];
const PATH_POS: Record<PathwayId, [number, number]> = {
  glycolysis: [20, 36], gluconeogenesis: [20, 111], "pyruvate-oxidation": [20, 186], tca: [20, 316], oxphos: [20, 411],
  "fa-activation": [750, 31], "carnitine-shuttle": [750, 96], "beta-oxidation": [750, 161], propionate: [750, 226], "fa-synthesis": [750, 291],
  ketogenesis: [750, 371], ketolysis: [750, 436], transamination: [750, 521], deamination: [750, 586], "urea-cycle": [750, 651],
};
const GROUP_KIND: Record<GroupId, GNode["kind"]> = { carbohydrate: "carbon", lipid: "lipid", ketone: "ketone", nitrogen: "nitrogen" };
export function pathwayTouches(p: PathwayId, metabolite: string): boolean { return pathwayReactions(p).some(({ reaction }) => [...reaction.substrates, ...reaction.products].some((x) => x.met === metabolite)); }
function splitLabel(text: string): string[] {
  if (text.length <= 22) return [text];
  const words = text.split(" ");
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length); if (d < bestDiff) { bestDiff = d; best = i; } }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}
export function fuelMapSpec(focus: MapFocus, selectedPathway: PathwayId | null, selectedMetabolite: string | null): Spec {
  const shown = new Set(MAP_FOCUS[focus].pathways);
  const bands: GBand[] = [
    { id: "carb", x: 10, y: 4, w: 190, h: 480, label: "Carbohydrate and cycle", tone: "b" }, { id: "lip", x: 740, y: 4, w: 190, h: 300, label: "Fatty acids", tone: "c" },
    { id: "ket", x: 740, y: 342, w: 190, h: 150, label: "Ketone bodies", tone: "e" }, { id: "nit", x: 740, y: 504, w: 190, h: 210, label: "Amino acids and nitrogen", tone: "d" },
  ];
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const dimmed = (p: PathwayId) => !shown.has(p);
  for (const p of Object.keys(PATH_POS) as PathwayId[]) {
    const [x, y] = PATH_POS[p], g = groupOf(p);
    nodes.push(N(`p-${p}`, x, y, 170, 52, splitLabel(PATHWAYS[p].label), { kind: GROUP_KIND[g], state: dimmed(p) ? "dim" : selectedMetabolite && !pathwayTouches(p, selectedMetabolite) ? "dim" : "normal", selected: selectedPathway === p, aria: PATHWAYS[p].label }));
  }
  for (const h of HUBS) {
    const m = metaboliteOf(h.id)!;
    nodes.push(N(`m-${h.id}`, h.x, h.y, 150, 52, [m.abbreviation === m.name ? m.name : m.name.split(" ")[0] === "Succinyl-CoA" ? "Succinyl-CoA" : m.name, m.carbons ? `C${m.carbons}` : ""].filter(Boolean), { kind: "shared", selected: selectedMetabolite === h.id, state: selectedMetabolite && selectedMetabolite !== h.id ? "dim" : "normal", aria: `${m.name}, shared metabolite` }));
    for (const p of Object.keys(PATH_POS) as PathwayId[]) {
      if (!pathwayTouches(p, h.id)) continue;
      const left = PATH_POS[p][0] < 400;
      const vis: Visual = dimmed(p) ? "dim" : selectedMetabolite && selectedMetabolite !== h.id ? "dim" : "normal";
      edges.push(E(`l-${p}-${h.id}`, `p-${p}`, `m-${h.id}`, undefined, { kind: "link", state: vis, via: left ? undefined : undefined }));
    }
  }
  return { width: 940, height: 725, nodes, edges, bands, texts: [{ x: 300, y: 20, text: "Shared metabolites", size: 13, weight: 700, anchor: "start" }, { x: 215, y: 715, text: "Lines connect a pathway to each shared metabolite it uses or makes (no direction or flux is implied).", size: 12 }], label: `Integrated fuel map, ${MAP_FOCUS[focus].label}: pathways grouped by fuel, linked through shared metabolites` };
}
export const nodeIdOfPathway = (id: string): PathwayId | null => (id.startsWith("p-") ? (id.slice(2) as PathwayId) : null);
export const nodeIdOfMetabolite = (id: string): string | null => (id.startsWith("m-") ? id.slice(2) : null);
export { FATTY_ACID_NAME };
