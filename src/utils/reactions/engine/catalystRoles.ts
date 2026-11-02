import { resolveReactantRequirement } from "../profiles/reactants";
import type { ReactionRule, RuleConditions } from "../reactionTypes";

/**
 * Catalyst and reagent roles (Stage 9B-3), deliberately narrow.
 *
 * A rule's `reagents` field is free text ("Pd catalyst, base", "1) LiAlH₄  2) H₃O⁺"). It is
 * kept exactly as written and is never parsed automatically. Structured roles come from two
 * places only:
 *
 *   1. the rule's own structural reactants (`additionalReactants`), and
 *   2. a small curated table below. Each curated entry names a piece of evidence; when the
 *      source is "registry-text" that evidence string must literally appear in the rule's
 *      `reagents` or `reagentNote` (a test enforces this), so a role claim can always be traced
 *      to text already in the registry. "textbook" entries are limited to textbook facts that the
 *      registry text implies but does not state (a hydride reductant is consumed).
 *
 * Everything else is "unassessed": the reagent text is shown and no role is asserted. Missing
 * metadata never means "compatible", and nothing here models loading, turnover, yield,
 * poisoning, ligands or mechanism.
 */

export type ChemicalRoleKind =
  /** A molecule drawn into the inventory that the reaction consumes. */
  | "structural-reactant"
  /** A reagent consumed in a documented amount-independent way (hydride, oxidant, metal). */
  | "stoichiometric-reagent"
  /** A reagent the reaction needs whose amount and fate are not stated. */
  | "reagent"
  | "catalyst"
  | "co-catalyst"
  | "solvent"
  | "reaction-condition"
  | "workup-reagent";

export type RoleSource = "registry-structure" | "registry-text" | "textbook";

export type ChemicalRole = {
  kind: ChemicalRoleKind;
  name: string;
  source: RoleSource;
  /** Literal text in the rule's reagents / reagentNote that supports this role (registry-text). */
  evidenceText?: string;
  /** Roles in one group are listed alternatives ("NaBH₄ or LiAlH₄"), not all required together. */
  alternativeGroup?: string;
  /** The species is only described by type ("Pd catalyst", "acid catalyst"), not identified. */
  identity?: "named" | "generic";
  /** The registry says the component is used only when applicable. */
  conditional?: boolean;
  note?: string;
};

export type StepRoleProfile = {
  ruleId: string;
  /** The rule's original reagent text, unchanged. */
  reagentText: string;
  /** False when no role beyond structural reactants could be established. */
  structured: boolean;
  roles: ChemicalRole[];
  /**
   * named:    a catalyst is identified by name (Pd/C, Lindlar catalyst, H₂SO₄).
   * generic:  a catalyst of some type is required but not identified (Pd catalyst, acid catalyst).
   * none:     the rule's text and curated entry declare no catalyst.
   * unknown:  the reagent text was not assessed, so absence of a catalyst is not established.
   */
  catalystIdentity: "named" | "generic" | "none" | "unknown";
};

type CuratedRole = Omit<ChemicalRole, "source" | "evidenceText"> & { source: "registry-text" | "textbook"; evidenceText?: string };

const h2 = (text = "H₂"): CuratedRole => ({ kind: "stoichiometric-reagent", name: "H₂", source: "textbook", note: "Consumed by the addition." , evidenceText: text });
const hydrides = (): CuratedRole[] => [
  { kind: "stoichiometric-reagent", name: "NaBH₄", source: "textbook", alternativeGroup: "hydride", identity: "named", note: "Hydride donor, consumed." },
  { kind: "stoichiometric-reagent", name: "LiAlH₄", source: "textbook", alternativeGroup: "hydride", identity: "named", note: "Hydride donor, consumed." },
];

const CURATED: Record<string, CuratedRole[]> = {
  "alkene-hydrogenation": [
    { kind: "catalyst", name: "Pd/C", source: "registry-text", evidenceText: "Pd/C", identity: "named" },
    { ...h2() },
  ],
  "alkyne-hydrogenation": [
    { kind: "catalyst", name: "Pt", source: "registry-text", evidenceText: "Pt", alternativeGroup: "catalyst", identity: "named" },
    { kind: "catalyst", name: "Pd/C", source: "registry-text", evidenceText: "Pd/C", alternativeGroup: "catalyst", identity: "named" },
    { ...h2("Excess H₂") },
  ],
  "aromatic-catalytic-hydrogenation": [
    { kind: "catalyst", name: "Pt, Pd or Ni", source: "registry-text", evidenceText: "Pt/Pd/Ni", identity: "named", note: "The registry lists three alternative metals." },
    { ...h2() },
    { kind: "reaction-condition", name: "high pressure and heat", source: "registry-text", evidenceText: "high pressure and heat" },
  ],
  "alkyne-lindlar-reduction-internal": [
    { kind: "catalyst", name: "Lindlar catalyst", source: "registry-text", evidenceText: "Lindlar catalyst", identity: "named" },
    { ...h2() },
  ],
  "alkyne-lindlar-reduction-terminal": [
    { kind: "catalyst", name: "Lindlar catalyst", source: "registry-text", evidenceText: "Lindlar catalyst", identity: "named" },
    { ...h2() },
  ],
  "alkyne-lindlar-deuteration-internal": [
    { kind: "catalyst", name: "Lindlar catalyst", source: "registry-text", evidenceText: "Lindlar catalyst", identity: "named" },
    { kind: "stoichiometric-reagent", name: "D₂", source: "textbook", evidenceText: "D₂", note: "Consumed by the addition." },
  ],
  "alkyne-lindlar-deuteration-terminal": [
    { kind: "catalyst", name: "Lindlar catalyst", source: "registry-text", evidenceText: "Lindlar catalyst", identity: "named" },
    { kind: "stoichiometric-reagent", name: "D₂", source: "textbook", evidenceText: "D₂", note: "Consumed by the addition." },
  ],
  "nitroarene-reduction": [
    { kind: "catalyst", name: "Pd/C", source: "registry-text", evidenceText: "Pd/C", alternativeGroup: "route-1", identity: "named", note: "Heterogeneous route: Pd/C with H₂." },
    { kind: "stoichiometric-reagent", name: "H₂", source: "textbook", evidenceText: "H₂", alternativeGroup: "route-1" },
    { kind: "stoichiometric-reagent", name: "Fe/HCl", source: "registry-text", evidenceText: "Fe/HCl", alternativeGroup: "route-2", identity: "named", note: "Metal reductant route; the metal is consumed." },
    { kind: "stoichiometric-reagent", name: "Sn/HCl", source: "registry-text", evidenceText: "Sn/HCl", alternativeGroup: "route-3", identity: "named", note: "Metal reductant route; the metal is consumed." },
  ],
  "suzuki-coupling": [
    { kind: "catalyst", name: "Pd catalyst", source: "registry-text", evidenceText: "Pd catalyst", identity: "generic", note: "Ligand and palladium source are not specified." },
    { kind: "reagent", name: "base", source: "registry-text", evidenceText: "base", identity: "generic" },
  ],
  "heck-coupling": [
    { kind: "catalyst", name: "Pd catalyst", source: "registry-text", evidenceText: "Pd catalyst", identity: "generic", note: "Ligand and palladium source are not specified." },
    { kind: "reagent", name: "base", source: "registry-text", evidenceText: "base", identity: "generic" },
    { kind: "reaction-condition", name: "heat", source: "registry-text", evidenceText: "heat" },
  ],
  "sonogashira-coupling": [
    { kind: "catalyst", name: "Pd catalyst", source: "registry-text", evidenceText: "Pd catalyst", identity: "generic", note: "Ligand and palladium source are not specified." },
    { kind: "co-catalyst", name: "CuI", source: "registry-text", evidenceText: "CuI", identity: "named", conditional: true, note: "The registry lists CuI/base \"as applicable\"; copper-free variants exist." },
    { kind: "reagent", name: "base", source: "registry-text", evidenceText: "base", identity: "generic" },
  ],
  "fischer-esterification": [
    { kind: "catalyst", name: "H₂SO₄", source: "registry-text", evidenceText: "Catalytic H₂SO₄", identity: "named", note: "Acid catalyst." },
    { kind: "reaction-condition", name: "heat", source: "registry-text", evidenceText: "heat" },
  ],
  "aldehyde-imine-formation": [{ kind: "catalyst", name: "acid", source: "registry-text", evidenceText: "acid catalyst", identity: "generic" }],
  "ketone-imine-formation": [{ kind: "catalyst", name: "acid", source: "registry-text", evidenceText: "acid catalyst", identity: "generic" }],
  "aldehyde-enamine-formation": [{ kind: "catalyst", name: "acid", source: "registry-text", evidenceText: "acid catalyst", identity: "generic" }],
  "ketone-enamine-formation": [{ kind: "catalyst", name: "acid", source: "registry-text", evidenceText: "acid catalyst", identity: "generic" }],
  "aldehyde-acetal-formation": [{ kind: "catalyst", name: "H⁺ (acid)", source: "registry-text", evidenceText: "Acid-catalyzed", identity: "generic" }],
  "ketone-ketal-formation": [{ kind: "catalyst", name: "H⁺ (acid)", source: "registry-text", evidenceText: "Acid-catalyzed", identity: "generic" }],
  "alkene-acid-hydration": [{ kind: "catalyst", name: "H⁺ (acid)", source: "registry-text", evidenceText: "Acid-catalyzed", identity: "generic" }],
  "alcohol-dehydration-alkene": [{ kind: "catalyst", name: "H₂SO₄ or H₃PO₄ (acid)", source: "registry-text", evidenceText: "Acid-catalyzed", identity: "named" }, { kind: "reaction-condition", name: "heat", source: "registry-text", evidenceText: "heat" }],
  "alkyne-mercury-hydration-terminal": [
    { kind: "catalyst", name: "Hg²⁺ (from HgSO₄)", source: "registry-text", evidenceText: "Hg²⁺-catalyzed", identity: "named" },
    { kind: "reagent", name: "H₂SO₄", source: "registry-text", evidenceText: "H₂SO₄", identity: "named", note: "Acid medium; its mechanistic role is not modeled." },
  ],
  "alkyne-mercury-hydration-internal": [
    { kind: "catalyst", name: "Hg²⁺ (from HgSO₄)", source: "registry-text", evidenceText: "Hg²⁺-catalyzed", identity: "named" },
    { kind: "reagent", name: "H₂SO₄", source: "registry-text", evidenceText: "H₂SO₄", identity: "named", note: "Acid medium; its mechanistic role is not modeled." },
  ],
  "alkene-oxymercuration-demercuration": [
    { kind: "stoichiometric-reagent", name: "Hg(OAc)₂", source: "textbook", evidenceText: "Hg(OAc)₂", identity: "named", note: "Consumed, not catalytic (contrast with Hg²⁺-catalyzed alkyne hydration)." },
    { kind: "stoichiometric-reagent", name: "NaBH₄", source: "textbook", evidenceText: "NaBH₄", identity: "named", note: "Demercuration step." },
  ],
  "primary-alcohol-mild-oxidation": [
    { kind: "stoichiometric-reagent", name: "PCC", source: "registry-text", evidenceText: "PCC", alternativeGroup: "oxidant", identity: "named", note: "Oxidant, consumed." },
    { kind: "stoichiometric-reagent", name: "DMP", source: "registry-text", evidenceText: "DMP", alternativeGroup: "oxidant", identity: "named", note: "Oxidant, consumed." },
    { kind: "stoichiometric-reagent", name: "Swern reagents", source: "registry-text", evidenceText: "Swern", alternativeGroup: "oxidant", identity: "named", note: "Activated-DMSO oxidant, consumed." },
  ],
  "secondary-alcohol-oxidation-pcc": [{ kind: "stoichiometric-reagent", name: "PCC", source: "registry-text", evidenceText: "PCC", identity: "named", note: "Oxidant, consumed." }],
  "ketone-reduction": [...hydrides().map((role) => ({ ...role, evidenceText: role.name })), { kind: "workup-reagent", name: "H₃O⁺", source: "registry-text", evidenceText: "then H₃O⁺" }],
  "aldehyde-reduction": [...hydrides().map((role) => ({ ...role, evidenceText: role.name })), { kind: "workup-reagent", name: "H₃O⁺", source: "registry-text", evidenceText: "then H₃O⁺" }],
  "ester-lah-reduction": [
    { kind: "stoichiometric-reagent", name: "LiAlH₄", source: "registry-text", evidenceText: "LiAlH₄", identity: "named", note: "Hydride donor, consumed." },
    { kind: "workup-reagent", name: "H₃O⁺", source: "registry-text", evidenceText: "2) H₃O⁺" },
  ],
  "haloalkane-grignard-formation-bromide": [
    { kind: "stoichiometric-reagent", name: "Mg", source: "registry-text", evidenceText: "Mg", identity: "named", note: "Metal, consumed." },
    { kind: "solvent", name: "dry ether", source: "registry-text", evidenceText: "dry ether" },
  ],
  "aldehyde-organometallic-addition": [{ kind: "workup-reagent", name: "H₃O⁺", source: "registry-text", evidenceText: "2) H₃O⁺" }],
};

/** Rule ids that have a curated role entry (for tests and coverage reports). */
export const CURATED_ROLE_RULE_IDS: readonly string[] = Object.keys(CURATED);

/** The text a curated registry-text evidence string must appear in. */
export function ruleReagentEvidenceText(rule: Pick<ReactionRule, "reagents" | "reagentNote">): string {
  return `${rule.reagents}\n${rule.reagentNote}`;
}

export function curatedRolesFor(ruleId: string): readonly CuratedRole[] | undefined {
  return CURATED[ruleId];
}

function structuralRoles(rule: ReactionRule): ChemicalRole[] {
  const roles: ChemicalRole[] = [];
  for (const requirement of (rule.additionalReactants ?? []).map(resolveReactantRequirement)) {
    if (requirement.supplyMode === "condition-only") {
      roles.push({ kind: "reaction-condition", name: requirement.label, source: "registry-structure" });
    } else if (requirement.supplyMode === "auto") {
      roles.push({
        kind: "reagent",
        name: requirement.label,
        source: "registry-structure",
        note: "Supplied by the rule itself; it is not an inventory molecule and its amount is not modeled.",
      });
    } else {
      const copies = Math.max(1, Math.floor(requirement.equivalents ?? 1));
      roles.push({
        kind: "structural-reactant",
        name: copies > 1 ? `${requirement.label} (${copies} molecules)` : requirement.label,
        source: "registry-structure",
        note: "Must be a molecule in the inventory.",
      });
    }
  }
  return roles;
}

/**
 * Structured roles for one rule. Always keeps the original reagent text. A rule without a
 * curated entry is "unassessed" apart from the structural reactants the registry itself declares.
 */
export function describeRuleRoles(rule: ReactionRule): StepRoleProfile {
  const curated = CURATED[rule.id];
  const roles: ChemicalRole[] = [...structuralRoles(rule)];
  if (curated) {
    for (const role of curated) {
      roles.push({ ...role });
    }
  }
  const catalysts = roles.filter((role) => role.kind === "catalyst" || role.kind === "co-catalyst");
  let catalystIdentity: StepRoleProfile["catalystIdentity"];
  if (!curated) catalystIdentity = "unknown";
  else if (catalysts.length === 0) catalystIdentity = "none";
  else catalystIdentity = catalysts.every((role) => role.identity === "named") ? "named" : "generic";
  return {
    ruleId: rule.id,
    reagentText: rule.reagents,
    structured: Boolean(curated),
    roles,
    catalystIdentity,
  };
}

// ---------------------------------------------------------------------------------------
// Condition compatibility between two reactions (only if someone proposes combining them)
// ---------------------------------------------------------------------------------------

export type CombinationCategory =
  /** Only ever from a curated, literature-backed pair. No pair is curated in this version. */
  | "documented-compatible"
  /** A deterministic clash between declared conditions (an acid and a strong base, an oxidant and a hydride). */
  | "documented-conflict"
  /** Both reactions declare conditions and no clash was found, but most factors are not modeled. */
  | "incomplete"
  /** At least one reaction declares no machine-readable conditions. */
  | "unassessed";

export type CombinationAssessment = {
  ruleIds: [string, string];
  category: CombinationCategory;
  reasons: string[];
};

function acidBaseClash(acidSide: RuleConditions, baseSide: RuleConditions): string | null {
  if (!acidSide.acid) return null;
  if (baseSide.base === "strong" || baseSide.organometallic || baseSide.hydride) {
    return "an acid would quench a strong base, carbanion or hydride";
  }
  if (baseSide.base === "mild" && acidSide.acid === "strong") return "a strong acid would neutralise a base";
  return null;
}

function redoxClash(oxidising: RuleConditions, reducing: RuleConditions): string | null {
  if (!oxidising.oxidant) return null;
  if (reducing.hydride || reducing.organometallic) return "an oxidant would destroy a hydride or carbanion reagent";
  return null;
}

/**
 * Could these two reactions share one pot, judged only from their declared RuleConditions?
 * A clash is a documented conflict. Absence of a clash is NOT compatibility: solvent, ligands,
 * temperature, concentration and catalyst poisoning are not modeled, so the best a pair of
 * declared reactions can reach here is "incomplete".
 */
export function assessCombination(a: ReactionRule, b: ReactionRule): CombinationAssessment {
  const ruleIds: [string, string] = [a.id, b.id];
  const left = a.conditions;
  const right = b.conditions;
  if (!left || !right) {
    const missing = [!left ? a.id : null, !right ? b.id : null].filter(Boolean).join(" and ");
    return {
      ruleIds,
      category: "unassessed",
      reasons: [`${missing} declare${missing.includes(" and ") ? "" : "s"} no machine-readable conditions, so nothing can be said about combining them.`],
    };
  }
  const reasons = [
    acidBaseClash(left, right) && `${a.id} / ${b.id}: ${acidBaseClash(left, right)}`,
    acidBaseClash(right, left) && `${b.id} / ${a.id}: ${acidBaseClash(right, left)}`,
    redoxClash(left, right) && `${a.id} / ${b.id}: ${redoxClash(left, right)}`,
    redoxClash(right, left) && `${b.id} / ${a.id}: ${redoxClash(right, left)}`,
  ].filter((reason): reason is string => Boolean(reason));
  if (reasons.length > 0) return { ruleIds, category: "documented-conflict", reasons };
  return {
    ruleIds,
    category: "incomplete",
    reasons: [
      "No clash among the declared acid, base, organometallic, hydride and oxidant conditions. This is not evidence of compatibility: solvent, ligands, temperature, concentration and catalyst poisoning are not modeled.",
    ],
  };
}

export const COMBINATION_LABEL: Record<CombinationCategory, string> = {
  "documented-compatible": "Documented compatible",
  "documented-conflict": "Documented conflict",
  incomplete: "Incomplete information",
  unassessed: "Unassessed",
};
