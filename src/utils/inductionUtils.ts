import { getRDKit } from "./analyzeSmiles";

export type InductiveModifier = {
  label: string;
  pkaShift: number;
  distance: number;
  explanation: string;
};

type ParsedMolGraph = {
  adjacency: Map<number, number[]>;
};

function parseMolBlockGraph(molBlock: string): ParsedMolGraph {
  const lines = molBlock.split(/\r?\n/);
  const countsLine = lines[3];

  if (!countsLine) {
    return { adjacency: new Map() };
  }

  const atomCount = Number.parseInt(countsLine.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(countsLine.slice(3, 6).trim(), 10);

  const adjacency = new Map<number, number[]>();

  for (let i = 0; i < atomCount; i++) {
    adjacency.set(i, []);
  }

  const bondStart = 4 + atomCount;

  for (let i = 0; i < bondCount; i++) {
    const line = lines[bondStart + i];
    if (!line) continue;

    const atomA = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atomB = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;

    if (Number.isNaN(atomA) || Number.isNaN(atomB)) continue;

    adjacency.get(atomA)?.push(atomB);
    adjacency.get(atomB)?.push(atomA);
  }

  return { adjacency };
}

function extractAtomMatches(matchesJson: string): number[][] {
  try {
    const parsed = JSON.parse(matchesJson);

    if (Array.isArray(parsed)) {
      return parsed
        .map((match) => {
          if (Array.isArray(match)) return match;
          if (Array.isArray(match.atoms)) return match.atoms;
          return [];
        })
        .filter((atoms) => atoms.length > 0);
    }

    if (parsed && Array.isArray(parsed.atoms)) {
      return [parsed.atoms];
    }

    return [];
  } catch {
    return [];
  }
}

function getShortestBondDistance(
  adjacency: Map<number, number[]>,
  start: number,
  target: number
): number | null {
  const visited = new Set<number>();
  const queue: Array<{ atom: number; distance: number }> = [
    { atom: start, distance: 0 },
  ];

  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (current.atom === target) {
      return current.distance;
    }

    const neighbors = adjacency.get(current.atom) ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;

      visited.add(neighbor);
      queue.push({
        atom: neighbor,
        distance: current.distance + 1,
      });
    }
  }

  return null;
}

function distanceMultiplier(distance: number): number {
  if (distance <= 0) return 0;
  if (distance === 1) return 1.0;
  if (distance === 2) return 0.65;
  if (distance === 3) return 0.35;
  if (distance === 4) return 0.15;
  return 0;
}

function describeDistance(distance: number): string {
  if (distance === 1) return "directly attached";
  if (distance === 2) return "very close";
  if (distance === 3) return "nearby";
  if (distance === 4) return "farther away";
  return "distant";
}

const INDUCTIVE_SUBSTITUENTS = [
  {
    label: "fluorine",
    smarts: "[F]",
    baseShift: -2.3,
    effect: "electron-withdrawing",
  },
  {
    label: "chlorine",
    smarts: "[Cl]",
    baseShift: -1.4,
    effect: "electron-withdrawing",
  },
  {
    label: "bromine",
    smarts: "[Br]",
    baseShift: -1.0,
    effect: "electron-withdrawing",
  },
  {
    label: "iodine",
    smarts: "[I]",
    baseShift: -0.6,
    effect: "electron-withdrawing",
  },
  {
    label: "nitro group",
    smarts: "[NX3+](=O)[O-]",
    baseShift: -2.0,
    effect: "electron-withdrawing",
  },
  {
    label: "cyano group",
    smarts: "[CX2]#N",
    baseShift: -1.6,
    effect: "electron-withdrawing",
  },
  {
    label: "carbonyl group",
    smarts: "[CX3](=[OX1])",
    baseShift: -1.1,
    effect: "electron-withdrawing",
  },
  {
    label: "alkoxy group",
    smarts: "[OX2][#6]",
    baseShift: -0.5,
    effect: "electron-withdrawing by induction",
  },
  {
    label: "alkyl group",
    smarts: "[CX4]",
    baseShift: 0.15,
    effect: "weakly electron-donating",
  },
] as const;

export async function getInductiveModifiersForSite(
  smiles: string,
  siteSmarts: string,
  anchorAtomIndexInMatch: number,
  inductionSensitivity: number,
  mode: "acidity" | "basicity"
): Promise<InductiveModifier[]> {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);

  if (!mol) return [];

  const molBlock = mol.get_molblock();
  const { adjacency } = parseMolBlockGraph(molBlock);

  const siteQuery = RDKit.get_qmol(siteSmarts);
  const siteMatches = extractAtomMatches(mol.get_substruct_matches(siteQuery));

  const rawModifiers: InductiveModifier[] = [];

  for (const siteMatch of siteMatches) {
    const siteAnchorIndex = siteMatch[anchorAtomIndexInMatch];

    if (siteAnchorIndex === undefined) continue;

    for (const substituent of INDUCTIVE_SUBSTITUENTS) {
      const query = RDKit.get_qmol(substituent.smarts);
      const matches = extractAtomMatches(mol.get_substruct_matches(query));

      for (const match of matches) {
        const substituentAnchorIndex = match[0];

        if (substituentAnchorIndex === undefined) continue;

        // Do not count the acidic/basic site itself as its own modifier.
        if (substituentAnchorIndex === siteAnchorIndex) continue;

        const distance = getShortestBondDistance(
          adjacency,
          siteAnchorIndex,
          substituentAnchorIndex
        );

        if (distance === null) continue;

        const multiplier = distanceMultiplier(distance);
        if (multiplier === 0) continue;

        const pkaShift =
          substituent.baseShift * multiplier * inductionSensitivity;

        const distanceText = describeDistance(distance);

        const acidityExplanation = `${substituent.label} is ${distanceText} to the acidic site, so its ${substituent.effect} inductive effect ${
          pkaShift < 0 ? "stabilizes" : "destabilizes"
        } the conjugate base and ${
          pkaShift < 0 ? "lowers" : "raises"
        } the estimated pKa.`;

        const basicityExplanation = `${substituent.label} is ${distanceText} to the basic site, so its ${substituent.effect} inductive effect ${
          pkaShift < 0 ? "pulls electron density away from" : "pushes electron density toward"
        } the basic atom and ${
          pkaShift < 0 ? "weakens" : "strengthens"
        } basicity.`;

        rawModifiers.push({
          label: substituent.label,
          pkaShift,
          distance,
          explanation:
            mode === "acidity" ? acidityExplanation : basicityExplanation,
        });
      }

      query.delete();
    }
  }

  siteQuery.delete();
  mol.delete();

  rawModifiers.sort((a, b) => Math.abs(b.pkaShift) - Math.abs(a.pkaShift));

  return rawModifiers.slice(0, 4).map((modifier, index) => ({
    ...modifier,
    pkaShift: modifier.pkaShift * Math.pow(0.7, index),
  }));
}