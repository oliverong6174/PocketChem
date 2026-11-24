/**
 * What the Properties page persists, and how saved data is validated before it is shown.
 *
 * Inputs: the drawn structure as KET plus its chemistry identity key, and the view settings
 * (dashboard panel and concept selection). Results: the analysis output that was displayed
 * (functional groups, acid/base sites, resonance, chirality, annotation, name and properties,
 * predicted reactions). Highlight SVGs and selection indices are regenerated, not stored.
 */
import type { MoleculeAnnotation, AnnotationConcept } from "../moleculeAnnotation";
import type { FunctionalGroupResult } from "../functionalGroups";
import type { ResonanceResult } from "../resonanceUtils";
import type { ChiralityResult } from "../chiralityUtils";
import type { MoleculeIdentityResult } from "../nomenclatureUtils";
import type { AcidityResult } from "../ranking/acidBase/analyzeAcidity";
import type { BasicityResult } from "../ranking/acidBase/analyzeBasicity";
import type { ReactionPathway } from "../reactionUtils";

/** Bump when the shape or meaning of saved Properties results changes. */
export const PROPERTIES_ENGINE_VERSION = 2;

export type PropertiesAnalysisPanel = "overview" | "acidBase" | "aromaticity" | "concepts" | "properties";

export type PropertiesWorkspaceInputs = {
  ket: string | null;
  /** Chemistry identity of the drawn structure when it was captured (see ketIdentity.ts). */
  key: string | null;
  analysisPanel: PropertiesAnalysisPanel;
  selectedConcept: AnnotationConcept;
  selectedHybridization: "all" | "sp" | "sp2" | "sp3";
  selectedBondType: "all" | "single" | "double" | "triple";
};

export type PropertiesWorkspaceResults = {
  /** Identity of the structure that was analyzed. */
  inputKey: string;
  smiles: string;
  molfile: string | null;
  functionalGroups: FunctionalGroupResult[];
  acidityResults: AcidityResult[];
  basicityResults: BasicityResult[];
  resonanceResults: ResonanceResult[];
  chiralityResults: ChiralityResult[];
  moleculeAnnotation: MoleculeAnnotation | null;
  moleculeIdentity: MoleculeIdentityResult | null;
  reactionPathways: ReactionPathway[];
};

const PANELS: readonly string[] = ["overview", "acidBase", "aromaticity", "concepts", "properties"];
const CONCEPTS: readonly string[] = [
  "hybridization",
  "bondOrbitals",
  "lonePairs",
  "acidBaseSites",
  "reactiveSites",
  "resonance",
  "chirality",
  "functionalGroups",
];
const MAX_KET_CHARS = 1_500_000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const isObjectArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isObject);

export function validatePropertiesInputs(raw: unknown): PropertiesWorkspaceInputs | null {
  if (!isObject(raw)) return null;
  const { ket, key, analysisPanel, selectedConcept, selectedHybridization, selectedBondType } = raw;
  if (!isNullableString(ket) || !isNullableString(key)) return null;
  if (typeof analysisPanel !== "string" || !PANELS.includes(analysisPanel)) return null;
  if (typeof selectedConcept !== "string" || !CONCEPTS.includes(selectedConcept)) return null;
  if (!["all", "sp", "sp2", "sp3"].includes(String(selectedHybridization))) return null;
  if (!["all", "single", "double", "triple"].includes(String(selectedBondType))) return null;
  if (ket !== null) {
    if (ket.length > MAX_KET_CHARS) return null;
    try {
      const parsed: unknown = JSON.parse(ket);
      if (!isObject(parsed) || !isObject(parsed.root)) return null;
    } catch {
      return null;
    }
  }
  return {
    ket,
    key,
    analysisPanel: analysisPanel as PropertiesAnalysisPanel,
    selectedConcept: selectedConcept as AnnotationConcept,
    selectedHybridization: selectedHybridization as PropertiesWorkspaceInputs["selectedHybridization"],
    selectedBondType: selectedBondType as PropertiesWorkspaceInputs["selectedBondType"],
  };
}

/** Returns usable results, or null when they cannot be shown safely. */
export function validatePropertiesResults(raw: unknown): PropertiesWorkspaceResults | null {
  if (!isObject(raw)) return null;
  if (typeof raw.inputKey !== "string" || typeof raw.smiles !== "string" || !raw.smiles.trim()) return null;
  if (!isNullableString(raw.molfile)) return null;
  if (
    !isObjectArray(raw.functionalGroups) ||
    !isObjectArray(raw.acidityResults) ||
    !isObjectArray(raw.basicityResults) ||
    !isObjectArray(raw.resonanceResults) ||
    !isObjectArray(raw.chiralityResults) ||
    !isObjectArray(raw.reactionPathways)
  ) {
    return null;
  }
  const annotation = raw.moleculeAnnotation;
  if (annotation !== null && !(isObject(annotation) && isObjectArray(annotation.atoms) && isObjectArray(annotation.bonds))) {
    return null;
  }
  const identity = raw.moleculeIdentity;
  if (identity !== null && !(isObject(identity) && isObject(identity.nomenclature) && isObject(identity.properties))) {
    return null;
  }
  const result = raw as unknown as PropertiesWorkspaceResults;
  // Older saved snapshots may predate the generic-structure fix. Keep the snapshot but
  // withhold invalid whole-molecule numbers without pretending it has been recomputed.
  if (result.moleculeIdentity && (result.smiles.includes("*") || /R(?![a-z])|\([^)]*\)[nm]/.test(result.moleculeIdentity.properties.molecularFormula ?? ""))) {
    const id = result.moleculeIdentity, p = id.properties;
    if (p.fullySpecified === false && p.molecularWeight === null && p.exactMass === null && p.degreesOfUnsaturation === null) return result;
    const unknown = p.unspecifiedAtomCount ?? p.atomCounts?.filter((a) => ["R", "*", "A", "Q", "X"].includes(a.element)).reduce((n,a) => n+a.count,0) ?? 0;
    return { ...result, moleculeIdentity: { ...id, properties: { ...p, fullySpecified: false, unspecifiedAtomCount: unknown, heavyAtomCount: p.fullySpecified === false ? p.heavyAtomCount : Math.max(0,p.heavyAtomCount-unknown), molecularWeight: null, exactMass: null, degreesOfUnsaturation: null, notes: [...(p.notes ?? []), "Generic saved scaffold: whole-molecule mass, DBE and tendencies withheld; this snapshot was not recomputed."] } } };
  }
  return result;
}

/** The one-line description a saved Properties analysis gets in the library list. */
export function describePropertiesAnalysis(
  data: Pick<PropertiesWorkspaceResults, "smiles" | "functionalGroups" | "chiralityResults" | "reactionPathways" | "moleculeIdentity">,
): string {
  const nomenclature = data.moleculeIdentity?.nomenclature;
  const name = nomenclature?.displayName || nomenclature?.estimatedName || data.smiles;
  const formula = data.moleculeIdentity?.properties?.molecularFormula;
  const groups = data.functionalGroups.length;
  const centers = data.chiralityResults.length;
  const reactions = data.reactionPathways.length;
  return `${name}${formula ? ` (${formula})` : ""} · ${groups} functional group${groups === 1 ? "" : "s"}, ${centers} stereo result${centers === 1 ? "" : "s"}, ${reactions} predicted reaction${reactions === 1 ? "" : "s"}`;
}
