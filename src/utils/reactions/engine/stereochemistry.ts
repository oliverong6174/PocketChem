import { getRDKit } from "../../rdkit";

/**
 * Stereo-aware structure helpers used by forward search, retrosynthesis, and
 * product-mixture classification.
 *
 * Important: an isomeric canonical SMILES string and a connectivity-only
 * canonical SMILES string are both retained. Simply deleting @, /, and \\
 * tokens from an isomeric canonical SMILES is not sufficient because stereo
 * can influence canonical atom ordering. RDKit therefore generates the two
 * keys independently from the same molecular graph.
 */

export type StereoStructureMatch =
  | "exact"
  | "connectivity-only"
  | "stereo-conflict"
  | "different";

export type CanonicalStereoStructure = {
  /** Canonical isomeric SMILES. R/S and E/Z are retained. */
  isomeric: string;
  /** Canonical SMILES generated with stereochemistry omitted. */
  connectivity: string;
  hasSpecifiedStereo: boolean;
};

export function smilesHasSpecifiedStereo(smiles: string): boolean {
  return /@|[\\/]/.test(smiles);
}

/**
 * Legacy synchronous fallback for already-canonical strings.
 *
 * New search code should prefer `canonicalizeStereoStructure()` because RDKit
 * can canonicalize the achiral graph independently. This function remains for
 * small local operations where the products were just emitted by RDKit and a
 * synchronous key is useful.
 */
export function connectivityKeyFromCanonicalSmiles(smiles: string): string {
  return smiles
    .split(".")
    .map((component) => component.replace(/@@?/g, "").replace(/[\\/]/g, ""))
    .sort((a, b) => a.localeCompare(b))
    .join(".");
}

export async function canonicalizeStereoStructure(
  smiles: string,
): Promise<CanonicalStereoStructure | null> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;

  try {
    const isomeric = mol.get_smiles?.();
    const connectivity = mol.get_smiles?.(
      JSON.stringify({ doIsomericSmiles: false }),
    );

    if (
      typeof isomeric !== "string" ||
      !isomeric.trim() ||
      typeof connectivity !== "string" ||
      !connectivity.trim()
    ) {
      return null;
    }

    const normalizedIsomeric = isomeric.trim();
    return {
      isomeric: normalizedIsomeric,
      connectivity: connectivity.trim(),
      hasSpecifiedStereo: smilesHasSpecifiedStereo(normalizedIsomeric),
    };
  } catch {
    return null;
  } finally {
    mol.delete?.();
  }
}

export function compareStereoStructureKeys(
  left: CanonicalStereoStructure,
  right: CanonicalStereoStructure,
): StereoStructureMatch {
  if (left.isomeric === right.isomeric) return "exact";
  if (left.connectivity !== right.connectivity) return "different";

  if (left.hasSpecifiedStereo && right.hasSpecifiedStereo) {
    return "stereo-conflict";
  }

  return "connectivity-only";
}

export function compareCanonicalStereochemistry(
  leftCanonical: string,
  rightCanonical: string,
): StereoStructureMatch {
  if (leftCanonical === rightCanonical) return "exact";

  if (
    connectivityKeyFromCanonicalSmiles(leftCanonical) !==
    connectivityKeyFromCanonicalSmiles(rightCanonical)
  ) {
    return "different";
  }

  if (
    smilesHasSpecifiedStereo(leftCanonical) &&
    smilesHasSpecifiedStereo(rightCanonical)
  ) {
    return "stereo-conflict";
  }

  return "connectivity-only";
}

/**
 * Target matching is intentionally asymmetric. If the target explicitly
 * specifies R/S or E/Z, an unspecified product is not considered verified.
 * If the target itself is unspecified, a stereochemically defined product may
 * still satisfy the requested connectivity.
 */
export function compareProductStructureToTarget(
  product: CanonicalStereoStructure,
  target: CanonicalStereoStructure,
): StereoStructureMatch {
  const match = compareStereoStructureKeys(product, target);

  if (match === "connectivity-only" && target.hasSpecifiedStereo) {
    return "stereo-conflict";
  }

  return match;
}

export function compareProductCanonicalToTarget(
  productCanonical: string,
  targetCanonical: string,
): StereoStructureMatch {
  const match = compareCanonicalStereochemistry(productCanonical, targetCanonical);

  if (
    match === "connectivity-only" &&
    smilesHasSpecifiedStereo(targetCanonical)
  ) {
    return "stereo-conflict";
  }

  return match;
}

/**
 * Intermediate search fronts may meet through an unspecified structure, but
 * two explicitly different stereoisomers are not a valid bridge.
 */
export function canBridgeStereoStructures(
  left: CanonicalStereoStructure,
  right: CanonicalStereoStructure,
): boolean {
  const match = compareStereoStructureKeys(left, right);
  return match === "exact" || match === "connectivity-only";
}

export function canBridgeCanonicalStructures(
  leftCanonical: string,
  rightCanonical: string,
): boolean {
  const match = compareCanonicalStereochemistry(leftCanonical, rightCanonical);
  return match === "exact" || match === "connectivity-only";
}

/**
 * A route that is known to be a stereochemical mixture cannot satisfy an
 * explicitly stereodefined target merely because one member of the mixture has
 * the requested R/S or E/Z structure. It can satisfy an unspecified target.
 */
export function stereochemicalMixtureCanSatisfyTarget(
  mixtureKind: "racemic" | "diastereomeric" | "stereoisomeric" | null,
  target: CanonicalStereoStructure,
): boolean {
  return mixtureKind === null || !target.hasSpecifiedStereo;
}
