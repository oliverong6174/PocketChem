import type { ParsedMol } from "../types";
import { getOtherAtom } from "../molParser";
import { buildBranchName } from "../branch/branchConstructor";

export type OrganometallicNameResult = {
  name: string;
  confidence: "high" | "medium";
  reason: string;
};

const HALIDE_NAMES: Record<string, string> = {
  F: "fluoride",
  Cl: "chloride",
  Br: "bromide",
  I: "iodide",
};

function carbonLigandNames(parsedMol: ParsedMol, center: number): string[] {
  const names: string[] = [];

  for (const bond of parsedMol.adjacency.get(center) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const other = getOtherAtom(bond, center);
    if (parsedMol.atoms[other]?.element !== "C") continue;
    names.push(buildBranchName(parsedMol, other, center).name);
  }

  return names;
}

function directlyBoundHalide(parsedMol: ParsedMol, center: number): string | null {
  for (const bond of parsedMol.adjacency.get(center) ?? []) {
    if (bond.bondOrder !== 1) continue;
    const other = getOtherAtom(bond, center);
    const element = parsedMol.atoms[other]?.element ?? "";
    const halide = HALIDE_NAMES[element];
    if (halide) return halide;
  }
  return null;
}

function freeCounterionHalide(parsedMol: ParsedMol): string | null {
  for (const atom of parsedMol.atoms) {
    const halide = HALIDE_NAMES[atom.element];
    if (!halide) continue;
    const heavyBonds = (parsedMol.adjacency.get(atom.atomIndex) ?? []).filter(
      (bond) => {
        const other = getOtherAtom(bond, atom.atomIndex);
        return parsedMol.atoms[other]?.element !== "H";
      },
    );
    if (heavyBonds.length === 0 && atom.charge <= 0) return halide;
  }
  return null;
}

function hasFreeLithiumCounterion(parsedMol: ParsedMol): boolean {
  return parsedMol.atoms.some((atom) => {
    if (atom.element !== "Li") return false;
    return (parsedMol.adjacency.get(atom.atomIndex) ?? []).length === 0;
  });
}

function multiplier(count: number): string {
  if (count === 2) return "di";
  if (count === 3) return "tri";
  if (count === 4) return "tetra";
  return "";
}

function compactLigands(names: string[]): string {
  const cleaned = names.filter(Boolean);
  if (cleaned.length === 0) return "";
  const allSame = cleaned.every((name) => name === cleaned[0]);
  if (allSame) return `${multiplier(cleaned.length)}${cleaned[0]}`;
  return [...cleaned].sort().join("");
}

/**
 * Names the common carbon-metal reagents students draw directly in Ketcher.
 *
 * This intentionally runs before ordinary hydrocarbon-parent nomenclature.
 * Without that priority, a structure such as CH3CH2-Mg-Br is flattened to
 * "ethane" because the carbon skeleton is valid even though the metal reagent
 * identity is the chemically important part of the structure.
 */
export function getOrganometallicName(
  parsedMol: ParsedMol,
): OrganometallicNameResult | null {
  for (const metal of parsedMol.atoms) {
    const center = metal.atomIndex;
    const ligands = carbonLigandNames(parsedMol, center);
    if (ligands.length === 0) continue;

    if (metal.element === "Mg") {
      const halide =
        directlyBoundHalide(parsedMol, center) ?? freeCounterionHalide(parsedMol);
      const organic = compactLigands(ligands);
      return {
        name: halide
          ? `${organic}magnesium ${halide}`
          : `${organic}magnesium reagent`,
        confidence: halide ? "high" : "medium",
        reason:
          "Recognized a carbon-magnesium bond and named the structure as a Grignard/organomagnesium reagent rather than as the corresponding hydrocarbon.",
      };
    }

    if (metal.element === "Li") {
      return {
        name: `${compactLigands(ligands)}lithium`,
        confidence: "high",
        reason:
          "Recognized a carbon-lithium bond and named the structure as an organolithium reagent.",
      };
    }

    if (metal.element === "Zn") {
      const halide =
        directlyBoundHalide(parsedMol, center) ?? freeCounterionHalide(parsedMol);
      const organic = compactLigands(ligands);
      return {
        name: halide ? `${organic}zinc ${halide}` : `${organic}zinc`,
        confidence: halide ? "high" : "medium",
        reason:
          "Recognized a carbon-zinc bond and named the organozinc reagent from its carbon ligand(s) and halide when present.",
      };
    }

    if (metal.element === "Cu") {
      const organic = compactLigands(ligands);
      if (ligands.length >= 2 && hasFreeLithiumCounterion(parsedMol)) {
        return {
          name: `lithium ${organic}cuprate`,
          confidence: "high",
          reason:
            "Recognized a lithium organocuprate (Gilman-type) reagent from the carbon-copper ligands and lithium counterion.",
        };
      }
      return {
        name: ligands.length >= 2 ? `${organic}copper` : `${organic}copper reagent`,
        confidence: "medium",
        reason:
          "Recognized a carbon-copper organometallic reagent; the exact salt/counterion form was not fully specified.",
      };
    }

    if (metal.element === "Na") {
      return {
        name: `${compactLigands(ligands)}sodium`,
        confidence: "medium",
        reason: "Recognized a direct carbon-sodium organometallic bond.",
      };
    }

    if (metal.element === "K") {
      return {
        name: `${compactLigands(ligands)}potassium`,
        confidence: "medium",
        reason: "Recognized a direct carbon-potassium organometallic bond.",
      };
    }
  }

  return null;
}
