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

function looksLikeMolBlock(source: string): boolean {
  return /(?:V2000|V3000|M\s+END)/.test(source);
}

/**
 * Render a user-authored structure without regenerating its 2-D coordinates.
 * This preserves Ketcher's scaffold orientation and the specific bond that the
 * student used for wedge/dash depiction. The chemical stereochemistry is still
 * verified by RDKit when the molfile is parsed; this function changes only
 * presentation, not molecular identity.
 */
export async function getPreservedMolfileSvg(
  molfile: string | null | undefined,
): Promise<string | null> {
  const source = molfile?.trim() ?? "";
  if (!source) return null;

  const cacheKey = `preserved-molfile::${source}`;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let mol: any = null;
  try {
    const RDKit = await getRDKit();
    mol = RDKit.get_mol(source);
    if (!mol) {
      rememberSvg(cacheKey, null);
      return null;
    }

    // Do NOT call set_new_coords(): the coordinates and wedging in this molfile
    // are the user's Ketcher drawing and are intentionally the source of truth
    // for presentation.
    const svg = mol.get_svg_with_highlights(STEREO_PRESENTATION_DRAW_OPTIONS);
    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.warn("Failed to render preserved Ketcher molfile.", error);
    return null;
  } finally {
    mol?.delete?.();
  }
}

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


/**
 * Presentation-only wedge/dash helper for a tetrahedral carbon next to a
 * carbonyl that bears at least two exocyclic carbon substituents.  This is
 * useful for rearrangement products where the 2-D perspective is chemically
 * informative even when identical substituents mean the atom is not a true
 * stereocenter (for example a gem-dialkyl pinacol product).
 *
 * No chirality is added to the stored SMILES.  The altered molblock is used
 * only if reparsing it preserves the exact canonical isomeric structure.
 */
function tetrahedralPerspectiveMolBlock(
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

  const symbols = Array.from({ length: atomCount }, (_, index) =>
    parseV2000AtomSymbol(lines[atomStart + index] ?? ""),
  );
  const adjacency: number[][] = Array.from({ length: atomCount }, () => []);
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
      atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount
    ) continue;
    adjacency[atom1].push(atom2);
    adjacency[atom2].push(atom1);
    bonds.push({ lineIndex, atom1, atom2, bondType });
  }

  const bondBetween = (a: number, b: number) =>
    bonds.find(
      (bond) =>
        (bond.atom1 === a && bond.atom2 === b) ||
        (bond.atom1 === b && bond.atom2 === a),
    );

  const edgeIsInCycle = (a: number, b: number): boolean => {
    const seen = new Set<number>([a]);
    const queue = [a];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency[current]) {
        if ((current === a && next === b) || (current === b && next === a)) continue;
        if (seen.has(next)) continue;
        if (next === b) return true;
        seen.add(next);
        queue.push(next);
      }
    }
    return false;
  };

  for (let center = 0; center < atomCount; center += 1) {
    if (symbols[center] !== "C" || adjacency[center].length !== 4) continue;

    const carbonylNeighbor = adjacency[center].find((neighbor) => {
      if (symbols[neighbor] !== "C") return false;
      const connecting = bondBetween(center, neighbor);
      if (!connecting || connecting.bondType !== 1) return false;
      return adjacency[neighbor].some((other) => {
        const bond = bondBetween(neighbor, other);
        return symbols[other] === "O" && bond?.bondType === 2;
      });
    });
    if (carbonylNeighbor === undefined) continue;

    const exocyclicCarbonBonds = bonds.filter((bond) => {
      if (bond.bondType !== 1) return false;
      if (bond.atom1 !== center && bond.atom2 !== center) return false;
      const other = bond.atom1 === center ? bond.atom2 : bond.atom1;
      if (other === carbonylNeighbor || symbols[other] !== "C") return false;
      return !edgeIsInCycle(center, other);
    });
    if (exocyclicCarbonBonds.length < 2) continue;

    // Clear any existing presentation stereo around this center, then place
    // the first two exocyclic substituent bonds on opposite faces.
    for (const bond of bonds) {
      if (bond.atom1 !== center && bond.atom2 !== center) continue;
      const line = lines[bond.lineIndex] ?? "";
      lines[bond.lineIndex] = rewriteV2000BondLine(
        line,
        bond.atom1 + 1,
        bond.atom2 + 1,
        bond.bondType,
        0,
      );
    }

    exocyclicCarbonBonds.slice(0, 2).forEach((bond, index) => {
      const other = bond.atom1 === center ? bond.atom2 : bond.atom1;
      const line = lines[bond.lineIndex] ?? "";
      lines[bond.lineIndex] = rewriteV2000BondLine(
        line,
        center + 1,
        other + 1,
        bond.bondType,
        stereoCodes[index],
      );
    });

    return lines.join("\n");
  }

  return null;
}

export async function getTetrahedralPerspectiveSvg(
  smiles: string,
): Promise<string | null> {
  const trimmed = smiles.trim();
  const cacheKey = `tetrahedral-perspective::${trimmed}`;
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

    let representativeSvg: string | null = null;
    for (const codes of [[1, 6], [6, 1]] as const) {
      const presentationBlock = tetrahedralPerspectiveMolBlock(molBlock, codes);
      if (!presentationBlock) break;

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
    console.error("Failed to generate tetrahedral-perspective SVG:", error);
    return getMoleculeSvg(smiles);
  } finally {
    sourceMol?.delete?.();
  }
}


/**
 * Makes an untouched chiral alcohol center visually explicit after a reaction
 * without changing the molecular stereochemistry.  This is a presentation-only
 * helper: it tries opposite wedge/dash assignments on the C-OH bond and one
 * exocyclic carbon substituent, reparses the mol block, and accepts the drawing
 * only when RDKit reports the exact same canonical isomeric SMILES as the source.
 *
 * This is useful for transformations such as oxidation at another alcohol site,
 * where the spectator stereocenter is chemically retained but RDKit's fresh 2D
 * layout may choose a different bond for the wedge and make the product look
 * inverted even though its absolute configuration is unchanged.
 */
function explicitAlcoholStereoMolBlock(
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

  const symbols = Array.from({ length: atomCount }, (_, index) =>
    parseV2000AtomSymbol(lines[atomStart + index] ?? ""),
  );
  const adjacency: number[][] = Array.from({ length: atomCount }, () => []);
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
      atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount
    ) continue;
    adjacency[atom1].push(atom2);
    adjacency[atom2].push(atom1);
    bonds.push({ lineIndex, atom1, atom2, bondType });
  }

  const bondBetween = (a: number, b: number) =>
    bonds.find(
      (bond) =>
        (bond.atom1 === a && bond.atom2 === b) ||
        (bond.atom1 === b && bond.atom2 === a),
    );

  const edgeIsInCycle = (a: number, b: number): boolean => {
    const seen = new Set<number>([a]);
    const queue = [a];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency[current]) {
        if ((current === a && next === b) || (current === b && next === a)) continue;
        if (seen.has(next)) continue;
        if (next === b) return true;
        seen.add(next);
        queue.push(next);
      }
    }
    return false;
  };

  for (let center = 0; center < atomCount; center += 1) {
    if (symbols[center] !== "C" || adjacency[center].length !== 4) continue;

    const hydroxylOxygen = adjacency[center].find((neighbor) => {
      if (symbols[neighbor] !== "O" || adjacency[neighbor].length !== 1) return false;
      return bondBetween(center, neighbor)?.bondType === 1;
    });
    if (hydroxylOxygen === undefined) continue;

    // Prefer an exocyclic carbon substituent (typically methyl/alkyl) so the
    // visual convention is chemically intuitive: OH and that substituent are
    // shown on opposite faces while the ring skeleton remains in the plane.
    const exocyclicCarbon = adjacency[center].find((neighbor) => {
      if (symbols[neighbor] !== "C") return false;
      const bond = bondBetween(center, neighbor);
      return bond?.bondType === 1 && !edgeIsInCycle(center, neighbor);
    });
    if (exocyclicCarbon === undefined) continue;

    for (const bond of bonds) {
      if (bond.atom1 !== center && bond.atom2 !== center) continue;
      const line = lines[bond.lineIndex] ?? "";
      lines[bond.lineIndex] = rewriteV2000BondLine(
        line,
        bond.atom1 + 1,
        bond.atom2 + 1,
        bond.bondType,
        0,
      );
    }

    const hydroxylBond = bondBetween(center, hydroxylOxygen);
    const carbonBond = bondBetween(center, exocyclicCarbon);
    if (!hydroxylBond || !carbonBond) continue;

    const hydroxylLine = lines[hydroxylBond.lineIndex] ?? "";
    lines[hydroxylBond.lineIndex] = rewriteV2000BondLine(
      hydroxylLine,
      center + 1,
      hydroxylOxygen + 1,
      hydroxylBond.bondType,
      stereoCodes[0],
    );

    const carbonLine = lines[carbonBond.lineIndex] ?? "";
    lines[carbonBond.lineIndex] = rewriteV2000BondLine(
      carbonLine,
      center + 1,
      exocyclicCarbon + 1,
      carbonBond.bondType,
      stereoCodes[1],
    );

    return lines.join("\n");
  }

  return null;
}

export async function getExplicitAlcoholStereoSvg(
  smiles: string,
): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;

  const cacheKey = `explicit-alcohol-stereo::${trimmed}`;
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

    for (const codes of [[1, 6], [6, 1]] as const) {
      const presentationBlock = explicitAlcoholStereoMolBlock(molBlock, codes);
      if (!presentationBlock) break;

      let presentationMol: any = null;
      try {
        presentationMol = RDKit.get_mol(presentationBlock);
        if (!presentationMol) continue;

        const presentationCanonical = presentationMol.get_smiles?.();
        if (
          typeof sourceCanonical === "string" &&
          typeof presentationCanonical === "string" &&
          presentationCanonical === sourceCanonical
        ) {
          const svg = presentationMol.get_svg_with_highlights(
            STEREO_PRESENTATION_DRAW_OPTIONS,
          );
          rememberSvg(cacheKey, svg);
          return svg;
        }
      } finally {
        presentationMol?.delete?.();
      }
    }

    const fallback = sourceMol.get_svg_with_highlights(MOLECULE_DRAW_OPTIONS);
    rememberSvg(cacheKey, fallback);
    return fallback;
  } catch (error) {
    console.error("Failed to generate explicit alcohol stereo SVG:", error);
    return getMoleculeSvg(smiles);
  } finally {
    sourceMol?.delete?.();
  }
}




type ReferenceStereoBond = {
  begin: number;
  end: number;
  stereo: 1 | 6;
};

function parseSingleSubstructureAtomMap(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(Number).filter(Number.isInteger);
    }
    if (parsed && typeof parsed === "object") {
      const atoms = (parsed as { atoms?: unknown }).atoms;
      if (Array.isArray(atoms)) return atoms.map(Number).filter(Number.isInteger);
    }
  } catch {
    // fall through
  }
  return [];
}

/**
 * Extract the exact wedge/hash bond chosen by the user from either Ketcher's
 * V3000 snapshot or a conventional V2000 molfile.  Atom order is retained:
 * molfile wedge direction is defined from the first atom toward the second.
 */
function referenceStereoBonds(molBlock: string): ReferenceStereoBond[] {
  const source = molBlock.trim();
  if (!source) return [];

  if (source.includes("V3000")) {
    const bonds: ReferenceStereoBond[] = [];
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(
        /^M\s+V30\s+\d+\s+\d+\s+(\d+)\s+(\d+)(?:\s+.*)?\sCFG=(1|3)(?:\s|$)/,
      );
      if (!match) continue;
      const begin = Number(match[1]) - 1;
      const end = Number(match[2]) - 1;
      const cfg = Number(match[3]);
      if (begin < 0 || end < 0) continue;
      bonds.push({ begin, end, stereo: cfg === 1 ? 1 : 6 });
    }
    return bonds;
  }

  const lines = source.split(/\r?\n/);
  if (lines.length < 5) return [];
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return [];
  const bondStart = 4 + atomCount;
  const bonds: ReferenceStereoBond[] = [];
  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const begin = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const end = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
    if ((stereo === 1 || stereo === 6) && begin >= 0 && end >= 0) {
      bonds.push({ begin, end, stereo });
    }
  }
  return bonds;
}

/**
 * After RDKit aligns product coordinates to the user's reactant, explicitly
 * transfer every surviving user-selected wedge/hash bond onto the same mapped
 * atom pair in the product.  This preserves *depiction continuity* as well as
 * absolute stereochemistry.  It is generic: any unchanged stereobond that is
 * part of the product's substructure is transferred, not just alcohol C-O.
 */
function transferReferenceStereoBondsToProduct(
  productMol: any,
  referenceMol: any,
  referenceMolBlock: string,
): string | null {
  const stereoBonds = referenceStereoBonds(referenceMolBlock);
  if (stereoBonds.length === 0) return null;
  if (typeof productMol.get_substruct_match !== "function") return null;

  const atomMap = parseSingleSubstructureAtomMap(
    productMol.get_substruct_match(referenceMol) ?? "{}",
  );
  if (atomMap.length === 0) return null;

  const molBlock = productMol.get_molblock?.();
  if (typeof molBlock !== "string" || molBlock.includes("V3000")) return null;
  const lines = molBlock.split(/\r?\n/);
  if (lines.length < 5) return null;

  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;
  const bondStart = 4 + atomCount;

  type ProductBond = V2000Bond & { stereo: number };
  const productBonds: ProductBond[] = [];
  for (let index = 0; index < bondCount; index += 1) {
    const lineIndex = bondStart + index;
    const line = lines[lineIndex] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
    const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
    if (
      !Number.isInteger(atom1) ||
      !Number.isInteger(atom2) ||
      atom1 < 0 ||
      atom2 < 0 ||
      atom1 >= atomCount ||
      atom2 >= atomCount
    ) continue;
    productBonds.push({ lineIndex, atom1, atom2, bondType, stereo });
  }

  let transferred = 0;
  for (const referenceBond of stereoBonds) {
    const mappedBegin = atomMap[referenceBond.begin];
    const mappedEnd = atomMap[referenceBond.end];
    if (!Number.isInteger(mappedBegin) || !Number.isInteger(mappedEnd)) continue;

    const targetBond = productBonds.find(
      (bond) =>
        (bond.atom1 === mappedBegin && bond.atom2 === mappedEnd) ||
        (bond.atom1 === mappedEnd && bond.atom2 === mappedBegin),
    );
    if (!targetBond || targetBond.bondType !== 1) continue;

    // A tetrahedral center should have one presentation wedge/hash. Remove
    // RDKit's automatically chosen one around this mapped center first.
    for (const bond of productBonds) {
      if (bond.atom1 !== mappedBegin && bond.atom2 !== mappedBegin) continue;
      const line = lines[bond.lineIndex] ?? "";
      lines[bond.lineIndex] = rewriteV2000BondLine(
        line,
        bond.atom1 + 1,
        bond.atom2 + 1,
        bond.bondType,
        0,
      );
    }

    const line = lines[targetBond.lineIndex] ?? "";
    lines[targetBond.lineIndex] = rewriteV2000BondLine(
      line,
      mappedBegin + 1,
      mappedEnd + 1,
      targetBond.bondType,
      referenceBond.stereo,
    );
    transferred += 1;
  }

  return transferred > 0 ? lines.join("\n") : null;
}


/**
 * Draw a stereochemical product through an explicit 2-D molblock before SVG
 * rendering. RDKit then assigns wedge/hash bonds to ordinary heavy-atom bonds
 * wherever possible instead of displaying an explicit H wedge merely to encode
 * the same tetrahedral configuration. This is especially useful for bicyclic
 * Diels-Alder products, where the carbon substituent/bridge bond is the
 * pedagogically meaningful stereobond. Chemical identity is accepted only if
 * the molblock reparses to the same isomeric SMILES.
 */
export async function getHeavyAtomStereoSvg(
  smiles: string,
): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;
  const cacheKey = `heavy-atom-stereo::${trimmed}`;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let sourceMol: any = null;
  let presentationMol: any = null;
  try {
    const RDKit = await getRDKit();
    sourceMol = RDKit.get_mol(trimmed);
    if (!sourceMol) return getMoleculeSvg(trimmed);
    const canonical = sourceMol.get_smiles?.();
    sourceMol.set_new_coords?.();
    const block = sourceMol.get_molblock?.();
    if (typeof block !== "string") return getMoleculeSvg(trimmed);

    presentationMol = RDKit.get_mol(block);
    if (!presentationMol) return getMoleculeSvg(trimmed);
    const reparsed = presentationMol.get_smiles?.();
    if (typeof canonical === "string" && typeof reparsed === "string" && canonical !== reparsed) {
      return getMoleculeSvg(trimmed);
    }

    const result = presentationMol.get_svg_with_highlights(STEREO_PRESENTATION_DRAW_OPTIONS);
    rememberSvg(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("Heavy-atom stereochemical depiction failed; using standard drawing.", error);
    return getMoleculeSvg(trimmed);
  } finally {
    sourceMol?.delete?.();
    presentationMol?.delete?.();
  }
}
export async function getAlignedStereoSvg(
  smiles: string,
  referenceSmiles: string | null | undefined,
): Promise<string | null> {
  const product = smiles.trim();
  const reference = referenceSmiles?.trim() ?? "";
  if (!product) return null;
  if (!reference) return getMoleculeSvg(product);

  const cacheKey = `aligned-stereo::${product}::${reference}`;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let productMol: any = null;
  let referenceMol: any = null;
  try {
    const RDKit = await getRDKit();
    productMol = RDKit.get_mol(product);
    referenceMol = RDKit.get_mol(reference);
    if (!productMol || !referenceMol) return getMoleculeSvg(product);

    const canonicalBefore = productMol.get_smiles?.();
    // A Ketcher molfile already contains the student's 2-D coordinates. Only
    // synthesize coordinates when the reference is merely SMILES.
    if (!looksLikeMolBlock(reference)) referenceMol.set_new_coords?.();
    if (typeof productMol.generate_aligned_coords !== "function") {
      return getMoleculeSvg(product);
    }
    productMol.generate_aligned_coords(referenceMol, JSON.stringify({}));

    const canonicalAfter = productMol.get_smiles?.();
    if (
      typeof canonicalBefore === "string" &&
      typeof canonicalAfter === "string" &&
      canonicalBefore !== canonicalAfter
    ) {
      return getMoleculeSvg(product);
    }

    // If the reference is the original Ketcher molfile, preserve the exact
    // user-selected wedge/hash bond whenever that bond survives the reaction.
    // This is especially important for Williamson ether formation: C-O is not
    // broken, so a dashed C-O bond should remain the dashed bond in the product.
    if (looksLikeMolBlock(reference)) {
      const presentationBlock = transferReferenceStereoBondsToProduct(
        productMol,
        referenceMol,
        reference,
      );
      if (presentationBlock) {
        let presentationMol: any = null;
        try {
          presentationMol = RDKit.get_mol(presentationBlock);
          const presentationCanonical = presentationMol?.get_smiles?.();
          if (
            presentationMol &&
            (typeof canonicalBefore !== "string" || presentationCanonical === canonicalBefore)
          ) {
            const svg = presentationMol.get_svg_with_highlights(
              STEREO_PRESENTATION_DRAW_OPTIONS,
            );
            rememberSvg(cacheKey, svg);
            return svg;
          }
        } finally {
          presentationMol?.delete?.();
        }
      }
    }

    const svg = productMol.get_svg_with_highlights(STEREO_PRESENTATION_DRAW_OPTIONS);
    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.warn("Aligned stereochemical depiction failed; using standard drawing.", error);
    return getMoleculeSvg(product);
  } finally {
    productMol?.delete?.();
    referenceMol?.delete?.();
  }
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


export async function getAlignedGenericHalogenSvg(
  smiles: string,
  referenceSmiles: string | null | undefined,
): Promise<string | null> {
  const product = smiles.trim();
  const reference = referenceSmiles?.trim() ?? "";
  if (!product) return null;
  if (!reference) return getGenericHalogenSvg(product);

  const cacheKey = `aligned-generic-halogen::${product}::${reference}`;
  if (moleculeSvgCache.has(cacheKey)) {
    return moleculeSvgCache.get(cacheKey) ?? null;
  }

  let productMol: any = null;
  let referenceMol: any = null;
  try {
    const RDKit = await getRDKit();
    productMol = RDKit.get_mol(product);
    referenceMol = RDKit.get_mol(reference);
    if (!productMol || !referenceMol) return getGenericHalogenSvg(product);

    const canonicalBefore = productMol.get_smiles?.();
    if (!looksLikeMolBlock(reference)) referenceMol.set_new_coords?.();
    if (typeof productMol.generate_aligned_coords !== "function") {
      return getGenericHalogenSvg(product);
    }
    productMol.generate_aligned_coords(referenceMol, JSON.stringify({}));

    const canonicalAfter = productMol.get_smiles?.();
    if (
      typeof canonicalBefore === "string" &&
      typeof canonicalAfter === "string" &&
      canonicalBefore !== canonicalAfter
    ) {
      return getGenericHalogenSvg(product);
    }

    const molBlock = productMol.get_molblock?.();
    if (typeof molBlock !== "string") return getGenericHalogenSvg(product);
    const atomLabels = halogenAtomLabelOverridesFromMolBlock(molBlock);
    if (Object.keys(atomLabels).length === 0) {
      return productMol.get_svg_with_highlights(MOLECULE_DRAW_OPTIONS);
    }

    const svg = productMol.get_svg_with_highlights(
      JSON.stringify({ atomLabelDeuteriumTritium: true, atomLabels }),
    );
    rememberSvg(cacheKey, svg);
    return svg;
  } catch (error) {
    console.warn(
      "Aligned generic-halogen depiction failed; using standard generic-halogen drawing.",
      error,
    );
    return getGenericHalogenSvg(product);
  } finally {
    productMol?.delete?.();
    referenceMol?.delete?.();
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
