import { MolecularEnvironmentGraph } from "./environmentGraph";
import { evaluateAcidBaseSite } from "./evaluateSite";
import type {
  AcidBaseFactor,
  SiteEnvironment,
} from "./environmentTypes";
import type {
  AcidBaseConfidence,
  MatchedAcidBaseSite,
} from "./types";

export type {
  AcidBaseFactor,
  SiteEnvironment,
  SiteEvaluation,
  SiteHybridization,
  WithdrawingFeatureKind,
  WithdrawingFeatureMatch,
} from "./environmentTypes";

export type AcidSiteEnvironmentAdjustment = {
  relatedGroup: string;
  pkaCenter: number;
  pkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  induction: string;
  factors: AcidBaseFactor[];
  modifiers: string[];
  explanation: string;
};

export type BaseSiteEnvironmentAdjustment = {
  relatedGroup: string;
  pkaCenter: number;
  pkaRange: readonly [number, number];
  confidence: AcidBaseConfidence;
  factors: AcidBaseFactor[];
  modifiers: string[];
  explanation: string;
};

export class AcidBaseSiteEnvironmentAnalyzer {
  private readonly graph: MolecularEnvironmentGraph;

  private constructor(graph: MolecularEnvironmentGraph) {
    this.graph = graph;
  }

  static async create(
    smiles: string
  ): Promise<AcidBaseSiteEnvironmentAnalyzer | null> {
    const graph = await MolecularEnvironmentGraph.create(smiles);
    return graph ? new AcidBaseSiteEnvironmentAnalyzer(graph) : null;
  }

  dispose(): void {
    this.graph.dispose();
  }

  buildEnvironment(site: MatchedAcidBaseSite): SiteEnvironment {
    return this.graph.buildSiteEnvironment(site);
  }

  getAcidAdjustment(
    site: MatchedAcidBaseSite
  ): AcidSiteEnvironmentAdjustment {
    const evaluation = evaluateAcidBaseSite(
      "acid",
      site,
      this.buildEnvironment(site)
    );

    return {
      relatedGroup: evaluation.relatedGroup,
      pkaCenter: evaluation.pkaCenter,
      pkaRange: evaluation.pkaRange,
      confidence: evaluation.confidence,
      induction: evaluation.induction,
      factors: evaluation.factors,
      modifiers: evaluation.modifiers,
      explanation: evaluation.explanation,
    };
  }

  getBaseAdjustment(
    site: MatchedAcidBaseSite
  ): BaseSiteEnvironmentAdjustment {
    const evaluation = evaluateAcidBaseSite(
      "base",
      site,
      this.buildEnvironment(site)
    );

    return {
      relatedGroup: evaluation.relatedGroup,
      pkaCenter: evaluation.pkaCenter,
      pkaRange: evaluation.pkaRange,
      confidence: evaluation.confidence,
      factors: evaluation.factors,
      modifiers: evaluation.modifiers,
      explanation: evaluation.explanation,
    };
  }
}

export async function getAcidSiteEnvironmentAdjustments(
  smiles: string,
  sites: readonly MatchedAcidBaseSite[]
): Promise<Map<number, AcidSiteEnvironmentAdjustment>> {
  const adjustments = new Map<number, AcidSiteEnvironmentAdjustment>();
  if (sites.length === 0) return adjustments;

  const analyzer = await AcidBaseSiteEnvironmentAnalyzer.create(smiles);
  if (!analyzer) return adjustments;

  try {
    for (const site of sites) {
      adjustments.set(site.atomIndex, analyzer.getAcidAdjustment(site));
    }
  } finally {
    analyzer.dispose();
  }

  return adjustments;
}

export async function getBaseSiteEnvironmentAdjustments(
  smiles: string,
  sites: readonly MatchedAcidBaseSite[]
): Promise<Map<number, BaseSiteEnvironmentAdjustment>> {
  const adjustments = new Map<number, BaseSiteEnvironmentAdjustment>();
  if (sites.length === 0) return adjustments;

  const analyzer = await AcidBaseSiteEnvironmentAnalyzer.create(smiles);
  if (!analyzer) return adjustments;

  try {
    for (const site of sites) {
      adjustments.set(site.atomIndex, analyzer.getBaseAdjustment(site));
    }
  } finally {
    analyzer.dispose();
  }

  return adjustments;
}