/**
 * Stage 19: provenance of the metabolic models' reference claims.
 *
 * Stage 18 wrote these models from recalled textbook knowledge. This file records, claim by claim, what has actually been checked
 * against an openly retrievable source and what has not. A claim is "source-checked" only if the cited page's text was read and
 * states it; "partly-checked" if the source states part of it; "unverified" if no source could be opened that states it. Nothing
 * here is a quotation: statements are paraphrases, and no page numbers are given because the sources are web pages.
 *
 * Sources that could NOT be retrieved: Berg, Tymoczko and Stryer "Biochemistry" on NCBI Bookshelf answered automated requests with
 * a reCAPTCHA page, and Lehninger / Nelson and Cox are not openly retrievable, so nothing is attributed to them as checked.
 */
import { atpPerFadh2, atpPerNadh, carriersOf, glycolysisAtpBreakdown, pathwayNet } from "./ledger";

export type ProvenanceStatus = "source-checked" | "partly-checked" | "unverified";

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** Date the page was opened (ISO). */
  accessed: string;
}

export const STATUS_LABEL: Record<ProvenanceStatus, string> = {
  "source-checked": "Checked against a source",
  "partly-checked": "Partly checked",
  unverified: "Not independently checked",
};

const ACCESSED = "2026-11-15";
export const SOURCES: Source[] = [
  { id: "openstax-7-2", title: "7.2 Glycolysis (Biology 2e)", publisher: "OpenStax", url: "https://openstax.org/books/biology-2e/pages/7-2-glycolysis", accessed: ACCESSED },
  { id: "openstax-7-3", title: "7.3 Oxidation of Pyruvate and the Citric Acid Cycle (Biology 2e)", publisher: "OpenStax", url: "https://openstax.org/books/biology-2e/pages/7-3-oxidation-of-pyruvate-and-the-citric-acid-cycle", accessed: ACCESSED },
  { id: "openstax-7-4", title: "7.4 Oxidative Phosphorylation (Biology 2e)", publisher: "OpenStax", url: "https://openstax.org/books/biology-2e/pages/7-4-oxidative-phosphorylation", accessed: ACCESSED },
];

export type ProvenanceTopic = "glycolysis" | "gluconeogenesis" | "pyruvate-oxidation" | "tca" | "etc" | "regulation";

export interface ModelCheck {
  /** What the model computes. */
  label: string;
  /** The value the cited source states (or that follows arithmetically from what it states). */
  sourceValue: number;
  /** Evaluates the model. */
  model: () => number;
}

export interface Claim {
  id: string;
  topic: ProvenanceTopic;
  statement: string;
  status: ProvenanceStatus;
  sourceIds: string[];
  /** Numeric agreement between the model and the source, run by the tests. */
  check?: ModelCheck;
  /** What remains unchecked or differs from the source. */
  caveat?: string;
}

const perGlucose = (pathway: Parameters<typeof pathwayNet>[0]) => carriersOf(pathwayNet(pathway));

export const CLAIMS: Claim[] = [
  { id: "glyc-net-atp", topic: "glycolysis", statement: "Glycolysis makes 4 ATP and uses 2, a net gain of 2 ATP per glucose.", status: "source-checked", sourceIds: ["openstax-7-2"], check: { label: "net ATP per glucose", sourceValue: 2, model: () => glycolysisAtpBreakdown().net } },
  { id: "glyc-gross-atp", topic: "glycolysis", statement: "Four ATP are formed in the second half and two are invested in the first.", status: "source-checked", sourceIds: ["openstax-7-2"], check: { label: "ATP formed", sourceValue: 4, model: () => glycolysisAtpBreakdown().produced } },
  { id: "glyc-nadh", topic: "glycolysis", statement: "Glycolysis yields 2 NADH per glucose and 2 pyruvate.", status: "source-checked", sourceIds: ["openstax-7-2"], check: { label: "NADH per glucose", sourceValue: 2, model: () => perGlucose("glycolysis").nadh } },
  { id: "glyc-location", topic: "glycolysis", statement: "Glycolysis occurs in the cytoplasm, and phosphofructokinase (step 3) is a rate-limiting enzyme that responds to ADP.", status: "partly-checked", sourceIds: ["openstax-7-2"], caveat: "The retrieved text states ADP activation; the ATP, AMP and fructose-2,6-bisphosphate effects in the model's regulation table were not found in it." },
  { id: "pdh-products", topic: "pyruvate-oxidation", statement: "Pyruvate oxidation releases CO₂, reduces NAD⁺ to NADH and forms acetyl-CoA, once for each of the two pyruvates per glucose.", status: "source-checked", sourceIds: ["openstax-7-3"], check: { label: "CO₂ from pyruvate oxidation per glucose", sourceValue: 2, model: () => perGlucose("pyruvate-oxidation").co2 } },
  { id: "tca-co2-glucose", topic: "tca", statement: "After pyruvate oxidation, the cycle releases the remaining four CO₂ of one glucose (two per turn).", status: "source-checked", sourceIds: ["openstax-7-3"], check: { label: "CO₂ from the cycle per glucose", sourceValue: 4, model: () => perGlucose("tca").co2 } },
  { id: "tca-gtp", topic: "tca", statement: "Each turn forms one GTP or ATP by substrate-level phosphorylation (succinyl-CoA to succinate), plus NADH and FADH₂.", status: "source-checked", sourceIds: ["openstax-7-3"], check: { label: "NTP equivalents from the cycle per glucose (two turns)", sourceValue: 2, model: () => perGlucose("tca").ntpEquivalents }, caveat: "The page says GTP or ATP depending on the isoenzyme; the model counts one NTP equivalent." },
  { id: "tca-nadh-count", topic: "tca", statement: "Each turn of the cycle forms 3 NADH and 1 FADH₂.", status: "partly-checked", sourceIds: ["openstax-7-3"], caveat: "The retrieved text confirms NADH at isocitrate and α-ketoglutarate oxidation and FADH₂ production; the full count of three NADH was not found in the excerpt that was read." },
  { id: "tca-regulation", topic: "regulation", statement: "Citrate synthase is inhibited by ATP; isocitrate dehydrogenase is inhibited by ATP and NADH and activated by ADP; α-ketoglutarate dehydrogenase is inhibited by ATP, succinyl-CoA and NADH.", status: "partly-checked", sourceIds: ["openstax-7-3"], caveat: "The page does not mention NADH inhibition of citrate synthase, which the model's table includes; that effect is unverified here." },
  { id: "etc-yield-proportional", topic: "etc", statement: "The ATP obtained is proportional to the protons pumped; FADH₂ enters at complex II, bypassing complex I, so it yields less ATP than NADH.", status: "source-checked", sourceIds: ["openstax-7-4"], check: { label: "ATP per FADH₂ is smaller than per NADH (ratio < 1)", sourceValue: 1, model: () => (atpPerFadh2() < atpPerNadh() ? 1 : 0) } },
  { id: "etc-inhibitors", topic: "etc", statement: "Cyanide inhibits cytochrome c oxidase; dinitrophenol is an uncoupler that makes the inner membrane leaky to protons.", status: "partly-checked", sourceIds: ["openstax-7-4"], caveat: "Stated in the page's questions. Rotenone, malonate, antimycin and oligomycin were not found in the retrieved text." },
  { id: "etc-proton-stoichiometry", topic: "etc", statement: "Complexes I, III and IV pump 4, 4 and 2 protons per electron pair (10 per NADH, 6 per succinate).", status: "unverified", sourceIds: [], caveat: "Recalled from standard textbooks. The OpenStax figure text uses simpler numbers (one proton at complex I, two more elsewhere), so this source does not support the model's values; textbooks differ." },
  { id: "etc-atp-per-carrier", topic: "etc", statement: "About 2.5 ATP per NADH and 1.5 per FADH₂ (protons ÷ 4).", status: "unverified", sourceIds: [], caveat: "The OpenStax page says the yield varies with species and shuttle, and its retrieved text gave no per-carrier value. The 4 H⁺ per ATP assumption is a rounded textbook convention." },
  { id: "etc-glucose-total", topic: "etc", statement: "About 32 ATP per glucose with the malate–aspartate shuttle and 30 with the glycerol-phosphate shuttle.", status: "unverified", sourceIds: [], caveat: "OpenStax discusses why the glucose yield varies (species, shuttle) but the retrieved excerpt gives no total; these totals follow from the model's own assumptions." },
  { id: "gluco-bypass", topic: "gluconeogenesis", statement: "Gluconeogenesis bypasses pyruvate kinase, PFK-1 and hexokinase with PC + PEPCK, FBPase-1 and glucose-6-phosphatase; seven glycolytic steps are shared.", status: "unverified", sourceIds: [], caveat: "Recalled from standard textbooks; the pages retrieved this session cover glycolysis, the cycle and oxidative phosphorylation only." },
  { id: "reg-f26bp", topic: "regulation", statement: "Fructose 2,6-bisphosphate activates PFK-1 and inhibits FBPase-1; AMP activates PFK-1 and inhibits FBPase-1.", status: "unverified", sourceIds: [], caveat: "Recalled from standard textbooks; not found in the pages retrieved." },
  { id: "net-balance", topic: "glycolysis", statement: "Every reaction in the network balances for atoms and charge under the stated neutral-acid convention.", status: "unverified", sourceIds: [], caveat: "This is checked by the repository's own test (validateNetwork), not by an outside source; the convention differs from some textbooks." },
];

export const sourceById = (id: string): Source | undefined => SOURCES.find((source) => source.id === id);
export const claimsFor = (topics: readonly ProvenanceTopic[]): Claim[] => CLAIMS.filter((claim) => topics.includes(claim.topic));

/** Problems with the provenance table: dangling sources, a "checked" claim with no source, an "unverified" claim that cites one. */
export function validateProvenance(claims: readonly Claim[] = CLAIMS, sources: readonly Source[] = SOURCES): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const source of sources) {
    if (!/^https:\/\//.test(source.url)) problems.push(`source ${source.id}: no https URL`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.accessed)) problems.push(`source ${source.id}: bad access date`);
  }
  for (const claim of claims) {
    if (ids.has(claim.id)) problems.push(`duplicate claim ${claim.id}`);
    ids.add(claim.id);
    for (const sourceId of claim.sourceIds) if (!sources.some((source) => source.id === sourceId)) problems.push(`${claim.id}: unknown source ${sourceId}`);
    if (claim.status === "source-checked" && claim.sourceIds.length === 0) problems.push(`${claim.id}: marked checked without a source`);
    if (claim.status === "unverified" && claim.sourceIds.length > 0) problems.push(`${claim.id}: unverified claim cites a source`);
    if (claim.status !== "source-checked" && !claim.caveat) problems.push(`${claim.id}: ${claim.status} claim has no caveat`);
    if (claim.check && claim.status === "unverified") problems.push(`${claim.id}: unverified claim has a source-agreement check`);
  }
  return problems;
}
