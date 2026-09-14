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
  const cacheKey = normalizeMoleculeSource(smiles);
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

    // For a raw SMILES product, generate a fresh 2-D layout on this molecule
    // and draw it directly. Do NOT round-trip the generated V2000 molblock back
    // through RDKit before drawing: RDKit writes stereo code 3 on an
    // unspecified C=C in that molblock, and reparsing it turns an ordinary
    // alkene into the crossed/either-bond depiction seen in Wittig products.
    //
    // For an incoming molblock, keep its supplied coordinates/stereo exactly as
    // they are; specialized renderers are responsible for any intentional
    // wedge/hash preservation.
    if (!looksLikeMolBlock(cacheKey)) {
      mol.set_new_coords?.();
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
 * RDKit.js is stricter than desktop RDKit about molfile termination: a V2000
 * block with its final newline removed can fail to parse. SMILES should still
 * be trimmed normally, while molfiles are normalized to exactly one trailing
 * newline. This is critical because aligned products are passed between SVG
 * renderers as molfiles rather than SMILES.
 */
function normalizeMoleculeSource(source: string | null | undefined): string {
  const raw = source ?? "";
  if (!raw.trim()) return "";

  if (looksLikeMolBlock(raw)) {
    // Molfile header lines are positional. In particular, RDKit often emits an
    // intentionally blank first title line; String.trim() deletes that line and
    // shifts the V2000 counts record out of line 4, making RDKit.js reject an
    // otherwise valid molfile. Preserve the leading bytes exactly and normalize
    // only trailing whitespace.
    return `${raw.replace(/\s+$/, "")}\n`;
  }

  return raw.trim();
}


type DepictionAtom = {
  index: number;
  element: string;
  x: number;
  y: number;
};

type DepictionBond = {
  atom1: number;
  atom2: number;
  bondType: number;
};

type ParsedDepiction = {
  atoms: DepictionAtom[];
  bonds: DepictionBond[];
  adjacency: number[][];
};

type DepictionMapping = Map<number, number>;

type SimilarityTransform = {
  reflected: boolean;
  aReal: number;
  aImag: number;
  sourceCx: number;
  sourceCy: number;
  targetCx: number;
  targetCy: number;
  rmsd: number;
};

type AlignmentCandidate = {
  reference: string;
  mapping: DepictionMapping;
  transform: SimilarityTransform;
  anchorCount: number;
};

const alignedProductStructureCache = new Map<string, string | null>();
const MAX_ALIGNMENT_CACHE_ENTRIES = 160;
const MAX_ALIGNMENT_MAPPINGS = 128;
const MAX_ALIGNMENT_PRUNE_STATES = 240;
const MAX_ALIGNMENT_REMOVALS = 6;

function rememberAlignedStructure(key: string, value: string | null) {
  alignedProductStructureCache.delete(key);
  alignedProductStructureCache.set(key, value);
  if (alignedProductStructureCache.size > MAX_ALIGNMENT_CACHE_ENTRIES) {
    const oldest = alignedProductStructureCache.keys().next().value;
    if (oldest !== undefined) alignedProductStructureCache.delete(oldest);
  }
}

function normalizeDepictionElement(symbol: string) {
  const trimmed = symbol.trim();
  if (!trimmed) return "";
  // Ketcher/RDKit may use dummy/query atoms in teaching structures. Keep those
  // labels literal so they never get accidentally mapped onto a carbon atom.
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
}

function parseV2000Depiction(source: string): ParsedDepiction | null {
  const lines = source.split(/\r?\n/);
  if (lines.length < 5 || !lines[3]?.includes("V2000")) return null;
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(lines[3].slice(3, 6).trim(), 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const atoms: DepictionAtom[] = [];
  for (let index = 0; index < atomCount; index += 1) {
    const line = lines[4 + index] ?? "";
    const x = Number.parseFloat(line.slice(0, 10).trim());
    const y = Number.parseFloat(line.slice(10, 20).trim());
    const element = normalizeDepictionElement(parseV2000AtomSymbol(line));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !element) return null;
    atoms.push({ index, element, x, y });
  }

  const bonds: DepictionBond[] = [];
  const adjacency = Array.from({ length: atomCount }, () => [] as number[]);
  const bondStart = 4 + atomCount;
  for (let index = 0; index < bondCount; index += 1) {
    const line = lines[bondStart + index] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (
      !Number.isInteger(atom1) || !Number.isInteger(atom2) ||
      atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount
    ) continue;
    bonds.push({ atom1, atom2, bondType });
    adjacency[atom1].push(atom2);
    adjacency[atom2].push(atom1);
  }

  return { atoms, bonds, adjacency };
}

function parseV3000Depiction(source: string): ParsedDepiction | null {
  if (!source.includes("V3000")) return null;
  const atoms: DepictionAtom[] = [];
  const rawBonds: Array<{ atom1: number; atom2: number; bondType: number }> = [];
  let inAtoms = false;
  let inBonds = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^M\s+V30\s+BEGIN\s+ATOM\b/.test(line)) {
      inAtoms = true;
      continue;
    }
    if (/^M\s+V30\s+END\s+ATOM\b/.test(line)) {
      inAtoms = false;
      continue;
    }
    if (/^M\s+V30\s+BEGIN\s+BOND\b/.test(line)) {
      inBonds = true;
      continue;
    }
    if (/^M\s+V30\s+END\s+BOND\b/.test(line)) {
      inBonds = false;
      continue;
    }
    if (!line.startsWith("M  V30 ")) continue;
    const fields = line.replace(/^M\s+V30\s+/, "").split(/\s+/);
    if (inAtoms && fields.length >= 5) {
      const index = Number.parseInt(fields[0], 10) - 1;
      const element = normalizeDepictionElement(fields[1]);
      const x = Number.parseFloat(fields[2]);
      const y = Number.parseFloat(fields[3]);
      if (Number.isInteger(index) && index >= 0 && element && Number.isFinite(x) && Number.isFinite(y)) {
        atoms[index] = { index, element, x, y };
      }
    } else if (inBonds && fields.length >= 4) {
      const bondType = Number.parseInt(fields[1], 10);
      const atom1 = Number.parseInt(fields[2], 10) - 1;
      const atom2 = Number.parseInt(fields[3], 10) - 1;
      if (Number.isInteger(atom1) && Number.isInteger(atom2) && atom1 >= 0 && atom2 >= 0) {
        rawBonds.push({ atom1, atom2, bondType });
      }
    }
  }

  if (atoms.length === 0 || atoms.some((atom) => !atom)) return null;
  const adjacency = Array.from({ length: atoms.length }, () => [] as number[]);
  const bonds = rawBonds.filter(
    (bond) => bond.atom1 < atoms.length && bond.atom2 < atoms.length,
  );
  for (const bond of bonds) {
    adjacency[bond.atom1].push(bond.atom2);
    adjacency[bond.atom2].push(bond.atom1);
  }
  return { atoms, bonds, adjacency };
}

function parseDepiction(source: string): ParsedDepiction | null {
  return source.includes("V3000")
    ? parseV3000Depiction(source)
    : parseV2000Depiction(source);
}

function hasDepictionBond(depiction: ParsedDepiction, atom1: number, atom2: number) {
  return depiction.adjacency[atom1]?.includes(atom2) ?? false;
}


type DepictionGeometryQuality = {
  medianBondLength: number;
  minimumNonbondedDistance: number;
  shortBondCount: number;
  longBondCount: number;
};

function depictionGeometryQuality(depiction: ParsedDepiction): DepictionGeometryQuality | null {
  const bondLengths = depiction.bonds
    .map((bond) => {
      const atom1 = depiction.atoms[bond.atom1];
      const atom2 = depiction.atoms[bond.atom2];
      if (!atom1 || !atom2) return Number.NaN;
      return Math.hypot(atom1.x - atom2.x, atom1.y - atom2.y);
    })
    .filter((length) => Number.isFinite(length) && length > 1e-6)
    .sort((left, right) => left - right);

  if (bondLengths.length === 0) return null;
  const middle = Math.floor(bondLengths.length / 2);
  const medianBondLength = bondLengths.length % 2 === 0
    ? (bondLengths[middle - 1] + bondLengths[middle]) / 2
    : bondLengths[middle];
  if (!Number.isFinite(medianBondLength) || medianBondLength <= 1e-6) return null;

  let minimumNonbondedDistance = Number.POSITIVE_INFINITY;
  for (let left = 0; left < depiction.atoms.length; left += 1) {
    for (let right = left + 1; right < depiction.atoms.length; right += 1) {
      if (hasDepictionBond(depiction, left, right)) continue;
      const distance = Math.hypot(
        depiction.atoms[left].x - depiction.atoms[right].x,
        depiction.atoms[left].y - depiction.atoms[right].y,
      );
      minimumNonbondedDistance = Math.min(minimumNonbondedDistance, distance);
    }
  }

  return {
    medianBondLength,
    minimumNonbondedDistance,
    shortBondCount: bondLengths.filter((length) => length < medianBondLength * 0.45).length,
    longBondCount: bondLengths.filter((length) => length > medianBondLength * 2.2).length,
  };
}

/**
 * Coordinate preservation is allowed to rotate/reflect a clean depiction, but
 * it must never make the molecular drawing geometrically worse. In particular,
 * a mapped substituent must not collapse onto a nonbonded atom or create wildly
 * inconsistent bond lengths. If an alignment candidate fails this guard, the
 * caller falls back to RDKit's clean 2-D coordinates instead of forcing the
 * student's reference orientation at the expense of legibility.
 */
function alignmentIntroducesSevereGeometryDistortion(
  baseline: ParsedDepiction,
  candidateMolBlock: string,
): boolean {
  const candidate = parseDepiction(candidateMolBlock);
  if (!candidate) return true;

  const baselineQuality = depictionGeometryQuality(baseline);
  const candidateQuality = depictionGeometryQuality(candidate);
  if (!baselineQuality || !candidateQuality) return false;

  if (candidateQuality.shortBondCount > baselineQuality.shortBondCount) return true;
  if (candidateQuality.longBondCount > baselineQuality.longBondCount) return true;

  const candidateCollisionRatio =
    candidateQuality.minimumNonbondedDistance / candidateQuality.medianBondLength;
  const baselineCollisionRatio =
    baselineQuality.minimumNonbondedDistance / baselineQuality.medianBondLength;

  if (candidateCollisionRatio < 0.32 && candidateCollisionRatio < baselineCollisionRatio * 0.7) {
    return true;
  }

  return false;
}

/**
 * Find atom correspondences using the preserved molecular graph rather than
 * bond orders. Bond order is intentionally ignored: reaction products commonly
 * change C=C to C-C, C-O to C=O, etc., but those atoms should stay in exactly
 * the same place on screen. Element identity and connectivity are still strict.
 */
function findDepictionMappings(
  reference: ParsedDepiction,
  product: ParsedDepiction,
  selectedReferenceAtoms: readonly number[],
): DepictionMapping[] {
  const selected = new Set(selectedReferenceAtoms);
  const selectedDegree = new Map<number, number>();
  for (const atom of selectedReferenceAtoms) {
    selectedDegree.set(
      atom,
      (reference.adjacency[atom] ?? []).filter((neighbor) => selected.has(neighbor)).length,
    );
  }

  const productByElement = new Map<string, number[]>();
  for (const atom of product.atoms) {
    const bucket = productByElement.get(atom.element) ?? [];
    bucket.push(atom.index);
    productByElement.set(atom.element, bucket);
  }

  const ordered = [...selectedReferenceAtoms].sort((left, right) => {
    const leftCandidates = productByElement.get(reference.atoms[left].element)?.length ?? 0;
    const rightCandidates = productByElement.get(reference.atoms[right].element)?.length ?? 0;
    if (leftCandidates !== rightCandidates) return leftCandidates - rightCandidates;
    return (selectedDegree.get(right) ?? 0) - (selectedDegree.get(left) ?? 0);
  });

  const mapping = new Map<number, number>();
  const usedProduct = new Set<number>();
  const results: DepictionMapping[] = [];

  const visit = (position: number) => {
    if (results.length >= MAX_ALIGNMENT_MAPPINGS) return;
    if (position >= ordered.length) {
      results.push(new Map(mapping));
      return;
    }

    const referenceAtom = ordered[position];
    const candidates = productByElement.get(reference.atoms[referenceAtom].element) ?? [];
    for (const productAtom of candidates) {
      if (usedProduct.has(productAtom)) continue;
      if ((product.adjacency[productAtom]?.length ?? 0) < (selectedDegree.get(referenceAtom) ?? 0)) continue;

      let compatible = true;
      for (const referenceNeighbor of reference.adjacency[referenceAtom] ?? []) {
        if (!selected.has(referenceNeighbor)) continue;
        const mappedNeighbor = mapping.get(referenceNeighbor);
        if (mappedNeighbor === undefined) continue;
        if (!hasDepictionBond(product, productAtom, mappedNeighbor)) {
          compatible = false;
          break;
        }
      }
      if (!compatible) continue;

      mapping.set(referenceAtom, productAtom);
      usedProduct.add(productAtom);
      visit(position + 1);
      usedProduct.delete(productAtom);
      mapping.delete(referenceAtom);
    }
  };

  visit(0);
  return results;
}

function heavyReferenceAtoms(depiction: ParsedDepiction) {
  return depiction.atoms
    .filter((atom) => atom.element !== "H")
    .map((atom) => atom.index);
}

function mappingCandidatesWithBoundaryPruning(
  reference: ParsedDepiction,
  product: ParsedDepiction,
): DepictionMapping[] {
  const initial = heavyReferenceAtoms(reference);
  if (initial.length === 0) return [];
  const minimumAnchors = Math.min(3, initial.length);
  const queue: Array<{ atoms: number[]; removed: number }> = [{ atoms: initial, removed: 0 }];
  const seen = new Set<string>();
  let explored = 0;

  while (queue.length > 0 && explored < MAX_ALIGNMENT_PRUNE_STATES) {
    const levelRemoved = queue[0].removed;
    const level: Array<{ atoms: number[]; removed: number }> = [];
    while (queue.length > 0 && queue[0].removed === levelRemoved) level.push(queue.shift()!);

    const levelMappings: DepictionMapping[] = [];
    for (const state of level) {
      explored += 1;
      const key = state.atoms.join(",");
      if (seen.has(key)) continue;
      seen.add(key);

      const mappings = findDepictionMappings(reference, product, state.atoms);
      if (mappings.length > 0) levelMappings.push(...mappings);
      if (explored >= MAX_ALIGNMENT_PRUNE_STATES) break;
    }
    if (levelMappings.length > 0) return levelMappings.slice(0, MAX_ALIGNMENT_MAPPINGS);
    if (levelRemoved >= MAX_ALIGNMENT_REMOVALS) continue;

    for (const state of level) {
      if (state.atoms.length <= minimumAnchors) continue;
      const selected = new Set(state.atoms);
      const removable = state.atoms.filter((atomIndex) => {
        const degree = (reference.adjacency[atomIndex] ?? []).filter((neighbor) => selected.has(neighbor)).length;
        return degree <= 1;
      });
      // Prefer pruning terminal heteroatoms/leaving groups before carbon atoms.
      removable.sort((left, right) => {
        const leftCarbon = reference.atoms[left].element === "C" ? 1 : 0;
        const rightCarbon = reference.atoms[right].element === "C" ? 1 : 0;
        return leftCarbon - rightCarbon;
      });
      for (const atomIndex of removable) {
        const next = state.atoms.filter((candidate) => candidate !== atomIndex);
        if (next.length >= minimumAnchors) queue.push({ atoms: next, removed: state.removed + 1 });
      }
    }
  }

  return [];
}

function fitSimilarityTransform(
  reference: ParsedDepiction,
  product: ParsedDepiction,
  mapping: DepictionMapping,
  reflected: boolean,
): SimilarityTransform | null {
  const pairs = [...mapping.entries()];
  if (pairs.length < 2) return null;
  const sourceCx = pairs.reduce((sum, [, productIndex]) => sum + product.atoms[productIndex].x, 0) / pairs.length;
  const sourceCy = pairs.reduce((sum, [, productIndex]) => sum + product.atoms[productIndex].y, 0) / pairs.length;
  const targetCx = pairs.reduce((sum, [referenceIndex]) => sum + reference.atoms[referenceIndex].x, 0) / pairs.length;
  const targetCy = pairs.reduce((sum, [referenceIndex]) => sum + reference.atoms[referenceIndex].y, 0) / pairs.length;

  let denominator = 0;
  let numeratorReal = 0;
  let numeratorImag = 0;
  for (const [referenceIndex, productIndex] of pairs) {
    const px = product.atoms[productIndex].x - sourceCx;
    const py = product.atoms[productIndex].y - sourceCy;
    const qx = reference.atoms[referenceIndex].x - targetCx;
    const qy = reference.atoms[referenceIndex].y - targetCy;
    denominator += px * px + py * py;
    if (reflected) {
      // q ~= a * conjugate(p)
      numeratorReal += qx * px - qy * py;
      numeratorImag += qx * py + qy * px;
    } else {
      // q ~= a * p
      numeratorReal += qx * px + qy * py;
      numeratorImag += qy * px - qx * py;
    }
  }
  if (denominator <= 1e-10) return null;
  const aReal = numeratorReal / denominator;
  const aImag = numeratorImag / denominator;

  let squaredError = 0;
  for (const [referenceIndex, productIndex] of pairs) {
    const px = product.atoms[productIndex].x - sourceCx;
    const py = product.atoms[productIndex].y - sourceCy;
    let tx: number;
    let ty: number;
    if (reflected) {
      tx = aReal * px + aImag * py + targetCx;
      ty = aImag * px - aReal * py + targetCy;
    } else {
      tx = aReal * px - aImag * py + targetCx;
      ty = aImag * px + aReal * py + targetCy;
    }
    const dx = tx - reference.atoms[referenceIndex].x;
    const dy = ty - reference.atoms[referenceIndex].y;
    squaredError += dx * dx + dy * dy;
  }

  return {
    reflected,
    aReal,
    aImag,
    sourceCx,
    sourceCy,
    targetCx,
    targetCy,
    rmsd: Math.sqrt(squaredError / pairs.length),
  };
}

function applySimilarity(transform: SimilarityTransform, x: number, y: number) {
  const px = x - transform.sourceCx;
  const py = y - transform.sourceCy;
  if (transform.reflected) {
    return {
      x: transform.aReal * px + transform.aImag * py + transform.targetCx,
      y: transform.aImag * px - transform.aReal * py + transform.targetCy,
    };
  }
  return {
    x: transform.aReal * px - transform.aImag * py + transform.targetCx,
    y: transform.aImag * px + transform.aReal * py + transform.targetCy,
  };
}

function formatMolCoordinate(value: number) {
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return normalized.toFixed(4).padStart(10);
}

function rewriteV2000Coordinates(
  molBlock: string,
  product: ParsedDepiction,
  reference: ParsedDepiction,
  mapping: DepictionMapping,
  transform: SimilarityTransform,
  swapWedgesForReflection: boolean,
) {
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return null;
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(lines[3].slice(3, 6).trim(), 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

  const reverseMapping = new Map<number, number>();
  for (const [referenceIndex, productIndex] of mapping) reverseMapping.set(productIndex, referenceIndex);

  for (let index = 0; index < atomCount; index += 1) {
    const lineIndex = 4 + index;
    const line = lines[lineIndex] ?? "";
    const mappedReference = reverseMapping.get(index);
    const point = mappedReference === undefined
      ? applySimilarity(transform, product.atoms[index].x, product.atoms[index].y)
      : { x: reference.atoms[mappedReference].x, y: reference.atoms[mappedReference].y };
    lines[lineIndex] = `${formatMolCoordinate(point.x)}${formatMolCoordinate(point.y)}${line.slice(20)}`;
  }

  if (swapWedgesForReflection && transform.reflected) {
    const bondStart = 4 + atomCount;
    for (let index = 0; index < bondCount; index += 1) {
      const lineIndex = bondStart + index;
      const line = lines[lineIndex] ?? "";
      const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
      if (stereo !== 1 && stereo !== 6) continue;
      const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10);
      const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10);
      const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
      lines[lineIndex] = rewriteV2000BondLine(
        line,
        atom1,
        atom2,
        bondType,
        stereo === 1 ? 6 : 1,
      );
    }
  }

  return lines.join("\n");
}

type CoordinateAssignment = {
  productIndex: number;
  x: number;
  y: number;
};

function rewriteAssignedV2000Coordinates(
  molBlock: string,
  assignments: readonly CoordinateAssignment[],
): string | null {
  if (assignments.length === 0) return molBlock;
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return null;
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  if (!Number.isInteger(atomCount)) return null;

  for (const assignment of assignments) {
    if (assignment.productIndex < 0 || assignment.productIndex >= atomCount) continue;
    const lineIndex = 4 + assignment.productIndex;
    const line = lines[lineIndex] ?? "";
    lines[lineIndex] = `${formatMolCoordinate(assignment.x)}${formatMolCoordinate(assignment.y)}${line.slice(20)}`;
  }

  return lines.join("\n");
}

function enrichWithSupplementalReferenceCoordinates(
  alignedMolBlock: string,
  productDepiction: ParsedDepiction,
  primaryCandidate: AlignmentCandidate,
  allReferenceBlocks: readonly string[],
): string | null {
  if (!alignedMolBlock || allReferenceBlocks.length <= 1) return alignedMolBlock;

  let enriched = alignedMolBlock;
  let alignedDepiction = parseDepiction(alignedMolBlock);
  if (!alignedDepiction) return alignedMolBlock;
  const claimedProductAtoms = new Set<number>(primaryCandidate.mapping.values());

  for (const referenceBlock of allReferenceBlocks) {
    if (referenceBlock === primaryCandidate.reference) continue;
    const referenceDepiction = parseDepiction(referenceBlock);
    if (!referenceDepiction) continue;

    const mappings = mappingCandidatesWithBoundaryPruning(referenceDepiction, productDepiction);
    let bestMapping: DepictionMapping | null = null;
    let bestFreshAtomCount = 0;
    let bestAnchorCount = 0;

    for (const mapping of mappings) {
      let freshAtomCount = 0;
      let anchorCount = 0;
      for (const [, productIndex] of mapping) {
        if (claimedProductAtoms.has(productIndex)) {
          anchorCount += 1;
        } else {
          freshAtomCount += 1;
        }
      }
      if (anchorCount < 2 || freshAtomCount === 0) continue;
      if (
        freshAtomCount > bestFreshAtomCount ||
        (freshAtomCount === bestFreshAtomCount && anchorCount > bestAnchorCount)
      ) {
        bestFreshAtomCount = freshAtomCount;
        bestAnchorCount = anchorCount;
        bestMapping = mapping;
      }
    }

    if (!bestMapping) continue;

    const anchorMapping = new Map<number, number>();
    for (const [referenceIndex, productIndex] of bestMapping) {
      if (claimedProductAtoms.has(productIndex)) {
        anchorMapping.set(productIndex, referenceIndex);
      }
    }
    if (anchorMapping.size < 2) continue;

    const directTransform = fitSimilarityTransform(
      alignedDepiction,
      referenceDepiction,
      anchorMapping,
      false,
    );
    const reflectedTransform = fitSimilarityTransform(
      alignedDepiction,
      referenceDepiction,
      anchorMapping,
      true,
    );
    const chosenTransform = [directTransform, reflectedTransform]
      .filter((candidate): candidate is SimilarityTransform => Boolean(candidate))
      .sort((left, right) => left.rmsd - right.rmsd)[0] ?? null;
    if (!chosenTransform) continue;

    const assignments: CoordinateAssignment[] = [];
    for (const [referenceIndex, productIndex] of bestMapping) {
      if (claimedProductAtoms.has(productIndex)) continue;
      const point = applySimilarity(
        chosenTransform,
        referenceDepiction.atoms[referenceIndex].x,
        referenceDepiction.atoms[referenceIndex].y,
      );
      assignments.push({
        productIndex,
        x: point.x,
        y: point.y,
      });
      claimedProductAtoms.add(productIndex);
    }

    enriched = rewriteAssignedV2000Coordinates(enriched, assignments) ?? enriched;
    alignedDepiction = parseDepiction(enriched) ?? alignedDepiction;
  }

  return enriched;
}

function transferMappedReferenceStereoBonds(
  productMolBlock: string,
  referenceMolBlock: string,
  mapping: DepictionMapping,
): string | null {
  const stereoBonds = referenceStereoBonds(referenceMolBlock);
  if (stereoBonds.length === 0 || productMolBlock.includes("V3000")) return productMolBlock;

  const lines = productMolBlock.split(/\r?\n/);
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
  const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return productMolBlock;
  const bondStart = 4 + atomCount;
  const productBonds: Array<V2000Bond & { stereo: number }> = [];
  for (let index = 0; index < bondCount; index += 1) {
    const lineIndex = bondStart + index;
    const line = lines[lineIndex] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
    const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
    if (atom1 >= 0 && atom2 >= 0) productBonds.push({ lineIndex, atom1, atom2, bondType, stereo });
  }

  for (const referenceBond of stereoBonds) {
    const mappedBegin = mapping.get(referenceBond.begin);
    const mappedEnd = mapping.get(referenceBond.end);
    if (mappedBegin === undefined || mappedEnd === undefined) continue;
    const target = productBonds.find(
      (bond) =>
        (bond.atom1 === mappedBegin && bond.atom2 === mappedEnd) ||
        (bond.atom1 === mappedEnd && bond.atom2 === mappedBegin),
    );
    if (!target || target.bondType !== 1) continue;

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
    const line = lines[target.lineIndex] ?? "";
    lines[target.lineIndex] = rewriteV2000BondLine(
      line,
      mappedBegin + 1,
      mappedEnd + 1,
      target.bondType,
      referenceBond.stereo,
    );
  }
  return lines.join("\n");
}

function bondTypeBetweenDepictions(
  depiction: ParsedDepiction,
  atom1: number,
  atom2: number,
): number | null {
  const bond = depiction.bonds.find(
    (candidate) =>
      (candidate.atom1 === atom1 && candidate.atom2 === atom2) ||
      (candidate.atom1 === atom2 && candidate.atom2 === atom1),
  );
  return bond?.bondType ?? null;
}

function conjugatedDienePaths(depiction: ParsedDepiction): number[][] {
  const paths: number[][] = [];
  const seen = new Set<string>();
  for (const a of depiction.atoms) {
    if (a.element !== "C") continue;
    for (const b of depiction.adjacency[a.index] ?? []) {
      if (bondTypeBetweenDepictions(depiction, a.index, b) !== 2) continue;
      for (const c of depiction.adjacency[b] ?? []) {
        if (c === a.index || bondTypeBetweenDepictions(depiction, b, c) !== 1) continue;
        for (const d of depiction.adjacency[c] ?? []) {
          if (d === b || d === a.index) continue;
          if (bondTypeBetweenDepictions(depiction, c, d) !== 2) continue;
          if (depiction.atoms[b]?.element !== "C" || depiction.atoms[c]?.element !== "C" || depiction.atoms[d]?.element !== "C") continue;
          const forward = [a.index, b, c, d];
          const reverse = [...forward].reverse();
          const key = [forward.join("-"), reverse.join("-")].sort()[0];
          if (seen.has(key)) continue;
          seen.add(key);
          paths.push(forward);
        }
      }
    }
  }
  return paths;
}

/**
 * Score a reactant->product mapping by the actual [4+2] bond-order migration:
 * C1=C2-C3=C4 becomes C1-C2=C3-C4. This prevents a symmetry-equivalent
 * cyclohexadiene mapping from rotating the new product double bond to a
 * different side of the ring merely because its RMSD is numerically similar.
 */
function dielsAlderMappingScore(
  reference: ParsedDepiction,
  product: ParsedDepiction,
  mapping: DepictionMapping,
): number {
  let best = 0;
  for (const path of conjugatedDienePaths(reference)) {
    const mapped = path.map((atom) => mapping.get(atom));
    if (mapped.some((atom) => atom === undefined)) continue;
    const [a, b, c, d] = mapped as number[];
    if (
      bondTypeBetweenDepictions(product, a, b) === 1 &&
      bondTypeBetweenDepictions(product, b, c) === 2 &&
      bondTypeBetweenDepictions(product, c, d) === 1
    ) {
      best = Math.max(best, 100);
    }
  }
  return best;
}

function compareAlignmentCandidates(left: AlignmentCandidate, right: AlignmentCandidate) {
  if (left.anchorCount !== right.anchorCount) return right.anchorCount - left.anchorCount;
  if (left.transform.reflected !== right.transform.reflected) {
    return Number(left.transform.reflected) - Number(right.transform.reflected);
  }
  return left.transform.rmsd - right.transform.rmsd;
}

type DielsAlderBicycloScaffold = {
  bridgeheadA: number;
  bridgeheadD: number;
  dienePath: [number, number, number, number];
  preservedBridge: [number, number, number, number];
  dienophileBridge: [number, number, number, number];
  substituentCenter: number | null;
  substituentAtom: number | null;
};

function canonicalPathKey(path: readonly number[]) {
  const forward = path.join("-");
  const reverse = [...path].reverse().join("-");
  return forward < reverse ? forward : reverse;
}

function sameUndirectedPath(left: readonly number[], right: readonly number[]) {
  return canonicalPathKey(left) === canonicalPathKey(right);
}

function findSimplePathExcluding(
  depiction: ParsedDepiction,
  start: number,
  end: number,
  blocked: ReadonlySet<number>,
  requiredNodes: number,
): number[] | null {
  const queue: Array<{ atom: number; path: number[] }> = [{ atom: start, path: [start] }];
  const seen = new Set<string>([`${start}`]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length > requiredNodes) continue;
    if (current.atom === end) {
      return current.path.length === requiredNodes ? current.path : null;
    }

    for (const next of depiction.adjacency[current.atom] ?? []) {
      if (next !== end && blocked.has(next)) continue;
      if (current.path.includes(next)) continue;
      const nextPath = [...current.path, next];
      const key = nextPath.join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ atom: next, path: nextPath });
    }
  }

  return null;
}

function enumerateTwoAtomBridgePaths(
  depiction: ParsedDepiction,
  start: number,
  end: number,
): number[][] {
  const paths: number[][] = [];
  const seen = new Set<string>();
  for (const mid1 of depiction.adjacency[start] ?? []) {
    if (mid1 === end) continue;
    for (const mid2 of depiction.adjacency[mid1] ?? []) {
      if (mid2 === start || mid2 === end) continue;
      if (!hasDepictionBond(depiction, mid2, end)) continue;
      const path = [start, mid1, mid2, end];
      const key = canonicalPathKey(path);
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(path);
    }
  }
  return paths;
}

function findDielsAlderBicycloScaffold(
  reference: ParsedDepiction,
  product: ParsedDepiction,
  mapping: DepictionMapping,
): DielsAlderBicycloScaffold | null {
  for (const referenceDienePath of conjugatedDienePaths(reference)) {
    const mapped = referenceDienePath.map((atom) => mapping.get(atom));
    if (mapped.some((atom) => atom === undefined)) continue;
    const dienePath = mapped as [number, number, number, number];
    const [a, b, c, d] = dienePath;
    if (
      bondTypeBetweenDepictions(product, a, b) !== 1 ||
      bondTypeBetweenDepictions(product, b, c) !== 2 ||
      bondTypeBetweenDepictions(product, c, d) !== 1
    ) {
      continue;
    }

    const blocked = new Set<number>([referenceDienePath[1], referenceDienePath[2]]);
    const referenceBridgePath = findSimplePathExcluding(
      reference,
      referenceDienePath[0],
      referenceDienePath[3],
      blocked,
      4,
    );
    if (!referenceBridgePath) continue;
    const mappedBridge = referenceBridgePath.map((atom) => mapping.get(atom));
    if (mappedBridge.some((atom) => atom === undefined)) continue;
    const preservedBridge = mappedBridge as [number, number, number, number];

    const candidatePaths = enumerateTwoAtomBridgePaths(product, a, d);
    const dienophileBridge = candidatePaths.find(
      (candidate) =>
        !sameUndirectedPath(candidate, dienePath) &&
        !sameUndirectedPath(candidate, preservedBridge),
    ) as [number, number, number, number] | undefined;
    if (!dienophileBridge) continue;

    const pathAtoms = new Set<number>([
      ...dienePath,
      ...preservedBridge,
      ...dienophileBridge,
    ]);
    let substituentCenter: number | null = null;
    let substituentAtom: number | null = null;
    for (const center of [dienophileBridge[1], dienophileBridge[2]]) {
      const extra = (product.adjacency[center] ?? []).find((neighbor) => !pathAtoms.has(neighbor));
      if (extra !== undefined) {
        substituentCenter = center;
        substituentAtom = extra;
        break;
      }
    }

    return {
      bridgeheadA: a,
      bridgeheadD: d,
      dienePath,
      preservedBridge,
      dienophileBridge,
      substituentCenter,
      substituentAtom,
    };
  }
  return null;
}

function rewriteV2000AtomCoordinate(line: string, x: number, y: number) {
  return `${formatMolCoordinate(x)}${formatMolCoordinate(y)}${line.slice(20)}`;
}

function repositionDielsAlderInternalBridge(
  molBlock: string,
  depiction: ParsedDepiction,
  scaffold: DielsAlderBicycloScaffold,
) {
  if (molBlock.includes("V3000")) return null;
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return null;

  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  if (!Number.isInteger(atomCount)) return null;

  const atom = (index: number) => depiction.atoms[index];
  const average = (points: Array<{ x: number; y: number }>) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  });
  const mix = (left: { x: number; y: number }, right: { x: number; y: number }, t: number) => ({
    x: left.x * (1 - t) + right.x * t,
    y: left.y * (1 - t) + right.y * t,
  });

  const a = atom(scaffold.bridgeheadA);
  const d = atom(scaffold.bridgeheadD);
  const outerCenter = average([
    atom(scaffold.dienePath[1]),
    atom(scaffold.dienePath[2]),
    atom(scaffold.dienophileBridge[1]),
    atom(scaffold.dienophileBridge[2]),
  ]);

  const gBase = mix(a, d, 0.33);
  const hBase = mix(a, d, 0.67);
  const pull = 0.55;
  const g = {
    x: gBase.x + (outerCenter.x - gBase.x) * pull,
    y: gBase.y + (outerCenter.y - gBase.y) * pull,
  };
  const h = {
    x: hBase.x + (outerCenter.x - hBase.x) * pull,
    y: hBase.y + (outerCenter.y - hBase.y) * pull,
  };

  const gIndex = scaffold.preservedBridge[1];
  const hIndex = scaffold.preservedBridge[2];
  lines[4 + gIndex] = rewriteV2000AtomCoordinate(lines[4 + gIndex] ?? "", g.x, g.y);
  lines[4 + hIndex] = rewriteV2000AtomCoordinate(lines[4 + hIndex] ?? "", h.x, h.y);
  return lines.join("\n");
}

function setSpecificWedgeBonds(
  molBlock: string,
  wedgeBonds: Array<{ center: number; neighbor: number; stereo: 1 | 6 }>,
) {
  if (molBlock.includes("V3000")) return null;
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return null;
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(lines[3].slice(3, 6).trim(), 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;
  const bondStart = 4 + atomCount;

  const targets = new Map<string, { center: number; neighbor: number; stereo: 1 | 6 }>();
  for (const bond of wedgeBonds) {
    targets.set(canonicalPathKey([bond.center, bond.neighbor]), bond);
  }

  for (let index = 0; index < bondCount; index += 1) {
    const lineIndex = bondStart + index;
    const line = lines[lineIndex] ?? "";
    const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
    const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
    const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
    if (!Number.isInteger(atom1) || !Number.isInteger(atom2) || atom1 < 0 || atom2 < 0) continue;
    const target = targets.get(canonicalPathKey([atom1, atom2]));
    if (!target) {
      lines[lineIndex] = rewriteV2000BondLine(line, atom1 + 1, atom2 + 1, bondType, 0);
      continue;
    }
    lines[lineIndex] = rewriteV2000BondLine(
      line,
      target.center + 1,
      target.neighbor + 1,
      bondType,
      target.stereo,
    );
  }

  return lines.join("\n");
}

function countStereoBondsInMolBlock(molBlock: string) {
  let wedges = 0;
  let hashes = 0;
  for (const line of molBlock.split(/\r?\n/)) {
    const stereo = Number.parseInt(line.slice(9, 12).trim() || "0", 10);
    if (stereo === 1) wedges += 1;
    else if (stereo === 6) hashes += 1;
  }
  return { wedges, hashes };
}

/**
 * Preserve reaction-map depiction continuity globally.
 *
 * Product SMILES deliberately contain chemistry, not drawing coordinates. A
 * direct SMILES -> SVG round trip therefore lets RDKit rotate or reflect the
 * product on every reaction. This function instead finds the largest unchanged
 * heavy-atom scaffold in the user's Ketcher molfile(s), aligns the product's
 * coordinates to it, and snaps all matched atoms back to the exact user-drawn
 * coordinates. The transformed molblock is accepted only if reparsing proves
 * that its canonical isomeric SMILES is unchanged.
 */
export async function getReferenceAlignedProductStructure(
  productSource: string,
  referenceSources: readonly (string | null | undefined)[],
): Promise<string | null> {
  const product = normalizeMoleculeSource(productSource);
  const references = referenceSources
    .map((reference) => normalizeMoleculeSource(reference))
    .filter(Boolean);
  if (!product || references.length === 0) return null;

  const cacheKey = `aligned-product-structure::${product}::${references.join("||")}`;
  if (alignedProductStructureCache.has(cacheKey)) {
    return alignedProductStructureCache.get(cacheKey) ?? null;
  }

  let productMol: any = null;
  const temporaryMols: any[] = [];
  try {
    const RDKit = await getRDKit();
    productMol = RDKit.get_mol(product);
    if (!productMol) return null;
    const canonicalProduct = productMol.get_smiles?.();
    if (!looksLikeMolBlock(product)) productMol.set_new_coords?.();
    const productMolBlock = productMol.get_molblock?.();
    if (typeof productMolBlock !== "string" || productMolBlock.includes("V3000")) {
      rememberAlignedStructure(cacheKey, null);
      return null;
    }
    const productDepiction = parseDepiction(productMolBlock);
    if (!productDepiction) return null;

    const candidates: AlignmentCandidate[] = [];
    for (const rawReference of references) {
      let referenceBlock = rawReference;
      if (!looksLikeMolBlock(referenceBlock)) {
        const referenceMol = RDKit.get_mol(referenceBlock);
        if (!referenceMol) continue;
        temporaryMols.push(referenceMol);
        referenceMol.set_new_coords?.();
        const generated = referenceMol.get_molblock?.();
        if (typeof generated !== "string") continue;
        referenceBlock = generated;
      }
      const referenceDepiction = parseDepiction(referenceBlock);
      if (!referenceDepiction) continue;
      const mappings = mappingCandidatesWithBoundaryPruning(referenceDepiction, productDepiction);
      for (const mapping of mappings) {
        for (const reflected of [false, true]) {
          const transform = fitSimilarityTransform(referenceDepiction, productDepiction, mapping, reflected);
          if (!transform) continue;
          candidates.push({ reference: referenceBlock, mapping, transform, anchorCount: mapping.size });
        }
      }
    }

    candidates.sort(compareAlignmentCandidates);
    for (const candidate of candidates) {
      const referenceDepiction = parseDepiction(candidate.reference);
      if (!referenceDepiction) continue;

      // Reflection changes the handedness of a 2-D depiction. Swap wedge/hash
      // codes first, then verify molecular identity. If RDKit encodes a center
      // in a way that does not require this swap, the second attempt covers it.
      const reflectionAttempts = candidate.transform.reflected ? [true, false] : [false];
      for (const swapWedges of reflectionAttempts) {
        let aligned = rewriteV2000Coordinates(
          productMolBlock,
          productDepiction,
          referenceDepiction,
          candidate.mapping,
          candidate.transform,
          swapWedges,
        );
        if (!aligned) continue;
        if (looksLikeMolBlock(candidate.reference)) {
          aligned = transferMappedReferenceStereoBonds(
            aligned,
            candidate.reference,
            candidate.mapping,
          ) ?? aligned;
        }

        aligned = enrichWithSupplementalReferenceCoordinates(
          aligned,
          productDepiction,
          candidate,
          references,
        ) ?? aligned;

        if (alignmentIntroducesSevereGeometryDistortion(productDepiction, aligned)) {
          continue;
        }

        const verificationMol = RDKit.get_mol(aligned);
        if (!verificationMol) continue;
        try {
          const canonicalAligned = verificationMol.get_smiles?.();
          if (
            typeof canonicalProduct === "string" &&
            typeof canonicalAligned === "string" &&
            canonicalProduct !== canonicalAligned
          ) {
            continue;
          }
          rememberAlignedStructure(cacheKey, aligned);
          return aligned;
        } finally {
          verificationMol.delete?.();
        }
      }
    }

    rememberAlignedStructure(cacheKey, null);
    return null;
  } catch (error) {
    console.warn("Reference-preserving product alignment failed; using standard depiction.", error);
    rememberAlignedStructure(cacheKey, null);
    return null;
  } finally {
    productMol?.delete?.();
    for (const mol of temporaryMols) mol?.delete?.();
  }
}

/**
 * Diels-Alder depiction is reaction-aware rather than a generic SMILES redraw.
 * It preserves the cyclic diene coordinates and specifically maps the diene's
 * original C=C-C=C path onto the product C-C=C-C path. This locks the migrated
 * double bond to the chemically corresponding side of the student's drawing.
 *
 * The selected stereoisomer is generated upstream; this renderer only preserves
 * its molblock wedge choices and coordinates. It never invents chirality.
 */
const ALPHA_PYRONE_REFERENCE_SMARTS =
  "[$([O]=[c]1[o][c][c][c][c]1),$([O]=[C]1O[C]=[C][C]=[C]1)]";

async function sourceMatchesSmarts(
  RDKit: any,
  source: string,
  smarts: string,
): Promise<boolean> {
  let mol: any = null;
  let query: any = null;
  try {
    mol = RDKit.get_mol(source);
    if (!mol) return false;
    query = RDKit.get_qmol(smarts);
    if (!query) return false;
    // get_substruct_match() is the reliable embind path here. On some RDKit
    // builds, has_substruct_match is absent or returns a non-boolean wrapper,
    // which made the alpha-pyrone bypass silently fail and let the mangling
    // bicyclic projection run anyway.
    return mol.get_substruct_match?.(query) !== "{}";
  } catch {
    return false;
  } finally {
    query?.delete?.();
    mol?.delete?.();
  }
}

export async function getDielsAlderBicyclicSvg(
  productSource: string,
  referenceSources: readonly (string | null | undefined)[],
): Promise<string | null> {
  const product = normalizeMoleculeSource(productSource);
  const references = referenceSources
    .map((reference) => normalizeMoleculeSource(reference))
    .filter(Boolean);
  if (!product) return null;
  if (references.length === 0) return getHeavyAtomStereoSvg(product);

  let productMol: any = null;
  const temporaryMols: any[] = [];
  try {
    const RDKit = await getRDKit();
    if (
      await Promise.all(
        references.map((reference) =>
          sourceMatchesSmarts(RDKit, reference, ALPHA_PYRONE_REFERENCE_SMARTS),
        ),
      ).then((hits) => hits.some(Boolean))
    ) {
      // The bicyclic-preservation code is tuned for hydrocarbon bridged systems.
      // Alpha-pyrone adducts already have a rigid, heteroatom-rich bicyclic
      // core; forcing the preserved-orientation bridge projection bends the
      // lactone portion and mangles the SVG. Use a completely fresh generic
      // redraw here (not the heavy-atom stereo projection), so RDKit can lay
      // out the bicyclic lactone without inherited bridge wedges/labels.
      return getMoleculeSvg(product);
    }

    productMol = RDKit.get_mol(product);
    if (!productMol) return getHeavyAtomStereoSvg(product);
    const canonicalProduct = productMol.get_smiles?.();
    if (!looksLikeMolBlock(product)) productMol.set_new_coords?.();
    const productMolBlock = productMol.get_molblock?.();
    if (typeof productMolBlock !== "string" || productMolBlock.includes("V3000")) {
      return getHeavyAtomStereoSvg(product);
    }
    const productDepiction = parseDepiction(productMolBlock);
    if (!productDepiction) return getHeavyAtomStereoSvg(product);

    const candidates: Array<AlignmentCandidate & { reactionScore: number }> = [];
    for (const rawReference of references) {
      let referenceBlock = rawReference;
      if (!looksLikeMolBlock(referenceBlock)) {
        const referenceMol = RDKit.get_mol(referenceBlock);
        if (!referenceMol) continue;
        temporaryMols.push(referenceMol);
        referenceMol.set_new_coords?.();
        const generated = referenceMol.get_molblock?.();
        if (typeof generated !== "string") continue;
        referenceBlock = generated;
      }
      const referenceDepiction = parseDepiction(referenceBlock);
      if (!referenceDepiction || conjugatedDienePaths(referenceDepiction).length === 0) continue;
      for (const mapping of mappingCandidatesWithBoundaryPruning(referenceDepiction, productDepiction)) {
        const reactionScore = dielsAlderMappingScore(referenceDepiction, productDepiction, mapping);
        if (reactionScore <= 0) continue;
        // Never mirror the diene depiction for the representative card. The
        // mirror enantiomer remains a chemical mixture member upstream.
        const transform = fitSimilarityTransform(referenceDepiction, productDepiction, mapping, false);
        if (!transform) continue;
        candidates.push({ reference: referenceBlock, mapping, transform, anchorCount: mapping.size, reactionScore });
      }
    }

    candidates.sort((left, right) =>
      right.reactionScore - left.reactionScore || compareAlignmentCandidates(left, right),
    );

    for (const candidate of candidates) {
      const referenceDepiction = parseDepiction(candidate.reference);
      if (!referenceDepiction) continue;
      const scaffold = findDielsAlderBicycloScaffold(
        referenceDepiction,
        productDepiction,
        candidate.mapping,
      );
      if (!scaffold) continue;

      let aligned = rewriteV2000Coordinates(
        productMolBlock,
        productDepiction,
        referenceDepiction,
        candidate.mapping,
        candidate.transform,
        false,
      );
      if (!aligned) continue;
      aligned = repositionDielsAlderInternalBridge(aligned, productDepiction, scaffold) ?? aligned;
      if (alignmentIntroducesSevereGeometryDistortion(productDepiction, aligned)) {
        continue;
      }

      const wedgeSpecs = [
        { center: scaffold.bridgeheadA, neighbor: scaffold.preservedBridge[1], stereo: 1 as const },
        { center: scaffold.bridgeheadD, neighbor: scaffold.preservedBridge[2], stereo: 1 as const },
      ];
      if (scaffold.substituentCenter !== null && scaffold.substituentAtom !== null) {
        wedgeSpecs.push({
          center: scaffold.substituentCenter,
          neighbor: scaffold.substituentAtom,
          stereo: 1 as const,
        });
      }

      const wedgeTrials: Array<Array<1 | 6>> = [
        wedgeSpecs.map(() => 1 as const),
        wedgeSpecs.map(() => 6 as const),
      ];

      for (const stereos of wedgeTrials) {
        const presentation = setSpecificWedgeBonds(
          aligned,
          wedgeSpecs.map((bond, index) => ({ ...bond, stereo: stereos[index] })),
        );
        if (!presentation) continue;
        const verificationMol = RDKit.get_mol(presentation);
        if (!verificationMol) continue;
        try {
          const canonicalAligned = verificationMol.get_smiles?.();
          if (
            typeof canonicalProduct === "string" &&
            typeof canonicalAligned === "string" &&
            canonicalProduct !== canonicalAligned
          ) {
            continue;
          }
          const counts = countStereoBondsInMolBlock(presentation);
          if (stereos.every((stereo) => stereo === 1) && counts.wedges < wedgeSpecs.length) {
            continue;
          }
          return getHeavyAtomStereoSvg(presentation);
        } finally {
          verificationMol.delete?.();
        }
      }
    }

    // If the reaction-specific map cannot be proven, fall back to the global
    // scaffold-preserving layer instead of inventing a projection.
    const genericAligned = await getReferenceAlignedProductStructure(product, references);
    return genericAligned
      ? getHeavyAtomStereoSvg(genericAligned)
      : getHeavyAtomStereoSvg(product);
  } catch (error) {
    console.warn("Diels-Alder reaction-aware depiction failed; using verified fallback.", error);
    return getHeavyAtomStereoSvg(product);
  } finally {
    productMol?.delete?.();
    for (const mol of temporaryMols) mol?.delete?.();
  }
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
  const source = normalizeMoleculeSource(molfile);
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
  const trimmed = normalizeMoleculeSource(smiles);
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
  const trimmed = normalizeMoleculeSource(smiles);
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
  const trimmed = normalizeMoleculeSource(smiles);
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
  const trimmed = normalizeMoleculeSource(smiles);
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
    // A pre-aligned molblock already contains the product coordinates chosen
    // to preserve the user's reactant depiction. Regenerate coordinates only
    // for a raw SMILES input.
    if (!looksLikeMolBlock(trimmed)) sourceMol.set_new_coords?.();
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
  const product = normalizeMoleculeSource(smiles);
  const reference = normalizeMoleculeSource(referenceSmiles);
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
  const trimmed = normalizeMoleculeSource(smiles);
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
  const product = normalizeMoleculeSource(smiles);
  const reference = normalizeMoleculeSource(referenceSmiles);
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
  const trimmed = normalizeMoleculeSource(smiles);
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
