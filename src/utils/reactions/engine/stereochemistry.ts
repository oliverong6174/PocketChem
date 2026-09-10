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

/**
 * Flip every tetrahedral `@`/`@@` descriptor in a SMILES string while leaving
 * E/Z bond notation untouched. Because the neighbour order in the source
 * SMILES is preserved, this constructs the molecular mirror image for ordinary
 * tetrahedral O-Chem stereocenters without relying on atom indices that may be
 * reordered by canonicalization.
 */
export function invertTetrahedralSmiles(smiles: string): string {
  return smiles.replace(/@@|@/g, (tag) => (tag === "@" ? "@@" : "@"));
}

/**
 * Test whether two already-canonicalized structures are exact mirror images.
 *
 * This is deliberately based on canonicalizing the explicit mirror of one
 * structure rather than comparing CIP descriptors by atom index. Canonical
 * atom ordering can change between enantiomers, so an index-by-index R/S
 * comparison can incorrectly miss a genuine racemate in bridged/fused systems.
 */
export async function areCanonicalEnantiomers(
  left: CanonicalStereoStructure,
  right: CanonicalStereoStructure,
): Promise<boolean> {
  if (left.connectivity !== right.connectivity) return false;
  if (!left.hasSpecifiedStereo || !right.hasSpecifiedStereo) return false;

  // Pure E/Z alternatives are geometric isomers, not enantiomers. At least one
  // tetrahedral descriptor must be present before mirroring is meaningful here.
  if (!/@/.test(left.isomeric) || !/@/.test(right.isomeric)) return false;

  const mirrored = await canonicalizeStereoStructure(
    invertTetrahedralSmiles(left.isomeric),
  );

  return Boolean(
    mirrored &&
      mirrored.connectivity === right.connectivity &&
      mirrored.isomeric === right.isomeric,
  );
}

export type RelativeSubstituentFace = "same" | "opposite";

export type RelativeStereoBondQuery = {
  /**
   * Product SMARTS containing both stereochemically related substituent bonds.
   * Atom positions below refer to match-array positions, not atom-map numbers.
   */
  smarts: string;
  firstBond: readonly [number, number];
  secondBond: readonly [number, number];
};

type V2000StereoBond = {
  first: number;
  second: number;
  stereo: number;
};

function parseSubstructureMatches(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (Array.isArray(entry)) {
          return entry.map(Number).filter(Number.isFinite);
        }
        if (
          entry &&
          typeof entry === "object" &&
          Array.isArray((entry as { atoms?: unknown[] }).atoms)
        ) {
          return (entry as { atoms: unknown[] }).atoms
            .map(Number)
            .filter(Number.isFinite);
        }
        return [];
      })
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function parseV2000StereoBonds(molBlock: string): V2000StereoBond[] {
  if (!molBlock || molBlock.includes("V3000")) return [];
  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return [];

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return [];

  const bondStart = 4 + atomCount;
  const bonds: V2000StereoBond[] = [];

  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const first = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const second = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const stereo = Number.parseInt(line.slice(9, 12).trim(), 10);

    if (
      !Number.isInteger(first) ||
      !Number.isInteger(second) ||
      !Number.isInteger(stereo) ||
      first < 0 ||
      second < 0
    ) {
      continue;
    }

    // MDL V2000: 1 = up/wedge and 6 = down/hash. Other values do not provide
    // the directed tetrahedral face information needed by this guard.
    if (stereo === 1 || stereo === 6) {
      bonds.push({ first, second, stereo });
    }
  }

  return bonds;
}

function directedStereoSign(
  bonds: V2000StereoBond[],
  fromAtom: number,
  toAtom: number,
): 1 | -1 | null {
  const bond = bonds.find(
    (candidate) =>
      (candidate.first === fromAtom && candidate.second === toAtom) ||
      (candidate.first === toAtom && candidate.second === fromAtom),
  );
  if (!bond) return null;

  let sign: 1 | -1 = bond.stereo === 1 ? 1 : -1;

  // The wedge/hash direction is defined from the first atom in a V2000 bond
  // record. Normalize every result to the caller's requested from -> to order.
  if (bond.first !== fromAtom) sign = sign === 1 ? -1 : 1;
  return sign;
}

/**
 * Determine the depicted relative face of two substituent bonds in a product.
 * Directed wedge/hash signs are normalized to the reaction-center atoms, so a
 * simple rotation of the 2-D drawing does not change the comparison.
 *
 * This is intentionally a conservative CYCLIC-product guard, not a general
 * definition of syn/anti for freely rotating acyclic products. Callers should
 * constrain their SMARTS to ring atoms when using it to reject products.
 *
 * `null` means the current RDKit molblock did not expose both stereobonds in a
 * decidable V2000 wedge/hash form. Callers should fall back conservatively
 * rather than deleting products in that case.
 */
export async function relativeSubstituentFace(
  smiles: string,
  query: RelativeStereoBondQuery,
): Promise<RelativeSubstituentFace | null> {
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return null;

  let qmol: any = null;
  try {
    qmol = rdkit.get_qmol(query.smarts);
    if (!qmol) return null;

    const matches = parseSubstructureMatches(
      mol.get_substruct_matches?.(qmol) ?? "[]",
    );
    if (matches.length === 0) return null;

    const molBlock = mol.get_molblock?.();
    if (typeof molBlock !== "string" || !molBlock) return null;
    const bonds = parseV2000StereoBonds(molBlock);
    if (bonds.length === 0) return null;

    const observed = new Set<RelativeSubstituentFace>();

    for (const match of matches) {
      const firstFrom = match[query.firstBond[0]];
      const firstTo = match[query.firstBond[1]];
      const secondFrom = match[query.secondBond[0]];
      const secondTo = match[query.secondBond[1]];

      if (
        !Number.isInteger(firstFrom) ||
        !Number.isInteger(firstTo) ||
        !Number.isInteger(secondFrom) ||
        !Number.isInteger(secondTo)
      ) {
        continue;
      }

      const firstSign = directedStereoSign(bonds, firstFrom, firstTo);
      const secondSign = directedStereoSign(bonds, secondFrom, secondTo);
      if (firstSign === null || secondSign === null) continue;

      observed.add(firstSign === secondSign ? "same" : "opposite");
    }

    // Several symmetry-equivalent SMARTS matches may be present. Accept a
    // relationship only when all decidable matches agree; otherwise the query
    // is ambiguous and the caller should retain the unfiltered product set.
    return observed.size === 1 ? [...observed][0] : null;
  } catch {
    return null;
  } finally {
    qmol?.delete?.();
    mol.delete?.();
  }
}

/**
 * Mechanistic post-generation guard for syn/anti product sets.
 *
 * Reaction SMARTS can be matched in multiple atom-map orientations, and `@`
 * versus `@@` depends on local branch ordering. Enumerating tags alone can
 * therefore leak formally syn products into an anti reaction (or vice versa),
 * especially in fused/bridged rings. This filter checks the actual generated
 * product wedges/dashes and removes only products whose CYCLIC face relationship
 * is unambiguously inconsistent with the mechanism.
 *
 * Safety rule: if RDKit cannot decide the relationship for any candidate, the
 * original set is returned unchanged. Chemistry is never discarded merely
 * because depiction metadata was unavailable.
 */
export async function filterProductsByRelativeSubstituentFace(
  products: string[],
  query: RelativeStereoBondQuery,
  expected: RelativeSubstituentFace,
): Promise<string[]> {
  if (products.length <= 1) return products;

  const evaluated = await Promise.all(
    products.map(async (product) => ({
      product,
      relationship: await relativeSubstituentFace(product, query),
    })),
  );

  const decidable = evaluated.filter((item) => item.relationship !== null);
  if (decidable.length === 0) return products;

  const kept = evaluated
    .filter(
      (item) => item.relationship === null || item.relationship === expected,
    )
    .map((item) => item.product);

  return kept.length > 0 ? kept : products;
}
