import { analyzeFunctionalGroupHierarchy } from "../../functionalGroups";
import type { FunctionalGroupResult } from "../../functionalGroups";
import type { ReactionComponent } from "../reactionTypes";
import { GRIGNARD_HALOGENS } from "../organometallic";

function nextRGroupMapFactory() {
  let next = 1;
  return (requested?: string) => {
    const parsed = requested ? Number.parseInt(requested, 10) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      next = Math.max(next, parsed + 1);
      return parsed;
    }
    return next++;
  };
}

/**
 * Ketcher can emit wildcard atoms directly, while pseudo/R-group labels may
 * appear as R, R1, [R], or [R1] depending on how the structure was entered.
 * RDKit understands wildcard atoms, so normalize the common label forms to
 * mapped wildcard atoms and leave existing `*`/`[*:n]` atoms untouched.
 */
export function normalizeKetcherRGroups(smiles: string): string {
  const allocateMap = nextRGroupMapFactory();

  let normalized = smiles.trim();

  normalized = normalized.replace(/\[R(\d*)\]/g, (_match, number: string) => {
    return `[*:${allocateMap(number || undefined)}]`;
  });

  normalized = normalized.replace(
    /(^|[.()=#+-])R(\d+)(?=$|[.()=#+-])/g,
    (_match, prefix: string, number: string) =>
      `${prefix}[*:${allocateMap(number)}]`
  );

  normalized = normalized.replace(
    /(^|[.()=#+-])R(?=$|[.()=#+-])/g,
    (_match, prefix: string) => `${prefix}[*:${allocateMap()}]`
  );

  return normalized;
}

function isMetalFragment(fragment: string, element: string): boolean {
  const bracketed = new RegExp(`\\[${element}(?:[^\\]]*)\\]`, "i");
  const bare = new RegExp(`(^|[^A-Za-z])${element}([^a-z]|$)`, "i");
  return bracketed.test(fragment) || bare.test(fragment);
}

function standaloneElement(fragment: string): string | null {
  const clean = fragment.trim();
  const bracketed = /^\[([A-Z][a-z]?)[^\]]*\]$/.exec(clean);
  if (bracketed) return bracketed[1];
  const bare = /^([A-Z][a-z]?)$/.exec(clean);
  return bare?.[1] ?? null;
}


function bondMagnesiumToHalide(
  fragment: string,
  halideFragment: string,
): string | null {
  const halogen = standaloneElement(halideFragment);
  if (!halogen || !GRIGNARD_HALOGENS.includes(halogen as (typeof GRIGNARD_HALOGENS)[number])) {
    return null;
  }

  // Ketcher commonly serializes a Grignard reagent as R[Mg+].[Br-].
  // Convert that ion-pair representation into the bonded R-Mg-Br form used
  // consistently by the reaction SMARTS catalog.  Do not do this for fluoride
  // or arbitrary magnesium salts: those are not the standard Grignard reagent
  // class represented by the O-Chem rules.
  if (/\[Mg[^\]]*\]/i.test(fragment)) {
    return fragment.replace(/\[Mg[^\]]*\]/i, `[Mg](${halogen})`);
  }

  return null;
}

function bondLithiumToCarbanion(fragment: string): string | null {
  // Common Ketcher/RDKit ionic organolithium serialization: R[C-].[Li+].
  // Convert the charged carbon representation to the bonded R-C-Li form used
  // by the reaction SMARTS catalog. This is structural normalization, not a
  // molecule-specific exception.
  const bracketedCarbonAnion = /\[([^\]]*[Cc][^\]]*?)-\]/;
  if (!bracketedCarbonAnion.test(fragment)) return null;
  return fragment.replace(bracketedCarbonAnion, "[$1]([Li])");
}

/**
 * Keep ionic organometallic salts together as one logical structural reactant.
 * Ketcher/RDKit can serialize e.g. a Grignard reagent as
 * `CC[Mg+].[Br-]`.  Treating the bromide as a separate drawn reactant caused
 * the reaction matcher and the input-name display to think three molecules
 * were present when the student had really drawn only a carbonyl + RMgBr.
 */
function coalesceOrganometallicIonPairs(parts: string[]): string[] {
  const consumed = new Set<number>();
  const grouped: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    if (consumed.has(index)) continue;
    const part = parts[index];

    const bondedLithium = bondLithiumToCarbanion(part);
    if (bondedLithium) {
      const lithiumIndex = parts.findIndex((candidate, candidateIndex) => {
        if (candidateIndex === index || consumed.has(candidateIndex)) return false;
        return standaloneElement(candidate) === "Li";
      });

      if (lithiumIndex >= 0) {
        consumed.add(lithiumIndex);
        grouped.push(bondedLithium);
        continue;
      }
    }

    if (standaloneElement(part) === "Li") {
      const carbanionIndex = parts.findIndex((candidate, candidateIndex) => {
        if (candidateIndex === index || consumed.has(candidateIndex)) return false;
        return Boolean(bondLithiumToCarbanion(candidate));
      });

      if (carbanionIndex >= 0) {
        consumed.add(carbanionIndex);
        grouped.push(bondLithiumToCarbanion(parts[carbanionIndex])!);
        continue;
      }
    }

    const isMg = isMetalFragment(part, "Mg");
    const isZn = isMetalFragment(part, "Zn");
    const isCu = isMetalFragment(part, "Cu");

    if (isMg || isZn) {
      const allowedCounterions = isMg
        ? new Set<string>(GRIGNARD_HALOGENS)
        : new Set<string>(["F", "Cl", "Br", "I"]);

      const counterionIndex = parts.findIndex((candidate, candidateIndex) => {
        if (candidateIndex === index || consumed.has(candidateIndex)) return false;
        return allowedCounterions.has(standaloneElement(candidate) ?? "");
      });

      if (counterionIndex >= 0) {
        consumed.add(counterionIndex);

        if (isMg) {
          const bonded = bondMagnesiumToHalide(part, parts[counterionIndex]);
          grouped.push(bonded ?? `${part}.${parts[counterionIndex]}`);
        } else {
          grouped.push(`${part}.${parts[counterionIndex]}`);
        }
        continue;
      }
    }

    if (isCu) {
      const lithiumIndex = parts.findIndex((candidate, candidateIndex) => {
        if (candidateIndex === index || consumed.has(candidateIndex)) return false;
        return standaloneElement(candidate) === "Li";
      });

      if (lithiumIndex >= 0) {
        consumed.add(lithiumIndex);
        grouped.push(`${parts[lithiumIndex]}.${part}`);
        continue;
      }
    }

    grouped.push(part);
  }

  return grouped;
}

export function splitReactionComponents(smiles: string): string[] {
  const parts = normalizeKetcherRGroups(smiles)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  return coalesceOrganometallicIonPairs(parts);
}

export function isGenericReactionSmiles(smiles: string): boolean {
  const normalized = normalizeKetcherRGroups(smiles);
  return normalized.includes("*");
}

export async function analyzeReactionComponents(
  smiles: string,
  singleReactantFunctionalGroups: FunctionalGroupResult[] = []
): Promise<ReactionComponent[]> {
  const componentSmiles = splitReactionComponents(smiles);

  const components: ReactionComponent[] = [];

  for (let index = 0; index < componentSmiles.length; index += 1) {
    const component = componentSmiles[index];
    let functionalGroups: FunctionalGroupResult[] = [];

    if (componentSmiles.length === 1 && singleReactantFunctionalGroups.length > 0) {
      functionalGroups = singleReactantFunctionalGroups;
    } else {
      try {
        const hierarchy = await analyzeFunctionalGroupHierarchy(component);
        functionalGroups = hierarchy.primaryGroups ?? [];
      } catch (error) {
        console.warn("Reaction component analysis failed:", component, error);
      }
    }

    components.push({
      smiles: component,
      functionalGroups,
      isGeneric: isGenericReactionSmiles(component),
    });
  }

  return components;
}
