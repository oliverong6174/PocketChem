/**
 * Cyclohexane chair model.
 *
 * Scope (deliberately narrow): an isolated, saturated, all-carbon six-membered ring in which every
 * ring atom belongs to that one ring only. Fused, bridged, spiro, unsaturated, aromatic and
 * heteroatom rings are reported as "not a freely flipping chair" with the reason, never forced.
 *
 * The relative configuration (which substituents lie on the same face of the ring) comes from the
 * tetrahedral tags of the input and is never invented. Where the input does not define it and it matters,
 * the model asks for an explicit choice (`status: "needs-choice"`).
 *
 * Geometry: real 3D coordinates for the ring and the first atom of each substituent are generated, so
 * axial/equatorial is a measured property (angle to the ring axis), the drawing is a projection of those
 * coordinates, and the whole model can be checked against RDKit's own stereo perception of a molblock
 * built from it (see `chairCoreMolblock`).
 */
import {
  bondBetween,
  chiralSense,
  isHydrogenIndex,
  type ConformationGraph,
  type RdKitLike,
} from "./graph";
import {
  add,
  dot,
  handedness,
  normalize,
  rotateX,
  rotateY,
  scale,
  sub,
  toRadians,
  vec,
  type Vec3,
} from "./geometry";
import { identifySubstituent, type SubstituentIdentity } from "./substituents";

export const CHAIR_ENGINE_VERSION = 1;

export type Face = "up" | "down";
export type FaceSource = "input-stereo" | "user-choice" | "single-centre-arbitrary" | "mirror-fixed" | "hydrogen";
export type Orientation = "axial" | "equatorial";

export type RingEligibility = { ring: number[]; eligible: true } | { ring: number[]; eligible: false; reason: string };

const RT_KCAL_298 = 0.5925;

/** Finds six-membered rings and says, for each, whether it is a freely flipping chair. */
export function findChairCandidates(graph: ConformationGraph): RingEligibility[] {
  const out: RingEligibility[] = [];
  for (const ring of graph.rings) {
    if (ring.length !== 6) continue;
    out.push(checkRing(graph, ring));
  }
  return out;
}

/** One sentence saying why there is (or is not) a chair to analyse. */
export function describeChairAvailability(graph: ConformationGraph): string {
  const candidates = findChairCandidates(graph);
  const ok = candidates.filter((item) => item.eligible);
  if (ok.length > 0) return `${ok.length} freely flipping cyclohexane ring${ok.length === 1 ? "" : "s"} found.`;
  if (candidates.length > 0) return candidates.map((item) => (item.eligible ? "" : item.reason)).join(" ");
  if (graph.rings.length === 0) return "The molecule has no ring.";
  const shared = graph.atoms.some((atom) => atom.ringMemberships > 1);
  return shared
    ? "The rings share atoms (fused, bridged or spiro), and no isolated six-membered carbocycle remains: such systems are conformationally constrained and are not modelled as a freely flipping chair."
    : "The molecule has no six-membered ring; chair analysis applies to cyclohexane rings only.";
}

function checkRing(graph: ConformationGraph, ring: number[]): RingEligibility {
  const label = (atom: number) => `atom ${atom} (${graph.atoms[atom].symbol})`;
  for (const atom of ring) {
    const info = graph.atoms[atom];
    if (info.atomicNumber !== 6) return { ring, eligible: false, reason: `${label(atom)} is a heteroatom: only carbocyclic rings are modelled as chairs.` };
    if (info.aromatic) return { ring, eligible: false, reason: "The ring is aromatic and planar; it has no chair conformation." };
    if (info.ringMemberships > 1) return { ring, eligible: false, reason: `${label(atom)} is shared with another ring (fused, bridged or spiro): such a ring is conformationally constrained and does not flip freely.` };
    if (graph.fullNeighbors[atom].length !== 4) return { ring, eligible: false, reason: `${label(atom)} is not sp3 (a double bond or radical in the ring changes the shape).` };
    if (info.charge !== 0) return { ring, eligible: false, reason: `${label(atom)} is charged; charged ring atoms are not modelled.` };
  }
  for (let i = 0; i < ring.length; i++) {
    const bond = bondBetween(graph, ring[i], ring[(i + 1) % ring.length]);
    if (!bond || bond.order !== 1 || bond.aromatic) return { ring, eligible: false, reason: "The ring contains a double or aromatic bond, so it is not a chair." };
  }
  return { ring, eligible: true };
}

export type SubstituentSlot = {
  /** Ring position 0..5 along the ring path. */
  position: number;
  ringAtom: number;
  /** Neighbour atom (a real atom, or a virtual hydrogen index). */
  atom: number;
  isHydrogen: boolean;
  face: Face;
  faceSource: FaceSource;
  identity: SubstituentIdentity | null;
};

export type ChairModel = {
  ring: number[];
  status: "ready" | "needs-choice";
  /** Ring atoms whose substituent faces the input does not specify and the user must choose. */
  unresolved: number[];
  /** When every substituted atom is unspecified, the first one is fixed (a mirror-image choice, no information lost). */
  mirrorFixed: number | null;
  slots: SubstituentSlot[];
  warnings: string[];
};

export type FaceChoices = Record<number, Face>;

// ------------------------------------------------------------------------------------------------
// Geometry
// ------------------------------------------------------------------------------------------------

const CC = 1.53;
const RING_RADIUS = 1.446;
const PUCKER = 0.25;
const AXIAL_TILT = Math.sin(toRadians(19.47));
const EQ_OUT = Math.cos(toRadians(19.47));

/** +1 when the ring atom at `position` is puckered up in this chair, -1 when down. */
export const puckerSign = (position: number, flipped: boolean): 1 | -1 => (((position % 2 === 0 ? 1 : -1) * (flipped ? -1 : 1)) as 1 | -1);

function ringPosition(position: number, flipped: boolean): Vec3 {
  const angle = toRadians(60 * position);
  return vec(RING_RADIUS * Math.cos(angle), 0.5 * PUCKER * puckerSign(position, flipped), RING_RADIUS * Math.sin(angle));
}

/** Unit vector from the ring atom at `position` along its axial (up/down) or equatorial bond on `face`. */
export function bondDirection(position: number, flipped: boolean, face: Face): { direction: Vec3; orientation: Orientation } {
  const s = puckerSign(position, flipped);
  const faceSign = face === "up" ? 1 : -1;
  if (faceSign === s) return { direction: vec(0, faceSign, 0), orientation: "axial" };
  const angle = toRadians(60 * position);
  // The equatorial bond points outward, tilted slightly toward the side opposite to this atom's pucker.
  return { direction: normalize(vec(EQ_OUT * Math.cos(angle), -s * AXIAL_TILT, EQ_OUT * Math.sin(angle))), orientation: "equatorial" };
}

// ------------------------------------------------------------------------------------------------
// Building the model from a graph
// ------------------------------------------------------------------------------------------------

export function buildChairModel(rdkit: RdKitLike, graph: ConformationGraph, ring: number[], choices: FaceChoices = {}): ChairModel {
  const blocked = new Set(ring);
  const warnings: string[] = [];
  type Raw = { position: number; ringAtom: number; others: number[]; sense: 1 | -1 | 0; geometric: 1 | -1 | 0 };
  const raw: Raw[] = ring.map((ringAtom, position) => {
    const prev = ring[(position + 5) % 6];
    const next = ring[(position + 1) % 6];
    const others = graph.fullNeighbors[ringAtom].filter((atom) => atom !== prev && atom !== next);
    const sense = others.length === 2 ? chiralSense(graph, ringAtom, [prev, next, others[0], others[1]]) : 0;
    // The model's own handedness for (previous, next, up-neighbour, down-neighbour) at this position.
    const base = ringPosition(position, false);
    const upBond = bondDirection(position, false, "up").direction;
    const downBond = bondDirection(position, false, "down").direction;
    const geometric = handedness(
      ringPosition((position + 5) % 6, false),
      ringPosition((position + 1) % 6, false),
      add(base, upBond),
      add(base, downBond),
    );
    return { position, ringAtom, others, sense, geometric };
  });

  const hasSubstituent = (item: Raw) => item.others.some((atom) => !isHydrogenIndex(graph, atom));
  const relevant = raw.filter(hasSubstituent);
  const unspecified = relevant.filter((item) => item.sense === 0);
  const firstSubstituent = (item: Raw) =>
    [...item.others].filter((atom) => !isHydrogenIndex(graph, atom)).sort((a, b) => a - b)[0];

  const unresolved: number[] = [];
  let mirrorFixed: number | null = null;
  const faceOfFirst = new Map<number, { face: Face; source: FaceSource }>();
  if (relevant.length >= 2 && unspecified.length > 0) {
    const allUnspecified = unspecified.length === relevant.length;
    for (const item of unspecified) {
      const chosen = choices[item.ringAtom];
      if (allUnspecified && item === unspecified[0]) {
        mirrorFixed = item.ringAtom;
        faceOfFirst.set(item.ringAtom, { face: "up", source: "mirror-fixed" });
      } else if (chosen) {
        faceOfFirst.set(item.ringAtom, { face: chosen, source: "user-choice" });
      } else {
        unresolved.push(item.ringAtom);
      }
    }
  } else if (unspecified.length > 0) {
    // A single substituted atom: the up/down labelling is arbitrary (both are the same compound up to mirror image).
    for (const item of unspecified) faceOfFirst.set(item.ringAtom, { face: choices[item.ringAtom] ?? "up", source: "single-centre-arbitrary" });
  }

  const slots: SubstituentSlot[] = [];
  for (const item of raw) {
    const [x, y] = item.others;
    let xFace: Face;
    let source: FaceSource;
    if (item.sense !== 0) {
      xFace = item.sense === item.geometric ? "up" : "down";
      source = "input-stereo";
    } else if (hasSubstituent(item)) {
      const entry = faceOfFirst.get(item.ringAtom);
      const first = firstSubstituent(item);
      const firstFace: Face = entry?.face ?? "up";
      xFace = first === x ? firstFace : firstFace === "up" ? "down" : "up";
      source = entry?.source ?? "user-choice";
    } else {
      xFace = "up";
      source = "hydrogen";
    }
    const yFace: Face = xFace === "up" ? "down" : "up";
    for (const [atom, face] of [[x, xFace], [y, yFace]] as Array<[number, Face]>) {
      const isHydrogen = isHydrogenIndex(graph, atom);
      slots.push({
        position: item.position,
        ringAtom: item.ringAtom,
        atom,
        isHydrogen,
        face,
        faceSource: isHydrogen ? "hydrogen" : source,
        identity: isHydrogen ? null : identifySubstituent(rdkit, graph, item.ringAtom, atom, blocked),
      });
    }
  }
  for (const slot of slots) {
    if (slot.identity?.reconnects) {
      warnings.push(`Substituent on atom ${slot.ringAtom} reconnects to the ring system; this is not a simple monocyclic chair.`);
    }
  }
  return { ring, status: unresolved.length > 0 ? "needs-choice" : "ready", unresolved, mirrorFixed, slots, warnings };
}

// ------------------------------------------------------------------------------------------------
// A chair conformer: coordinates, axial/equatorial, energy
// ------------------------------------------------------------------------------------------------

export type ChairSubstituent = {
  slot: SubstituentSlot;
  orientation: Orientation;
  /** Position of the substituent's first atom. */
  point: Vec3;
};

export type ChairConformer = {
  flipped: boolean;
  label: "Chair A" | "Chair B";
  ringPoints: Vec3[];
  substituents: ChairSubstituent[];
};

export function buildConformer(model: ChairModel, flipped: boolean): ChairConformer {
  const ringPoints = model.ring.map((_, position) => ringPosition(position, flipped));
  const substituents = model.slots.map((slot) => {
    const { direction, orientation } = bondDirection(slot.position, flipped, slot.face);
    const length = slot.isHydrogen ? 1.09 : CC;
    return { slot, orientation, point: add(ringPoints[slot.position], scale(direction, length)) };
  });
  return { flipped, label: flipped ? "Chair B" : "Chair A", ringPoints, substituents };
}

export type SynDiaxial = {
  /** The axial substituent that suffers the interaction. */
  substituentAtom: number;
  fromPosition: number;
  /** The other axial group on the same face, two ring atoms away. */
  partnerPosition: number;
  partnerIsHydrogen: boolean;
  partnerAtom: number;
};

export function synDiaxialInteractions(conformer: ChairConformer): SynDiaxial[] {
  const axial = conformer.substituents.filter((item) => item.orientation === "axial");
  const out: SynDiaxial[] = [];
  for (const item of axial) {
    if (item.slot.isHydrogen) continue;
    for (const offset of [2, 4]) {
      const partnerPosition = (item.slot.position + offset) % 6;
      const partner = axial.find((other) => other.slot.position === partnerPosition && other.slot.face === item.slot.face);
      if (partner) out.push({ substituentAtom: item.slot.atom, fromPosition: item.slot.position, partnerPosition, partnerIsHydrogen: partner.slot.isHydrogen, partnerAtom: partner.slot.atom });
    }
  }
  return out;
}

export type ConformerAssessment = {
  conformer: ChairConformer;
  axialGroups: Array<{ atom: number; position: number; label: string; aValue: number | null; confidence: "standard" | "approximate" | null; lowerBound: boolean }>;
  equatorialGroups: Array<{ atom: number; position: number; label: string }>;
  synDiaxial: SynDiaxial[];
  /** Sum of the A-values of the axial groups, or null when any axial group has no documented A-value. */
  strainKcal: number | null;
  /** Axial groups with no documented A-value. */
  missing: string[];
};

export type ChairPreference =
  | { kind: "no-substituents"; summary: string }
  | { kind: "equivalent-by-symmetry"; summary: string }
  | { kind: "quantified"; preferred: "Chair A" | "Chair B" | "equal"; deltaKcal: number; impliedPreferredPercent: number; summary: string; usesLowerBound: boolean; usesApproximate: boolean }
  | { kind: "unassessed"; summary: string; missing: string[] };

export type ChairAnalysis = {
  engineVersion: number;
  A: ConformerAssessment;
  B: ConformerAssessment;
  preference: ChairPreference;
  /** What the additive model leaves out; always shown with any energy. */
  notIncluded: string[];
};

function assessConformer(conformer: ChairConformer): ConformerAssessment {
  const axialGroups: ConformerAssessment["axialGroups"] = [];
  const equatorialGroups: ConformerAssessment["equatorialGroups"] = [];
  for (const item of conformer.substituents) {
    if (item.slot.isHydrogen) continue;
    const identity = item.slot.identity;
    const label = identity?.label ?? "substituent";
    if (item.orientation === "axial") {
      axialGroups.push({
        atom: item.slot.atom,
        position: item.slot.position,
        label,
        aValue: identity?.aValue?.a ?? null,
        confidence: identity?.aValue?.confidence ?? null,
        lowerBound: identity?.aValue?.lowerBound ?? false,
      });
    } else {
      equatorialGroups.push({ atom: item.slot.atom, position: item.slot.position, label });
    }
  }
  const missing = axialGroups.filter((group) => group.aValue === null).map((group) => group.label);
  const strainKcal = missing.length > 0 ? null : axialGroups.reduce((sum, group) => sum + (group.aValue ?? 0), 0);
  return { conformer, axialGroups, equatorialGroups, synDiaxial: synDiaxialInteractions(conformer), strainKcal, missing };
}

const multiset = (labels: string[]) => [...labels].sort().join("|");

export function analyzeChairs(model: ChairModel): ChairAnalysis {
  const A = assessConformer(buildConformer(model, false));
  const B = assessConformer(buildConformer(model, true));
  const notIncluded = [
    "Substituent–substituent interactions (gauche, syn-diaxial between two non-hydrogen groups) are not parameterised; they would raise the strain of the more crowded chair further.",
    "Polar, hydrogen-bonding, dipole and solvent effects are not modelled; A-values are literature averages that vary with solvent.",
    "Twist-boat and half-chair forms and the barrier between the chairs are not modelled.",
  ];
  const substituentCount = model.slots.filter((slot) => !slot.isHydrogen).length;
  let preference: ChairPreference;
  if (substituentCount === 0) {
    preference = { kind: "no-substituents", summary: "No substituents: the two chairs are identical, so there is nothing to compare." };
  } else if (multiset(A.axialGroups.map((g) => g.label)) === multiset(B.axialGroups.map((g) => g.label)) && A.axialGroups.length === B.axialGroups.length) {
    preference = {
      kind: "equivalent-by-symmetry",
      summary: "The same kinds of groups are axial in both chairs, so the two chairs are expected to have the same energy.",
    };
  } else if (A.strainKcal !== null && B.strainKcal !== null) {
    const delta = B.strainKcal - A.strainKcal; // positive: Chair A is more stable
    const preferred = Math.abs(delta) < 0.05 ? "equal" : delta > 0 ? "Chair A" : "Chair B";
    const gap = Math.abs(delta);
    const impliedPreferredPercent = 100 / (1 + Math.exp(-gap / RT_KCAL_298));
    const usesLowerBound = [...A.axialGroups, ...B.axialGroups].some((g) => g.lowerBound);
    const usesApproximate = [...A.axialGroups, ...B.axialGroups].some((g) => g.confidence === "approximate");
    preference = {
      kind: "quantified",
      preferred,
      deltaKcal: gap,
      impliedPreferredPercent,
      usesLowerBound,
      usesApproximate,
      summary:
        preferred === "equal"
          ? "The additive A-value model puts the two chairs at the same energy."
          : `${preferred} is favoured by about ${gap.toFixed(2)} kcal/mol in the additive A-value model.`,
    };
  } else {
    const missing = [...new Set([...A.missing, ...B.missing])];
    preference = {
      kind: "unassessed",
      missing,
      summary: `No documented A-value for ${missing.join(", ")}, so the stability of the two chairs is not assessed.`,
    };
  }
  return { engineVersion: CHAIR_ENGINE_VERSION, A, B, preference, notIncluded };
}

// ------------------------------------------------------------------------------------------------
// Relationship summary (cis/trans) and projection
// ------------------------------------------------------------------------------------------------

/** cis (same face) or trans (opposite faces) for two substituted ring atoms; null if either is not substituted. */
export function relationship(model: ChairModel, ringAtomA: number, ringAtomB: number): "cis" | "trans" | null {
  const firstFace = (ringAtom: number) => model.slots.find((slot) => slot.ringAtom === ringAtom && !slot.isHydrogen)?.face ?? null;
  const a = firstFace(ringAtomA);
  const b = firstFace(ringAtomB);
  if (!a || !b) return null;
  return a === b ? "cis" : "trans";
}

/** Ring-path distance between two ring atoms: 1 (1,2), 2 (1,3) or 3 (1,4). */
export function ringDistance(model: ChairModel, ringAtomA: number, ringAtomB: number): number {
  const i = model.ring.indexOf(ringAtomA);
  const j = model.ring.indexOf(ringAtomB);
  const d = Math.abs(i - j) % 6;
  return Math.min(d, 6 - d);
}

export type ChairView = { yaw: number; pitch: number };
export const DEFAULT_CHAIR_VIEW: ChairView = { yaw: 22, pitch: 24 };

export type ProjectedPoint = { x: number; y: number; depth: number };

/** Orthographic projection to screen coordinates (y up, depth larger = nearer the viewer). */
export function projectPoint(point: Vec3, view: ChairView = DEFAULT_CHAIR_VIEW): ProjectedPoint {
  const rotated = rotateX(rotateY(point, toRadians(view.yaw)), toRadians(view.pitch));
  return { x: rotated.x, y: rotated.y, depth: rotated.z };
}

/** Angle in degrees between a bond direction and the ring's mean-plane normal (0 = axial). */
export function angleToAxis(conformer: ChairConformer, item: ChairSubstituent): number {
  const origin = conformer.ringPoints[item.slot.position];
  const direction = normalize(sub(item.point, origin));
  const cos = Math.abs(dot(direction, vec(0, 1, 0)));
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
}

/**
 * A V2000 molblock with 3D coordinates for the ring and the FIRST atom of every non-hydrogen
 * substituent (hydrogens are left implicit). RDKit perceives stereo from these coordinates, which
 * independently validates the model: for single-atom or methyl substituents the canonical SMILES must equal
 * the input's. Only for validation; not shown to users.
 */
export function chairCoreMolblock(graph: ConformationGraph, model: ChairModel, flipped: boolean): string {
  const conformer = buildConformer(model, flipped);
  const atoms: Array<{ symbol: string; p: Vec3 }> = [];
  const bonds: Array<[number, number]> = [];
  conformer.ringPoints.forEach((p) => atoms.push({ symbol: "C", p }));
  for (let i = 0; i < 6; i++) bonds.push([i + 1, ((i + 1) % 6) + 1]);
  for (const item of conformer.substituents) {
    if (item.slot.isHydrogen) continue;
    atoms.push({ symbol: graph.atoms[item.slot.atom].symbol, p: item.point });
    bonds.push([item.slot.position + 1, atoms.length]);
  }
  const lines = ["", "     RDKit          3D", ""];
  lines.push(`${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`);
  for (const atom of atoms) {
    lines.push(`${atom.p.x.toFixed(4).padStart(10)}${atom.p.y.toFixed(4).padStart(10)}${atom.p.z.toFixed(4).padStart(10)} ${atom.symbol.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  }
  for (const [a, b] of bonds) lines.push(`${String(a).padStart(3)}${String(b).padStart(3)}  1  0`);
  lines.push("M  END");
  return lines.join("\n");
}
