import type { FunctionalGroupResult } from "../functionalGroups/types";
import { BASE_SITE_RULES } from "./acidBase/baseSiteRegistry";
import { matchAcidBaseSites } from "./acidBase/matchSites";
import { getBaseSiteEnvironmentAdjustments } from "./acidBase/siteEnvironment";
import type { AcidBaseFactor } from "./acidBase/environmentTypes";
import type { AcidBaseConfidence } from "./acidBase/types";

export type BasicityResult = {
  relatedGroup: string;
  basicSite: string;
  siteAtomIndex: number;
  conjugateAcidPka: string;
  conjugateAcidPkaNumber: number;
  conjugateAcidPkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  baseConjugateAcidPkaNumber: number;
  strengthRank: number;
  factors: AcidBaseFactor[];
  modifiers: string[];
  explanation: string;
};

function formatPkaEstimate(value: number): string {
  return `~${value.toFixed(1)}`;
}

export async function analyzeBasicity(
  smiles: string,
  _functionalGroups: FunctionalGroupResult[]
): Promise<BasicityResult[]> {
  const sites = await matchAcidBaseSites(smiles, BASE_SITE_RULES, "base");
  const environmentAdjustments = await getBaseSiteEnvironmentAdjustments(
    smiles,
    sites
  );

  return sites
    .map(({ rule, atomIndex }) => {
      const adjustment = environmentAdjustments.get(atomIndex);
      const conjugateAcidPkaNumber = adjustment?.pkaCenter ?? rule.pkaCenter;
      const conjugateAcidPkaRange = adjustment?.pkaRange ?? rule.pkaRange;

      return {
        relatedGroup: adjustment?.relatedGroup ?? rule.relatedGroup,
        basicSite: rule.siteLabel,
        siteAtomIndex: atomIndex,
        conjugateAcidPka: formatPkaEstimate(conjugateAcidPkaNumber),
        conjugateAcidPkaNumber,
        conjugateAcidPkaRange,
        confidence: adjustment?.confidence ?? rule.confidence,
        baseConjugateAcidPkaNumber: rule.pkaCenter,
        strengthRank: rule.priority,
        factors: adjustment?.factors ?? [],
        modifiers: adjustment?.modifiers ?? [],
        explanation: adjustment?.explanation ?? rule.explanation,
      } satisfies BasicityResult;
    })
    .sort(
      (first, second) =>
        second.conjugateAcidPkaNumber - first.conjugateAcidPkaNumber ||
        first.siteAtomIndex - second.siteAtomIndex
    );
}