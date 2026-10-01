import type { FunctionalGroupHierarchy } from "../functionalGroups/types";
import type { MassSpectrumResult } from "../spectroscopy/types";
import { COMPARISON_MODES } from "./comparisonModes";
import type {
  ComparisonMetric,
  ComparisonModeId,
  ComparisonProfile,
} from "./comparisonTypes";
import {
  descriptorNumber,
  emptyMetric,
  groupNames,
} from "./comparisonUtils";
import { applyEwgEdgMetrics } from "./electronic/ewgEdg";
import { applyInductiveMetrics } from "./electronic/inductiveEffects";
import { applyResonanceEffectMetrics } from "./electronic/resonanceEffects";
import { applyStabilityMetrics } from "./stability/stabilityComparisons";
import { applySubstitutionMetrics } from "./reactivity/substitution";
import { applyEliminationMetrics } from "./reactivity/elimination";
import { applyDielsAlderMetrics } from "./reactivity/dielsAlder";
import { applyAromaticReactivityMetrics } from "./reactivity/aromaticReactivity";
import { applySpectroscopyMetrics } from "./spectroscopy/spectroscopyComparisons";
import { applyPhysicalMetrics } from "./physical/physicalComparisons";
import { applyStructureMetrics } from "./structure/structureComparisons";

export {
  COMPARISON_CATEGORIES,
  COMPARISON_MODES,
  getComparisonMode,
  rankComparisonEntries,
} from "./comparisonModes";
export type {
  ComparisonCategory,
  ComparisonMetric,
  ComparisonModeDefinition,
  ComparisonModeId,
  ComparisonProfile,
} from "./comparisonTypes";

async function safeAnalysis<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.warn(`[PocketChem:Ranking] ${label} analysis failed`, error);
    return fallback;
  }
}

function createEmptyMetrics(): Record<ComparisonModeId, ComparisonMetric> {
  return Object.fromEntries(
    COMPARISON_MODES.map((mode) => [
      mode.id,
      emptyMetric(
        "No applicable structural feature was detected for this comparison.",
      ),
    ]),
  ) as Record<ComparisonModeId, ComparisonMetric>;
}

export async function analyzeComparisonMolecule(
  smiles: string,
  hierarchy: FunctionalGroupHierarchy,
): Promise<ComparisonProfile> {
  const [
    { getRDKit },
    { parseMolBlock },
    { calculateAtomCounts, buildFormula, safeParseDescriptors },
    acidityModule,
    basicityModule,
    anionModule,
    cationModule,
    radicalModule,
    boilingModule,
    solubilityModule,
    cipModule,
    nmrModule,
    irModule,
    massModule,
  ] = await Promise.all([
    import("../rdkit"),
    import("../nomenclature/molParser"),
    import("../nomenclature/properties"),
    import("./acidBase/analyzeAcidity"),
    import("./acidBase/analyzeBasicity"),
    import("./stability/anionStability"),
    import("./stability/cationStability"),
    import("./stability/radicalStability"),
    import("./physical/boilingPoint"),
    import("./physical/solubility"),
    import("./structure/cipPriority"),
    import("../spectroscopy/nmrPrediction"),
    import("../spectroscopy/irRules"),
    import("../spectroscopy/massSpec"),
  ]);

  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);
  if (!mol) throw new Error("Could not create molecule for comparison analysis.");

  try {
    const graph = parseMolBlock(mol.get_molblock());
    const descriptorMol = mol as { get_descriptors?: () => unknown };
    const descriptors = safeParseDescriptors(
      descriptorMol.get_descriptors?.(),
    ) as Record<string, unknown>;
    const counts = calculateAtomCounts(graph);
    const formula = buildFormula(counts);
    const exactMass = descriptorNumber(descriptors, [
      "exactmw",
      "ExactMolWt",
      "exactMolWt",
    ]);
    const molecularWeight = descriptorNumber(descriptors, [
      "amw",
      "MolWt",
      "molwt",
    ]);
    const tpsa = descriptorNumber(descriptors, ["tpsa", "TPSA"]);
    const logP = descriptorNumber(descriptors, [
      "CrippenClogP",
      "MolLogP",
      "logp",
    ]);
    const hbd = descriptorNumber(descriptors, [
      "lipinskiHBD",
      "NumHDonors",
      "hbd",
    ]);
    const hba = descriptorNumber(descriptors, [
      "lipinskiHBA",
      "NumHAcceptors",
      "hba",
    ]);
    const rotatableBonds = descriptorNumber(descriptors, [
      "NumRotatableBonds",
      "numRotatableBonds",
    ]);
    const ringCount = descriptorNumber(descriptors, ["NumRings", "numRings"]);
    const names = groupNames(hierarchy.functionalGroups);

    const [
      acidity,
      basicity,
      anionResults,
      cationResults,
      radicalResults,
      boiling,
      solubility,
      cip,
      nmr,
      ir,
      massSpec,
    ] = await Promise.all([
      safeAnalysis(
        "acidity",
        acidityModule.analyzeAcidity(smiles, hierarchy.primaryGroups),
        [],
      ),
      safeAnalysis(
        "basicity",
        basicityModule.analyzeBasicity(smiles, hierarchy.primaryGroups),
        [],
      ),
      safeAnalysis("carbanion", anionModule.analyzeCarbanionStability(smiles), []),
      safeAnalysis("carbocation", cationModule.analyzeCarbocationStability(smiles), []),
      safeAnalysis("radical", radicalModule.analyzeCarbonRadicalStability(smiles), []),
      safeAnalysis(
        "boiling point",
        boilingModule.analyzeBoilingPointRanking(
          smiles,
          hierarchy.functionalGroups,
        ),
        null,
      ),
      safeAnalysis(
        "solubility",
        solubilityModule.analyzeSolubilityRanking(
          smiles,
          hierarchy.functionalGroups,
        ),
        null,
      ),
      safeAnalysis("CIP", cipModule.analyzeCipSubstituentPriority(smiles), null),
      safeAnalysis("NMR", nmrModule.predictStructureNMR(smiles), {
        protonNMR: [],
        carbonNMR: [],
      }),
      safeAnalysis(
        "IR",
        irModule.predictRuleBasedIR(hierarchy.functionalGroups, smiles),
        [],
      ),
      safeAnalysis<MassSpectrumResult>(
        "mass spectrum",
        massModule.predictMassSpectrum(
          formula,
          exactMass,
          hierarchy.functionalGroups,
          smiles,
        ),
        {
          formula,
          molecularIonMz: exactMass,
          nominalMass: null,
          basePeakMz: null,
          peaks: [],
          notes: [],
        },
      ),
    ]);

    const metrics = createEmptyMetrics();
    const { strongestEwg, strongestEdg } = applyEwgEdgMetrics(metrics, names);
    const strongestInductive = applyInductiveMetrics(metrics, names);
    const { strongestResDonor, strongestResWithdrawer } =
      applyResonanceEffectMetrics(metrics, names);

    const delocalization = applyStabilityMetrics(
      metrics,
      graph,
      acidity,
      basicity,
      anionModule.getBestCarbanionStabilityResult(anionResults),
      cationModule.getBestCarbocationStabilityResult(cationResults),
      radicalModule.getBestCarbonRadicalStabilityResult(radicalResults),
    );

    const { leavingGroup, carbonyl } = applySubstitutionMetrics(
      metrics,
      graph,
      names,
      strongestEwg,
    );
    applyEliminationMetrics(metrics, leavingGroup);
    applyDielsAlderMetrics(metrics, graph, names, strongestEwg, strongestEdg);
    applyAromaticReactivityMetrics(
      metrics,
      names,
      delocalization,
      strongestEwg,
      strongestEdg,
      strongestInductive,
      strongestResDonor,
      strongestResWithdrawer,
      leavingGroup,
    );

    applySpectroscopyMetrics(metrics, formula, nmr, ir, massSpec);

    const physical = applyPhysicalMetrics(
      metrics,
      graph,
      counts,
      {
        molecularWeight,
        tpsa,
        logP,
        hbd,
        hba,
        rotatableBonds,
        ringCount,
      },
      delocalization,
      strongestEwg,
      carbonyl,
      boiling,
      solubility,
    );

    applyStructureMetrics(
      metrics,
      cip,
      physical.heavyAtoms,
      physical.branching,
      ringCount,
      rotatableBonds,
      physical.rigidityScore,
    );

    return { formula, metrics };
  } finally {
    mol.delete?.();
  }
}
