import type {
  ParsedAtom,
  ParsedBond,
  ParsedMol,
} from "./types";

import { COMMON_VALENCES } from "./constants";
import { getOtherAtom } from "./molParser";

import {
  getSimpleCarbonRing,
  isBenzeneLikeRing,
} from "./parentSelection";

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

export function detectAromaticMotifs(parsedMol: ParsedMol) {
  const motifs = new Set<string>();

  const ring = getSimpleCarbonRing(parsedMol);

  if (!ring || !isBenzeneLikeRing(parsedMol, ring)) {
    return [];
  }

  motifs.add("aromatic benzene ring");

  const ringSet = new Set(ring.ringAtoms);

  const halogenNames: Record<string, string> = {
    F: "fluorobenzene motif",
    Cl: "chlorobenzene motif",
    Br: "bromobenzene motif",
    I: "iodobenzene motif",
  };

  const hasCarbonylOxygen = (carbonIndex: number) => {
    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
      const other = getOtherAtom(bond, carbonIndex);
      return parsedMol.atoms[other]?.element === "O" && bond.bondOrder === 2;
    });
  };

  const hasSingleOxygenWithHydrogen = (carbonIndex: number) => {
    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
      const other = getOtherAtom(bond, carbonIndex);
      const atom = parsedMol.atoms[other];

      return (
        atom?.element === "O" &&
        bond.bondOrder === 1 &&
        countImplicitHydrogens(atom, parsedMol.adjacency) > 0
      );
    });
  };

  const hasAttachedHalogen = (carbonIndex: number, halogen: string) => {
    return (parsedMol.adjacency.get(carbonIndex) ?? []).some((bond) => {
      const other = getOtherAtom(bond, carbonIndex);
      return parsedMol.atoms[other]?.element === halogen;
    });
  };

  for (const ringAtom of ring.ringAtoms) {
    for (const bond of parsedMol.adjacency.get(ringAtom) ?? []) {
      const attachedIndex = getOtherAtom(bond, ringAtom);

      if (ringSet.has(attachedIndex)) continue;

      const attachedAtom = parsedMol.atoms[attachedIndex];

      if (!attachedAtom) continue;

      if (attachedAtom.element === "O") {
        const oxygenBonds = parsedMol.adjacency.get(attachedIndex) ?? [];

        const hasCarbonSubstituent = oxygenBonds.some((oxygenBond) => {
          const other = getOtherAtom(oxygenBond, attachedIndex);
          return other !== ringAtom && parsedMol.atoms[other]?.element === "C";
        });

        motifs.add(
          hasCarbonSubstituent
            ? "anisole / alkoxybenzene motif"
            : "phenol motif"
        );
      }

      if (attachedAtom.element === "N") {
        const nBonds = parsedMol.adjacency.get(attachedIndex) ?? [];

        const oxygenCount = nBonds.filter((nBond) => {
          const other = getOtherAtom(nBond, attachedIndex);
          return parsedMol.atoms[other]?.element === "O";
        }).length;

        motifs.add(
          oxygenCount >= 2 ? "nitrobenzene motif" : "aniline motif"
        );
      }

      if (halogenNames[attachedAtom.element]) {
        motifs.add(halogenNames[attachedAtom.element]);
      }

      if (attachedAtom.element === "S") {
        motifs.add("thiophenol / benzenethiol motif");
      }

      if (attachedAtom.element === "C") {
        const carbonIndex = attachedIndex;

        if (hasCarbonylOxygen(carbonIndex)) {
          if (hasSingleOxygenWithHydrogen(carbonIndex)) {
            motifs.add("benzoic acid motif");
          } else {
            motifs.add("benzoyl motif");
          }
        }

        const implicitH = countImplicitHydrogens(
          attachedAtom,
          parsedMol.adjacency
        );

        if (hasCarbonylOxygen(carbonIndex) && implicitH >= 1) {
          motifs.add("benzaldehyde motif");
        }

        if (hasAttachedHalogen(carbonIndex, "Br")) {
          motifs.add("benzyl bromide motif");
        }

        if (hasAttachedHalogen(carbonIndex, "Cl")) {
          motifs.add("benzyl chloride motif");
        }

        const carbonNeighbors = (parsedMol.adjacency.get(carbonIndex) ?? [])
          .map((carbonBond) => getOtherAtom(carbonBond, carbonIndex))
          .filter((other) => parsedMol.atoms[other]?.element === "C");

        if (carbonNeighbors.length >= 2) {
          motifs.add("benzyl / alkylbenzene motif");
        }

        const hasDoubleCarbonBond = (
          parsedMol.adjacency.get(carbonIndex) ?? []
        ).some((carbonBond) => {
          const other = getOtherAtom(carbonBond, carbonIndex);
          return (
            parsedMol.atoms[other]?.element === "C" &&
            carbonBond.bondOrder === 2
          );
        });

        if (hasDoubleCarbonBond) {
          motifs.add("styrene / vinylbenzene motif");
        }
      }
    }
  }

  return Array.from(motifs);
}