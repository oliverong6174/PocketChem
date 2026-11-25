import type { ComparisonMetric, ComparisonModeId } from "../comparisonTypes";
import { metric, strongestNamedEffect, type NamedEffect } from "../comparisonUtils";
import { GROUP_SIGMA_P, type AromaticHammettEffects, type HammettEffect } from "./hammett";

const EWG_WEIGHTS: Record<string, number> = {
  "Quaternary ammonium": 5,
  "Ammonium ion": 5,
  Benzenediazonium: 5,
  Nitro: 4.8,
  Nitrobenzene: 4.8,
  "Sulfonyl chloride": 4.7,
  "Acyl halide": 4.6,
  Nitrile: 4.4,
  Isocyanate: 4.2,
  Isothiocyanate: 4.1,
  "Acid anhydride": 4.1,
  Aldehyde: 4,
  Benzaldehyde: 4,
  Enal: 4,
  Ketone: 3.8,
  Enone: 4,
  Sulfone: 4,
  "Carboxylic acid": 3.6,
  "Benzoic acid": 3.7,
  Ester: 3.5,
  Enoate: 3.7,
  Amide: 3,
  "Sulfonamide": 3.2,
  "Aryl halide": 1.6,
  Fluoride: 2,
  Chloride: 1.6,
  Bromide: 1.4,
  Iodide: 1.2,
};

const EDG_WEIGHTS: Record<string, number> = {
  Phenoxide: 5,
  Alkoxide: 4.9,
  "Amide anion": 4.9,
  Aniline: 4.6,
  "Aryl amine": 4.6,
  Enamine: 4.5,
  "Aryl ether": 4.2,
  Anisole: 4.2,
  Phenol: 4,
  Amine: 3.7,
  "Primary amine": 3.8,
  "Secondary amine": 3.9,
  "Tertiary amine": 4,
  Pyrrole: 3.8,
  Indole: 3.6,
  "Alkylbenzene": 1.8,
};

export type DonorAcceptorEffects = {
  strongestEwg: NamedEffect;
  strongestEdg: NamedEffect;
};

export function applyEwgEdgMetrics(
  metrics: Record<ComparisonModeId, ComparisonMetric>,
  names: string[],
  aromatic: AromaticHammettEffects | null = null,
): DonorAcceptorEffects {
  const strongestEwg = strongestNamedEffect(names, EWG_WEIGHTS);
  const strongestEdg = strongestNamedEffect(names, EDG_WEIGHTS);

  // One scale for both modes: Hammett sigma_p (Hansch, Leo & Taft 1991). Tabulated ring substituents decide when the molecule has any; otherwise
  // the recognised functional groups are mapped to the sigma_p of the matching substituent. The 0-5 weights above stay for the other modes.
  let withdrawing: HammettEffect | null = null;
  let donating: HammettEffect | null = null;
  if (aromatic?.found) {
    withdrawing = aromatic.strongestWithdrawing;
    donating = aromatic.strongestDonating;
  } else {
    for (const name of names) {
      const sigma = GROUP_SIGMA_P[name];
      if (sigma === undefined) continue;
      if (sigma > 0 && (!withdrawing || sigma > withdrawing.sigmaP)) withdrawing = { name, sigmaP: sigma };
      if (sigma < 0 && (!donating || sigma < donating.sigmaP)) donating = { name, sigmaP: sigma };
    }
  }
  const basis = aromatic?.found
    ? "Hammett sigma_p of the ring substituent (Hansch, Leo & Taft, Chem. Rev. 1991)."
    : "Functional group mapped to the sigma_p of the matching substituent (an approximation for non-aromatic groups).";

  metrics.ewgStrength = metric(
    withdrawing ? withdrawing.sigmaP : null,
    withdrawing ? `${withdrawing.name}, σp +${withdrawing.sigmaP.toFixed(2)}` : "No tabulated electron-withdrawing substituent",
    `Strongest withdrawing substituent by ${basis}`,
  );
  metrics.edgStrength = metric(
    donating ? -donating.sigmaP : null,
    donating ? `${donating.name}, σp ${donating.sigmaP.toFixed(2)}` : "No tabulated electron-donating substituent",
    `Strongest donating substituent by ${basis}`,
  );

  return { strongestEwg, strongestEdg };
}
