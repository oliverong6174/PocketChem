import type { ParentDescriptor, ParsedMol } from "./types";

export type StereoDescriptorKind = "tetrahedral" | "double-bond";
export type StereoDescriptorValue = "R" | "S" | "E" | "Z";

export type NomenclatureStereoDescriptor = {
  kind: StereoDescriptorKind;
  descriptor: StereoDescriptorValue;
  locant: number | null;
  atomIndex?: number;
  bondAtomIndices?: [number, number];
  source: "rdkit-cip";
};

export type StereoNomenclatureResult = {
  descriptors: NomenclatureStereoDescriptor[];
  prefix: string | null;
  limitations: string[];
};

type StereoTagDocument = {
  CIP_atoms?: unknown;
  CIP_bonds?: unknown;
};

function normalizeCipDescriptor(value: unknown): StereoDescriptorValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^\(/, "").replace(/\)$/, "");
  return normalized === "R" || normalized === "S" || normalized === "E" || normalized === "Z"
    ? normalized
    : null;
}

function parseStereoTags(raw: string): StereoTagDocument | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StereoTagDocument) : null;
  } catch {
    return null;
  }
}

function parentLocant(parent: ParentDescriptor | null, atomIndex: number): number | null {
  if (!parent) return null;
  const pathIndex = parent.path.indexOf(atomIndex);
  return pathIndex >= 0 ? pathIndex + 1 : null;
}

function doubleBondLocant(
  parent: ParentDescriptor | null,
  parsedMol: ParsedMol,
  beginAtomIndex: number,
  endAtomIndex: number,
): number | null {
  if (!parent) return null;

  const beginLocant = parentLocant(parent, beginAtomIndex);
  const endLocant = parentLocant(parent, endAtomIndex);
  if (beginLocant === null || endLocant === null) return null;

  const isDoubleBond = parsedMol.bonds.some(
    (bond) =>
      bond.bondOrder === 2 &&
      ((bond.atomA === beginAtomIndex && bond.atomB === endAtomIndex) ||
        (bond.atomA === endAtomIndex && bond.atomB === beginAtomIndex)),
  );

  if (!isDoubleBond) return null;
  return Math.min(beginLocant, endLocant);
}

function descriptorSortKey(descriptor: NomenclatureStereoDescriptor): [number, number, string] {
  return [
    descriptor.locant ?? Number.MAX_SAFE_INTEGER,
    descriptor.kind === "double-bond" ? 0 : 1,
    descriptor.descriptor,
  ];
}

function compareDescriptors(a: NomenclatureStereoDescriptor, b: NomenclatureStereoDescriptor) {
  const keyA = descriptorSortKey(a);
  const keyB = descriptorSortKey(b);
  if (keyA[0] !== keyB[0]) return keyA[0] - keyB[0];
  if (keyA[1] !== keyB[1]) return keyA[1] - keyB[1];
  return keyA[2].localeCompare(keyB[2]);
}

function buildStereoPrefix(
  descriptors: NomenclatureStereoDescriptor[],
  limitations: string[],
): string | null {
  if (descriptors.length === 0) return null;

  const sorted = [...descriptors].sort(compareDescriptors);
  const locanted = sorted.filter((descriptor) => descriptor.locant !== null);
  const unlocanted = sorted.filter((descriptor) => descriptor.locant === null);

  // A single unambiguous stereogenic element is conventionally displayed
  // without repeating its locant in the stereodescriptor block:
  // (R)-butan-2-ol, (E)-but-2-ene. Multiple descriptors require locants.
  if (sorted.length === 1) {
    return `(${sorted[0].descriptor})-`;
  }

  if (unlocanted.length > 0) {
    limitations.push(
      "Some stereogenic elements are outside the resolved parent numbering, so only safely locanted stereodescriptors are included in the systematic prefix.",
    );
  }

  if (locanted.length === 0) return null;

  return `(${locanted
    .map((descriptor) => `${descriptor.locant}${descriptor.descriptor}`)
    .join(",")})-`;
}

export function analyzeStereoNomenclature(
  mol: { get_stereo_tags?: () => string },
  parsedMol: ParsedMol,
  parent: ParentDescriptor | null,
): StereoNomenclatureResult {
  const limitations: string[] = [];
  const descriptors: NomenclatureStereoDescriptor[] = [];

  let rawTags = "";
  try {
    rawTags = mol.get_stereo_tags?.() ?? "";
  } catch {
    return { descriptors, prefix: null, limitations };
  }

  if (!rawTags) return { descriptors, prefix: null, limitations };
  const document = parseStereoTags(rawTags);
  if (!document) return { descriptors, prefix: null, limitations };

  if (Array.isArray(document.CIP_atoms)) {
    for (const entry of document.CIP_atoms) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const atomIndex = Number(entry[0]);
      const descriptor = normalizeCipDescriptor(entry[1]);
      if (!Number.isInteger(atomIndex) || (descriptor !== "R" && descriptor !== "S")) {
        continue;
      }

      descriptors.push({
        kind: "tetrahedral",
        descriptor,
        locant: parentLocant(parent, atomIndex),
        atomIndex,
        source: "rdkit-cip",
      });
    }
  }

  if (Array.isArray(document.CIP_bonds)) {
    for (const entry of document.CIP_bonds) {
      if (!Array.isArray(entry) || entry.length < 3) continue;
      const beginAtomIndex = Number(entry[0]);
      const endAtomIndex = Number(entry[1]);
      const descriptor = normalizeCipDescriptor(entry[2]);
      if (
        !Number.isInteger(beginAtomIndex) ||
        !Number.isInteger(endAtomIndex) ||
        (descriptor !== "E" && descriptor !== "Z")
      ) {
        continue;
      }

      descriptors.push({
        kind: "double-bond",
        descriptor,
        locant: doubleBondLocant(
          parent,
          parsedMol,
          beginAtomIndex,
          endAtomIndex,
        ),
        bondAtomIndices: [beginAtomIndex, endAtomIndex],
        source: "rdkit-cip",
      });
    }
  }

  const unique = descriptors.filter((descriptor, index, all) => {
    const key = `${descriptor.kind}:${descriptor.atomIndex ?? descriptor.bondAtomIndices?.join("-")}:${descriptor.descriptor}`;
    return (
      all.findIndex((candidate) => {
        const candidateKey = `${candidate.kind}:${candidate.atomIndex ?? candidate.bondAtomIndices?.join("-")}:${candidate.descriptor}`;
        return candidateKey === key;
      }) === index
    );
  });

  return {
    descriptors: unique.sort(compareDescriptors),
    prefix: buildStereoPrefix(unique, limitations),
    limitations,
  };
}

export function applyStereoPrefix(baseName: string, prefix: string | null): string {
  if (!prefix || !baseName) return baseName;

  // Avoid double-decoration when a retained/systematic name already begins
  // with the exact same stereodescriptor block.
  if (baseName.startsWith(prefix)) return baseName;
  return `${prefix}${baseName}`;
}
