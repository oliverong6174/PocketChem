import { CHAIN_PREFIXES } from "../constants";
import { getOtherAtom } from "../molParser";
import type { ParentDescriptor, ParsedMol } from "../types";

/**
 * Saturated acyclic polycarboxylic acids with three or more -COOH groups (citric acid, tricarballylic acid, butane-tetracarboxylic acid).
 *
 * IUPAC 2013 P-44.1.1 and P-65.1.1: the parent is the chain that expresses the largest number of principal characteristic groups. A
 * "-dioic acid" chain can include at most two carboxyl carbons, so when three or more acid groups are present they are all cited as
 * "-carboxylic acid" on the carbon skeleton that carries them: 2-hydroxypropane-1,2,3-tricarboxylic acid, not
 * 3-carboxy-3-hydroxypentanedioic acid.
 *
 * Deliberately narrow: only C/O atoms, no rings, no multiple bonds apart from the acid C=O (and optional oxo), and a skeleton that is a
 * simple unbranched chain. Anything else returns null and goes through the general builders unchanged.
 */

export type PolycarboxylicAcidName = {
  name: string;
  parent: ParentDescriptor;
  acidLocants: number[];
};

const MULTIPLIER: Record<number, string> = { 1: "", 2: "di", 3: "tri", 4: "tetra", 5: "penta", 6: "hexa" };

function neighbours(parsedMol: ParsedMol, atom: number) {
  return (parsedMol.adjacency.get(atom) ?? []).map((bond) => ({ bond, other: getOtherAtom(bond, atom) }));
}

function compareArrays(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? Number.POSITIVE_INFINITY;
    const y = b[i] ?? Number.POSITIVE_INFINITY;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function getAcyclicPolycarboxylicAcidName(parsedMol: ParsedMol): PolycarboxylicAcidName | null {
  const { atoms, bonds } = parsedMol;
  if (atoms.length < 6 || atoms.some((atom) => (atom.element !== "C" && atom.element !== "O") || atom.charge !== 0)) return null;
  if (bonds.length !== atoms.length - 1) return null; // a tree: acyclic and connected (connectivity is checked below)

  const acidCarbons = new Set<number>();
  const acidAtoms = new Set<number>();
  for (const atom of atoms) {
    if (atom.element !== "C") continue;
    const around = neighbours(parsedMol, atom.atomIndex);
    const carbonyl = around.filter(({ bond, other }) => bond.bondOrder === 2 && atoms[other].element === "O" && neighbours(parsedMol, other).length === 1);
    const hydroxyl = around.filter(({ bond, other }) => bond.bondOrder === 1 && atoms[other].element === "O" && neighbours(parsedMol, other).length === 1);
    if (carbonyl.length === 1 && hydroxyl.length === 1 && around.length === 3) {
      acidCarbons.add(atom.atomIndex);
      acidAtoms.add(atom.atomIndex);
      acidAtoms.add(carbonyl[0].other);
      acidAtoms.add(hydroxyl[0].other);
    }
  }
  if (acidCarbons.size < 3 || acidCarbons.size > 6) return null;

  // Skeleton carbons are everything that is not part of a COOH group; every COOH must hang from exactly one of them.
  const skeleton = atoms.filter((atom) => atom.element === "C" && !acidCarbons.has(atom.atomIndex)).map((atom) => atom.atomIndex);
  if (skeleton.length === 0 || skeleton.length > 10) return null;
  const skeletonSet = new Set(skeleton);

  const attachments = new Map<number, number>(); // skeleton carbon -> number of COOH on it
  for (const acid of acidCarbons) {
    const anchor = neighbours(parsedMol, acid).find(({ other }) => !acidAtoms.has(other));
    if (!anchor || !skeletonSet.has(anchor.other) || anchor.bond.bondOrder !== 1) return null;
    attachments.set(anchor.other, (attachments.get(anchor.other) ?? 0) + 1);
  }

  const hydroxy = new Set<number>();
  const oxo = new Set<number>();
  for (const carbon of skeleton) {
    for (const { bond, other } of neighbours(parsedMol, carbon)) {
      if (acidAtoms.has(other) || skeletonSet.has(other)) {
        if (skeletonSet.has(other) && bond.bondOrder !== 1) return null;
        continue;
      }
      if (atoms[other].element !== "O" || neighbours(parsedMol, other).length !== 1) return null;
      if (bond.bondOrder === 1) hydroxy.add(carbon);
      else if (bond.bondOrder === 2) oxo.add(carbon);
      else return null;
    }
  }

  // The skeleton must be an unbranched path.
  const degree = (carbon: number) => neighbours(parsedMol, carbon).filter(({ other }) => skeletonSet.has(other)).length;
  if (skeleton.some((carbon) => degree(carbon) > 2)) return null;
  const ends = skeleton.filter((carbon) => degree(carbon) <= 1);
  if (skeleton.length > 1 && ends.length !== 2) return null;
  const walk = (start: number) => {
    const path = [start];
    let previous = -1;
    let current = start;
    for (;;) {
      const next = neighbours(parsedMol, current).find(({ other }) => skeletonSet.has(other) && other !== previous);
      if (!next) break;
      previous = current;
      current = next.other;
      path.push(current);
    }
    return path;
  };
  const forward = walk(ends[0] ?? skeleton[0]);
  if (forward.length !== skeleton.length) return null;
  const chainStem = CHAIN_PREFIXES[forward.length];
  if (!chainStem) return null;

  const locantsFor = (path: number[], pick: (carbon: number) => number) =>
    path.flatMap((carbon, index) => Array.from({ length: pick(carbon) }, () => index + 1));
  const orientations = [forward, [...forward].reverse()].map((path) => ({
    path,
    acid: locantsFor(path, (carbon) => attachments.get(carbon) ?? 0),
    substituents: [...locantsFor(path, (carbon) => (hydroxy.has(carbon) ? 1 : 0)), ...locantsFor(path, (carbon) => (oxo.has(carbon) ? 1 : 0))].sort((a, b) => a - b),
    hydroxyLocants: locantsFor(path, (carbon) => (hydroxy.has(carbon) ? 1 : 0)),
    oxoLocants: locantsFor(path, (carbon) => (oxo.has(carbon) ? 1 : 0)),
  }));
  orientations.sort(
    (a, b) =>
      compareArrays(a.acid, b.acid) ||
      compareArrays(a.substituents, b.substituents) ||
      compareArrays(a.hydroxyLocants, b.hydroxyLocants),
  );
  const best = orientations[0];

  const prefixes = [
    best.hydroxyLocants.length ? `${best.hydroxyLocants.join(",")}-${MULTIPLIER[best.hydroxyLocants.length] ?? ""}hydroxy` : "",
    best.oxoLocants.length ? `${best.oxoLocants.join(",")}-${MULTIPLIER[best.oxoLocants.length] ?? ""}oxo` : "",
  ].filter(Boolean);
  const count = best.acid.length;
  const multiplier = MULTIPLIER[count];
  if (multiplier === undefined) return null;
  const parentName = `${chainStem}ane`;
  const locantPart = forward.length === 1 ? "" : `-${best.acid.join(",")}-`;
  const name = `${prefixes.join("-")}${parentName}${locantPart}${multiplier}carboxylic acid`;

  return {
    name,
    acidLocants: best.acid,
    parent: {
      kind: "chain",
      path: best.path,
      carbonCount: best.path.length,
      parentHydrocarbon: parentName,
      parentStem: `${chainStem}an`,
    },
  };
}
