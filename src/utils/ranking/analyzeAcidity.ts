import type { FunctionalGroupResult } from "../functionalGroups/types";
import { ACID_SITE_RULES } from "./acidBase/acidSiteRegistry";
import { matchAcidBaseSites } from "./acidBase/matchSites";
import { getAcidSiteEnvironmentAdjustments } from "./acidBase/siteEnvironment";
import type { AcidBaseFactor } from "./acidBase/environmentTypes";
import type { AcidBaseConfidence } from "./acidBase/types";

export type AcidityResult = {
  relatedGroup: string;
  acidicSite: string;
  siteAtomIndex: number;
  estimatedPka: string;
  estimatedPkaNumber: number;
  estimatedPkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  basePkaNumber: number;
  strengthRank: number;
  atom: string;
  resonance: string;
  induction: string;
  orbital: string;
  factors: AcidBaseFactor[];
  modifiers: string[];
  explanation: string;
};

function formatPkaEstimate(value: number): string {
  return `~${value.toFixed(1)}`;
}

export async function analyzeAcidity(
  smiles: string,
  _functionalGroups: FunctionalGroupResult[]
): Promise<AcidityResult[]> {
  const sites = await matchAcidBaseSites(smiles, ACID_SITE_RULES, "acid");
  const environmentAdjustments = await getAcidSiteEnvironmentAdjustments(
    smiles,
    sites
  );

  return sites
    .map(({ rule, atomIndex }) => {
      const adjustment = environmentAdjustments.get(atomIndex);
      const estimatedPkaNumber = adjustment?.pkaCenter ?? rule.pkaCenter;
      const estimatedPkaRange = adjustment?.pkaRange ?? rule.pkaRange;

      return {
        relatedGroup: adjustment?.relatedGroup ?? rule.relatedGroup,
        acidicSite: rule.siteLabel,
        siteAtomIndex: atomIndex,
        estimatedPka: formatPkaEstimate(estimatedPkaNumber),
        estimatedPkaNumber,
        estimatedPkaRange,
        confidence: adjustment?.confidence ?? rule.confidence,
        basePkaNumber: rule.pkaCenter,
        strengthRank: rule.priority,
        atom: rule.atom,
        resonance: rule.resonance,
        induction: adjustment?.induction ?? rule.induction,
        orbital: rule.orbital,
        factors: adjustment?.factors ?? [],
        modifiers: adjustment?.modifiers ?? [],
        explanation: adjustment?.explanation ?? rule.explanation,
      } satisfies AcidityResult;
    })
    .sort(
      (first, second) =>
        first.estimatedPkaNumber - second.estimatedPkaNumber ||
        first.siteAtomIndex - second.siteAtomIndex
    );
}