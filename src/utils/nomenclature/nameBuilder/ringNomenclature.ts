import type { FunctionalGroupResult } from "../../functionalGroups/types";

import type {
  NamingFeature,
  ParentDescriptor,
  ParsedAtom,
  ParsedBond,
  ParsedMol,
} from "../types";

import { COMMON_VALENCES } from "../constants";
import { getOtherAtom } from "../molParser";
import { buildBranchName } from "../branch/branchConstructor";
import { getNamingIntent } from "./namingIntent";

export type RingSuffixContext = {
  suffixName: string;
  anchorAtom: number;
  representedExternalAtoms: ReadonlySet<number>;
  primaryFeature: NamingFeature;
};

export type AromaticSuffixContext = RingSuffixContext;

/**
 * For a monosubstituted saturated ring, the attachment locant of an
 * exocyclic characteristic group is normally implicit:
 *
 *   cyclohexanecarboxylic acid
 *
 * Once the ring has another substituent, the attachment atom is written as
 * locant 1 so the other ring locants are explicit:
 *
 *   2-acetylcyclohexane-1-carboxylic acid
 *
 * Ring orientation already places the suffix anchor at position 1. This
 * helper only controls whether that implicit 1 is printed in the name.
 */
export function getRenderedRingSuffixName(
  parent: ParentDescriptor,
  context: RingSuffixContext,
  substituentCount: number
): string {
  if (parent.kind !== "ring" || parent.aromaticRing) {
    return context.suffixName;
  }

  if (substituentCount === 0) {
    return context.suffixName;
  }

  const exocyclicSuffixTypes = new Set<NamingFeature["type"]>([
    "carboxylicAcid",
    "aldehyde",
    "nitrile",
    "amide",
    "acidChloride",
    "ester",
  ]);

  if (!exocyclicSuffixTypes.has(context.primaryFeature.type)) {
    return context.suffixName;
  }

  const ringName = parent.parentHydrocarbon;
  if (!ringName) return context.suffixName;

  if (context.suffixName.startsWith(ringName)) {
    const suffixRemainder = context.suffixName.slice(ringName.length);
    return `${ringName}-1-${suffixRemainder}`;
  }

  // Esters begin with the O-alkyl name, e.g.
  // "methyl cyclohexanecarboxylate". Insert the locant into the embedded
  // ring parent without disturbing the alkyl portion.
  const embeddedRingName = ` ${ringName}`;
  const ringPosition = context.suffixName.indexOf(embeddedRingName);

  if (ringPosition >= 0) {
    const before = context.suffixName.slice(0, ringPosition + 1);
    const after = context.suffixName.slice(
      ringPosition + embeddedRingName.length
    );

    return `${before}${ringName}-1-${after}`;
  }

  return context.suffixName;
}

type RingAttachedGroupMatch = {
  anchorAtom: number;
  externalAtom: number;
  representedExternalAtoms: Set<number>;
};

const HALIDE_NAMES: Record<string, string> = {
  F: "fluoride",
  Cl: "chloride",
  Br: "bromide",
  I: "iodide",
};

export function getRingSuffixContext(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult | null
): RingSuffixContext | null {
  if (parent.kind !== "ring") return null;

  // Aromatic retained-parent naming still depends on the functional-group
  // hierarchy because names such as benzoic acid / benzamide are retained
  // parent choices rather than purely graph-local suffix transformations.
  if (parent.aromaticRing) {
    return primaryGroup
      ? getAromaticSuffixContext(parsedMol, parent, primaryGroup)
      : null;
  }

  // Normal route: use the functional-group hierarchy to choose the suffix.
  if (primaryGroup) {
    const contextual = getNonAromaticRingSuffixContext(
      parsedMol,
      parent,
      primaryGroup
    );

    if (contextual) return contextual;
  }

  // Defensive structural fallback. Ring-attached terminal suffix groups are
  // unambiguous from the molecular graph and must never be flattened into an
  // acyclic path merely because the external functional-group metadata was
  // absent, stale, or generated from a different atom ordering.
  //
  //   C1CCCCC1C(=O)O  -> cyclohexanecarboxylic acid
  //   C1CCCCC1C=O     -> cyclohexanecarbaldehyde
  //   C1CCCCC1C#N     -> cyclohexanecarbonitrile
  //   C1CCCCC1C(=O)N  -> cyclohexanecarboxamide
  return getStructuralNonAromaticRingSuffixContext(parsedMol, parent);
}

function getStructuralNonAromaticRingSuffixContext(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
): RingSuffixContext | null {
  const ringName = parent.parentHydrocarbon;
  if (!ringName) return null;

  const acid = findRingAttachedAcylGroup(
    parsedMol,
    parent,
    isCarboxylicAcidCarbon
  );

  if (acid) {
    return makeContext(acid, `${ringName}carboxylic acid`, {
      type: "carboxylicAcid",
      suffix: "carboxylic acid",
      prefix: "carboxy",
      priority: 1,
    });
  }

  const amide = findRingAttachedAcylGroup(parsedMol, parent, isAmideCarbon);
  if (amide) {
    return makeContext(amide, `${ringName}carboxamide`, {
      type: "amide",
      suffix: "amide",
      prefix: "carbamoyl",
      priority: 1.5,
    });
  }

  const acidHalide = findRingAttachedAcylGroup(
    parsedMol,
    parent,
    isAcidHalideCarbon
  );
  const halideName = acidHalide
    ? getAcidHalideName(parsedMol, acidHalide.externalAtom)
    : null;

  if (acidHalide && halideName) {
    return makeContext(acidHalide, `${ringName}carbonyl ${halideName}`, {
      type: "acidChloride",
      suffix: `oyl ${halideName}`,
      prefix: "halocarbonyl",
      priority: 1.4,
    });
  }

  const ester = findRingAttachedAcylGroup(parsedMol, parent, isEsterCarbon);
  const esterAlkyl = ester
    ? getEsterAlkylName(parsedMol, ester.externalAtom)
    : null;

  if (ester && esterAlkyl) {
    return makeContext(ester, `${esterAlkyl} ${ringName}carboxylate`, {
      type: "ester",
      suffix: "oate",
      prefix: "alkoxycarbonyl",
      priority: 1,
      alkylName: esterAlkyl,
    });
  }

  const nitrile = findRingAttachedNitrileGroup(parsedMol, parent);
  if (nitrile) {
    return makeContext(nitrile, `${ringName}carbonitrile`, {
      type: "nitrile",
      suffix: "nitrile",
      prefix: "cyano",
      priority: 1.7,
    });
  }

  const aldehyde = findRingAttachedAcylGroup(
    parsedMol,
    parent,
    isAldehydeCarbon
  );
  if (aldehyde) {
    return makeContext(aldehyde, `${ringName}carbaldehyde`, {
      type: "aldehyde",
      suffix: "al",
      prefix: "formyl",
      priority: 2,
    });
  }

  return null;
}

function getNonAromaticRingSuffixContext(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult
): RingSuffixContext | null {
  const intent = getNamingIntent(primaryGroup);
  const ringName = parent.parentHydrocarbon;
  if (!ringName) return null;

  if (intent.featureType === "carboxylicAcid") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isCarboxylicAcidCarbon);
    if (match) {
      return makeContext(match, `${ringName}carboxylic acid`, {
        type: "carboxylicAcid",
        suffix: "carboxylic acid",
        prefix: "carboxy",
        priority: 1,
      });
    }
  }

  if (intent.featureType === "aldehyde") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isAldehydeCarbon);
    if (match) {
      return makeContext(match, `${ringName}carbaldehyde`, {
        type: "aldehyde",
        suffix: "al",
        prefix: "formyl",
        priority: 2,
      });
    }
  }

  if (intent.featureType === "nitrile") {
    const match = findRingAttachedNitrileGroup(parsedMol, parent);
    if (match) {
      return makeContext(match, `${ringName}carbonitrile`, {
        type: "nitrile",
        suffix: "nitrile",
        prefix: "cyano",
        priority: 1.7,
      });
    }
  }

  if (intent.featureType === "amide") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isAmideCarbon);
    if (match) {
      return makeContext(match, `${ringName}carboxamide`, {
        type: "amide",
        suffix: "amide",
        prefix: "carbamoyl",
        priority: 1.5,
      });
    }
  }

  if (intent.featureType === "acidChloride") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isAcidHalideCarbon);
    const halideName = match ? getAcidHalideName(parsedMol, match.externalAtom) : null;
    if (match && halideName) {
      return makeContext(match, `${ringName}carbonyl ${halideName}`, {
        type: "acidChloride",
        suffix: `oyl ${halideName}`,
        prefix: "halocarbonyl",
        priority: 1.4,
      });
    }
  }

  if (intent.featureType === "ester") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isEsterCarbon);
    const alkylName = match ? getEsterAlkylName(parsedMol, match.externalAtom) : null;
    if (match && alkylName) {
      return makeContext(match, `${alkylName} ${ringName}carboxylate`, {
        type: "ester",
        suffix: "oate",
        prefix: "alkoxycarbonyl",
        priority: 1,
        alkylName,
      });
    }
  }

  return null;
}

export function getAromaticSuffixContext(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  primaryGroup: FunctionalGroupResult | null
): AromaticSuffixContext | null {
  if (!parent.aromaticRing) return null;
  if (!primaryGroup) return null;

  const intent = getNamingIntent(primaryGroup);

  if (!intent.aromaticRetainedParentAllowed) return null;

  if (intent.featureType === "amide") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isAmideCarbon);

    if (match) {
      return makeContext(match, "benzamide", {
        type: "amide",
        suffix: "amide",
        prefix: "carbamoyl",
        priority: 1.5,
      });
    }
  }

  if (intent.featureType === "carboxylicAcid") {
    const match = findRingAttachedAcylGroup(
      parsedMol,
      parent,
      isCarboxylicAcidCarbon
    );

    if (match) {
      return makeContext(match, "benzoic acid", {
        type: "carboxylicAcid",
        suffix: "oic acid",
        prefix: "carboxy",
        priority: 1,
      });
    }
  }

  if (intent.featureType === "acidChloride") {
    const match = findRingAttachedAcylGroup(
      parsedMol,
      parent,
      isAcidHalideCarbon
    );

    const halideName = match
      ? getAcidHalideName(parsedMol, match.externalAtom)
      : null;

    if (match && halideName) {
      return makeContext(match, `benzoyl ${halideName}`, {
        type: "acidChloride",
        suffix: `oyl ${halideName}`,
        prefix: "halocarbonyl",
        priority: 1.4,
      });
    }
  }

  if (intent.featureType === "aldehyde") {
    const match = findRingAttachedAcylGroup(
      parsedMol,
      parent,
      isAldehydeCarbon
    );

    if (match) {
      return makeContext(match, "benzaldehyde", {
        type: "aldehyde",
        suffix: "al",
        prefix: "formyl",
        priority: 2,
      });
    }
  }

  if (intent.featureType === "ketone") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isKetoneCarbon);
    const retainedName = match
      ? getAromaticKetoneRetainedName(parsedMol, parent, match)
      : null;

    if (match && retainedName) {
      return makeContext(match, retainedName, {
        type: "ketone",
        suffix: "one",
        prefix: "oxo",
        priority: 3,
      });
    }
  }

  if (intent.featureType === "nitrile") {
    const match = findRingAttachedNitrileGroup(parsedMol, parent);

    if (match) {
      return makeContext(match, "benzonitrile", {
        type: "nitrile",
        suffix: "nitrile",
        prefix: "cyano",
        priority: 1.7,
      });
    }
  }

  if (intent.featureType === "ester") {
    const match = findRingAttachedAcylGroup(parsedMol, parent, isEsterCarbon);
    const alkylName = match
      ? getEsterAlkylName(parsedMol, match.externalAtom)
      : null;

    if (match && alkylName) {
      return makeContext(match, `${alkylName} benzoate`, {
        type: "ester",
        suffix: "oate",
        prefix: "alkoxycarbonyl",
        priority: 1,
        alkylName,
      });
    }
  }

  if (intent.featureType === "alcohol") {
    const match = findRingAttachedHeteroGroup(parsedMol, parent, "O");

    if (match) {
      return makeContext(match, "phenol", {
        type: "alcohol",
        suffix: "ol",
        prefix: "hydroxy",
        priority: 4,
      });
    }
  }

  if (intent.featureType === "amine") {
    const match = findRingAttachedHeteroGroup(parsedMol, parent, "N");

    if (match) {
      return makeContext(match, "aniline", {
        type: "amine",
        suffix: "amine",
        prefix: "amino",
        priority: 6,
      });
    }
  }

  if (intent.featureType === "sulfonicAcid") {
    const match = findRingAttachedSulfurGroup(
      parsedMol,
      parent,
      (sulfurIndex) =>
        countDoubleBondedOxygens(parsedMol, sulfurIndex) >= 2 &&
        hasHydroxyOxygen(parsedMol, sulfurIndex)
    );

    if (match) {
      return makeContext(match, "benzenesulfonic acid", {
        type: "sulfonicAcid",
        suffix: "sulfonic acid",
        prefix: "sulfo",
        priority: 0.9,
      });
    }
  }

  if (intent.featureType === "sulfinicAcid") {
    const match = findRingAttachedSulfurGroup(
      parsedMol,
      parent,
      (sulfurIndex) =>
        countDoubleBondedOxygens(parsedMol, sulfurIndex) === 1 &&
        hasHydroxyOxygen(parsedMol, sulfurIndex)
    );

    if (match) {
      return makeContext(match, "benzenesulfinic acid", {
        type: "sulfinicAcid",
        suffix: "sulfinic acid",
        prefix: "sulfino",
        priority: 1.1,
      });
    }
  }

  if (intent.featureType === "sulfenicAcid") {
    const match = findRingAttachedSulfurGroup(
      parsedMol,
      parent,
      (sulfurIndex) =>
        countDoubleBondedOxygens(parsedMol, sulfurIndex) === 0 &&
        hasHydroxyOxygen(parsedMol, sulfurIndex)
    );

    if (match) {
      return makeContext(match, "benzenesulfenic acid", {
        type: "sulfenicAcid",
        suffix: "sulfenic acid",
        prefix: "sulfenyl",
        priority: 6.5,
      });
    }
  }

  if (intent.featureType === "sulfonamide") {
    const match = findRingAttachedSulfurGroup(
      parsedMol,
      parent,
      (sulfurIndex) =>
        countDoubleBondedOxygens(parsedMol, sulfurIndex) >= 2 &&
        hasSingleBondedElement(parsedMol, sulfurIndex, "N")
    );

    if (match) {
      return makeContext(match, "benzenesulfonamide", {
        type: "sulfonamide",
        suffix: "sulfonamide",
        prefix: "sulfonamido",
        priority: 1.25,
      });
    }
  }

  if (intent.featureType === "thiol") {
    const match = findRingAttachedHeteroGroup(parsedMol, parent, "S");

    if (match) {
      return makeContext(match, "thiophenol", {
        type: "thiol",
        suffix: "thiol",
        prefix: "sulfanyl",
        priority: 7,
      });
    }
  }

  return null;
}

export function orientRingParentForSuffix(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  context: RingSuffixContext
): ParentDescriptor {
  if (parent.kind !== "ring") return parent;

  return {
    ...parent,
    path: orientRingPathFromAnchor(
      parsedMol,
      parent.path,
      context.anchorAtom,
      context.representedExternalAtoms
    ),
  };
}

export function orientAromaticParentForSuffix(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  context: AromaticSuffixContext
): ParentDescriptor {
  return orientRingParentForSuffix(parsedMol, parent, context);
}

function makeContext(
  match: RingAttachedGroupMatch,
  suffixName: string,
  feature: Omit<NamingFeature, "locants">
): AromaticSuffixContext {
  return {
    suffixName,
    anchorAtom: match.anchorAtom,
    representedExternalAtoms: match.representedExternalAtoms,
    primaryFeature: {
      ...feature,
      locants: [1],
    },
  };
}

function findRingAttachedAcylGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  predicate: (parsedMol: ParsedMol, carbonIndex: number) => boolean
): RingAttachedGroupMatch | null {
  const ringSet = new Set(parent.path);

  for (const ringAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const other = getOtherAtom(bond, ringAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (ringSet.has(other)) continue;
      if (otherAtom.element !== "C") continue;
      if (!predicate(parsedMol, other)) continue;

      return {
        anchorAtom: ringAtom,
        externalAtom: other,
        representedExternalAtoms: collectExternalGroupAtoms(
          parsedMol,
          other,
          ringSet
        ),
      };
    }
  }

  return null;
}

function findRingAttachedHeteroGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  element: "O" | "N" | "S"
): RingAttachedGroupMatch | null {
  for (const ringAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      if (bond.bondOrder !== 1) continue;

      const other = getOtherAtom(bond, ringAtom);
      const otherAtom = parsedMol.atoms[other];

      if (!otherAtom) continue;
      if (otherAtom.element !== element) continue;
      if (!isSimpleRetainedHeteroGroup(parsedMol, other, element)) continue;

      return {
        anchorAtom: ringAtom,
        externalAtom: other,
        representedExternalAtoms: new Set([other]),
      };
    }
  }

  return null;
}

function isSimpleRetainedHeteroGroup(
  parsedMol: ParsedMol,
  heteroAtom: number,
  element: "O" | "N" | "S"
) {
  const bonds = parsedMol.adjacency.get(heteroAtom) ?? [];
  const carbonNeighborCount = bonds.filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, heteroAtom)];
    return attached?.element === "C";
  }).length;

  if (carbonNeighborCount !== 1) return false;
  if (element === "N") return !bonds.some((bond) => bond.bondOrder > 1);

  return true;
}

function findRingAttachedSulfurGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  predicate: (sulfurIndex: number) => boolean
): RingAttachedGroupMatch | null {
  const ringSet = new Set(parent.path);

  for (const ringAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      if (bond.bondOrder !== 1) continue;
      const sulfurIndex = getOtherAtom(bond, ringAtom);
      if (ringSet.has(sulfurIndex)) continue;
      if (parsedMol.atoms[sulfurIndex]?.element !== "S") continue;
      if (!predicate(sulfurIndex)) continue;

      return {
        anchorAtom: ringAtom,
        externalAtom: sulfurIndex,
        representedExternalAtoms: collectExternalGroupAtoms(
          parsedMol,
          sulfurIndex,
          ringSet
        ),
      };
    }
  }

  return null;
}

function countDoubleBondedOxygens(parsedMol: ParsedMol, atomIndex: number) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  }).length;
}

function hasHydroxyOxygen(parsedMol: ParsedMol, atomIndex: number) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    if (bond.bondOrder !== 1) return false;
    const oxygenIndex = getOtherAtom(bond, atomIndex);
    const oxygen = parsedMol.atoms[oxygenIndex];
    return (
      oxygen?.element === "O" &&
      countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0
    );
  });
}

function hasSingleBondedElement(
  parsedMol: ParsedMol,
  atomIndex: number,
  element: string
) {
  return (parsedMol.adjacency.get(atomIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, atomIndex)];
    return bond.bondOrder === 1 && attached?.element === element;
  });
}

function findRingAttachedNitrileGroup(
  parsedMol: ParsedMol,
  parent: ParentDescriptor
): RingAttachedGroupMatch | null {
  const ringSet = new Set(parent.path);

  for (const ringAtom of parent.path) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const nitrileCarbon = getOtherAtom(bond, ringAtom);
      const carbonAtom = parsedMol.atoms[nitrileCarbon];

      if (!carbonAtom) continue;
      if (ringSet.has(nitrileCarbon)) continue;
      if (carbonAtom.element !== "C") continue;

      const hasTripleNitrogen = (
        parsedMol.adjacency.get(nitrileCarbon) ?? []
      ).some((candidate) => {
        const attached = getOtherAtom(candidate, nitrileCarbon);
        const attachedAtom = parsedMol.atoms[attached];

        return attachedAtom?.element === "N" && candidate.bondOrder === 3;
      });

      if (!hasTripleNitrogen) continue;

      return {
        anchorAtom: ringAtom,
        externalAtom: nitrileCarbon,
        representedExternalAtoms: collectExternalGroupAtoms(
          parsedMol,
          nitrileCarbon,
          ringSet
        ),
      };
    }
  }

  return null;
}

function collectExternalGroupAtoms(
  parsedMol: ParsedMol,
  rootAtom: number,
  blockedAtoms: Set<number>
) {
  const collected = new Set<number>();
  const stack = [rootAtom];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined) continue;
    if (collected.has(current)) continue;
    if (blockedAtoms.has(current)) continue;

    collected.add(current);

    for (const bond of parsedMol.adjacency.get(current) ?? []) {
      const other = getOtherAtom(bond, current);

      if (blockedAtoms.has(other)) continue;
      if (collected.has(other)) continue;

      stack.push(other);
    }
  }

  return collected;
}

function hasCarbonylOxygen(parsedMol: ParsedMol, carbonIndex: number) {
  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 2;
  });
}

function isAmideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "N" && bond.bondOrder === 1;
  });
}

function isCarboxylicAcidCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
    const oxygenIndex = getOtherAtom(bond, carbonIndex);
    const oxygen = parsedMol.atoms[oxygenIndex];

    return (
      oxygen?.element === "O" &&
      bond.bondOrder === 1 &&
      countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0
    );
  });
}

function isAcidHalideCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return Boolean(getAcidHalideName(parsedMol, carbonIndex));
}

function getAcidHalideName(parsedMol: ParsedMol, carbonIndex: number) {
  for (const bond of parsedMol.adjacency.get(carbonIndex) ?? []) {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];

    if (attached && HALIDE_NAMES[attached.element]) {
      return HALIDE_NAMES[attached.element];
    }
  }

  return null;
}

function isAldehydeCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  const carbon = parsedMol.atoms[carbonIndex];
  if (!carbon) return false;

  const carbonNeighborCount = (
    parsedMol.adjacency.get(carbonIndex) ?? []
  ).filter((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "C";
  }).length;

  return (
    carbonNeighborCount === 1 &&
    countImplicitHydrogens(carbon, parsedMol.adjacency) > 0
  );
}

function isKetoneCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  const carbonNeighbors = (parsedMol.adjacency.get(carbonIndex) ?? []).filter(
    (bond) => {
      const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
      return attached?.element === "C";
    }
  );

  return carbonNeighbors.length >= 2;
}

function isEsterCarbon(parsedMol: ParsedMol, carbonIndex: number) {
  if (!hasCarbonylOxygen(parsedMol, carbonIndex)) return false;

  return Boolean(getEsterAlkylName(parsedMol, carbonIndex));
}

function getEsterAlkylName(parsedMol: ParsedMol, carbonIndex: number) {
  const singleOxygenBond = (
    parsedMol.adjacency.get(carbonIndex) ?? []
  ).find((bond) => {
    const attached = parsedMol.atoms[getOtherAtom(bond, carbonIndex)];
    return attached?.element === "O" && bond.bondOrder === 1;
  });

  if (!singleOxygenBond) return null;

  const oxygenIndex = getOtherAtom(singleOxygenBond, carbonIndex);
  const oxygen = parsedMol.atoms[oxygenIndex];

  if (!oxygen) return null;

  if (countImplicitHydrogens(oxygen, parsedMol.adjacency) > 0) {
    return null;
  }

  const alkylBond = (parsedMol.adjacency.get(oxygenIndex) ?? []).find(
    (bond) => {
      const attached = getOtherAtom(bond, oxygenIndex);

      if (attached === carbonIndex) return false;

      return parsedMol.atoms[attached]?.element === "C";
    }
  );

  if (!alkylBond) return null;

  const alkylCarbon = getOtherAtom(alkylBond, oxygenIndex);

  return buildBranchName(parsedMol, alkylCarbon, oxygenIndex).name;
}

function getAromaticKetoneRetainedName(
  parsedMol: ParsedMol,
  parent: ParentDescriptor,
  match: RingAttachedGroupMatch
) {
  const ringSet = new Set(parent.path);

  const carbonSideBond = (parsedMol.adjacency.get(match.externalAtom) ?? []).find(
    (bond) => {
      const attached = getOtherAtom(bond, match.externalAtom);
      if (ringSet.has(attached)) return false;

      return parsedMol.atoms[attached]?.element === "C";
    }
  );

  if (!carbonSideBond) return null;

  const carbonSideAtom = getOtherAtom(carbonSideBond, match.externalAtom);

  const sideName = buildBranchName(
    parsedMol,
    carbonSideAtom,
    match.externalAtom
  ).name;

  if (sideName === "methyl") return "acetophenone";
  if (sideName === "ethyl") return "propiophenone";

  return `${sideName} phenyl ketone`;
}

function orientRingPathFromAnchor(
  parsedMol: ParsedMol,
  ringPath: number[],
  anchorAtom: number,
  ignoredExternalAtoms: ReadonlySet<number>
) {
  const anchorIndex = ringPath.indexOf(anchorAtom);

  if (anchorIndex < 0) return ringPath;

  const rotated = [
    ...ringPath.slice(anchorIndex),
    ...ringPath.slice(0, anchorIndex),
  ];

  const reversed = [rotated[0], ...rotated.slice(1).reverse()];

  return compareRingOrientation(
    parsedMol,
    reversed,
    rotated,
    ignoredExternalAtoms
  ) < 0
    ? reversed
    : rotated;
}

function compareRingOrientation(
  parsedMol: ParsedMol,
  candidateA: number[],
  candidateB: number[],
  ignoredExternalAtoms: ReadonlySet<number>
) {
  const locantsA = getExternalSubstituentLocants(
    parsedMol,
    candidateA,
    ignoredExternalAtoms
  );

  const locantsB = getExternalSubstituentLocants(
    parsedMol,
    candidateB,
    ignoredExternalAtoms
  );

  return compareLocantLists(locantsA, locantsB);
}

function getExternalSubstituentLocants(
  parsedMol: ParsedMol,
  path: number[],
  ignoredExternalAtoms: ReadonlySet<number>
) {
  const ringSet = new Set(path);
  const locants: number[] = [];

  path.forEach((ringAtom, index) => {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const other = getOtherAtom(bond, ringAtom);

      if (ringSet.has(other)) continue;
      if (ignoredExternalAtoms.has(other)) continue;

      locants.push(index + 1);
    }
  });

  return locants.sort((a, b) => a - b);
}

function compareLocantLists(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? Number.POSITIVE_INFINITY;
    const valueB = b[i] ?? Number.POSITIVE_INFINITY;

    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
  }

  return 0;
}

function getExpectedValence(atom: ParsedAtom) {
  if (atom.element === "N" && atom.charge > 0) return 4;
  if (atom.element === "O" && atom.charge < 0) return 1;
  if (atom.element === "C" && atom.charge < 0) return 3;

  return COMMON_VALENCES[atom.element] ?? 0;
}

function countImplicitHydrogens(
  atom: ParsedAtom,
  adjacency: Map<number, ParsedBond[]>
) {
  if (atom.element === "H") return 0;

  const expectedValence = getExpectedValence(atom);
  if (expectedValence === 0) return 0;

  const bondOrderSum = (adjacency.get(atom.atomIndex) ?? []).reduce(
    (sum, bond) => sum + bond.bondOrder,
    0
  );

  return Math.max(0, Math.round(expectedValence - bondOrderSum));
}