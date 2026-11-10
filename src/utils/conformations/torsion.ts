/**
 * Rotation about a single bond: the shared model behind the Newman and sawhorse views and the
 * conformational energy profile.
 *
 * One conformation is fully described by (front atom, rear atom, the reference substituent on each
 * end, and the dihedral angle between those two references). Every view is derived from that, so a
 * Newman projection and a sawhorse projection can only ever show the same conformation.
 *
 * Conventions
 *  - The viewer looks along the bond from the FRONT atom towards the REAR atom.
 *  - Angles on the projection are measured clockwise from 12 o'clock, in degrees.
 *  - The dihedral angle between a front substituent F and a rear substituent R is the clockwise
 *    angle from F to R as seen by the viewer (the IUPAC sign: positive = clockwise). 0 is eclipsed
 *    (syn), 180 is anti.
 *  - Handedness (which way the three substituents of an end run) comes from the input's tetrahedral
 *    tags. For the rear atom the viewer looks from the same side as the front atom, so the tag's sense is
 *    used as is; for the front atom the viewer is on the far side, so it is reversed.
 */
import { isHydrogenIndex, chiralSense, type ConformationGraph, type GraphBond } from "./graph";
import { cross, sub, vec, wrap180, wrap360, type Vec3 } from "./geometry";

export const TORSION_ENGINE_VERSION = 1;

export type EndGeometry = "sp3" | "sp2" | "single";

export type EndModel = {
  atom: number;
  /** Substituents (neighbours other than the partner), most "important" first. */
  slots: number[];
  geometry: EndGeometry;
  /** +1: the slots, in the listed order, run clockwise on the projection; -1: anticlockwise. */
  hand: 1 | -1;
  /** The handedness could not be taken from the input although it matters (three different groups, no tetrahedral tag). */
  handAssumed: boolean;
};

export type TorsionSetup = {
  front: EndModel;
  rear: EndModel;
  frontRef: number;
  rearRef: number;
  warnings: string[];
};

export type BondCheck = { ok: true; bond: GraphBond; warnings: string[] } | { ok: false; reason: string };

// ------------------------------------------------------------------------------------------------
// Which bonds can be viewed
// ------------------------------------------------------------------------------------------------

function hasMultipleBond(graph: ConformationGraph, atom: number, except: number): boolean {
  return graph.bonds.some((bond) => (bond.a === atom || bond.b === atom) && bond.a !== except && bond.b !== except && (bond.order > 1 || bond.aromatic));
}

function hasTripleBond(graph: ConformationGraph, atom: number): boolean {
  return graph.bonds.some((bond) => (bond.a === atom || bond.b === atom) && bond.order === 3);
}

/** Why a bond can or cannot be shown as a rotatable single bond. */
export function checkRotatableBond(graph: ConformationGraph, a: number, b: number): BondCheck {
  const bond = graph.bonds.find((item) => (item.a === a && item.b === b) || (item.a === b && item.b === a));
  if (!bond) return { ok: false, reason: "These atoms are not bonded." };
  const atomA = graph.atoms[a];
  const atomB = graph.atoms[b];
  if (atomA.atomicNumber === 1 || atomB.atomicNumber === 1) return { ok: false, reason: "A bond to hydrogen has nothing to rotate against." };
  if (bond.order !== 1 || bond.aromatic) {
    return { ok: false, reason: `This is a ${bond.aromatic ? "aromatic" : bond.order === 2 ? "double" : "triple"} bond: rotation is restricted (a double bond cannot rotate without breaking the π bond), so a Newman projection is not offered.` };
  }
  if (bond.inRing) return { ok: false, reason: "This bond is part of a ring: ring bonds cannot rotate freely (the ring constrains the dihedral angle), so it is not offered as a rotatable bond." };
  const warnings: string[] = [];
  const acyl = (carbon: number, other: number) =>
    graph.atoms[carbon].atomicNumber === 6 &&
    graph.bonds.some((bond2) => bond2.order === 2 && (bond2.a === carbon || bond2.b === carbon) && ![bond2.a, bond2.b].includes(other) &&
      [graph.atoms[bond2.a === carbon ? bond2.b : bond2.a].atomicNumber].some((z) => z === 8 || z === 16)) &&
    graph.atoms[other].atomicNumber === 7;
  if (acyl(a, b) || acyl(b, a)) {
    return { ok: false, reason: "This is an amide-type C–N bond. Resonance gives it partial double-bond character (a rotation barrier of roughly 15–20 kcal/mol), so it is not treated as freely rotating." };
  }
  for (const end of [a, b]) {
    if (hasTripleBond(graph, end)) return { ok: false, reason: "One end of this bond is an sp carbon, which is cylindrically symmetric: rotation produces no distinct conformations." };
    if (graph.fullNeighbors[end].length < 2) return { ok: false, reason: "An end of this bond has no other substituent." };
  }
  if (graph.atoms[a].charge !== 0 || graph.atoms[b].charge !== 0) warnings.push("A charged atom is on this bond; electrostatic effects are not modelled.");
  return { ok: true, bond, warnings };
}

export function listRotatableBonds(graph: ConformationGraph): Array<{ bond: GraphBond; check: BondCheck }> {
  return graph.bonds
    .filter((bond) => graph.atoms[bond.a].atomicNumber !== 1 && graph.atoms[bond.b].atomicNumber !== 1)
    .map((bond) => ({ bond, check: checkRotatableBond(graph, bond.a, bond.b) }));
}

// ------------------------------------------------------------------------------------------------
// Ends, references, handedness
// ------------------------------------------------------------------------------------------------

function priority(graph: ConformationGraph, atom: number): [number, number, number] {
  if (isHydrogenIndex(graph, atom)) return [1, 0, atom];
  const info = graph.atoms[atom];
  return [info.atomicNumber, info.neighbors.length, atom];
}

function orderSlots(graph: ConformationGraph, slots: number[]): number[] {
  return [...slots].sort((x, y) => {
    const px = priority(graph, x);
    const py = priority(graph, y);
    return py[0] - px[0] || py[1] - px[1] || px[2] - py[2];
  });
}

const identityOf = (graph: ConformationGraph, atom: number): string => {
  if (isHydrogenIndex(graph, atom)) return "H";
  const info = graph.atoms[atom];
  return `${info.atomicNumber}:${info.isotope}:${info.charge}:${info.neighbors.length}:${info.hydrogenCount}`;
};

function buildEnd(graph: ConformationGraph, atom: number, partner: number, viewerSideIsPartner: boolean): EndModel {
  const slots = orderSlots(graph, graph.fullNeighbors[atom].filter((n) => n !== partner));
  const multiple = hasMultipleBond(graph, atom, partner) || graph.atoms[atom].aromatic;
  const geometry: EndGeometry = slots.length === 1 ? "single" : slots.length === 2 && multiple ? "sp2" : "sp3";
  let hand: 1 | -1 = 1;
  let handAssumed = false;
  if (geometry === "sp3" && slots.length === 3) {
    const sense = chiralSense(graph, atom, [partner, slots[0], slots[1], slots[2]]);
    if (sense !== 0) {
      // sense is what an observer standing on the partner's side sees. The viewer is on that side only for the rear atom.
      hand = (viewerSideIsPartner ? sense : -sense) as 1 | -1;
    } else {
      const distinct = new Set(slots.map((s) => identityOf(graph, s))).size;
      if (distinct === 3) handAssumed = true;
    }
  }
  return { atom, slots, geometry, hand, handAssumed };
}

export function setupTorsion(graph: ConformationGraph, front: number, rear: number, refs: { frontRef?: number; rearRef?: number } = {}): TorsionSetup {
  const frontEnd = buildEnd(graph, front, rear, false);
  const rearEnd = buildEnd(graph, rear, front, true);
  const warnings: string[] = [];
  for (const end of [frontEnd, rearEnd]) {
    if (end.handAssumed) {
      warnings.push(`Atom ${end.atom} has three different substituents but the input does not specify its configuration; the left/right arrangement shown is an assumption and its mirror image is equally consistent with the input.`);
    }
  }
  const pick = (end: EndModel, wanted: number | undefined) => (wanted !== undefined && end.slots.includes(wanted) ? wanted : end.slots[0]);
  return { front: frontEnd, rear: rearEnd, frontRef: pick(frontEnd, refs.frontRef), rearRef: pick(rearEnd, refs.rearRef), warnings };
}

/** The same bond seen from the other end. The conformation (every pairwise dihedral) is unchanged. */
export function reverseView(graph: ConformationGraph, setup: TorsionSetup): TorsionSetup {
  return setupTorsion(graph, setup.rear.atom, setup.front.atom, { frontRef: setup.rearRef, rearRef: setup.frontRef });
}

// ------------------------------------------------------------------------------------------------
// A conformation
// ------------------------------------------------------------------------------------------------

export type Placed = { atom: number; angle: number };

export type Conformation = {
  /** Dihedral angle between the two reference substituents, in (-180, 180]. */
  rotation: number;
  front: Placed[];
  rear: Placed[];
};

function endAngles(end: EndModel, ref: number, refAngle: number): Placed[] {
  const refIndex = Math.max(0, end.slots.indexOf(ref));
  const step = end.geometry === "sp2" ? 180 : 120;
  return end.slots.map((atom, k) => {
    const offset = ((k - refIndex) % end.slots.length + end.slots.length) % end.slots.length;
    return { atom, angle: wrap360(refAngle + end.hand * step * offset) };
  });
}

/** Places every substituent for a given dihedral between the references (the front reference is at 12 o'clock). */
export function conformationAt(setup: TorsionSetup, rotation: number): Conformation {
  const front = endAngles(setup.front, setup.frontRef, 0);
  const rear = endAngles(setup.rear, setup.rearRef, wrap360(rotation));
  return { rotation: wrap180(rotation), front, rear };
}

/** Dihedral angle between front substituent `f` and rear substituent `r`, in (-180, 180]. */
export function dihedralBetween(conformation: Conformation, f: number, r: number): number {
  const a = conformation.front.find((item) => item.atom === f);
  const b = conformation.rear.find((item) => item.atom === r);
  if (!a || !b) return Number.NaN;
  return wrap180(b.angle - a.angle);
}

// ------------------------------------------------------------------------------------------------
// Classification
// ------------------------------------------------------------------------------------------------

export type PairRelation = "eclipsed" | "gauche" | "anti" | "skew" | "120°";

export function pairRelation(dihedral: number): PairRelation {
  const d = Math.abs(wrap180(dihedral));
  if (d <= 15) return "eclipsed";
  if (d <= 45) return "skew";
  if (d <= 75) return "gauche";
  if (d <= 105) return "skew";
  if (d <= 135) return "120°";
  return "anti";
}

export type Classification = {
  kind: "staggered" | "eclipsed" | "skew";
  /** Name from the reference groups, e.g. "anti", "gauche", "fully eclipsed", or just kind when a reference is hydrogen. */
  name: string;
  /** One-line, learner-facing description. */
  description: string;
  /** Relations among the non-hydrogen front/rear groups. */
  relations: Array<{ front: number; rear: number; dihedral: number; relation: PairRelation }>;
};

const TOL = 6;

export function classify(graph: ConformationGraph, setup: TorsionSetup, rotation: number): Classification {
  const conf = conformationAt(setup, rotation);
  const threeThree = setup.front.slots.length === 3 && setup.rear.slots.length === 3 && setup.front.geometry === "sp3" && setup.rear.geometry === "sp3";
  const allPairs: number[] = [];
  for (const f of conf.front) for (const r of conf.rear) allPairs.push(Math.abs(dihedralBetween(conf, f.atom, r.atom)));
  const minSeparation = Math.min(...allPairs);
  let kind: Classification["kind"];
  if (threeThree) {
    const phase = wrap360(rotation) % 120;
    kind = Math.abs(phase - 60) <= TOL ? "staggered" : phase <= TOL || phase >= 120 - TOL ? "eclipsed" : "skew";
  } else {
    kind = minSeparation <= TOL ? "eclipsed" : minSeparation >= 50 ? "staggered" : "skew";
  }
  const relations = conf.front.flatMap((f) =>
    conf.rear
      .filter((r) => !isHydrogenIndex(graph, f.atom) && !isHydrogenIndex(graph, r.atom))
      .map((r) => {
        const dihedral = dihedralBetween(conf, f.atom, r.atom);
        return { front: f.atom, rear: r.atom, dihedral, relation: pairRelation(dihedral) };
      }),
  );
  const refsHeavy = !isHydrogenIndex(graph, setup.frontRef) && !isHydrogenIndex(graph, setup.rearRef);
  const d = Math.abs(wrap180(rotation));
  let name: string = kind;
  if (threeThree && refsHeavy) {
    if (kind === "staggered") name = d >= 180 - TOL ? "anti" : "gauche";
    else if (kind === "eclipsed") name = d <= TOL ? "fully eclipsed" : "eclipsed";
  }
  const description =
    name === "anti" ? "Staggered, with the two reference groups opposite each other (180°): the lowest-strain arrangement."
    : name === "gauche" ? "Staggered, with the two reference groups 60° apart: no torsional strain, but the groups crowd each other."
    : name === "fully eclipsed" ? "Eclipsed with the two reference groups directly in line (0°): torsional strain plus the largest steric clash."
    : name === "eclipsed" ? "Eclipsed: every front bond is lined up with a rear bond, giving torsional strain (the reference groups eclipse a hydrogen)."
    : kind === "staggered" ? "Staggered: each front bond sits midway between rear bonds, which minimises torsional strain."
    : kind === "eclipsed" ? "Eclipsed: front and rear bonds line up, which costs torsional strain."
    : "Between staggered and eclipsed (a skew conformation).";
  return { kind, name, description, relations };
}

// ------------------------------------------------------------------------------------------------
// Energy: pairwise eclipsing + gauche model (textbook increments), or "not parameterised"
// ------------------------------------------------------------------------------------------------

/** Increments (kJ/mol): H/H eclipsed 4.0, H/CH3 eclipsed 6.0, CH3/CH3 eclipsed 11, CH3/CH3 gauche 3.8 (McMurry, Organic Chemistry; Clayden et al.). */
export const ENERGY_MODEL = {
  id: "pairwise-eclipsing-gauche-v1",
  eclipsingKJ: { HH: 4.0, HMe: 6.0, MeMe: 11.0 },
  gaucheMeMeKJ: 3.8,
  kcalPerKJ: 1 / 4.184,
  description:
    "Each eclipsed front/rear pair costs a fixed torsional-plus-steric increment (H/H 4.0, H/CH₃ 6.0, CH₃/CH₃ 11 kJ/mol) that falls smoothly to zero as the pair moves 60° apart; a CH₃/CH₃ pair 60° apart (gauche) adds 3.8 kJ/mol. These are the textbook values that give ethane 12, propane 14 and butane 3.8 (gauche), 16 (eclipsed) and 19 kJ/mol (fully eclipsed) above the minimum. It is a teaching model, not a force field or a quantum-mechanical calculation.",
  references: [
    "J. McMurry, Organic Chemistry (conformations of ethane, propane and butane: torsional and steric strain increments).",
    "J. Clayden, N. Greeves, S. Warren, Organic Chemistry, 2nd ed., ch. 16.",
  ],
} as const;

type GroupClass = "H" | "Me" | "other";

function groupClass(graph: ConformationGraph, atom: number): GroupClass {
  if (isHydrogenIndex(graph, atom)) return "H";
  const info = graph.atoms[atom];
  if (info.atomicNumber === 6 && info.neighbors.length === 1 && info.hydrogenCount === 3 && info.charge === 0 && info.isotope === 0) return "Me";
  return "other";
}

export type EnergySupport =
  | { supported: true; model: typeof ENERGY_MODEL.id }
  | { supported: false; reason: string; unparameterised: Array<{ atom: number; label: string }> };

export function energySupport(graph: ConformationGraph, setup: TorsionSetup): EnergySupport {
  const ends = [setup.front, setup.rear];
  if (ends.some((end) => end.geometry !== "sp3" || end.slots.length !== 3)) {
    return { supported: false, reason: "The energy model is parameterised only for bonds between two sp3 centres that each carry three substituents.", unparameterised: [] };
  }
  const unparameterised = ends.flatMap((end) => end.slots).filter((atom) => groupClass(graph, atom) === "other").map((atom) => ({ atom, label: graph.atoms[atom]?.symbol ?? "?" }));
  if (unparameterised.length > 0) {
    return {
      supported: false,
      reason: "The numeric model covers only hydrogen and methyl substituents. Other groups need their own eclipsing and gauche parameters, which are not included, so only a qualitative comparison is given.",
      unparameterised,
    };
  }
  return { supported: true, model: ENERGY_MODEL.id };
}

const cos2 = (degrees: number) => Math.cos((degrees * Math.PI) / 180) ** 2;

function pairEnergyKJ(a: GroupClass, b: GroupClass, separation: number): number {
  const d = Math.abs(wrap180(separation));
  const key = a === "H" && b === "H" ? "HH" : a === "Me" && b === "Me" ? "MeMe" : "HMe";
  const eclipsing = d < 60 ? ENERGY_MODEL.eclipsingKJ[key] * cos2(1.5 * d) : 0;
  const gauche = key === "MeMe" && d > 0 && d < 120 ? ENERGY_MODEL.gaucheMeMeKJ * cos2(1.5 * (d - 60)) : 0;
  return eclipsing + gauche;
}

/** Strain energy in kJ/mol relative to a conformation with no eclipsing and no gauche interaction, or null when not parameterised. */
export function strainEnergyKJ(graph: ConformationGraph, setup: TorsionSetup, rotation: number): number | null {
  if (!energySupport(graph, setup).supported) return null;
  const conf = conformationAt(setup, rotation);
  let total = 0;
  for (const f of conf.front) {
    for (const r of conf.rear) {
      total += pairEnergyKJ(groupClass(graph, f.atom), groupClass(graph, r.atom), dihedralBetween(conf, f.atom, r.atom));
    }
  }
  return total;
}

export type ProfilePoint = { angle: number; kJ: number };
export type ProfileFeature = { angle: number; kJ: number; kind: "minimum" | "maximum"; name: string };

export type EnergyProfile =
  | { supported: false; reason: string }
  | {
      supported: true;
      points: ProfilePoint[];
      /** Energies relative to the lowest point of this molecule's own profile. */
      baselineKJ: number;
      features: ProfileFeature[];
      model: typeof ENERGY_MODEL;
    };

/** The full 0..360° profile in the reference dihedral. */
export function energyProfile(graph: ConformationGraph, setup: TorsionSetup, stepDegrees = 2): EnergyProfile {
  const support = energySupport(graph, setup);
  if (!support.supported) return { supported: false, reason: support.reason };
  const raw: ProfilePoint[] = [];
  for (let angle = 0; angle <= 360; angle += stepDegrees) raw.push({ angle, kJ: strainEnergyKJ(graph, setup, angle) ?? 0 });
  const baselineKJ = Math.min(...raw.map((p) => p.kJ));
  const points = raw.map((p) => ({ angle: p.angle, kJ: p.kJ - baselineKJ }));
  const features: ProfileFeature[] = [];
  const n = points.length - 1;
  const eps = 1e-9;
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n].kJ;
    const here = points[i].kJ;
    const next = points[(i + 1) % n].kJ;
    if (here <= prev + eps && here <= next + eps && (here < prev - eps || here < next - eps)) {
      features.push({ angle: points[i].angle, kJ: here, kind: "minimum", name: nameFeature(graph, setup, points[i].angle) });
    } else if (here >= prev - eps && here >= next - eps && (here > prev + eps || here > next + eps)) {
      features.push({ angle: points[i].angle, kJ: here, kind: "maximum", name: nameFeature(graph, setup, points[i].angle) });
    }
  }
  return { supported: true, points, baselineKJ, features: dedupe(features), model: ENERGY_MODEL };
}

function dedupe(features: ProfileFeature[]): ProfileFeature[] {
  const out: ProfileFeature[] = [];
  for (const feature of features) {
    if (!out.some((other) => other.kind === feature.kind && Math.abs(wrap180(other.angle - feature.angle)) < 6)) out.push(feature);
  }
  return out;
}

function nameFeature(graph: ConformationGraph, setup: TorsionSetup, angle: number): string {
  return classify(graph, setup, angle).name;
}

// ------------------------------------------------------------------------------------------------
// Qualitative comparison (always available) for bonds the numeric model does not cover
// ------------------------------------------------------------------------------------------------

export type QualitativeAssessment = {
  staggeredVsEclipsed: string;
  stericNote: string;
  caveats: string[];
};

export function qualitativeAssessment(graph: ConformationGraph, setup: TorsionSetup, rotation: number): QualitativeAssessment {
  const cls = classify(graph, setup, rotation);
  const heavyFront = setup.front.slots.filter((s) => !isHydrogenIndex(graph, s));
  const heavyRear = setup.rear.slots.filter((s) => !isHydrogenIndex(graph, s));
  const caveats: string[] = [];
  const polar = [...heavyFront, ...heavyRear].filter((s) => [7, 8, 9].includes(graph.atoms[s].atomicNumber));
  if (polar.length >= 2) {
    caveats.push("Two electronegative substituents (N, O, F) can favour a gauche arrangement (the gauche effect) through hyperconjugation or hydrogen bonding, so the usual 'anti is lower' rule may not hold.");
  }
  const halogens = [...heavyFront, ...heavyRear].filter((s) => [17, 35, 53].includes(graph.atoms[s].atomicNumber));
  if (halogens.length >= 2) caveats.push("Dipole repulsion between halogens favours anti in the gas phase, but polar solvents reduce the preference.");
  const gaucheOrEclipsed = cls.relations.filter((r) => r.relation === "gauche" || r.relation === "eclipsed");
  const stericNote =
    heavyFront.length === 0 || heavyRear.length === 0
      ? "Only hydrogens sit on one end, so the only strain at this angle is torsional."
      : gaucheOrEclipsed.length === 0
        ? "No two non-hydrogen groups are gauche or eclipsed at this angle."
        : `${gaucheOrEclipsed.length} pair${gaucheOrEclipsed.length === 1 ? "" : "s"} of non-hydrogen groups ${gaucheOrEclipsed.map((r) => r.relation).filter((v, i, a) => a.indexOf(v) === i).join(" / ")} at this angle add steric strain.`;
  return {
    staggeredVsEclipsed:
      cls.kind === "staggered"
        ? "Staggered conformations are lower in energy than eclipsed ones because adjacent bonds are as far apart as possible."
        : cls.kind === "eclipsed"
          ? "Eclipsed conformations are energy maxima: bonds on adjacent atoms line up and their electron pairs repel."
          : "Between a staggered minimum and an eclipsed maximum.",
    stericNote,
    caveats,
  };
}

// ------------------------------------------------------------------------------------------------
// Projections: Newman, sawhorse, and the conversions between them
// ------------------------------------------------------------------------------------------------

export type Labelled = { atom: number; label: string };

/** Newman projection: angles only (clockwise from 12 o'clock). */
export type NewmanDiagram = {
  frontAtom: number;
  rearAtom: number;
  rotation: number;
  front: Array<Labelled & { angle: number }>;
  rear: Array<Labelled & { angle: number }>;
};

export function atomLabel(graph: ConformationGraph, atom: number): string {
  if (atom >= graph.implicitHydrogenBase) return "H";
  const info = graph.atoms[atom];
  if (info.atomicNumber === 1) return info.isotope === 2 ? "D" : info.isotope === 3 ? "T" : "H";
  // A one-atom group is named by its element; a larger group by its first atom (the full name appears in the legend).
  return `${info.isotope ? info.isotope : ""}${info.symbol}`;
}

export function newmanDiagram(graph: ConformationGraph, setup: TorsionSetup, rotation: number): NewmanDiagram {
  const conf = conformationAt(setup, rotation);
  return {
    frontAtom: setup.front.atom,
    rearAtom: setup.rear.atom,
    rotation: conf.rotation,
    front: conf.front.map((item) => ({ ...item, label: atomLabel(graph, item.atom) })),
    rear: conf.rear.map((item) => ({ ...item, label: atomLabel(graph, item.atom) })),
  };
}

// Sawhorse geometry (arbitrary units): bond length 1.54, substituent length 1, tetrahedral lean 1/3.
const BOND = 1.54;
const SUB_LENGTH = 1;
const LEAN = 1 / 3;
const RADIAL = Math.sqrt(1 - LEAN * LEAN);
const OBLIQUE = { x: 0.42, y: 0.28 };

export type Point2 = { x: number; y: number };

export type SawhorseDiagram = {
  frontAtom: number;
  rearAtom: number;
  rotation: number;
  frontCarbon: Point2;
  rearCarbon: Point2;
  front: Array<Labelled & { end: Point2 }>;
  rear: Array<Labelled & { end: Point2 }>;
};

const oblique = (p: Vec3): Point2 => ({ x: p.x - OBLIQUE.x * p.z, y: p.y - OBLIQUE.y * p.z });

/** 3D position of a substituent end for a given role and projection angle (clockwise from 12 o'clock). */
export function substituentPoint3D(role: "front" | "rear", angle: number): Vec3 {
  const radians = (angle * Math.PI) / 180;
  const centreZ = role === "front" ? BOND / 2 : -BOND / 2;
  const lean = role === "front" ? LEAN : -LEAN;
  return vec(RADIAL * SUB_LENGTH * Math.sin(radians), RADIAL * SUB_LENGTH * Math.cos(radians), centreZ + lean * SUB_LENGTH);
}

export function newmanToSawhorse(newman: NewmanDiagram): SawhorseDiagram {
  return {
    frontAtom: newman.frontAtom,
    rearAtom: newman.rearAtom,
    rotation: newman.rotation,
    frontCarbon: oblique(vec(0, 0, BOND / 2)),
    rearCarbon: oblique(vec(0, 0, -BOND / 2)),
    front: newman.front.map((item) => ({ atom: item.atom, label: item.label, end: oblique(substituentPoint3D("front", item.angle)) })),
    rear: newman.rear.map((item) => ({ atom: item.atom, label: item.label, end: oblique(substituentPoint3D("rear", item.angle)) })),
  };
}

/** Recovers the Newman angles from a sawhorse drawing (the oblique shift is removed using the known depth of each role). */
export function sawhorseToNewman(sawhorse: SawhorseDiagram): NewmanDiagram {
  const angleOf = (role: "front" | "rear", end: Point2): number => {
    const centreZ = role === "front" ? BOND / 2 : -BOND / 2;
    const z = centreZ + (role === "front" ? LEAN : -LEAN) * SUB_LENGTH;
    const x = end.x + OBLIQUE.x * z;
    const y = end.y + OBLIQUE.y * z;
    return wrap360((Math.atan2(x, y) * 180) / Math.PI);
  };
  return {
    frontAtom: sawhorse.frontAtom,
    rearAtom: sawhorse.rearAtom,
    rotation: sawhorse.rotation,
    front: sawhorse.front.map((item) => ({ atom: item.atom, label: item.label, angle: angleOf("front", item.end) })),
    rear: sawhorse.rear.map((item) => ({ atom: item.atom, label: item.label, angle: angleOf("rear", item.end) })),
  };
}

// ------------------------------------------------------------------------------------------------
// Validation helpers (3D)
// ------------------------------------------------------------------------------------------------

/** IUPAC torsion (degrees, positive = clockwise looking from b to c) of four 3D points. */
export function torsionDegrees(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const b1 = sub(b, a);
  const b2 = sub(c, b);
  const b3 = sub(d, c);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const x = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  const triple = b1.x * n2.x + b1.y * n2.y + b1.z * n2.z;
  const y = Math.hypot(b2.x, b2.y, b2.z) * triple;
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * V2000 molblock (3D) of the two bonded atoms with the first atom of every substituent, for an sp3/sp3 bond.
 * RDKit perceives stereo from the coordinates, so reading it back checks both the handedness of each end and
 * the dihedral angles. Validation only.
 */
export function torsionCoreMolblock(graph: ConformationGraph, setup: TorsionSetup, rotation: number): string {
  const conf = conformationAt(setup, rotation);
  const atoms: Array<{ symbol: string; p: Vec3 }> = [];
  const bonds: Array<[number, number]> = [];
  const symbolFor = (atom: number) => (isHydrogenIndex(graph, atom) ? "H" : graph.atoms[atom].symbol);
  atoms.push({ symbol: graph.atoms[setup.front.atom].symbol, p: vec(0, 0, BOND / 2) });
  atoms.push({ symbol: graph.atoms[setup.rear.atom].symbol, p: vec(0, 0, -BOND / 2) });
  bonds.push([1, 2]);
  for (const item of conf.front) {
    atoms.push({ symbol: symbolFor(item.atom), p: substituentPoint3D("front", item.angle) });
    bonds.push([1, atoms.length]);
  }
  for (const item of conf.rear) {
    atoms.push({ symbol: symbolFor(item.atom), p: substituentPoint3D("rear", item.angle) });
    bonds.push([2, atoms.length]);
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

export function rearPoint(conformation: Conformation, atom: number): Vec3 | null {
  const item = conformation.rear.find((entry) => entry.atom === atom);
  return item ? substituentPoint3D("rear", item.angle) : null;
}
export const FRONT_CARBON_3D: Vec3 = vec(0, 0, BOND / 2);
export const REAR_CARBON_3D: Vec3 = vec(0, 0, -BOND / 2);

