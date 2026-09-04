import { getRDKit } from "../rdkit";

const MAX_SVG_CACHE_ENTRIES = 160;
const moleculeSvgCache = new Map<string, string | null>();

// Keep deuterium chemically represented as [2H] internally, but render it
// using the conventional organic-chemistry label "D" in molecule drawings.
const MOLECULE_DRAW_OPTIONS = JSON.stringify({
  atomLabelDeuteriumTritium: true,
});

function rememberSvg(key: string, svg: string | null) {
  moleculeSvgCache.delete(key);
  moleculeSvgCache.set(key, svg);

  if (moleculeSvgCache.size > MAX_SVG_CACHE_ENTRIES) {
    const oldestKey = moleculeSvgCache.keys().next().value;
    if (oldestKey !== undefined) moleculeSvgCache.delete(oldestKey);
  }
}

export async function getMoleculeSvg(smiles: string): Promise<string | null> {
  const cacheKey = smiles.trim();
  if (!cacheKey) return null;

  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let mol: any = null;

  try {
    const RDKit = await getRDKit();
    mol = RDKit.get_mol(cacheKey);

    if (!mol) {
      rememberSvg(cacheKey, null);
      return null;
    }

    const svg = mol.get_svg_with_highlights(MOLECULE_DRAW_OPTIONS);
    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.error("Failed to generate molecule SVG:", error);
    return null;
  } finally {
    mol?.delete?.();
  }
}


type V2000Bond = {
  lineIndex: number;
  atom1: number;
  atom2: number;
  bondType: number;
};

function parseV2000AtomSymbol(line: string): string {
  return line.slice(31, 34).trim();
}

function rewriteV2000BondLine(
  line: string,
  atom1: number,
  atom2: number,
  bondType: number,
  stereo: number,
): string {
  return `${String(atom1).padStart(3)}${String(atom2).padStart(3)}${String(bondType).padStart(3)}${String(stereo).padStart(3)}${line.slice(12)}`;
}

/**
 * Rewrites the two vicinal C-OH bonds of a simple syn diol as matching
 * wedge/dash bonds for presentation. The modified molblock is reparsed and
 * accepted only when it represents exactly the same isomeric structure as the
 * original SMILES, so this is a drawing preference rather than a chemistry
 * mutation.
 */
function vicinalDiolPresentationMolBlock(
  molBlock: string,
  stereoCodes: readonly [1 | 6, 1 | 6],
): string | null {
  if (!molBlock || molBlock.includes("V3000")) return null;

  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return null;

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const atomStart = 4;
  const bondStart = atomStart + atomCount;
  if (lines.length < bondStart + bondCount) return null;

  const atomSymbols = Array.from({ length: atomCount }, (_, index) =>
    parseV2000AtomSymbol(lines[atomStart + index] ?? ""),
  );
  const degrees = Array.from({ length: atomCount }, () => 0);
  const bonds: V2000Bond[] = [];

  for (let index = 0; index < bondCount; index += 1) {
    const lineIndex = bondStart + index;
    const line = lines[lineIndex] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (
      !Number.isInteger(atom1) ||
      !Number.isInteger(atom2) ||
      atom1 < 0 ||
      atom2 < 0 ||
      atom1 >= atomCount ||
      atom2 >= atomCount
    ) {
      continue;
    }
    degrees[atom1] += 1;
    degrees[atom2] += 1;
    bonds.push({ lineIndex, atom1, atom2, bondType });
  }

  const hydroxylBonds = bonds.flatMap((bond) => {
    if (bond.bondType !== 1) return [];
    const firstIsO = atomSymbols[bond.atom1] === "O";
    const secondIsO = atomSymbols[bond.atom2] === "O";
    if (firstIsO === secondIsO) return [];

    const oxygen = firstIsO ? bond.atom1 : bond.atom2;
    const carbon = firstIsO ? bond.atom2 : bond.atom1;
    if (degrees[oxygen] !== 1 || atomSymbols[carbon] !== "C") return [];

    return [{ ...bond, oxygen, carbon }];
  });

  let selected:
    | [typeof hydroxylBonds[number], typeof hydroxylBonds[number]]
    | null = null;

  for (let left = 0; left < hydroxylBonds.length && !selected; left += 1) {
    for (let right = left + 1; right < hydroxylBonds.length; right += 1) {
      const a = hydroxylBonds[left];
      const b = hydroxylBonds[right];
      const adjacent = bonds.some(
        (bond) =>
          bond.bondType === 1 &&
          ((bond.atom1 === a.carbon && bond.atom2 === b.carbon) ||
            (bond.atom1 === b.carbon && bond.atom2 === a.carbon)),
      );
      if (adjacent) {
        selected = [a, b];
        break;
      }
    }
  }

  if (!selected) return null;
  const stereocenters = new Set(selected.map((item) => item.carbon));

  for (const bond of bonds) {
    if (!stereocenters.has(bond.atom1) && !stereocenters.has(bond.atom2)) continue;
    const line = lines[bond.lineIndex] ?? "";
    lines[bond.lineIndex] = rewriteV2000BondLine(
      line,
      bond.atom1 + 1,
      bond.atom2 + 1,
      bond.bondType,
      0,
    );
  }

  selected.forEach((bond, index) => {
    const line = lines[bond.lineIndex] ?? "";
    lines[bond.lineIndex] = rewriteV2000BondLine(
      line,
      bond.carbon + 1,
      bond.oxygen + 1,
      bond.bondType,
      stereoCodes[index],
    );
  });

  return lines.join("\n");
}

type VicinalDiolFaceMode = "syn" | "anti";

const STEREO_PRESENTATION_DRAW_OPTIONS = JSON.stringify({
  atomLabelDeuteriumTritium: true,
  useMolBlockWedging: true,
});

async function getVicinalDiolStereoSvg(
  smiles: string,
  mode: VicinalDiolFaceMode,
): Promise<string | null> {
  const trimmed = smiles.trim();
  const cacheKey = `${mode}-diol::${trimmed}`;
  if (!trimmed) return null;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let sourceMol: any = null;
  try {
    const RDKit = await getRDKit();
    sourceMol = RDKit.get_mol(trimmed);
    if (!sourceMol) return null;

    const sourceCanonical = sourceMol.get_smiles?.();
    const molBlock = sourceMol.get_molblock?.();
    if (typeof molBlock !== "string") return getMoleculeSvg(smiles);

    const candidates: ReadonlyArray<readonly [1 | 6, 1 | 6]> =
      mode === "syn"
        ? [[1, 1], [6, 6]]
        : [[1, 6], [6, 1]];

    let representativeSvg: string | null = null;

    for (const codes of candidates) {
      const presentationBlock = vicinalDiolPresentationMolBlock(molBlock, codes);
      if (!presentationBlock) continue;

      let presentationMol: any = null;
      try {
        presentationMol = RDKit.get_mol(presentationBlock);
        if (!presentationMol) continue;

        const svg = presentationMol.get_svg_with_highlights(
          STEREO_PRESENTATION_DRAW_OPTIONS,
        );
        representativeSvg ??= svg;

        const presentationCanonical = presentationMol.get_smiles?.();
        if (
          typeof sourceCanonical === "string" &&
          typeof presentationCanonical === "string" &&
          presentationCanonical === sourceCanonical
        ) {
          rememberSvg(cacheKey, svg);
          return svg;
        }
      } finally {
        presentationMol?.delete?.();
      }
    }

    if (representativeSvg) {
      rememberSvg(cacheKey, representativeSvg);
      return representativeSvg;
    }

    const fallback = sourceMol.get_svg_with_highlights(MOLECULE_DRAW_OPTIONS);
    rememberSvg(cacheKey, fallback);
    return fallback;
  } catch (error) {
    console.error(`Failed to generate ${mode}-diol SVG:`, error);
    return getMoleculeSvg(smiles);
  } finally {
    sourceMol?.delete?.();
  }
}

export async function getSynDiolSvg(smiles: string): Promise<string | null> {
  return getVicinalDiolStereoSvg(smiles, "syn");
}

export async function getAntiDiolSvg(smiles: string): Promise<string | null> {
  return getVicinalDiolStereoSvg(smiles, "anti");
}


function halogenAtomLabelOverridesFromMolBlock(molBlock: string): Record<string, string> {
  if (!molBlock || molBlock.includes("V3000")) return {};

  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return {};

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || atomCount <= 0) return {};

  const atomStart = 4;
  const labels: Record<string, string> = {};

  for (let index = 0; index < atomCount; index += 1) {
    const line = lines[atomStart + index] ?? "";
    const symbol = parseV2000AtomSymbol(line);
    if (symbol === "Cl" || symbol === "Br" || symbol === "I") {
      labels[String(index)] = "X";
    }
  }

  return labels;
}

export async function getGenericHalogenSvg(smiles: string): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;

  const cacheKey = `generic-halogen::${trimmed}`;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let mol: any = null;
  try {
    const RDKit = await getRDKit();
    mol = RDKit.get_mol(trimmed);
    if (!mol) {
      rememberSvg(cacheKey, null);
      return null;
    }

    const molBlock = mol.get_molblock?.();
    if (typeof molBlock !== "string") {
      const fallback = mol.get_svg_with_highlights(MOLECULE_DRAW_OPTIONS);
      rememberSvg(cacheKey, fallback);
      return fallback;
    }

    const atomLabels = halogenAtomLabelOverridesFromMolBlock(molBlock);
    if (Object.keys(atomLabels).length === 0) {
      const fallback = mol.get_svg_with_highlights(MOLECULE_DRAW_OPTIONS);
      rememberSvg(cacheKey, fallback);
      return fallback;
    }

    const svg = mol.get_svg_with_highlights(
      JSON.stringify({
        atomLabelDeuteriumTritium: true,
        atomLabels,
      }),
    );
    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.error("Failed to generate generic-halogen SVG:", error);
    return getMoleculeSvg(smiles);
  } finally {
    mol?.delete?.();
  }
}

type SulfonateBond = {
  atom1: number;
  atom2: number;
  bondOrder: number;
  stereo: number;
  sourceLine: string;
};

type ParsedSulfonateMolBlock = {
  header: string[];
  countsLine: string;
  atoms: string[];
  symbols: string[];
  bonds: SulfonateBond[];
  adjacency: number[][];
  mEndLine: string;
};

type CondensedSulfonatePresentation = {
  molBlock: string;
  dummyAtomIndex: number;
  abbreviation: "Ts" | "Ms";
};

function rewriteV2000AtomSymbolForDisplay(line: string, symbol: string): string {
  if (line.length < 34) return line;
  return `${line.slice(0, 31)}${symbol.padEnd(3).slice(0, 3)}${line.slice(34)}`;
}

function rewriteV2000BondForDisplay(
  sourceLine: string,
  atom1: number,
  atom2: number,
  bondOrder: number,
  stereo: number,
): string {
  const suffix = sourceLine.length > 12 ? sourceLine.slice(12) : "";
  return `${String(atom1 + 1).padStart(3)}${String(atom2 + 1).padStart(3)}${String(bondOrder).padStart(3)}${String(stereo).padStart(3)}${suffix}`;
}

function rewriteV2000CountsForDisplay(
  sourceLine: string,
  atomCount: number,
  bondCount: number,
): string {
  const suffix = sourceLine.length > 6 ? sourceLine.slice(6) : "  0  0  0  0            999 V2000";
  return `${String(atomCount).padStart(3)}${String(bondCount).padStart(3)}${suffix}`;
}

function parseSulfonateMolBlock(molBlock: string): ParsedSulfonateMolBlock | null {
  if (!molBlock || molBlock.includes("V3000")) return null;

  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return null;

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const atomStart = 4;
  const bondStart = atomStart + atomCount;
  if (lines.length < bondStart + bondCount) return null;

  const atoms = lines.slice(atomStart, bondStart);
  const symbols = atoms.map(parseV2000AtomSymbol);
  const adjacency = Array.from({ length: atomCount }, () => [] as number[]);
  const bonds: SulfonateBond[] = [];

  for (let index = 0; index < bondCount; index += 1) {
    const sourceLine = lines[bondStart + index] ?? "";
    const atom1 = Number.parseInt(sourceLine.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(sourceLine.slice(3, 6).trim(), 10) - 1;
    const bondOrder = Number.parseInt(sourceLine.slice(6, 9).trim(), 10);
    const stereo = Number.parseInt(sourceLine.slice(9, 12).trim() || "0", 10);

    if (
      !Number.isInteger(atom1) ||
      !Number.isInteger(atom2) ||
      !Number.isInteger(bondOrder) ||
      atom1 < 0 ||
      atom2 < 0 ||
      atom1 >= atomCount ||
      atom2 >= atomCount
    ) {
      return null;
    }

    const bondIndex = bonds.length;
    bonds.push({
      atom1,
      atom2,
      bondOrder,
      stereo: Number.isInteger(stereo) ? stereo : 0,
      sourceLine,
    });
    adjacency[atom1].push(bondIndex);
    adjacency[atom2].push(bondIndex);
  }

  const tail = lines.slice(bondStart + bondCount);
  const mEndLine = tail.find((line) => line.trim() === "M  END") ?? "M  END";

  return {
    header: lines.slice(0, 3),
    countsLine: lines[3] ?? "",
    atoms,
    symbols,
    bonds,
    adjacency,
    mEndLine,
  };
}

function otherSulfonateBondAtom(bond: SulfonateBond, atomIndex: number): number {
  return bond.atom1 === atomIndex ? bond.atom2 : bond.atom1;
}

function carbonSideGroup(
  parsed: ParsedSulfonateMolBlock,
  startAtom: number,
  sulfurAtom: number,
): Set<number> {
  const visited = new Set<number>();
  const stack = [startAtom];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current) || current === sulfurAtom) continue;
    if (parsed.symbols[current] !== "C") continue;
    visited.add(current);

    for (const bondIndex of parsed.adjacency[current]) {
      const neighbor = otherSulfonateBondAtom(parsed.bonds[bondIndex], current);
      if (
        neighbor !== sulfurAtom &&
        parsed.symbols[neighbor] === "C" &&
        !visited.has(neighbor)
      ) {
        stack.push(neighbor);
      }
    }
  }

  return visited;
}

function classifySulfonateAbbreviation(
  parsed: ParsedSulfonateMolBlock,
  sulfurAtom: number,
  sideCarbon: number,
): "Ts" | "Ms" | null {
  const sideGroup = carbonSideGroup(parsed, sideCarbon, sulfurAtom);

  // Mesyl = CH3-SO2-. In the heavy-atom graph the methyl carbon is the only
  // carbon on the sulfonyl side of sulfur.
  if (sideGroup.size === 1 && parsed.adjacency[sideCarbon].length === 1) {
    return "Ms";
  }

  // Tosyl = p-tolyl-SO2-. The aryl/methyl portion contains seven carbons.
  // Requiring at least seven C-C bonds prevents ordinary alkyl sulfonates from
  // being abbreviated incorrectly as Ts.
  if (sideGroup.size === 7) {
    const carbonCarbonBondCount = parsed.bonds.filter(
      (bond) => sideGroup.has(bond.atom1) && sideGroup.has(bond.atom2),
    ).length;
    if (carbonCarbonBondCount >= 7) return "Ts";
  }

  return null;
}

function findCondensableSulfonate(
  parsed: ParsedSulfonateMolBlock,
): {
  sulfurAtom: number;
  anchorOxygen: number;
  sideCarbon: number;
  oxygenSulfurBond: SulfonateBond;
  abbreviation: "Ts" | "Ms";
} | null {
  for (let sulfurAtom = 0; sulfurAtom < parsed.symbols.length; sulfurAtom += 1) {
    if (parsed.symbols[sulfurAtom] !== "S") continue;

    const neighborInfo = parsed.adjacency[sulfurAtom].map((bondIndex) => {
      const bond = parsed.bonds[bondIndex];
      const neighbor = otherSulfonateBondAtom(bond, sulfurAtom);
      return { bond, neighbor, symbol: parsed.symbols[neighbor] };
    });

    const doubleOxygens = neighborInfo.filter(
      ({ bond, symbol }) => symbol === "O" && bond.bondOrder === 2,
    );
    if (doubleOxygens.length !== 2) continue;

    const anchor = neighborInfo.find(({ bond, neighbor, symbol }) => {
      if (symbol !== "O" || bond.bondOrder !== 1) return false;
      return parsed.adjacency[neighbor].some((otherBondIndex) => {
        const otherBond = parsed.bonds[otherBondIndex];
        const otherNeighbor = otherSulfonateBondAtom(otherBond, neighbor);
        return otherNeighbor !== sulfurAtom && parsed.symbols[otherNeighbor] === "C";
      });
    });
    if (!anchor) continue;

    const sideCarbonEntry = neighborInfo.find(
      ({ bond, symbol }) => symbol === "C" && bond.bondOrder === 1,
    );
    if (!sideCarbonEntry) continue;

    const abbreviation = classifySulfonateAbbreviation(
      parsed,
      sulfurAtom,
      sideCarbonEntry.neighbor,
    );
    if (!abbreviation) continue;

    return {
      sulfurAtom,
      anchorOxygen: anchor.neighbor,
      sideCarbon: sideCarbonEntry.neighbor,
      oxygenSulfurBond: anchor.bond,
      abbreviation,
    };
  }

  return null;
}

function condensedSulfonateMolBlock(
  molBlock: string,
): CondensedSulfonatePresentation | null {
  const parsed = parseSulfonateMolBlock(molBlock);
  if (!parsed) return null;

  const match = findCondensableSulfonate(parsed);
  if (!match) return null;

  // Delete everything on the sulfonyl side of the alcohol oxygen, then add a
  // single dummy atom at sulfur's old coordinates. RDKit's atomLabels drawing
  // option turns that dummy into Ts or Ms, producing the familiar R-OTs/OMs
  // teaching shorthand without changing the chemistry stored in SMILES.
  const deleted = new Set<number>();
  const stack = [match.sulfurAtom];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (deleted.has(current) || current === match.anchorOxygen) continue;
    deleted.add(current);

    for (const bondIndex of parsed.adjacency[current]) {
      const neighbor = otherSulfonateBondAtom(parsed.bonds[bondIndex], current);
      if (neighbor !== match.anchorOxygen && !deleted.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  const keptAtoms = Array.from({ length: parsed.atoms.length }, (_, index) => index)
    .filter((index) => !deleted.has(index));
  const oldToNew = new Map<number, number>();
  keptAtoms.forEach((oldIndex, newIndex) => oldToNew.set(oldIndex, newIndex));

  const newAtoms = keptAtoms.map((oldIndex) => parsed.atoms[oldIndex]);
  const dummyAtomIndex = newAtoms.length;
  newAtoms.push(
    rewriteV2000AtomSymbolForDisplay(parsed.atoms[match.sulfurAtom], "*"),
  );

  const newBonds: string[] = [];
  for (const bond of parsed.bonds) {
    if (deleted.has(bond.atom1) || deleted.has(bond.atom2)) continue;
    const newAtom1 = oldToNew.get(bond.atom1);
    const newAtom2 = oldToNew.get(bond.atom2);
    if (newAtom1 === undefined || newAtom2 === undefined) continue;
    newBonds.push(
      rewriteV2000BondForDisplay(
        bond.sourceLine,
        newAtom1,
        newAtom2,
        bond.bondOrder,
        bond.stereo,
      ),
    );
  }

  const newAnchorOxygen = oldToNew.get(match.anchorOxygen);
  if (newAnchorOxygen === undefined) return null;
  newBonds.push(
    rewriteV2000BondForDisplay(
      match.oxygenSulfurBond.sourceLine,
      newAnchorOxygen,
      dummyAtomIndex,
      1,
      0,
    ),
  );

  const rebuilt = [
    ...parsed.header,
    rewriteV2000CountsForDisplay(parsed.countsLine, newAtoms.length, newBonds.length),
    ...newAtoms,
    ...newBonds,
    parsed.mEndLine,
    "",
  ].join("\n");

  return {
    molBlock: rebuilt,
    dummyAtomIndex,
    abbreviation: match.abbreviation,
  };
}

export async function getCondensedSulfonateSvg(
  smiles: string,
): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;

  const cacheKey = `condensed-sulfonate::${trimmed}`;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let sourceMol: any = null;
  let displayMol: any = null;

  try {
    const RDKit = await getRDKit();
    sourceMol = RDKit.get_mol(trimmed);
    if (!sourceMol) return null;

    const molBlock = sourceMol.get_molblock?.();
    if (typeof molBlock !== "string") return getMoleculeSvg(trimmed);

    const presentation = condensedSulfonateMolBlock(molBlock);
    if (!presentation) return getMoleculeSvg(trimmed);

    displayMol = RDKit.get_mol(presentation.molBlock);
    if (!displayMol) return getMoleculeSvg(trimmed);

    const svg = displayMol.get_svg_with_highlights(
      JSON.stringify({
        atomLabelDeuteriumTritium: true,
        atomLabels: {
          [String(presentation.dummyAtomIndex)]: presentation.abbreviation,
        },
      }),
    );

    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.error("Failed to generate condensed Ts/Ms SVG:", error);
    return getMoleculeSvg(trimmed);
  } finally {
    displayMol?.delete?.();
    sourceMol?.delete?.();
  }
}
