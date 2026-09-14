import type { ReactionPathway, ReactionRule } from "../reactions/reactionTypes";
import type { MechanisticStereoDirective } from "./runtime";

/**
 * Sources behind these invariants (also documented in the user-facing change log):
 * - OpenStax Organic Chemistry 14.4/14.5/30.6: Diels-Alder is a concerted
 *   thermal suprafacial [4+2], retains diene/dienophile stereochemistry, and
 *   commonly favors endo orientation for activated bicyclic products.
 * - Master Organic Chemistry, "Regiochemistry In The Diels-Alder Reaction":
 *   1-substituted electron-rich dienes favor the ortho-like 1,2 product;
 *   2-substituted electron-rich dienes favor the para-like 1,4 product.
 * - OpenStax 18.5: acid-catalyzed epoxide opening is backside/SN2-like and
 *   produces trans/anti opening; substitution effects control regioselectivity.
 * - OpenStax 8.2, 8.5, 8.6, 8.7: halogenation is anti; hydroboration,
 *   catalytic hydrogenation, and OsO4 hydroxylation are syn.
 * - OpenStax 11.2: SN2 gives backside inversion.
 */

export const STEREOCHEMISTRY_REFERENCE_URLS: Record<string, string> = {
  "openstax-da-14.4": "https://openstax.org/books/organic-chemistry/pages/14-4-the-diels-alder-cycloaddition-reaction",
  "openstax-da-14.5": "https://openstax.org/books/organic-chemistry/pages/14-5-characteristics-of-the-diels-alder-reaction",
  "openstax-da-30.6": "https://openstax.org/books/organic-chemistry/pages/30-6-stereochemistry-of-cycloadditions",
  "moc-da-regio": "https://www.masterorganicchemistry.com/2018/11/05/regiochemistry-in-the-diels-alder-reaction/",
  "openstax-epoxide-18.5": "https://openstax.org/books/organic-chemistry/pages/18-5-reactions-of-epoxides-ring-opening",
  "openstax-halogen-8.2": "https://openstax.org/books/organic-chemistry/pages/8-2-halogenation-of-alkenes-addition-of-x2",
  "openstax-hydroboration-8.5": "https://openstax.org/books/organic-chemistry/pages/8-5-hydration-of-alkenes-addition-of-h2o-by-hydroboration",
  "openstax-hydrogenation-8.6": "https://openstax.org/books/organic-chemistry/pages/8-6-reduction-of-alkenes-hydrogenation",
  "openstax-oxidation-8.7": "https://openstax.org/books/organic-chemistry/pages/8-7-oxidation-of-alkenes-epoxidation-and-hydroxylation",
  "openstax-sn2-11.2": "https://openstax.org/books/organic-chemistry/pages/11-2-the-sn2-reaction",
};

function customMode(rule: ReactionRule): string | null {
  if (rule.transform.type !== "customHandler") return null;
  const mode = rule.transform.options?.mode;
  return typeof mode === "string" ? mode : null;
}

/**
 * Convert chemistry metadata into a display directive. This intentionally does
 * NOT key off a specific substrate SMILES. One mechanistic rule applies to all
 * substrates that reach the same reaction rule.
 */
export function deriveMechanisticStereoDirective(
  rule: ReactionRule,
  pathway: ReactionPathway,
): MechanisticStereoDirective | null {
  const stereo = rule.selectivityProfile?.stereochemistry;
  const mechanismFamily = rule.mechanismProfile?.family;
  const mode = customMode(rule);

  if (mechanismFamily === "pericyclic-4+2" || mode === "dielsAlder") {
    return {
      kind: "diels-alder",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "back",
      relationship: "syn",
      referenceIds: ["openstax-da-14.4", "openstax-da-14.5", "openstax-da-30.6", "moc-da-regio"],
      dielsAlder: {
        dieneTerminalRelationship: null,
        dienophileGeometry: null,
        activatedDienophile: false,
      },
    };
  }

  if (
    mechanismFamily === "epoxidation-opening-sequence" ||
    mode === "epoxidationAcidicAlcoholOpening"
  ) {
    return {
      kind: "epoxide-alcohol-opening",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "front",
      relationship: "anti",
      referenceIds: ["openstax-epoxide-18.5"],
    };
  }

  if (stereo?.mode === "syn-addition") {
    return {
      kind: "syn-vicinal",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "back",
      relationship: "syn",
      referenceIds: [
        "openstax-hydroboration-8.5",
        "openstax-hydrogenation-8.6",
        "openstax-oxidation-8.7",
      ],
    };
  }

  if (stereo?.mode === "anti-addition") {
    return {
      kind: "anti-vicinal",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "front",
      relationship: "anti",
      referenceIds: ["openstax-halogen-8.2", "openstax-epoxide-18.5"],
    };
  }

  if (stereo?.mode === "inversion") {
    return {
      kind: "inversion",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "front",
      relationship: "inversion",
      referenceIds: ["openstax-sn2-11.2"],
    };
  }

  if (stereo?.mode === "retention") {
    return {
      kind: "retention",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "front",
      relationship: "retention",
      referenceIds: [],
    };
  }

  if (stereo?.mode === "racemization") {
    return {
      kind: "racemization",
      ruleId: rule.id,
      reactantSmiles: [...pathway.reactantComponents],
      representativeFace: "front",
      relationship: "racemic",
      referenceIds: [],
    };
  }

  return null;
}
