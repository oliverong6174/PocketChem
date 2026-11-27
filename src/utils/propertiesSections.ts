/**
 * Stage 20: groups the existing Properties results by scientific meaning for display.
 *
 * Nothing is computed here. Every value is read from the engine's `MoleculeIdentityResult`, and each row says what kind of value it is:
 *   calculated : derived from the structure (formula, mass, counts); exact for that structure, not a measurement;
 *   estimate   : the engine's qualitative tendency (a level plus the factors that led to it); heuristic, never a measured value.
 * A value the engine could not provide is listed as unavailable instead of being shown as a tile reading "N/A".
 */
import type { MoleculeIdentityResult } from "./nomenclatureUtils";

export type Evidence = "calculated" | "estimate";

export interface PropertyRow {
  id: string;
  label: string;
  value: string;
  evidence: Evidence;
  /** Key into the page's property-definition table. */
  infoKey: string;
  /** For estimates: why the engine reached the level. */
  detail?: { explanation: string; factors: readonly string[] };
}

export interface PropertySection {
  id: "composition" | "descriptors" | "tendencies";
  title: string;
  /** One line telling the reader what kind of values these are. */
  evidenceNote: string;
  rows: PropertyRow[];
}

export interface GroupCount { name: string; count: number }
export interface StereoCenter { label: string; configuration: string; /** 1-based atom number in the drawing, when known. */ atom?: number }

export interface PropertySections {
  sections: PropertySection[];
  unavailable: string[];
  groups: GroupCount[];
  stereocenters: StereoCenter[];
  /** Number of values shown (rows) out of those the engine could be asked for. */
  shown: number;
  askedFor: number;
}

type Properties = MoleculeIdentityResult["properties"];

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== "";

export function buildPropertySections(identity: MoleculeIdentityResult, groups: readonly GroupCount[] = [], stereocenters: readonly StereoCenter[] = []): PropertySections {
  const p: Properties = identity.properties;
  const unavailable: string[] = [];
  const calc = (id: string, label: string, raw: unknown, infoKey: string, format: (v: unknown) => string = String): PropertyRow | null => {
    if (!present(raw)) { unavailable.push(label); return null; }
    return { id, label, value: format(raw), evidence: "calculated", infoKey };
  };
  const tendency = (id: string, label: string, t: { level: string; explanation: string; factors: string[] } | undefined, infoKey: string): PropertyRow | null => {
    if (!t || !present(t.level)) { unavailable.push(label); return null; }
    return { id, label, value: t.level, evidence: "estimate", infoKey, detail: { explanation: t.explanation, factors: t.factors } };
  };
  const keep = (rows: Array<PropertyRow | null>): PropertyRow[] => rows.filter((row): row is PropertyRow => row !== null);

  const composition = keep([
    calc("formula", p.fullySpecified === false ? "Scaffold formula" : "Formula", p.molecularFormula, "formula"),
    calc("mw", "Molecular weight", p.molecularWeight, "molecularWeight", (v) => `${v} g/mol`),
    calc("exactMass", "Exact mass", p.exactMass, "exactMass"),
    calc("charge", "Formal charge", p.formalCharge, "formalCharge"),
    calc("heavy", p.fullySpecified === false ? "Known heavy atoms" : "Heavy atoms", p.heavyAtomCount, "heavyAtoms"),
  ]);
  const descriptors = keep([
    calc("dbe", "DBE / unsaturation", p.degreesOfUnsaturation, "dbe"),
    calc("rings", "Rings", p.ringCount, "rings"),
    calc("rot", "Rotatable bonds", p.rotatableBonds, "rotatableBonds"),
    calc("hbd", "H-bond donors", p.hydrogenBondDonors, "hbd"),
    calc("hba", "H-bond acceptors", p.hydrogenBondAcceptors, "hba"),
  ]);
  const tendencies = keep([
    tendency("solubility", "Water solubility", p.fullySpecified === false ? undefined : p.waterSolubilityTendency, "waterSolubility"),
    tendency("permeability", "Membrane permeability", p.fullySpecified === false ? undefined : p.membranePermeabilityTendency, "membranePermeability"),
    tendency("boiling", "Boiling point tendency", p.fullySpecified === false ? undefined : p.boilingPointTendency, "boilingPoint"),
    tendency("volatility", "Volatility", p.fullySpecified === false ? undefined : p.volatilityTendency, "volatility"),
  ]);

  const sections: PropertySection[] = [
    { id: "composition", title: "Molecular composition", evidenceNote: "Calculated from the structure.", rows: composition },
    { id: "descriptors", title: "Structural descriptors", evidenceNote: "Calculated from the structure.", rows: descriptors },
    { id: "tendencies", title: "Estimated physicochemical tendencies", evidenceNote: "Qualitative estimates from structural features. Heuristic, not measured values.", rows: tendencies },
  ];
  const shown = sections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, unavailable, groups: [...groups], stereocenters: [...stereocenters], shown, askedFor: shown + unavailable.length };
}

/** Counts functional-group occurrences by name, keeping first-seen order. */
export function countGroups(occurrences: ReadonlyArray<{ groupName: string }>): GroupCount[] {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) counts.set(occurrence.groupName, (counts.get(occurrence.groupName) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}
