/**
 * Hammett para substituent constants sigma_p (Hansch, Leo & Taft, Chem. Rev. 1991, 91, 165-195). Positive values withdraw electrons from a
 * benzene ring, negative values donate. The constants are measured for substituents on a benzene ring, so they are applied here only to
 * substituents attached to an aromatic carbon; aliphatic functional groups are mapped to the sigma_p of the same substituent as a stated
 * approximation (see GROUP_SIGMA_P).
 */
export type HammettSubstituent = { name: string; smarts: string; sigmaP: number };

/** First atom of every pattern is the aromatic ring carbon; the substituent hangs from the second. Order does not matter: the extreme wins. */
export const AROMATIC_SUBSTITUENTS: HammettSubstituent[] = [
  { name: "NO2", smarts: "c[N+](=O)[O-]", sigmaP: 0.78 },
  { name: "N(CH3)3+", smarts: "c[N+;X4]([CH3])([CH3])[CH3]", sigmaP: 0.82 },
  { name: "NH3+", smarts: "c[N+;H3]", sigmaP: 0.6 },
  { name: "SO2R", smarts: "cS(=O)(=O)[#6]", sigmaP: 0.72 },
  { name: "SO2NH2", smarts: "cS(=O)(=O)[NX3H2]", sigmaP: 0.6 },
  { name: "CN", smarts: "cC#N", sigmaP: 0.66 },
  { name: "COCl", smarts: "c[CX3](=O)Cl", sigmaP: 0.61 },
  { name: "CF3", smarts: "cC(F)(F)F", sigmaP: 0.54 },
  { name: "COR", smarts: "c[CX3](=O)[#6]", sigmaP: 0.5 },
  { name: "COOH", smarts: "c[CX3](=O)[OX2H1]", sigmaP: 0.45 },
  { name: "COOR", smarts: "c[CX3](=O)[OX2H0][#6]", sigmaP: 0.45 },
  { name: "CHO", smarts: "c[CX3H1]=O", sigmaP: 0.42 },
  { name: "CONH2", smarts: "c[CX3](=O)[NX3H2]", sigmaP: 0.36 },
  { name: "OCOR", smarts: "c[OX2]C(=O)[#6]", sigmaP: 0.31 },
  { name: "C≡CH", smarts: "cC#[CH]", sigmaP: 0.23 },
  { name: "Cl", smarts: "c[Cl]", sigmaP: 0.23 },
  { name: "Br", smarts: "c[Br]", sigmaP: 0.23 },
  { name: "I", smarts: "c[I]", sigmaP: 0.18 },
  { name: "SH", smarts: "c[SX2H1]", sigmaP: 0.15 },
  { name: "F", smarts: "c[F]", sigmaP: 0.06 },
  { name: "SR", smarts: "c[SX2H0][CX4]", sigmaP: 0.0 },
  { name: "NHCOR", smarts: "c[NX3H1]C(=O)[#6]", sigmaP: 0.0 },
  { name: "C6H5", smarts: "c-c", sigmaP: -0.01 },
  { name: "OPh", smarts: "c[OX2H0]c", sigmaP: -0.03 },
  { name: "CH=CH2", smarts: "c[CX3]=[CX3]", sigmaP: -0.04 },
  { name: "CH2R", smarts: "c[CX4H2][#6]", sigmaP: -0.15 },
  { name: "CH(R)2", smarts: "c[CX4H1]([#6])[#6]", sigmaP: -0.15 },
  { name: "CH3", smarts: "c[CH3]", sigmaP: -0.17 },
  { name: "C(CH3)3", smarts: "c[CX4H0]([CH3])([CH3])[CH3]", sigmaP: -0.2 },
  { name: "OCH3 / OR", smarts: "c[OX2H0][CX4]", sigmaP: -0.27 },
  { name: "OH", smarts: "c[OX2H1]", sigmaP: -0.37 },
  { name: "NHC4H9", smarts: "c[NX3H1][CX4;!$([CH3]);!$([CH2][CH3])]", sigmaP: -0.51 },
  { name: "NHC2H5", smarts: "c[NX3H1][CH2][CH3]", sigmaP: -0.61 },
  { name: "NH2", smarts: "c[NX3H2]", sigmaP: -0.66 },
  { name: "NHCH3", smarts: "c[NX3H1][CH3]", sigmaP: -0.7 },
  { name: "N(CH3)2", smarts: "c[NX3H0]([CX4])[CX4]", sigmaP: -0.83 },
  { name: "O-", smarts: "c[OX1-]", sigmaP: -0.81 },
];

/**
 * Aliphatic functional groups recognised by name, expressed as the sigma_p of the corresponding substituent. This puts every molecule on one
 * scale; for groups that are not a single substituent on a ring (anhydride, enone...) the nearest substituent is used, which is an
 * approximation, so the value is a rank, not a measured sigma.
 */
export const GROUP_SIGMA_P: Record<string, number> = {
  "Quaternary ammonium": 0.82,
  "Ammonium ion": 0.6,
  Benzenediazonium: 1.91,
  Nitro: 0.78,
  Nitrobenzene: 0.78,
  "Sulfonyl chloride": 0.84,
  "Acyl halide": 0.61,
  Nitrile: 0.66,
  Sulfone: 0.72,
  "Acid anhydride": 0.5,
  Ketone: 0.5,
  Enone: 0.5,
  "Carboxylic acid": 0.45,
  "Benzoic acid": 0.45,
  Ester: 0.45,
  Enoate: 0.45,
  Aldehyde: 0.42,
  Benzaldehyde: 0.42,
  Enal: 0.42,
  Sulfonamide: 0.6,
  Amide: 0.36,
  Chloride: 0.23,
  Bromide: 0.23,
  "Aryl halide": 0.23,
  Iodide: 0.18,
  Fluoride: 0.06,
  Phenoxide: -0.81,
  Alkoxide: -0.81,
  Aniline: -0.66,
  "Aryl amine": -0.66,
  Amine: -0.66,
  "Primary amine": -0.66,
  "Secondary amine": -0.7,
  "Tertiary amine": -0.83,
  Enamine: -0.83,
  "Aryl ether": -0.27,
  Anisole: -0.27,
  Phenol: -0.37,
  Alkylbenzene: -0.17,
};

export type HammettEffect = { name: string; sigmaP: number };
export type AromaticHammettEffects = {
  /** True when at least one tabulated substituent sits on an aromatic carbon; the aromatic result then replaces the name-based fallback. */
  found: boolean;
  strongestWithdrawing: HammettEffect | null;
  strongestDonating: HammettEffect | null;
};

type RdkitLike = { get_qmol: (smarts: string) => { delete?: () => void } | null };
type MolLike = { get_substruct_matches?: (query: unknown) => string };

/** Strongest tabulated sigma_p withdrawing and donating substituents on aromatic carbons of one molecule. */
export function aromaticHammettEffects(rdkit: RdkitLike, mol: MolLike): AromaticHammettEffects {
  let withdrawing: HammettEffect | null = null;
  let donating: HammettEffect | null = null;
  let found = false;
  for (const substituent of AROMATIC_SUBSTITUENTS) {
    const query = rdkit.get_qmol(substituent.smarts);
    if (!query) continue;
    try {
      const parsed = JSON.parse(mol.get_substruct_matches?.(query) ?? "[]");
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
    } catch {
      continue;
    } finally {
      query.delete?.();
    }
    found = true;
    if (substituent.sigmaP > 0 && (!withdrawing || substituent.sigmaP > withdrawing.sigmaP)) {
      withdrawing = { name: substituent.name, sigmaP: substituent.sigmaP };
    }
    if (substituent.sigmaP < 0 && (!donating || substituent.sigmaP < donating.sigmaP)) {
      donating = { name: substituent.name, sigmaP: substituent.sigmaP };
    }
  }
  return { found, strongestWithdrawing: withdrawing, strongestDonating: donating };
}
