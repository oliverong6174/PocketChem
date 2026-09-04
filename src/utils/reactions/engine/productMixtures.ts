import { getRDKit } from "../../rdkit";
import type {
  ReactionProductMixture,
  ReactionProductMixtureKind,
  ReactionRule,
} from "../reactionTypes";
import {
  canonicalizeStereoStructure,
  type CanonicalStereoStructure,
} from "./stereochemistry";

type CipDescriptor = "R" | "S" | "E" | "Z";

type StereoSignature = {
  atoms: Map<number, "R" | "S">;
  bonds: Map<string, "E" | "Z">;
};

export type ClassifiedReactionProduct = {
  smiles: string;
  structure: CanonicalStereoStructure;
  mixture: ReactionProductMixture | null;
};

function normalizeCip(value: unknown): CipDescriptor | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^\(/, "").replace(/\)$/, "");
  return normalized === "R" ||
    normalized === "S" ||
    normalized === "E" ||
    normalized === "Z"
    ? normalized
    : null;
}

function parseStereoTags(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function stereoSignature(smiles: string): Promise<StereoSignature> {
  const atoms = new Map<number, "R" | "S">();
  const bonds = new Map<string, "E" | "Z">();
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) return { atoms, bonds };

  try {
    const raw = mol.get_stereo_tags?.();
    if (typeof raw !== "string" || !raw) return { atoms, bonds };
    const tags = parseStereoTags(raw);
    if (!tags) return { atoms, bonds };

    const cipAtoms = tags.CIP_atoms;
    if (Array.isArray(cipAtoms)) {
      for (const entry of cipAtoms) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const index = Number(entry[0]);
        const descriptor = normalizeCip(entry[1]);
        if (
          Number.isInteger(index) &&
          (descriptor === "R" || descriptor === "S")
        ) {
          atoms.set(index, descriptor);
        }
      }
    }

    const cipBonds = tags.CIP_bonds;
    if (Array.isArray(cipBonds)) {
      for (const entry of cipBonds) {
        if (!Array.isArray(entry) || entry.length < 3) continue;
        const begin = Number(entry[0]);
        const end = Number(entry[1]);
        const descriptor = normalizeCip(entry[2]);
        if (
          Number.isInteger(begin) &&
          Number.isInteger(end) &&
          (descriptor === "E" || descriptor === "Z")
        ) {
          const key = begin < end ? `${begin}-${end}` : `${end}-${begin}`;
          bonds.set(key, descriptor);
        }
      }
    }

    return { atoms, bonds };
  } catch {
    return { atoms, bonds };
  } finally {
    mol.delete?.();
  }
}

function sameKeySet<K>(left: Map<K, unknown>, right: Map<K, unknown>): boolean {
  if (left.size !== right.size) return false;
  for (const key of left.keys()) {
    if (!right.has(key)) return false;
  }
  return true;
}

function areEnantiomericPair(
  left: StereoSignature,
  right: StereoSignature,
): boolean {
  if (left.atoms.size === 0 || !sameKeySet(left.atoms, right.atoms)) {
    return false;
  }
  if (!sameKeySet(left.bonds, right.bonds)) return false;

  for (const [index, descriptor] of left.atoms) {
    const opposite = descriptor === "R" ? "S" : "R";
    if (right.atoms.get(index) !== opposite) return false;
  }

  // E/Z geometry is not inverted by taking a molecular mirror image.
  for (const [key, descriptor] of left.bonds) {
    if (right.bonds.get(key) !== descriptor) return false;
  }

  return true;
}

function differsAtSomeButNotAllTetrahedralCenters(
  left: StereoSignature,
  right: StereoSignature,
): boolean {
  if (left.atoms.size < 2 || !sameKeySet(left.atoms, right.atoms)) return false;

  let same = 0;
  let opposite = 0;
  for (const [index, descriptor] of left.atoms) {
    const candidate = right.atoms.get(index);
    if (candidate === descriptor) same += 1;
    else if (candidate === (descriptor === "R" ? "S" : "R")) opposite += 1;
  }

  return same > 0 && opposite > 0;
}

async function mixtureKindForGroup(
  rule: ReactionRule,
  members: Array<{ smiles: string; structure: CanonicalStereoStructure }>,
): Promise<ReactionProductMixtureKind | null> {
  if (members.length < 2) return null;

  const stereoMode = rule.selectivityProfile?.stereochemistry?.mode;
  const expectedMixture = rule.selectivityProfile?.mixture === "expected";
  if (stereoMode !== "racemization" && !expectedMixture) return null;

  const signatures = await Promise.all(
    members.map((member) => stereoSignature(member.structure.isomeric)),
  );

  if (
    members.length === 2 &&
    areEnantiomericPair(signatures[0], signatures[1]) &&
    (stereoMode === "racemization" || expectedMixture)
  ) {
    return "racemic";
  }

  if (
    stereoMode === "racemization" &&
    signatures.some((signature, index) =>
      signatures.some(
        (other, otherIndex) =>
          otherIndex > index &&
          differsAtSomeButNotAllTetrahedralCenters(signature, other),
      ),
    )
  ) {
    return "diastereomeric";
  }

  return "stereoisomeric";
}

function mixtureLabel(kind: ReactionProductMixtureKind): string {
  if (kind === "racemic") return "Racemic mixture";
  if (kind === "diastereomeric") return "Diastereomeric mixture";
  return "Stereoisomeric mixture";
}

function groupId(ruleId: string, connectivity: string): string {
  let hash = 2166136261;
  const value = `${ruleId}::${connectivity}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${ruleId}--mixture-${(hash >>> 0).toString(36)}`;
}

/**
 * Canonicalizes and deduplicates generated products with stereochemistry
 * retained, then annotates product sets that represent one chemical mixture.
 *
 * This keeps R and S (or E and Z) as distinct structures for subsequent
 * reaction planning, while making it explicit that an SN1 outcome is not an
 * enantiopure bottle of whichever member happens to match the target.
 */
export async function classifyReactionProducts(
  rule: ReactionRule,
  products: string[],
): Promise<ClassifiedReactionProduct[]> {
  const unique = new Map<string, {
    smiles: string;
    structure: CanonicalStereoStructure;
  }>();

  for (const product of products) {
    const structure = await canonicalizeStereoStructure(product);
    if (!structure) continue;
    if (!unique.has(structure.isomeric)) {
      unique.set(structure.isomeric, {
        smiles: structure.isomeric,
        structure,
      });
    }
  }

  const members = [...unique.values()];
  const byConnectivity = new Map<string, typeof members>();

  for (const member of members) {
    const bucket = byConnectivity.get(member.structure.connectivity) ?? [];
    bucket.push(member);
    byConnectivity.set(member.structure.connectivity, bucket);
  }

  const mixtureByIsomeric = new Map<string, ReactionProductMixture>();

  for (const [connectivity, groupMembers] of byConnectivity) {
    const kind = await mixtureKindForGroup(rule, groupMembers);
    if (!kind) continue;

    const memberSmiles = groupMembers.map((member) => member.structure.isomeric);
    const id = groupId(rule.id, connectivity);

    groupMembers.forEach((member, index) => {
      mixtureByIsomeric.set(member.structure.isomeric, {
        kind,
        groupId: id,
        label: mixtureLabel(kind),
        memberIndex: index,
        memberCount: groupMembers.length,
        memberSmiles,
        displayName: null,
      });
    });
  }

  return members.map((member) => ({
    ...member,
    mixture: mixtureByIsomeric.get(member.structure.isomeric) ?? null,
  }));
}
