import { getRDKit } from "../../rdkit";
import type {
  CompatibilitySeverity,
  CompatibilityWarning,
  MultistepSynthesisRoute,
  ReactionRule,
  RouteCompatibility,
  RuleConditions,
  SynthesisStep,
} from "../reactionTypes";
import { getCompiledQuerySync } from "./rdkitCaches";

/**
 * Advisory chemical-compatibility assessment (Phase 4, Stage 7).
 *
 * The route verifier answers "does PocketChem's reaction model reproduce this route?". It
 * says nothing about whether the reagents tolerate the other functional groups in the
 * molecule. This module adds that second, separate question:
 *
 *   rule.conditions (declared, machine-readable)  x  groups present in the step's actual
 *   reactants that are NOT the intended reaction centre  ->  advisory warnings.
 *
 * - "Spectator" group = a group present before AND after the step. The count that survives
 *   is min(count in reactants, count in products): a group the step consumes (the acidic
 *   C-H of the alkyne being alkylated, the phenol being methylated) does not count.
 * - Severities. "model-constraint": a deterministic consequence of the declared condition
 *   and the group (a strong base or carbanion is quenched by a much more acidic proton).
 *   "plausible": a risk that real chemistry often handles (excess reagent, protection) or
 *   that depends on conditions the model does not carry. Rules with no `conditions` are
 *   reported as unassessed, never as compatible.
 * - Advisory only. Nothing here rejects or reorders a route's structural verification.
 *
 * False-positive risks: groups are found by SMARTS, so unusual environments can be
 * mis-classified; "surviving" counts cannot tell two identical groups apart (one consumed,
 * one spectator is detected; a group consumed and regenerated elsewhere is not); stoichiometry,
 * solvent and temperature are not modelled.
 */

type GroupId =
  | "carboxylic-acid"
  | "sulfonic-acid"
  | "phenol"
  | "thiol"
  | "water"
  | "terminal-alkyne"
  | "alcohol"
  | "amine-NH"
  | "aldehyde"
  | "ketone"
  | "ester"
  | "nitrile"
  | "acyl-halide"
  | "alkene"
  | "alkyne"
  | "aromatic-amine"
  | "acetal"
  | "epoxide"
  | "enol-ether";

const GROUP_SMARTS: Record<GroupId, { label: string; smarts: string }> = {
  "carboxylic-acid": { label: "carboxylic acid", smarts: "[CX3](=O)[OX2H1]" },
  "sulfonic-acid": { label: "sulfonic acid", smarts: "[SX4](=O)(=O)[OX2H1]" },
  phenol: { label: "phenolic OH", smarts: "[OX2H1]c" },
  thiol: { label: "thiol", smarts: "[SX2H1]" },
  water: { label: "water", smarts: "[OX2H2]" },
  "terminal-alkyne": { label: "terminal alkyne C–H", smarts: "[CX2H1]#[CX2]" },
  alcohol: { label: "alcohol OH", smarts: "[OX2H1][CX4]" },
  "amine-NH": { label: "amine N–H", smarts: "[NX3;H1,H2;!$(N-C=[O,S,N]);!$(N-S(=O)=O)]" },
  aldehyde: { label: "aldehyde", smarts: "[CX3H1](=O)[#6]" },
  ketone: { label: "ketone", smarts: "[#6][CX3](=O)[#6]" },
  ester: { label: "ester", smarts: "[#6][CX3](=O)[OX2][#6]" },
  nitrile: { label: "nitrile", smarts: "[CX2]#[NX1]" },
  "acyl-halide": { label: "acyl halide", smarts: "[CX3](=O)[Cl,Br,I]" },
  alkene: { label: "C=C double bond", smarts: "[CX3;!a]=[CX3;!a]" },
  alkyne: { label: "C≡C triple bond", smarts: "[CX2]#[CX2]" },
  "aromatic-amine": { label: "aromatic amine", smarts: "[NX3;H1,H2;!$(N-C=[O,S,N])]a" },
  acetal: { label: "acetal/ketal", smarts: "[CX4]([OX2][#6])[OX2][#6]" },
  epoxide: { label: "epoxide", smarts: "C1OC1" },
  "enol-ether": { label: "enol ether", smarts: "[CX3]=[CX3][OX2][#6]" },
};

const STRONGLY_ACIDIC: GroupId[] = ["carboxylic-acid", "sulfonic-acid", "phenol", "thiol", "water", "terminal-alkyne"];
const ELECTROPHILIC: GroupId[] = ["aldehyde", "ketone", "ester", "nitrile", "acyl-halide"];
const OXIDIZABLE_STRONG: GroupId[] = ["alcohol", "aldehyde", "thiol", "phenol", "aromatic-amine", "alkene", "alkyne"];

type Finding = {
  group: GroupId;
  severity: CompatibilitySeverity;
  kind: CompatibilityWarning["kind"];
  condition: string;
  why: string;
};

/** Which spectator groups matter for the declared conditions, and how seriously. */
function relevantFindings(conditions: RuleConditions): Finding[] {
  const out: Finding[] = [];
  const strongBase = conditions.base === "strong" || conditions.organometallic === true;
  const reagent = conditions.organometallic ? "a carbanion reagent" : "a strong base";

  if (strongBase) {
    for (const group of STRONGLY_ACIDIC) {
      out.push({
        group,
        severity: "model-constraint",
        kind: "acid-base-quench",
        condition: reagent,
        why: `would be deprotonated first, consuming the reagent`,
      });
    }
    // A carbanion (Grignard, organolithium, acetylide) is protonated by an alcohol outright; an
    // amide/hydride base only forms the alkoxide, which excess base or protection can handle.
    out.push({
      group: "alcohol",
      severity: conditions.organometallic ? "model-constraint" : "plausible",
      kind: "acid-base-quench",
      condition: reagent,
      why: "would be deprotonated (excess reagent or protection needed)",
    });
    out.push({ group: "amine-NH", severity: "plausible", kind: "acid-base-quench", condition: reagent, why: "may be deprotonated (excess reagent or protection needed)" });
  } else if (conditions.base === "mild") {
    for (const group of ["carboxylic-acid", "sulfonic-acid"] as GroupId[]) {
      out.push({ group, severity: "plausible", kind: "acid-base-quench", condition: "a base", why: "consumes base and the anion can compete as a nucleophile" });
    }
  }
  if (conditions.organometallic) {
    for (const group of ELECTROPHILIC) {
      out.push({ group, severity: "plausible", kind: "competing-electrophile", condition: "a carbanion reagent", why: "is an electrophile the reagent may also attack" });
    }
  }
  if (conditions.hydride) {
    for (const group of [...STRONGLY_ACIDIC, "alcohol", "amine-NH"] as GroupId[]) {
      out.push({ group, severity: "plausible", kind: "acid-base-quench", condition: "a metal hydride", why: "reacts with the hydride (excess reagent needed)" });
    }
    for (const group of ELECTROPHILIC) {
      out.push({ group, severity: "plausible", kind: "competing-reactivity", condition: "a metal hydride", why: "may be reduced as well" });
    }
  }
  if (conditions.radical) {
    for (const group of ["phenol", "aromatic-amine"] as GroupId[]) {
      out.push({ group, severity: "plausible", kind: "competing-reactivity", condition: "radical halogenation", why: "is strongly ring-activated (competing ring halogenation) and can quench radical chains" });
    }
    for (const group of ["alkene", "alkyne"] as GroupId[]) {
      out.push({ group, severity: "plausible", kind: "competing-reactivity", condition: "radical halogenation", why: "can add a halogen radical" });
    }
  }
  if (conditions.oxidant === "strong") {
    for (const group of OXIDIZABLE_STRONG) {
      out.push({ group, severity: "plausible", kind: "competing-reactivity", condition: "a strong oxidant", why: "may be oxidised as well" });
    }
  } else if (conditions.oxidant === "mild") {
    for (const group of ["thiol", "aromatic-amine"] as GroupId[]) {
      out.push({ group, severity: "plausible", kind: "competing-reactivity", condition: "an oxidant", why: "may be oxidised as well" });
    }
  }
  if (conditions.acid === "strong") {
    for (const group of ["acetal", "epoxide", "enol-ether"] as GroupId[]) {
      out.push({ group, severity: "plausible", kind: "competing-reactivity", condition: "strong acid", why: "is acid-sensitive" });
    }
    out.push({ group: "amine-NH", severity: "plausible", kind: "acid-base-quench", condition: "strong acid", why: "would be protonated" });
  }
  return out;
}

async function countGroup(smiles: string[], smarts: string): Promise<number> {
  const rdkit = await getRDKit();
  const query = getCompiledQuerySync(rdkit, smarts);
  if (!query) return 0;
  let total = 0;
  for (const part of smiles) {
    const mol = rdkit.get_mol(part);
    if (!mol) continue;
    try {
      const matches = JSON.parse(mol.get_substruct_matches(query));
      const heads = new Set<string>();
      if (Array.isArray(matches)) {
        for (const match of matches) {
          const atoms: number[] = Array.isArray(match) ? match : match?.atoms;
          // Distinct atom SETS: acetylene matches "terminal alkyne" from both ends.
          if (Array.isArray(atoms) && atoms.length > 0) heads.add([...atoms].sort((a, b) => a - b).join("-"));
        }
      }
      total += heads.size;
    } catch {
      /* an unparsable match list counts as zero */
    } finally {
      mol.delete();
    }
  }
  return total;
}

const stepCache = new Map<string, Promise<CompatibilityWarning[] | null>>();
const MAX_STEP_CACHE = 3000;

/**
 * Warnings for one step, or null when the rule carries no condition metadata (unassessed).
 * `reactants` and `products` are the step's component SMILES.
 */
export function assessStepCompatibility(
  rule: ReactionRule | undefined,
  reactants: string[],
  products: string[],
): Promise<CompatibilityWarning[] | null> {
  if (!rule || !rule.conditions) return Promise.resolve(null);
  const conditions = rule.conditions;
  const findings = relevantFindings(conditions);
  if (findings.length === 0) return Promise.resolve([]);

  const key = `${rule.id}|${[...reactants].sort().join(".")}>${[...products].sort().join(".")}`;
  const cached = stepCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const warnings: CompatibilityWarning[] = [];
    const seen = new Set<string>();
    for (const finding of findings) {
      if (seen.has(finding.group) || conditions.reactionCentre?.includes(finding.group)) continue;
      const { smarts, label } = GROUP_SMARTS[finding.group];
      const before = await countGroup(reactants, smarts);
      if (before === 0) continue;
      const surviving = Math.min(before, await countGroup(products, smarts));
      if (surviving === 0) continue;
      seen.add(finding.group);
      warnings.push({
        ruleId: rule.id,
        severity: finding.severity,
        kind: finding.kind,
        group: finding.group,
        condition: finding.condition,
        message: `${label} (${surviving} left unreacted) ${finding.why} under ${finding.condition}.`,
      });
    }
    return warnings;
  })();
  stepCache.set(key, pending);
  while (stepCache.size > MAX_STEP_CACHE) {
    const oldest = stepCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    stepCache.delete(oldest);
  }
  pending.catch(() => stepCache.delete(key));
  return pending;
}

/** Planning-cost units (a reaction step costs about 100). Advisory, so deliberately < 1 step. */
export function compatibilityPenalty(warnings: CompatibilityWarning[] | undefined): number {
  if (!warnings) return 0;
  return warnings.reduce((sum, item) => sum + (item.severity === "model-constraint" ? 80 : 25), 0);
}

/** Route length with advisory findings priced in, so a clean route can beat a slightly shorter flagged one. */
export function compatibilityAdjustedLength(steps: SynthesisStep[]): number {
  let length = steps.length;
  for (const step of steps) {
    for (const item of step.compatibility ?? []) length += item.severity === "model-constraint" ? 0.8 : 0.25;
  }
  return length;
}

export async function assessRouteCompatibility(
  route: MultistepSynthesisRoute,
  rules: ReactionRule[],
): Promise<RouteCompatibility> {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const warnings: CompatibilityWarning[] = [];
  const unassessed = new Set<string>();
  for (const step of route.steps) {
    const found = await assessStepCompatibility(byId.get(step.ruleId), step.reactantComponents, step.productComponents);
    if (found === null) unassessed.add(step.ruleId);
    else for (const item of found) warnings.push({ ...item, stepNumber: step.stepNumber });
  }
  return {
    warnings,
    unassessedRuleIds: [...unassessed].sort(),
    worst: warnings.some((w) => w.severity === "model-constraint")
      ? "model-constraint"
      : warnings.length > 0
        ? "plausible"
        : "none",
  };
}
