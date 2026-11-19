/**
 * Stage 25 integrated fuel and nitrogen map (pure; no React). One metabolite and reaction table (network.ts) is read here to give:
 *  - separate carbon, nitrogen, energy-carrier, redox and NADPH ledgers (a molecule or carrier is counted once, wherever it appears),
 *  - the pathways that use each shared metabolite,
 *  - tissue context and bounded qualitative scenarios,
 *  - a substrate comparison built from the Stage 18 ATP convention.
 * Connections are stoichiometric or curated relationships. They are NOT flux predictions.
 */
import { ENZYMES_BY_ID, METABOLITES_BY_ID, PATHWAYS, REACTIONS, metaboliteOf, parseFormula, type PathwayId, type Reaction, type TissueId } from "./network";
import { carriersOf, glucoseLedger, pathwayNet, reactionNet, type Net, type Shuttle } from "./ledger";
import { acetylCoaCycleAtp, bondChange, ketoneOxidationAtp, lipidRegulation, LIPID_PRESETS, oxidationTotals, synthesisLedger, type LipidConditions } from "./lipids";
import { AMINO_CATABOLISM, classifyAminoAcid } from "./nitrogen";
import type { Tendency } from "./network";

// ---- groups and focused views -----------------------------------------------------------------------------------------------------------

export type GroupId = "carbohydrate" | "lipid" | "ketone" | "nitrogen";
export const GROUPS: Record<GroupId, { label: string; pathways: PathwayId[]; summary: string }> = {
  carbohydrate: { label: "Carbohydrate and the cycle", pathways: ["glycolysis", "gluconeogenesis", "pyruvate-oxidation", "tca", "oxphos"], summary: "Stage 18 pathways: glucose to acetyl-CoA, the citric acid cycle and oxidative phosphorylation." },
  lipid: { label: "Fatty acids", pathways: ["fa-activation", "carnitine-shuttle", "beta-oxidation", "propionate", "fa-synthesis"], summary: "Activation, transport, β-oxidation, the propionyl-CoA route and cytosolic synthesis." },
  ketone: { label: "Ketone bodies", pathways: ["ketogenesis", "ketolysis"], summary: "Hepatic production and extrahepatic use of acetoacetate and β-hydroxybutyrate." },
  nitrogen: { label: "Amino acids and nitrogen", pathways: ["transamination", "deamination", "urea-cycle"], summary: "Amino-group transfer, ammonium release and urea synthesis; carbon skeletons enter the cycle." },
};
export const groupOf = (p: PathwayId): GroupId => (Object.keys(GROUPS) as GroupId[]).find((g) => GROUPS[g].pathways.includes(p))!;
export type MapFocus = "overview" | "acetyl-coa" | "ketone" | "amino-carbon" | "nitrogen";
export const MAP_FOCUS: Record<MapFocus, { label: string; summary: string; pathways: PathwayId[] }> = {
  overview: { label: "Overview (pathway level)", summary: "Every pathway as one box, grouped by fuel; shared metabolites link them.", pathways: Object.keys(PATHWAYS) as PathwayId[] },
  "acetyl-coa": { label: "Acetyl-CoA hub", summary: "Carbohydrate, fatty acids and ketone bodies all meet at acetyl-CoA and the citric acid cycle.", pathways: ["glycolysis", "pyruvate-oxidation", "tca", "beta-oxidation", "fa-synthesis", "ketogenesis", "ketolysis", "oxphos"] },
  ketone: { label: "Ketone bodies between tissues", summary: "Liver makes ketone bodies, blood carries them, extrahepatic mitochondria burn them.", pathways: ["beta-oxidation", "ketogenesis", "ketolysis", "tca"] },
  "amino-carbon": { label: "Amino-acid carbon skeletons", summary: "Carbon skeletons enter at pyruvate, acetyl-CoA / acetoacetate, α-ketoglutarate, succinyl-CoA, fumarate and oxaloacetate.", pathways: ["transamination", "tca", "gluconeogenesis", "ketogenesis"] },
  nitrogen: { label: "Nitrogen disposal", summary: "Amino groups move onto glutamate and aspartate and leave as urea.", pathways: ["transamination", "deamination", "urea-cycle", "tca"] },
};

// ---- metabolite roles across pathways -------------------------------------------------------------------------------------------------

export interface MetaboliteRole { reactionId: string; side: "substrate" | "product"; pathways: PathwayId[]; compartment: string; tissues: TissueId[] }
export const tissuesOf = (r: Reaction): TissueId[] => r.tissues ?? ENZYMES_BY_ID[r.enzyme]?.tissues ?? ["liver", "extrahepatic"];
export function metaboliteRoles(id: string): MetaboliteRole[] {
  const out: MetaboliteRole[] = [];
  for (const r of REACTIONS) {
    const pathways = [...new Set(r.roles.map((x) => x.pathway))];
    const base = { reactionId: r.id, pathways, compartment: r.compartment, tissues: tissuesOf(r) };
    if (r.substrates.some((p) => p.met === id)) out.push({ ...base, side: "substrate" });
    if (r.products.some((p) => p.met === id)) out.push({ ...base, side: "product" });
  }
  return out;
}
export const pathwaysOfMetabolite = (id: string): PathwayId[] => [...new Set(metaboliteRoles(id).flatMap((r) => r.pathways))];
/** Metabolites used by two or more pathways, i.e. the shared identities that connect the map (excluding water, protons and Pi). */
export function sharedMetabolites(): string[] {
  const skip = new Set(["h2o", "hplus", "pi", "co2", "o2"]);
  return Object.keys(METABOLITES_BY_ID).filter((id) => !skip.has(id) && new Set(pathwaysOfMetabolite(id).map(groupOf)).size >= 2);
}
export const REQUIRED_SHARED = ["acetylcoa", "oaa", "akg", "succoa", "fumarate", "atp", "nadh", "fadh2", "nadph", "coa"] as const;

// ---- ledgers ----------------------------------------------------------------------------------------------------------------------------------

const isCarrierKind = (id: string) => { const m = metaboliteOf(id); return !m || m.kind === "cofactor" || m.kind === "carrier"; };
/** Carbons counted in the carbon ledger: the acyl or skeleton carbons of intermediates; carrier moieties (CoA, ACP, carnitine) and nucleotide carriers are not counted. */
export const carbonCount = (id: string): number => { const m = metaboliteOf(id); return !m || isCarrierKind(id) ? 0 : (m.carbons ?? 0); };
/** Nitrogens counted in the nitrogen ledger: amino acids, ammonium, urea and nitrogen intermediates; CoA, nucleotides and carnitine nitrogen belong to carriers and are not counted. */
export const nitrogenCount = (id: string): number => {
  const m = metaboliteOf(id);
  if (!m || isCarrierKind(id) || m.acylGroup || !m.formula || /N7O\d+P3S$/.test(m.formula)) return 0;
  return parseFormula(m.formula)?.N ?? 0;
};
const sumOver = (net: Net, f: (id: string) => number): { consumed: number; produced: number; net: number } => {
  let consumed = 0, produced = 0;
  for (const [k, v] of Object.entries(net)) { const c = f(k) * v; if (c < 0) consumed += -c; else produced += c; }
  return { consumed, produced, net: produced - consumed };
};
export interface Ledgers {
  carbon: { consumed: number; produced: number; net: number; co2: number };
  nitrogen: { consumed: number; produced: number; net: number; ammonium: number; urea: number };
  energy: { atp: number; gtp: number; ntpEquivalents: number; highEnergyBonds: number };
  redox: { nadh: number; fadh2: number };
  nadph: number;
}
export function ledgersOf(net: Net): Ledgers {
  const c = sumOver(net, carbonCount), n = sumOver(net, nitrogenCount), cr = carriersOf(net);
  return {
    carbon: { ...c, co2: net.co2 ?? 0 }, nitrogen: { ...n, ammonium: net.nh4 ?? 0, urea: net.urea ?? 0 },
    energy: { atp: cr.atp, gtp: cr.gtp, ntpEquivalents: cr.ntpEquivalents, highEnergyBonds: bondChange(net) }, redox: { nadh: cr.nadh, fadh2: cr.fadh2 }, nadph: (net.nadph ?? 0),
  };
}
export const reactionLedgers = (r: Reaction, direction: "forward" | "reverse" = "forward"): Ledgers => ledgersOf(reactionNet(r, direction));
/** The pathway's net and the unit it is expressed per (glucose for the Stage 18 pathways; one pass or cycle for the new ones; palmitate for synthesis). */
export function pathwayLedger(p: PathwayId): { net: Net; unit: string; ledgers: Ledgers } {
  if (p === "fa-synthesis") { const s = synthesisLedger(16)!; return { net: s.net, unit: "per palmitate (acetyl-CoA exported as citrate)", ledgers: ledgersOf(s.net) }; }
  const perGlucose = groupOf(p) === "carbohydrate";
  const net = pathwayNet(p, perGlucose ? "glucose" : "event");
  const unit = perGlucose ? "per glucose" : p === "beta-oxidation" ? "per cycle (C16 instance)" : p === "urea-cycle" ? "per urea (core steps and connection excluded)" : p === "fa-activation" ? "per fatty acid activated" : "per pass";
  return { net, unit, ledgers: ledgersOf(net) };
}
/** Sum of several pathways, each counted once (a shared metabolite or carrier is never added twice because two pathways mention it). */
export function combinedLedger(pathways: PathwayId[]): { net: Net; ledgers: Ledgers } {
  const net: Net = {};
  for (const p of [...new Set(pathways)]) for (const [k, v] of Object.entries(pathwayLedger(p).net)) net[k] = (net[k] ?? 0) + v;
  const clean: Net = {};
  for (const [k, v] of Object.entries(net)) { const r = Math.round(v * 1e6) / 1e6; if (r !== 0) clean[k] = r; }
  return { net: clean, ledgers: ledgersOf(clean) };
}

// ---- substrate comparison ----------------------------------------------------------------------------------------------------------------

export interface SubstrateRow { id: string; label: string; formula: string; carbons: number; atp: number; atpPerCarbon: number; enters: string; needsOxygen: boolean; tissues: string; note: string }
export function substrateComparison(shuttle: Shuttle = "malate-aspartate"): SubstrateRow[] {
  const glucose = glucoseLedger(shuttle).totalAtp;
  const palm = oxidationTotals({ kind: "saturated", carbons: 16 })!.atp!.total;
  const acac = ketoneOxidationAtp("acetoacetate").total, bhb = ketoneOxidationAtp("bhb").total;
  const row = (id: string, label: string, formula: string, carbons: number, atp: number, enters: string, tissues: string, note: string): SubstrateRow =>
    ({ id, label, formula, carbons, atp, atpPerCarbon: atp / carbons, enters, needsOxygen: true, tissues, note });
  return [
    row("glucose", "Glucose", "C6H12O6", 6, glucose, "Glycolysis → pyruvate → acetyl-CoA", "Most cells (red blood cells: glycolysis only)", `Complete oxidation estimate with the ${shuttle === "malate-aspartate" ? "malate–aspartate" : "glycerol-phosphate"} shuttle; the glycolytic part also works without oxygen.`),
    row("palmitate", "Palmitate (C16:0)", "C16H32O2", 16, palm, "β-Oxidation → acetyl-CoA (and FADH₂, NADH)", "Heart, muscle, liver; not red blood cells; the brain little", "Net of activation (−2 ATP equivalents). Only the carriers and acetyl-CoA come from β-oxidation itself; the ATP appears in the citric acid cycle and respiratory chain."),
    row("acetoacetate", "Acetoacetate", "C4H6O3", 4, acac, "SCOT → acetoacetyl-CoA → 2 acetyl-CoA", "Extrahepatic tissues (not liver)", "Lower than two acetyl-CoA from other sources because SCOT bypasses succinyl-CoA synthetase's GTP."),
    row("bhb", "D-β-Hydroxybutyrate", "C4H8O3", 4, bhb, "BDH1 → acetoacetate → …", "Extrahepatic tissues (not liver)", "Includes the NADH formed when β-hydroxybutyrate is oxidized to acetoacetate."),
  ];
}
/** Acetyl-CoA delivered to the cycle is the same molecule whatever its source; only the cost or yield upstream of it differs. */
export function acetylCoaSources(shuttle: Shuttle = "malate-aspartate") {
  const perAcetyl = acetylCoaCycleAtp();
  const upstream = (total: number, n: number) => (total - n * perAcetyl) / n;
  return {
    sharedMetabolite: "acetylcoa", cycleAtpPerAcetylCoA: perAcetyl,
    carbohydrate: { upstreamPerAcetylCoA: upstream(glucoseLedger(shuttle).totalAtp, 2), note: "Glycolysis and pyruvate oxidation (substrate-level ATP and NADH) before the acetyl-CoA is formed." },
    acetoacetate: { upstreamPerAcetylCoA: upstream(ketoneOxidationAtp("acetoacetate").total, 2), note: "SCOT bypasses one GTP of succinyl-CoA synthetase for the two acetyl-CoA obtained." },
    bhb: { upstreamPerAcetylCoA: upstream(ketoneOxidationAtp("bhb").total, 2), note: "As acetoacetate, plus the NADH of the dehydrogenase." },
  };
}

// ---- scenarios -----------------------------------------------------------------------------------------------------------------------------

export type PathwayState = "tends-active" | "tends-suppressed" | "not-determined" | "absent";
export type StatementBasis = "stoichiometry" | "curated-regulation" | "tissue-enzyme" | "not-modelled";
export const STATE_LABEL: Record<PathwayState, string> = { "tends-active": "Tends to be active", "tends-suppressed": "Tends to be suppressed", "not-determined": "Not determined by the model", absent: "Not present in this tissue (in the model)" };
export const BASIS_LABEL: Record<StatementBasis, string> = { stoichiometry: "■ Stoichiometry", "curated-regulation": "▲ Curated regulation", "tissue-enzyme": "◆ Curated tissue enzymes", "not-modelled": "✖ Not modelled" };
export interface TissueStates { liver: PathwayState; extrahepatic: PathwayState }
export interface FuelScenario {
  id: string; title: string; summary: string; lipidPreset?: string;
  states: Partial<Record<PathwayId, TissueStates>>;
  statements: Array<{ text: string; basis: StatementBasis }>;
  missing: string[];
}
const S = (liver: PathwayState, extrahepatic: PathwayState): TissueStates => ({ liver, extrahepatic });
const T = "tends-active" as const, X = "tends-suppressed" as const, U = "not-determined" as const, N = "absent" as const;
const fromTendency = (t: Tendency): PathwayState => (t === "higher" ? T : t === "lower" ? X : U);
export const FUEL_SCENARIOS: FuelScenario[] = [
  { id: "baseline", title: "Reference (no scenario)", summary: "Every pathway is shown without a condition; nothing is pushed up or down.", states: {}, statements: [{ text: "Connections on the map are stoichiometric or curated relationships, not predictions of flux.", basis: "not-modelled" }], missing: ["Concentrations, enzyme amounts, hormone levels and time courses."] },
  { id: "fed", title: "Fed-associated carbohydrate and lipid utilization", summary: "After a carbohydrate-rich meal, insulin dominates.", lipidPreset: "fed",
    states: { glycolysis: S(T, T), gluconeogenesis: S(X, U), "pyruvate-oxidation": S(T, T), tca: S(T, T), oxphos: S(T, T), ketogenesis: S(X, N), ketolysis: S(N, X), "urea-cycle": S(U, N), "transamination": S(U, U) },
    statements: [
      { text: "Insulin-dominant, energy-rich conditions favour ACC, so malonyl-CoA tends to be higher; malonyl-CoA inhibits CPT I, so fatty-acid oxidation tends to be lower and synthesis higher.", basis: "curated-regulation" },
      { text: "Glycolytic control points are pushed up and gluconeogenic ones down by fructose 2,6-bisphosphate in liver (Stage 18 curated regulation).", basis: "curated-regulation" },
      { text: "Acetyl-CoA from pyruvate oxidation can leave the matrix as citrate for fatty-acid synthesis; this costs 1 ATP per acetyl-CoA exported.", basis: "stoichiometry" },
    ],
    missing: ["How much glucose is oxidized versus converted to fat, which depends on tissue, meal composition and time.", "Hormone dynamics and enzyme expression changes."] },
  { id: "fasting-fao", title: "Fasting-associated fatty-acid oxidation", summary: "Glucagon dominates and cellular energy signals are low.", lipidPreset: "fasting",
    states: { glycolysis: S(X, U), gluconeogenesis: S(T, U), "pyruvate-oxidation": S(X, U), tca: S(T, T), oxphos: S(T, T), ketogenesis: S(T, N), ketolysis: S(N, T), "urea-cycle": S(U, N) },
    statements: [
      { text: "Glucagon-dominant, low-energy conditions lower ACC and malonyl-CoA, which releases CPT I: oxidation tends to be favoured over synthesis.", basis: "curated-regulation" },
      { text: "Acetyl-CoA from fatty-acid oxidation activates pyruvate carboxylase and inhibits pyruvate dehydrogenase (via its kinase), sparing pyruvate for gluconeogenesis.", basis: "curated-regulation" },
      { text: "Each palmitate gives 8 acetyl-CoA, 7 NADH and 7 FADH₂ by β-oxidation; the ATP arises later in the cycle and respiratory chain.", basis: "stoichiometry" },
    ],
    missing: ["Rate of adipose lipolysis and fatty-acid delivery.", "How much acetyl-CoA enters the cycle versus ketogenesis, which depends on oxaloacetate and redox state."] },
  { id: "ketogenesis", title: "Hepatic ketogenesis", summary: "Hepatic β-oxidation supplies more acetyl-CoA than the cycle takes up (fasting-like conditions).", lipidPreset: "fasting",
    states: { "beta-oxidation": S(T, U), ketogenesis: S(T, N), ketolysis: S(N, T), "fa-synthesis": S(X, U), tca: S(U, U) },
    statements: [
      { text: "Two acetyl-CoA condense (thiolase), a third is added (HMG-CoA synthase) and HMG-CoA lyase releases acetoacetate; β-hydroxybutyrate needs NADH.", basis: "stoichiometry" },
      { text: "Hepatocytes make ketone bodies but have little SCOT, so they cannot oxidize them.", basis: "tissue-enzyme" },
      { text: "More acetyl-CoA does not automatically mean more ketone bodies: the direction here depends on the curated conditions (low insulin, high fatty-acid oxidation).", basis: "curated-regulation" },
    ],
    missing: ["How much ketone body is formed.", "The hepatic oxaloacetate pool and NADH/NAD⁺ ratio that influence the split between the cycle and ketogenesis."] },
  { id: "ketolysis", title: "Peripheral ketone-body utilization", summary: "Ketone bodies in blood are taken up and oxidized outside the liver.", lipidPreset: "fasting",
    states: { ketolysis: S(N, T), ketogenesis: S(T, N), tca: S(U, T), oxphos: S(U, T), "beta-oxidation": S(U, U) },
    statements: [
      { text: "SCOT transfers CoA from succinyl-CoA to acetoacetate; thiolase then gives two acetyl-CoA for the cycle.", basis: "stoichiometry" },
      { text: "The liver lacks SCOT; heart, muscle, kidney and (after adaptation) brain have it. Red blood cells have no mitochondria.", basis: "tissue-enzyme" },
      { text: "Because SCOT bypasses succinyl-CoA synthetase, ketone-derived acetyl-CoA carries a small cost (one GTP per acetoacetate) compared with carbohydrate- or fat-derived acetyl-CoA.", basis: "stoichiometry" },
    ],
    missing: ["Blood ketone concentration and transporter kinetics.", "How much of a tissue's energy is supplied by ketone bodies."] },
  { id: "aa-catabolism", title: "Increased amino-acid catabolism", summary: "More amino acids are degraded (for example after a protein-rich meal or during prolonged fasting).",
    states: { transamination: S(T, T), deamination: S(T, U), "urea-cycle": S(T, N), gluconeogenesis: S(U, U), ketogenesis: S(U, N), tca: S(T, T) },
    statements: [
      { text: "Transamination moves α-amino groups onto glutamate (no free ammonia); glutamate dehydrogenase, glutaminase and some dehydratases release NH₄⁺.", basis: "stoichiometry" },
      { text: "More NH₄⁺ and aspartate nitrogen tends to increase the supply of urea-cycle substrates; arginine stimulates NAGS and so CPS I.", basis: "curated-regulation" },
      { text: "Glucogenic carbon skeletons can give gluconeogenic intermediates; ketogenic ones (leucine, lysine) give acetyl-CoA or acetoacetate.", basis: "tissue-enzyme" },
    ],
    missing: ["The amino-acid mixture, which decides how much carbon enters at each point.", "How much glucose is made, which is not implied by the nominal glucogenic label."] },
  { id: "nitrogen-disposal", title: "Nitrogen disposal through the urea cycle", summary: "Ammonium and aspartate nitrogen become urea in the liver.",
    states: { "urea-cycle": S(T, N), deamination: S(T, U), transamination: S(T, U), tca: S(U, U) },
    statements: [
      { text: "Urea takes one nitrogen from NH₄⁺ (carbamoyl phosphate) and one from aspartate; its carbon comes from CO₂.", basis: "stoichiometry" },
      { text: "The cycle consumes 3 ATP molecules (4 high-energy bonds); it does not produce ATP. Fumarate → aspartate recovers NADH from the carbon skeleton, which is separate accounting.", basis: "stoichiometry" },
      { text: "Mitochondria and cytosol are both needed: CPS I and OTC in the matrix, the rest in the cytosol.", basis: "tissue-enzyme" },
    ],
    missing: ["Ammonia concentrations, urea excretion rates and any effect of enzyme deficiency: none is predicted."] },
];
export const FUEL_SCENARIOS_BY_ID: Record<string, FuelScenario> = Object.fromEntries(FUEL_SCENARIOS.map((s) => [s.id, s]));
/** Scenario states with the fat-metabolism rows derived from the lipid-regulation engine when the scenario names a preset (one engine, not two sets of rules). */
export function scenarioStates(id: string): Partial<Record<PathwayId, TissueStates>> {
  const sc = FUEL_SCENARIOS_BY_ID[id];
  const out = { ...sc.states };
  if (sc.lipidPreset) {
    const c = (LIPID_PRESETS.find((p) => p.id === sc.lipidPreset)!.conditions) as LipidConditions;
    const t = lipidRegulation(c);
    out["fa-synthesis"] = S(fromTendency(t.synthesis), U);
    out["beta-oxidation"] = out["beta-oxidation"] ?? S(fromTendency(t.oxidation), U);
    out["carnitine-shuttle"] = S(fromTendency(t.cpt1), U);
    out["fa-activation"] = out["beta-oxidation"] ?? S(U, U);
  }
  return out;
}
export const stateOf = (id: string, p: PathwayId, tissue: TissueId): PathwayState => scenarioStates(id)[p]?.[tissue] ?? "not-determined";
export function amountOfAminoAcidsByClass() { const o = { glucogenic: 0, ketogenic: 0, both: 0 }; for (const a of AMINO_CATABOLISM) o[classifyAminoAcid(a.one)] += 1; return o; }

