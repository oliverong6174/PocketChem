/**
 * Stage 25 amino-acid catabolism, nitrogen handling and urea-cycle engine (pure; no React).
 *
 * Three kinds of statement are kept apart, and the interface labels them:
 *  - stoichiometry: reactions defined once in the shared network (network.ts) and summed here (transamination, GDH, urea cycle, glutamine);
 *  - curated relationship: where an amino acid's carbon skeleton or nitrogen ends up, written from textbook summaries (Lehninger Principles of
 *    Biochemistry, ch. 18; Berg/Tymoczko/Stryer ch. 23). No intermediate enzymes are invented between the amino acid and its endpoint;
 *  - atom tracing: which nitrogen atom comes from where in the urea cycle, which stoichiometry alone cannot show.
 * Nothing here is a flux, concentration, clinical value or patient prediction.
 */
import { AMINO_ACIDS_BY_ONE, AMINO_ACID_LIST, parseFormula as parseAaFormula } from "../aminoAcids";
import { REACTIONS_BY_ID, aaId, metaboliteOf, parseFormula, type Metabolite, type Reaction, type Tendency } from "./network";
import { atpPerNadh, reactionNet, type Net } from "./ledger";
import { bondChange } from "./lipids";

const add = (a: Net, b: Net, times = 1): Net => { const o: Net = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v * times; return o; };
const tidy = (n: Net): Net => { const o: Net = {}; for (const [k, v] of Object.entries(n)) { const r = Math.round(v * 1e6) / 1e6; if (r !== 0) o[k] = r; } return o; };

// ---- amino-acid catabolism map (curated relationships) -------------------------------------------------------------------------------

export type EndpointId = "pyruvate" | "acetylcoa" | "acetoacetate" | "akg" | "succoa" | "fumarate" | "oaa";
export const ENDPOINTS: Record<EndpointId, { label: string; glucogenic: boolean; note: string }> = {
  pyruvate: { label: "Pyruvate", glucogenic: true, note: "Can be carboxylated to oxaloacetate and used for gluconeogenesis, or oxidized to acetyl-CoA (not back to glucose through acetyl-CoA)." },
  akg: { label: "α-Ketoglutarate", glucogenic: true, note: "A citric acid cycle intermediate; its carbons can leave as malate/oxaloacetate and support gluconeogenesis." },
  succoa: { label: "Succinyl-CoA", glucogenic: true, note: "A citric acid cycle intermediate (anaplerotic entry)." },
  fumarate: { label: "Fumarate", glucogenic: true, note: "A citric acid cycle intermediate; also released by the urea cycle." },
  oaa: { label: "Oxaloacetate", glucogenic: true, note: "A citric acid cycle intermediate and a gluconeogenic precursor." },
  acetylcoa: { label: "Acetyl-CoA", glucogenic: false, note: "In animals acetyl-CoA cannot give a net synthesis of glucose (pyruvate dehydrogenase is irreversible and both its carbons are lost in the cycle). It is oxidized or used to make ketone bodies and lipids." },
  acetoacetate: { label: "Acetoacetate / acetoacetyl-CoA", glucogenic: false, note: "A ketone body or its CoA ester; converted to acetyl-CoA." },
};
export const KETOGENIC_ENDPOINTS: EndpointId[] = ["acetylcoa", "acetoacetate"];

export type NitrogenKind = "transamination" | "direct-ammonium" | "amide-hydrolysis" | "urea-direct" | "via-glutamate" | "glutamate" | "not-traced";
export interface AminoCatabolism {
  one: string;
  endpoints: EndpointId[];
  nitrogen: { kind: NitrogenKind; text: string; destinations: Array<"glutamate" | "ammonium" | "aspartate" | "urea"> };
  /** Where the carbon-skeleton steps happen, or a caveat; stated at the level the sources support. */
  skeleton: string;
  /** Network reaction ids that implement part of this amino acid's route (others are curated only). */
  reactions: string[];
  tissueNote?: string;
}
const A = (one: string, endpoints: EndpointId[], kind: NitrogenKind, nText: string, dest: AminoCatabolism["nitrogen"]["destinations"], skeleton: string, reactions: string[] = [], tissueNote?: string): AminoCatabolism =>
  ({ one, endpoints, nitrogen: { kind, text: nText, destinations: dest }, skeleton, reactions, tissueNote });

export const AMINO_CATABOLISM: AminoCatabolism[] = [
  A("A", ["pyruvate"], "transamination", "Alanine aminotransferase (PLP) moves the α-amino group to α-ketoglutarate, giving glutamate.", ["glutamate"], "Transamination directly gives pyruvate.", ["ALT"], "Muscle exports alanine to the liver (glucose–alanine cycle)."),
  A("R", ["akg"], "urea-direct", "Arginase releases urea (both guanidino nitrogens) and ornithine; ornithine's nitrogens continue toward glutamate.", ["urea", "glutamate"], "Arginine → ornithine → glutamate semialdehyde → glutamate → α-ketoglutarate (curated; intermediate enzymes not modelled).", ["ARG1"]),
  A("N", ["oaa"], "amide-hydrolysis", "Asparaginase releases the amide nitrogen as NH₄⁺ and gives aspartate, which is then transaminated.", ["ammonium", "aspartate"], "Asparagine → aspartate → oxaloacetate (by aspartate aminotransferase).", ["AST"]),
  A("D", ["oaa"], "transamination", "Aspartate aminotransferase gives oxaloacetate and glutamate. Aspartate also donates its nitrogen directly to argininosuccinate synthetase in the urea cycle.", ["glutamate", "urea"], "Transamination directly gives oxaloacetate.", ["AST", "ASS"]),
  A("C", ["pyruvate"], "transamination", "The α-amino group is transferred to α-ketoglutarate (curated); the sulfur is handled separately (not modelled).", ["glutamate"], "Cysteine → (several steps) → pyruvate.", []),
  A("E", ["akg"], "glutamate", "Glutamate is the collection point: glutamate dehydrogenase releases its nitrogen as NH₄⁺, giving α-ketoglutarate.", ["ammonium"], "Oxidative deamination gives α-ketoglutarate.", ["GDH"]),
  A("Q", ["akg"], "amide-hydrolysis", "Glutaminase releases the amide nitrogen as NH₄⁺ and gives glutamate.", ["ammonium", "glutamate"], "Glutamine → glutamate → α-ketoglutarate.", ["GLS", "GDH"], "Glutamine is the main non-toxic nitrogen carrier in blood."),
  A("G", ["pyruvate"], "direct-ammonium", "The glycine cleavage system releases NH₄⁺ and CO₂ and transfers a one-carbon unit to tetrahydrofolate.", ["ammonium"], "Glycine → (via serine) → pyruvate; the cleavage system is the main route in liver (curated).", []),
  A("H", ["akg"], "direct-ammonium", "Histidine ammonia-lyase releases the α-amino nitrogen as NH₄⁺; the ring nitrogens are carried to glutamate and one-carbon pools (curated, not traced).", ["ammonium", "glutamate"], "Histidine → urocanate → → glutamate → α-ketoglutarate.", [], "Liver and skin."),
  A("I", ["succoa", "acetylcoa"], "transamination", "A branched-chain aminotransferase (PLP) moves the α-amino group to α-ketoglutarate.", ["glutamate"], "After transamination and oxidative decarboxylation the skeleton gives acetyl-CoA and propionyl-CoA, which leads to succinyl-CoA (both routes).", [], "The branched-chain transamination step is mainly extrahepatic (muscle)."),
  A("L", ["acetylcoa", "acetoacetate"], "transamination", "A branched-chain aminotransferase moves the α-amino group to α-ketoglutarate.", ["glutamate"], "The skeleton gives acetoacetate and acetyl-CoA (through HMG-CoA); leucine is exclusively ketogenic in the standard classification.", [], "The branched-chain transamination step is mainly extrahepatic (muscle)."),
  A("K", ["acetylcoa", "acetoacetate"], "via-glutamate", "Lysine does not use the usual transaminase route: the saccharopine pathway moves its nitrogen onto glutamate.", ["glutamate"], "The skeleton gives acetoacetyl-CoA and then acetyl-CoA; lysine is exclusively ketogenic in the standard classification.", []),
  A("M", ["succoa"], "not-traced", "Methionine is converted via S-adenosylmethionine and homocysteine; where its nitrogen ends up is not traced in this model.", [], "Methionine → … → propionyl-CoA → succinyl-CoA (curated).", []),
  A("F", ["fumarate", "acetoacetate"], "via-glutamate", "Phenylalanine is hydroxylated to tyrosine (phenylalanine hydroxylase), which is transaminated.", ["glutamate"], "Phenylalanine → tyrosine → fumarate + acetoacetate.", [], "Liver."),
  A("P", ["akg"], "via-glutamate", "Proline is oxidized to glutamate-γ-semialdehyde and then glutamate; its nitrogen ends up in glutamate.", ["glutamate"], "Proline → glutamate → α-ketoglutarate.", []),
  A("S", ["pyruvate"], "direct-ammonium", "Serine dehydratase (PLP) removes water and ammonia in one step, giving pyruvate and NH₄⁺.", ["ammonium"], "Serine → pyruvate directly.", []),
  A("T", ["pyruvate", "succoa", "acetylcoa"], "direct-ammonium", "In one route threonine dehydratase releases NH₄⁺ and gives α-ketobutyrate, which becomes propionyl-CoA and succinyl-CoA; other routes give glycine and acetyl-CoA.", ["ammonium"], "Several routes (species and tissue dependent): pyruvate via glycine/serine, succinyl-CoA via propionyl-CoA, acetyl-CoA.", []),
  A("W", ["pyruvate", "acetylcoa", "acetoacetate"], "not-traced", "Tryptophan is degraded through the kynurenine pathway; the nitrogen's fate is not traced in this model.", [], "Tryptophan → … → alanine (pyruvate) and acetoacetyl-CoA / acetyl-CoA (curated).", []),
  A("Y", ["fumarate", "acetoacetate"], "transamination", "Tyrosine aminotransferase (PLP) moves the α-amino group to α-ketoglutarate.", ["glutamate"], "Tyrosine → 4-hydroxyphenylpyruvate → … → fumarate + acetoacetate.", []),
  A("V", ["succoa"], "transamination", "A branched-chain aminotransferase moves the α-amino group to α-ketoglutarate.", ["glutamate"], "After transamination and oxidative decarboxylation the skeleton gives propionyl-CoA and then succinyl-CoA.", [], "The branched-chain transamination step is mainly extrahepatic (muscle)."),
];
export const AMINO_CATABOLISM_BY_ONE: Record<string, AminoCatabolism> = Object.fromEntries(AMINO_CATABOLISM.map((a) => [a.one, a]));

export type AaClassification = "glucogenic" | "ketogenic" | "both";
export function classifyAminoAcid(one: string): AaClassification {
  const e = AMINO_CATABOLISM_BY_ONE[one].endpoints;
  const gluco = e.some((x) => ENDPOINTS[x].glucogenic), keto = e.some((x) => KETOGENIC_ENDPOINTS.includes(x));
  return gluco && keto ? "both" : keto ? "ketogenic" : "glucogenic";
}
export const CLASSIFICATION_CAVEAT = "Glucogenic is a nominal label: the carbon skeleton can give a gluconeogenic intermediate, which does not mean net glucose is made in every condition (that depends on gluconeogenesis being active, oxaloacetate supply, and the fate of the other products). Ketogenic means the skeleton gives acetyl-CoA or acetoacetate, which cannot give a net synthesis of glucose in animals.";
export const catabolismFor = (one: string): AminoCatabolism | null => AMINO_CATABOLISM_BY_ONE[one] ?? null;
export interface AminoGroupRoles { one: string; aminoGroup: string; carbonSkeleton: string; functionalGroups: string[] }
/** Structural roles for the selected amino acid, from the Stage 17 table (backbone amino group, carbon skeleton, side-chain groups). */
export function aminoAcidRoles(one: string): AminoGroupRoles | null {
  const a = AMINO_ACIDS_BY_ONE[one];
  if (!a) return null;
  const groups = ["α-amino group (the nitrogen that is moved or released)", "α-carboxyl group"];
  for (const g of a.groups) if (g.id === "side-chain") groups.push(`side-chain ${g.label.replace(/^side-chain /, "")}`);
  if (one === "N" || one === "Q") groups.push("side-chain amide (a second nitrogen released by hydrolysis)");
  if (a.three === "Ser" || a.three === "Thr") groups.push("side-chain hydroxyl");
  if (a.aromatic) groups.push("aromatic ring");
  if (one === "M") groups.push("thioether sulfur");
  return { one, aminoGroup: "R–CH(NH₂)–COOH: the α-amino group on the α-carbon", carbonSkeleton: `${a.formula.match(/C(\d+)/)?.[1] ?? "?"} carbons including the carboxyl carbon; the carbon skeleton is what is left after the nitrogen is removed`, functionalGroups: groups };
}

// ---- transamination ------------------------------------------------------------------------------------------------------------------

export interface KetoAcid { id: string; name: string; formula: string; smiles: string }
/** α-Keto acids that correspond to selectable substrates. Pyruvate and oxaloacetate are the shared network metabolites; the others are generated here. */
export const TRANSAMINATION_SUBSTRATES: Array<{ one: string; enzyme: string; keto: KetoAcid; reactionId: string }> = [
  { one: "A", enzyme: "alt", reactionId: "ALT", keto: { id: "pyruvate", name: "Pyruvate", formula: "C3H4O3", smiles: "CC(=O)C(=O)O" } },
  { one: "D", enzyme: "ast", reactionId: "AST", keto: { id: "oaa", name: "Oxaloacetate", formula: "C4H4O5", smiles: "O=C(O)CC(=O)C(=O)O" } },
  { one: "L", enzyme: "bcat", reactionId: "TA:L", keto: { id: "kic", name: "α-Ketoisocaproate", formula: "C6H10O3", smiles: "CC(C)CC(=O)C(=O)O" } },
  { one: "V", enzyme: "bcat", reactionId: "TA:V", keto: { id: "kiv", name: "α-Ketoisovalerate", formula: "C5H8O3", smiles: "CC(C)C(=O)C(=O)O" } },
  { one: "I", enzyme: "bcat", reactionId: "TA:I", keto: { id: "kmv", name: "α-Keto-β-methylvalerate", formula: "C6H10O3", smiles: "CCC(C)C(=O)C(=O)O" } },
  { one: "Y", enzyme: "tat", reactionId: "TA:Y", keto: { id: "hpp", name: "4-Hydroxyphenylpyruvate", formula: "C9H8O4", smiles: "OC(=O)C(=O)Cc1ccc(O)cc1" } },
];
export const TRANSAMINATION_ONES = TRANSAMINATION_SUBSTRATES.map((t) => t.one);
export interface TransaminationModel {
  one: string; aminoAcid: string; ketoAcid: KetoAcid; enzymeName: string;
  /** Net of AA + α-ketoglutarate → keto acid + glutamate. */
  net: Net; ammoniumReleased: number; reaction: Reaction | null;
  balanced: boolean;
}
const ENZYME_NAMES: Record<string, string> = { alt: "Alanine aminotransferase (ALT)", ast: "Aspartate aminotransferase (AST)", bcat: "Branched-chain aminotransferase (BCAT)", tat: "Tyrosine aminotransferase (TAT)" };
/** Formula balance of a generated transamination: amino acid + α-KG = keto acid + glutamate, checked with the Stage 17 amino-acid formulas. */
export function transamination(one: string): TransaminationModel | null {
  const s = TRANSAMINATION_SUBSTRATES.find((t) => t.one === one);
  const aa = AMINO_ACIDS_BY_ONE[one];
  if (!s || !aa) return null;
  const reg = REACTIONS_BY_ID[s.reactionId] ?? null;
  const left = [parseAaFormula(aa.formula), parseAaFormula("C5H6O5")], right = [parseAaFormula(s.keto.formula), parseAaFormula(AMINO_ACIDS_BY_ONE.E.formula)];
  const sum = (fs: Array<Record<string, number>>) => { const o: Record<string, number> = {}; for (const f of fs) for (const [k, v] of Object.entries(f)) o[k] = (o[k] ?? 0) + v; return o; };
  const l = sum(left), r = sum(right);
  const balanced = [...new Set([...Object.keys(l), ...Object.keys(r)])].every((k) => (l[k] ?? 0) === (r[k] ?? 0));
  const net: Net = reg ? reactionNet(reg) : { [aaId(one)]: -1, akg: -1, [s.keto.id]: 1, [aaId("E")]: 1 };
  return { one, aminoAcid: aa.name, ketoAcid: s.keto, enzymeName: ENZYME_NAMES[s.enzyme], net: tidy(net), ammoniumReleased: net.nh4 ?? 0, reaction: reg, balanced };
}
export const plpCoenzyme = { name: "Pyridoxal 5′-phosphate (PLP)", vitamin: "Vitamin B₆ (pyridoxine / pyridoxal / pyridoxamine)" };
export interface PlpStage { id: string; title: string; text: string; aminoGroupOn: "amino acid" | "enzyme-bound PLP/PMP" | "glutamate"; plpForm: string; freeAmmonia: false }
/** The ping-pong mechanism of an aminotransferase, one stage at a time; the amino group never becomes free ammonia. */
export function plpMechanism(substrate: string, ketoName: string): PlpStage[] {
  return [
    { id: "internal", title: "Enzyme with PLP bound", text: "PLP is attached to an active-site lysine as an internal aldimine (a Schiff base).", aminoGroupOn: "amino acid", plpForm: "PLP–Lys aldimine", freeAmmonia: false },
    { id: "external", title: `${substrate} binds: external aldimine`, text: `The α-amino group of ${substrate} displaces the lysine (transaldimination), forming an external aldimine with PLP.`, aminoGroupOn: "amino acid", plpForm: "PLP–amino acid aldimine", freeAmmonia: false },
    { id: "quinonoid", title: "α-Proton removed: quinonoid intermediate", text: "The α-hydrogen is removed; PLP's pyridinium ring acts as an electron sink and stabilizes the carbanion.", aminoGroupOn: "amino acid", plpForm: "Quinonoid intermediate", freeAmmonia: false },
    { id: "ketimine", title: "Reprotonation at the aldehyde carbon: ketimine", text: "Protonation on the PLP carbon moves the double bond to the substrate carbon, giving a ketimine.", aminoGroupOn: "enzyme-bound PLP/PMP", plpForm: "PLP–ketimine", freeAmmonia: false },
    { id: "hydrolysis", title: `Hydrolysis releases ${ketoName}`, text: `Water hydrolyzes the ketimine: the α-keto acid (${ketoName}) leaves, and the amino group is now on the cofactor as pyridoxamine phosphate (PMP).`, aminoGroupOn: "enzyme-bound PLP/PMP", plpForm: "PMP (pyridoxamine phosphate)", freeAmmonia: false },
    { id: "akg", title: "α-Ketoglutarate binds", text: "The second substrate, α-ketoglutarate, forms a ketimine with PMP: the reaction now runs backward through the same intermediates.", aminoGroupOn: "enzyme-bound PLP/PMP", plpForm: "PMP–α-ketoglutarate ketimine", freeAmmonia: false },
    { id: "glu", title: "Glutamate formed: external aldimine", text: "Reprotonation and tautomerization give the external aldimine of glutamate with PLP.", aminoGroupOn: "glutamate", plpForm: "PLP–glutamate aldimine", freeAmmonia: false },
    { id: "release", title: "Glutamate released; PLP regenerated", text: "Lysine displaces glutamate, restoring the internal aldimine. Net: the amino group moved from one α-carbon to another; no free ammonia appeared.", aminoGroupOn: "glutamate", plpForm: "PLP–Lys aldimine", freeAmmonia: false },
  ];
}

// ---- oxidative deamination ----------------------------------------------------------------------------------------------------------------

export type GdhCofactor = "nad" | "nadp";
export type GdhDirection = "deamination" | "amination";
export interface GdhModel { cofactor: GdhCofactor; direction: GdhDirection; reactionId: string; net: Net; ammonium: number; reducedCarrier: number; compartment: string; text: string }
export function glutamateDehydrogenase(cofactor: GdhCofactor = "nad", direction: GdhDirection = "deamination"): GdhModel {
  const id = cofactor === "nad" ? "GDH" : "GDH-NADP";
  const r = REACTIONS_BY_ID[id];
  const net = reactionNet(r, direction === "deamination" ? "forward" : "reverse");
  const carrier = cofactor === "nad" ? "nadh" : "nadph";
  return {
    cofactor, direction, reactionId: id, net: tidy(net), ammonium: net.nh4 ?? 0, reducedCarrier: net[carrier] ?? 0, compartment: "matrix",
    text: direction === "deamination"
      ? "Oxidative deamination: glutamate is oxidized, NAD(P)⁺ is reduced and NH₄⁺ is released (liver mitochondria)."
      : "Reductive amination: α-ketoglutarate takes up NH₄⁺ using NAD(P)H (favoured when ammonium is high; NADPH is the usual reductant in this direction).",
  };
}
/** Transdeamination: transamination to glutamate followed by oxidative deamination; the only step that releases NH₄⁺ is GDH. */
export function transdeamination(one: string): { net: Net; text: string } | null {
  const t = transamination(one);
  if (!t) return null;
  const g = reactionNet(REACTIONS_BY_ID.GDH);
  return { net: tidy(add(t.net, g)), text: `${t.aminoAcid} + NAD⁺ + H₂O → ${t.ketoAcid.name} + NH₄⁺ + NADH: transamination (no ammonium) followed by deamination of the glutamate it made (α-ketoglutarate is regenerated, so it is a catalyst here).` };
}

// ---- nitrogen handling between tissues (bounded, curated examples) -------------------------------------------------------------------------

export interface NitrogenExample { id: string; title: string; tissues: string; carrier: string; route: string[]; reactions: string[]; caveat: string }
export const NITROGEN_EXAMPLES: NitrogenExample[] = [
  { id: "glucose-alanine", title: "Glucose–alanine cycle", tissues: "Skeletal muscle → liver", carrier: "Alanine", route: ["Muscle: amino groups → glutamate → alanine (ALT) with pyruvate from glycolysis", "Blood: alanine", "Liver: ALT regenerates pyruvate and glutamate; pyruvate → glucose; nitrogen → urea cycle"], reactions: ["ALT", "GDH"], caveat: "One of several carriers; its quantitative importance depends on physiological state." },
  { id: "glutamine-transport", title: "Glutamine as a non-toxic nitrogen carrier", tissues: "Many tissues → kidney, intestine, liver", carrier: "Glutamine", route: ["Tissue: glutamate + NH₄⁺ + ATP → glutamine (glutamine synthetase)", "Blood: glutamine", "Kidney, gut or liver: glutaminase releases NH₄⁺"], reactions: ["GS", "GLS"], caveat: "Where the released ammonium goes (urine, urea, portal blood) depends on the tissue and acid–base state, which are not modelled." },
  { id: "liver-urea", title: "Liver nitrogen disposal", tissues: "Hepatocyte mitochondria and cytosol", carrier: "NH₄⁺ and aspartate", route: ["Glutamate → NH₄⁺ (GDH, matrix)", "NH₄⁺ + CO₂ + 2 ATP → carbamoyl phosphate (CPS I)", "Aspartate (from OAA + glutamate, AST) joins citrulline (ASS)", "Urea leaves in blood"], reactions: ["GDH", "CPS1", "AST", "ASS"], caveat: "Periportal and perivenous hepatocytes differ (periportal cells make urea; perivenous cells make glutamine); this is not shown." },
  { id: "brain-ammonium", title: "Ammonium trapping in the brain", tissues: "Astrocytes", carrier: "Glutamine", route: ["Astrocytes: glutamate + NH₄⁺ + ATP → glutamine (glutamine synthetase)"], reactions: ["GS"], caveat: "Stated as an example of tissue-specific nitrogen handling; no clinical effect is predicted." },
];
export const NITROGEN_CARRIERS: Array<{ id: string; label: string; role: string }> = [
  { id: "glutamate", label: "Glutamate", role: "Collects α-amino groups from most amino acids by transamination; the substrate of GDH." },
  { id: "glutamine", label: "Glutamine", role: "Carries two nitrogens (α-amino and amide) in blood without being toxic like free ammonium." },
  { id: "alanine", label: "Alanine", role: "Carries amino groups from muscle to liver together with the carbon of pyruvate." },
  { id: "aspartate", label: "Aspartate", role: "Donates the second nitrogen of urea; made by transamination of oxaloacetate." },
  { id: "ammonium", label: "Ammonium", role: "Free NH₄⁺: released by GDH, glutaminase and some dehydratases; toxic at high concentration, so it is kept low." },
];

// ---- urea cycle -----------------------------------------------------------------------------------------------------------------------------

export const UREA_CORE = ["CPS1", "OTC", "CIT-EXPORT", "ASS", "PPASE", "ASL", "ARG1", "ORN-IMPORT"] as const;
export const UREA_CONNECTION = ["FUM-C", "MDH-C", "AST"] as const;
export interface UreaStep { index: number; reactionId: string; compartment: string; transport: boolean; title: string }
export function ureaSteps(): UreaStep[] {
  return UREA_CORE.map((id, i) => { const r = REACTIONS_BY_ID[id]; return { index: i + 1, reactionId: id, compartment: r.compartment === "inner-membrane" ? "inner-membrane" : r.compartment, transport: !!r.tags?.includes("transport"), title: r.name }; });
}
export function ureaNet(upTo: number = UREA_CORE.length): Net {
  let net: Net = {};
  for (const id of UREA_CORE.slice(0, upTo)) net = add(net, reactionNet(REACTIONS_BY_ID[id]));
  return tidy(net);
}
export interface UreaEnergy {
  atpMolecules: number; amp: number; adp: number; highEnergyBonds: number;
  perStep: Array<{ reactionId: string; atp: number; bonds: number }>;
  explanation: string;
}
export function ureaEnergy(): UreaEnergy {
  const net = ureaNet();
  const perStep = UREA_CORE.map((id) => { const n = reactionNet(REACTIONS_BY_ID[id]); return { reactionId: id, atp: n.atp ?? 0, bonds: bondChange(n) }; }).filter((s) => s.atp !== 0 || s.bonds !== 0);
  return {
    atpMolecules: -(net.atp ?? 0), amp: net.amp ?? 0, adp: net.adp ?? 0, highEnergyBonds: -bondChange(net), perStep,
    explanation: "Three ATP molecules are consumed (two by carbamoyl phosphate synthetase I, one by argininosuccinate synthetase), but the synthetase's ATP becomes AMP + PPi and pyrophosphatase hydrolyzes the PPi, so that one ATP molecule uses two high-energy bonds. Bonds spent: 2 (CPS I: two ATP → two ADP) + 1 (ATP → AMP + PPi) + 1 (PPi → 2 Pi) = 4, from 3 ATP molecules.",
  };
}
/** The connected fumarate → aspartate route: an optional recovery of reducing equivalents, kept separate from the urea-cycle ATP accounting. */
export function fumarateConnection() {
  let net: Net = {};
  for (const id of ["FUM-C", "MDH-C"]) net = add(net, reactionNet(REACTIONS_BY_ID[id]));
  net = add(net, reactionNet(REACTIONS_BY_ID.AST, "reverse"));
  net = tidy(net);
  const nadh = net.nadh ?? 0;
  const bonds = ureaEnergy().highEnergyBonds;
  return { net, nadh, atpEstimate: nadh * atpPerNadh(), estimatedNetBondEquivalents: bonds - nadh * atpPerNadh(),
    note: "The NADH comes from oxidizing the carbon skeleton (fumarate → malate → oxaloacetate), not from disposing of nitrogen. The estimate assumes the NADH is fully oxidized at about 2.5 ATP per NADH and ignores shuttle costs; it is shown separately and is not subtracted from the urea cycle's own ATP accounting." };
}

export interface NitrogenAtom { id: string; source: "NH₄⁺ (carbamoyl phosphate)" | "Aspartate" | "Ornithine (α)" | "Ornithine (δ)" }
export interface UreaSpecies { metabolite: string; nitrogens: NitrogenAtom[]; carbonSource?: string }
const N_AMMONIUM: NitrogenAtom = { id: "N-NH4", source: "NH₄⁺ (carbamoyl phosphate)" }, N_ASP: NitrogenAtom = { id: "N-Asp", source: "Aspartate" };
const N_ORN_A: NitrogenAtom = { id: "N-orn-alpha", source: "Ornithine (α)" }, N_ORN_D: NitrogenAtom = { id: "N-orn-delta", source: "Ornithine (δ)" };
/** Atom tracing (from the accepted mechanism, not derivable from stoichiometry): which species carries which nitrogen after each step. */
export function ureaTrace(step: number): UreaSpecies[] {
  const out: UreaSpecies[] = [];
  const s = Math.max(0, Math.min(step, UREA_CORE.length));
  if (s < 1) out.push({ metabolite: "nh4", nitrogens: [N_AMMONIUM] });
  if (s < 4) out.push({ metabolite: aaId("D"), nitrogens: [N_ASP] });
  if (s >= 1 && s < 2) out.push({ metabolite: "cp", nitrogens: [N_AMMONIUM], carbonSource: "CO₂ (bicarbonate pool)" });
  if (s < 2 || s >= 7) out.push({ metabolite: "ornithine", nitrogens: [N_ORN_A, N_ORN_D] });
  if (s >= 2 && s < 4) out.push({ metabolite: "citrulline", nitrogens: [N_ORN_A, N_ORN_D, N_AMMONIUM], carbonSource: "CO₂ (ureido carbon)" });
  if (s >= 4 && s < 6) out.push({ metabolite: "argsucc", nitrogens: [N_ORN_A, N_ORN_D, N_AMMONIUM, N_ASP], carbonSource: "CO₂ (guanidino carbon)" });
  if (s >= 6 && s < 7) out.push({ metabolite: aaId("R"), nitrogens: [N_ORN_A, N_ORN_D, N_AMMONIUM, N_ASP], carbonSource: "CO₂ (guanidino carbon)" });
  if (s >= 6) out.push({ metabolite: "fumarate", nitrogens: [] });
  if (s >= 7) out.push({ metabolite: "urea", nitrogens: [N_AMMONIUM, N_ASP], carbonSource: "CO₂ (via carbamoyl phosphate)" });
  return out;
}
/** Nitrogen atoms in a species according to its formula (used to check the tracing against stoichiometry). */
export const nitrogenInFormula = (m: Metabolite): number => parseFormula(m.formula ?? "")?.N ?? 0;
export function ureaTraceConsistent(step: number): boolean {
  return ureaTrace(step).every((sp) => { const m = metaboliteOf(sp.metabolite); return !!m && nitrogenInFormula(m) === sp.nitrogens.length; });
}
export const UREA_NITROGEN_SOURCES = { ammonium: "Free NH₄⁺, incorporated by carbamoyl phosphate synthetase I (one nitrogen of urea)", aspartate: "Aspartate, incorporated by argininosuccinate synthetase (the other nitrogen of urea)", carbon: "The urea carbon comes from CO₂ (the bicarbonate pool) through carbamoyl phosphate; the carbon skeleton of aspartate leaves as fumarate." };

export interface UreaRegulation { nagPresent: boolean; arginine: "normal" | "high" }
export interface UreaRegulationResult { nags: Tendency; nag: Tendency; cps1: Tendency; summary: string }
/** Qualitative: N-acetylglutamate activates CPS I (essentially required); arginine stimulates NAGS. No activity value is computed. */
export function ureaRegulation(r: UreaRegulation): UreaRegulationResult {
  const nags: Tendency = r.arginine === "high" ? "higher" : "reference";
  const nag: Tendency = !r.nagPresent ? "lower" : r.arginine === "high" ? "higher" : "reference";
  const cps1: Tendency = !r.nagPresent ? "lower" : r.arginine === "high" ? "higher" : "reference";
  return { nags, nag, cps1, summary: !r.nagPresent ? "Without N-acetylglutamate, CPS I is essentially inactive: the cycle cannot start, whatever the ammonium level." : r.arginine === "high" ? "Arginine stimulates NAGS, raising N-acetylglutamate and so CPS I: more amino-acid nitrogen increases the capacity to dispose of it." : "With N-acetylglutamate present, CPS I is active (reference state)." };
}
export const UREA_CAVEATS = [
  "This is a qualitative teaching model. It does not predict ammonia concentrations, the severity of any urea-cycle disorder, or any patient outcome.",
  "Only one allosteric control (N-acetylglutamate) and its stimulation by arginine are represented; substrate availability, enzyme amounts and transport are not.",
  "Atom tracing follows the accepted mechanism and is consistent with the stoichiometry, but the stoichiometry alone cannot distinguish the two urea nitrogens.",
];
export const AMMONIUM_UREA_LINK = "Amino-acid catabolism produces NH₄⁺ (mainly glutamate dehydrogenase, glutaminase and some dehydratases) and moves other amino groups onto glutamate and aspartate; the urea cycle takes NH₄⁺ and aspartate nitrogen. More amino-acid catabolism therefore tends to increase the supply of urea-cycle substrates, which the model states as a direction only.";
export const carbonSkeletonSummary = (): Record<AaClassification, string[]> => {
  const out: Record<AaClassification, string[]> = { glucogenic: [], ketogenic: [], both: [] };
  for (const a of AMINO_ACID_LIST) out[classifyAminoAcid(a.one)].push(a.one);
  return out;
};
