import type { FunctionalGroupResult } from "../functionalGroups";
import { getRDKit } from "../rdkit";
import type { MassSpectrumPeak, MassSpectrumResult } from "./types";

type Isotope = { shift: number; abundance: number };

const ISOTOPES: Record<string, Isotope[]> = {
  C: [{ shift: 0, abundance: 0.9893 }, { shift: 1, abundance: 0.0107 }],
  H: [{ shift: 0, abundance: 0.999885 }, { shift: 1, abundance: 0.000115 }],
  N: [{ shift: 0, abundance: 0.99636 }, { shift: 1, abundance: 0.00364 }],
  O: [{ shift: 0, abundance: 0.99757 }, { shift: 1, abundance: 0.00038 }, { shift: 2, abundance: 0.00205 }],
  S: [{ shift: 0, abundance: 0.9499 }, { shift: 1, abundance: 0.0075 }, { shift: 2, abundance: 0.0425 }],
  Cl: [{ shift: 0, abundance: 0.7576 }, { shift: 2, abundance: 0.2424 }],
  Br: [{ shift: 0, abundance: 0.5069 }, { shift: 2, abundance: 0.4931 }],
  Si: [{ shift: 0, abundance: 0.92223 }, { shift: 1, abundance: 0.04685 }, { shift: 2, abundance: 0.03092 }],
};

type IsotopePreviewSpec = {
  atomicNumber: number;
  majorAbundance: number;
  minors: Array<{ massNumber: number; shift: number; abundance: number }>;
};

type IsotopeLabelChoice = {
  element: string;
  atomicNumber: number;
  massNumber: number;
  count: number;
};

// Heavy-atom isotopes that RDKit can display explicitly in a skeletal structure.
// Hydrogen isotopes are intentionally omitted here because ordinary SMILES stores
// most hydrogens implicitly; choosing a random implicit H site would be misleading.
const ISOTOPE_PREVIEW_SPECS: Record<string, IsotopePreviewSpec> = {
  C: { atomicNumber: 6, majorAbundance: 0.9893, minors: [{ massNumber: 13, shift: 1, abundance: 0.0107 }] },
  N: { atomicNumber: 7, majorAbundance: 0.99636, minors: [{ massNumber: 15, shift: 1, abundance: 0.00364 }] },
  O: { atomicNumber: 8, majorAbundance: 0.99757, minors: [
    { massNumber: 17, shift: 1, abundance: 0.00038 },
    { massNumber: 18, shift: 2, abundance: 0.00205 },
  ] },
  Si: { atomicNumber: 14, majorAbundance: 0.92223, minors: [
    { massNumber: 29, shift: 1, abundance: 0.04685 },
    { massNumber: 30, shift: 2, abundance: 0.03092 },
  ] },
  S: { atomicNumber: 16, majorAbundance: 0.9499, minors: [
    { massNumber: 33, shift: 1, abundance: 0.0075 },
    { massNumber: 34, shift: 2, abundance: 0.0425 },
  ] },
  Cl: { atomicNumber: 17, majorAbundance: 0.7576, minors: [{ massNumber: 37, shift: 2, abundance: 0.2424 }] },
  Br: { atomicNumber: 35, majorAbundance: 0.5069, minors: [{ massNumber: 81, shift: 2, abundance: 0.4931 }] },
};

const NOMINAL_MASS: Record<string, number> = {
  H: 1, C: 12, N: 14, O: 16, F: 19, Si: 28, P: 31, S: 32, Cl: 35, Br: 79, I: 127, B: 11,
};

const FRAGMENT_REACTIONS = {
  // Remove the alcohol oxygen and a beta hydrogen, leaving the alkene skeleton
  // corresponding to the common M-H2O neutral loss. Multiple equivalent sites are
  // deduplicated; when constitutional alternatives exist, one deterministic
  // representative is shown rather than inventing a molecule-specific rule.
  // Dehydration is drawn toward a saturated (sp3) beta carbon. This avoids
  // generating artificial cumulated-diene/allene fragments by eliminating toward
  // a beta carbon that is already part of a pi bond. For allylic alcohols such as
  // CH2=CH-C(OH)(CH3)2, this correctly gives the conjugated diene skeleton.
  alcoholDehydration: "[C;X4:1]([O;H1:2])-[C;X4;H1,H2,H3:3]>>[C:1]=[C:3]",

  // Decarboxylation removes the carboxyl carbon and both oxygens from R-CO2H.
  acidDecarboxylation: "[*:1]-[C:2](=[O:3])[O;H1:4]>>[*:1]",

  // Representative decarbonylation products. Ketones reconnect the two groups that
  // flanked C=O; aldehydes retain the substituent attached to the formyl carbon.
  ketoneDecarbonylation: "[C:1]-[C:2](=[O:3])-[C:4]>>[C:1]-[C:4]",
  aldehydeDecarbonylation: "[*:1]-[C;H1:2]=[O:3]>>[*:1]",

  // EI alpha cleavage of an alcohol: break a C-C bond directly attached to the
  // carbinol carbon and retain the oxygen-containing side as the carbocation
  // preview R2C(+)-OH. That is the resonance form most often sketched in course
  // problems. (The oxonium form R2C=OH+ is a resonance contributor, but is not
  // the display convention we use here.) Every eligible adjacent carbon is
  // explored; symmetry-equivalent products are deduplicated later.
  alcoholAlphaCleavage: "[C;X4:1]([O;H1:2])-[#6:3]>>[C+:1]([O;H1:2])",
  // The neutral partner from EI homolytic alpha cleavage is a radical, not a
  // closed-shell hydrocarbon. Use hydrogen-count-aware product atoms so RDKit
  // preserves the cleavage-site radical and draws the radical dot on the SVG.
  // Separate patterns keep the original number of hydrogens on the severed atom.
  alcoholAlphaCleavagePairs: [
    "[C;X4:1]([O;H1:2])-[C;H3:3]>>[C+:1]([O;H1:2]).[CH3:3]",
    "[C;X4:1]([O;H1:2])-[C;H2:3]>>[C+:1]([O;H1:2]).[CH2:3]",
    "[C;X4:1]([O;H1:2])-[C;H1:3]>>[C+:1]([O;H1:2]).[CH:3]",
    "[C;X4:1]([O;H1:2])-[C;H0:3]>>[C+:1]([O;H1:2]).[C:3]",
    "[C;X4:1]([O;H1:2])-[c:3]>>[C+:1]([O;H1:2]).[cH0:3]",
  ],

  // Generic EI ester cleavages.  These are graph transformations rather than
  // molecule-name lookups: acyl-O cleavage gives the resonance-stabilized
  // acylium ion, while O-alkyl cleavage can retain charge on an alkyl/benzyl
  // group.  The latter is especially important for benzyl esters.
  esterAcylium: "[C:1](=[O:2])-[O:3]-[C:4]>>[C+:1]=[O:2]",
  esterAlcoholSideCation: "[C:1](=[O:2])-[O:3]-[C:4]>>[C+:4]",

  // Cleavage of an aryl-halogen bond gives a useful secondary EI channel.
  // Keep Br/Cl separate so the surviving carbon skeleton has no fake isotope
  // label attached to it.
  arylBromineLoss: "[c:1]-[Br:2]>>[c+:1]",
  arylChlorineLoss: "[c:1]-[Cl:2]>>[c+:1]",
} as const;

export function parseMolecularFormula(formula: string) {
  const counts: Record<string, number> = {};
  for (const match of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    const element = match[1];
    const count = Number(match[2] || "1");
    counts[element] = (counts[element] ?? 0) + count;
  }
  return counts;
}

function convolve(a: number[], isotope: Isotope[], maxShift: number) {
  const out = Array(maxShift + 1).fill(0) as number[];
  for (let i = 0; i < a.length; i += 1) {
    for (const entry of isotope) {
      const index = i + entry.shift;
      if (index <= maxShift) out[index] += a[i] * entry.abundance;
    }
  }
  return out;
}

function isotopeEnvelope(counts: Record<string, number>, maxShift = 4) {
  let distribution = [1, ...Array(maxShift).fill(0)] as number[];
  for (const [element, count] of Object.entries(counts)) {
    const isotope = ISOTOPES[element];
    if (!isotope) continue;
    for (let i = 0; i < count; i += 1) distribution = convolve(distribution, isotope, maxShift);
  }
  const maximum = Math.max(...distribution, 1e-12);
  return distribution.map((value) => (value / maximum) * 100);
}

function nominalMass(counts: Record<string, number>) {
  let total = 0;
  for (const [element, count] of Object.entries(counts)) {
    const mass = NOMINAL_MASS[element];
    if (mass === undefined) return null;
    total += mass * count;
  }
  return total;
}

function hasGroup(functionalGroups: FunctionalGroupResult[], names: string[]) {
  const nameSet = new Set(names);
  return functionalGroups.some((group) => nameSet.has(group.name));
}

function fragmentPeak(
  molecularIon: number,
  loss: number,
  label: string,
  explanation: string,
  intensity: number,
  fragmentSmiles?: string,
): MassSpectrumPeak | null {
  const mz = molecularIon - loss;
  if (mz <= 10) return null;
  return {
    mz,
    relativeIntensity: intensity,
    label,
    kind: "fragment",
    explanation,
    fragmentSmiles,
    previewStructure: fragmentSmiles,
    previewLabel: label,
  };
}

function logFactorial(value: number) {
  let total = 0;
  for (let i = 2; i <= value; i += 1) total += Math.log(i);
  return total;
}

function isotopePatternSignature(labels: IsotopeLabelChoice[]) {
  return labels
    .slice()
    .sort((a, b) => a.atomicNumber - b.atomicNumber || a.massNumber - b.massNumber || a.count - b.count)
    .map((label) => `${label.massNumber}${label.element}x${label.count}`)
    .join("|");
}

function representativeIsotopePatterns(
  counts: Record<string, number>,
  targetShift: number,
  limit = 2,
): IsotopeLabelChoice[][] {
  if (targetShift <= 0) return [[]];

  type ElementOption = { shift: number; logScore: number; labels: IsotopeLabelChoice[] };
  const perElementOptions: ElementOption[][] = [];

  for (const [element, atomCount] of Object.entries(counts)) {
    const spec = ISOTOPE_PREVIEW_SPECS[element];
    if (!spec || atomCount <= 0) continue;

    const options: ElementOption[] = [];
    const selected = Array(spec.minors.length).fill(0) as number[];

    const visit = (minorIndex: number, usedAtoms: number, shift: number) => {
      if (shift > targetShift || usedAtoms > atomCount) return;
      if (minorIndex >= spec.minors.length) {
        if (shift === 0) {
          options.push({ shift: 0, logScore: 0, labels: [] });
          return;
        }

        const logWays = logFactorial(atomCount)
          - logFactorial(atomCount - usedAtoms)
          - selected.reduce((sum, count) => sum + logFactorial(count), 0);
        let logScore = logWays;
        const labels: IsotopeLabelChoice[] = [];
        selected.forEach((count, index) => {
          if (count <= 0) return;
          const minor = spec.minors[index];
          logScore += count * Math.log(minor.abundance / spec.majorAbundance);
          labels.push({
            element,
            atomicNumber: spec.atomicNumber,
            massNumber: minor.massNumber,
            count,
          });
        });
        options.push({ shift, logScore, labels });
        return;
      }

      const minor = spec.minors[minorIndex];
      const maxCount = Math.min(
        atomCount - usedAtoms,
        Math.floor((targetShift - shift) / minor.shift),
      );
      for (let count = 0; count <= maxCount; count += 1) {
        selected[minorIndex] = count;
        visit(minorIndex + 1, usedAtoms + count, shift + count * minor.shift);
      }
      selected[minorIndex] = 0;
    };

    visit(0, 0, 0);

    const bestForShift = new Map<number, ElementOption>();
    for (const option of options) {
      const current = bestForShift.get(option.shift);
      if (!current || option.logScore > current.logScore) bestForShift.set(option.shift, option);
    }
    perElementOptions.push([...bestForShift.values()]);
  }

  type Combined = { logScore: number; labels: IsotopeLabelChoice[] };
  let dp = new Map<number, Combined[]>([[0, [{ logScore: 0, labels: [] }]]]);

  const keepBest = (items: Combined[]) => {
    const bySignature = new Map<string, Combined>();
    for (const item of items) {
      const signature = isotopePatternSignature(item.labels);
      const current = bySignature.get(signature);
      if (!current || item.logScore > current.logScore) bySignature.set(signature, item);
    }
    return [...bySignature.values()].sort((a, b) => b.logScore - a.logScore).slice(0, Math.max(limit * 4, 6));
  };

  for (const options of perElementOptions) {
    const next = new Map<number, Combined[]>();
    for (const [currentShift, currents] of dp.entries()) {
      for (const current of currents) {
        for (const option of options) {
          const shift = currentShift + option.shift;
          if (shift > targetShift) continue;
          const candidate: Combined = {
            logScore: current.logScore + option.logScore,
            labels: [...current.labels, ...option.labels],
          };
          next.set(shift, [...(next.get(shift) ?? []), candidate]);
        }
      }
    }
    for (const [shift, items] of next.entries()) {
      next.set(shift, keepBest(items));
    }
    dp = next;
  }

  return (dp.get(targetShift) ?? []).sort((a, b) => b.logScore - a.logScore).slice(0, limit).map((item) => item.labels);
}

function isotopeSuperscript(value: number) {
  const superscripts: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };
  return String(value).split("").map((digit) => superscripts[digit] ?? digit).join("");
}

function isotopePatternDescription(labels: IsotopeLabelChoice[]) {
  if (labels.length === 0) return "the monoisotopic parent composition";
  return labels.map((label) => {
    const isotope = `${isotopeSuperscript(label.massNumber)}${label.element}`;
    return label.count === 1 ? `one ${isotope}` : `${label.count} × ${isotope}`;
  }).join(" + ");
}

async function applyRepresentativeIsotopes(
  parentSmiles: string | null,
  labels: IsotopeLabelChoice[] | null,
): Promise<string | undefined> {
  if (!parentSmiles || !labels || labels.length === 0) return parentSmiles ?? undefined;

  let current: string | undefined = parentSmiles;
  for (const label of labels) {
    for (let index = 0; index < label.count; index += 1) {
      if (!current) return undefined;
      const reaction = `[#${label.atomicNumber};!$([${label.massNumber}#${label.atomicNumber}]):1]>>[${label.massNumber}${label.element}:1]`;
      current = await runFragmentReaction(current, reaction);
    }
  }
  return current;
}

async function sourceToSmiles(structure: string): Promise<string | null> {
  const source = structure.trim();
  if (!source) return null;

  const rdkit = await getRDKit();
  let mol: any = null;
  try {
    mol = rdkit.get_mol(source);
    const smiles = mol?.get_smiles?.();
    return typeof smiles === "string" && smiles.trim() ? smiles.trim() : null;
  } catch (error) {
    console.warn("Mass-spec parent structure could not be canonicalized:", error);
    return null;
  } finally {
    mol?.delete?.();
  }
}

async function runFragmentReactions(
  parentSmiles: string | null,
  reactionSmarts: string,
): Promise<string[]> {
  if (!parentSmiles) return [];

  const rdkit = await getRDKit();
  let reaction: any = null;
  let reactant: any = null;
  let reactants: any = null;
  let products: any = null;

  try {
    reaction = rdkit.get_rxn?.(reactionSmarts);
    reactant = rdkit.get_mol(parentSmiles);
    if (!reaction || !reactant) return [];

    reactants = new rdkit.MolList();
    reactants.append(reactant);
    products = reaction.run_reactants(reactants);
    if (!products || typeof products.size !== "function" || typeof products.get !== "function") return [];

    const candidates = new Set<string>();
    for (let setIndex = 0; setIndex < products.size(); setIndex += 1) {
      const productSet = products.get(setIndex);
      try {
        if (!productSet || typeof productSet.size !== "function" || typeof productSet.at !== "function") continue;
        for (let productIndex = 0; productIndex < productSet.size(); productIndex += 1) {
          const productMol = productSet.at(productIndex);
          try {
            const smiles = productMol?.get_smiles?.();
            if (typeof smiles === "string" && smiles.trim() && !smiles.includes(".")) {
              candidates.add(smiles.trim());
            }
          } finally {
            productMol?.delete?.();
          }
        }
      } finally {
        productSet?.delete?.();
      }
    }

    return [...candidates].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.warn("Mass-spec fragment generation failed:", reactionSmarts, error);
    return [];
  } finally {
    products?.delete?.();
    reactants?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}

async function runFragmentReaction(
  parentSmiles: string | null,
  reactionSmarts: string,
): Promise<string | undefined> {
  return (await runFragmentReactions(parentSmiles, reactionSmarts))[0];
}


async function runFragmentReactionSets(
  parentSmiles: string | null,
  reactionSmarts: string,
): Promise<string[][]> {
  if (!parentSmiles) return [];

  const rdkit = await getRDKit();
  let reaction: any = null;
  let reactant: any = null;
  let reactants: any = null;
  let products: any = null;

  try {
    reaction = rdkit.get_rxn?.(reactionSmarts);
    reactant = rdkit.get_mol(parentSmiles);
    if (!reaction || !reactant) return [];

    reactants = new rdkit.MolList();
    reactants.append(reactant);
    products = reaction.run_reactants(reactants);
    if (!products || typeof products.size !== "function" || typeof products.get !== "function") return [];

    const signatures = new Set<string>();
    const sets: string[][] = [];

    for (let setIndex = 0; setIndex < products.size(); setIndex += 1) {
      const productSet = products.get(setIndex);
      try {
        if (!productSet || typeof productSet.size !== "function" || typeof productSet.at !== "function") continue;
        const smilesSet: string[] = [];
        for (let productIndex = 0; productIndex < productSet.size(); productIndex += 1) {
          const productMol = productSet.at(productIndex);
          try {
            const smiles = productMol?.get_smiles?.();
            if (typeof smiles === "string" && smiles.trim()) smilesSet.push(smiles.trim());
          } finally {
            productMol?.delete?.();
          }
        }
        if (smilesSet.length === 0) continue;
        const signature = smilesSet.join("||");
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        sets.push(smilesSet);
      } finally {
        productSet?.delete?.();
      }
    }

    return sets;
  } catch (error) {
    console.warn("Mass-spec fragment-set generation failed:", reactionSmarts, error);
    return [];
  } finally {
    products?.delete?.();
    reactants?.delete?.();
    reactant?.delete?.();
    reaction?.delete?.();
  }
}

function parseMolBlockCharge(lines: string[], atomCount: number) {
  const charges = Array.from({ length: atomCount }, () => 0);
  for (const line of lines) {
    if (!line.startsWith("M  CHG")) continue;
    const fields = line.trim().split(/\s+/);
    const pairCount = Number.parseInt(fields[2] ?? "0", 10);
    for (let index = 0; index < pairCount; index += 1) {
      const atomIndex = Number.parseInt(fields[3 + index * 2] ?? "0", 10) - 1;
      const charge = Number.parseInt(fields[4 + index * 2] ?? "0", 10);
      if (atomIndex >= 0 && atomIndex < atomCount && Number.isFinite(charge)) charges[atomIndex] = charge;
    }
  }
  return charges;
}

function typicalValence(symbol: string, charge: number, currentValence: number) {
  if (symbol === "C") return charge > 0 ? 3 : 4;
  if (symbol === "N") return charge > 0 ? 4 : charge < 0 ? 2 : 3;
  if (symbol === "O") return charge > 0 ? 3 : charge < 0 ? 1 : 2;
  if (symbol === "F" || symbol === "Cl" || symbol === "Br" || symbol === "I") return 1;
  if (symbol === "B") return charge < 0 ? 4 : 3;
  if (symbol === "P") return currentValence > 3 ? 5 : 3;
  if (symbol === "S") return currentValence > 2 ? Math.max(4, Math.ceil(currentValence)) : 2;
  if (symbol === "H") return 1;
  return Math.ceil(currentValence);
}

/**
 * Calculate an educational nominal m/z for a singly charged fragment directly
 * from RDKit's normalized product graph. This intentionally uses nominal isotope
 * masses because the spectrum x-axis and common EI fragment assignments are shown
 * at integer m/z values.
 */
async function nominalMzForFragment(fragmentSmiles: string): Promise<number | null> {
  const rdkit = await getRDKit();
  let mol: any = null;
  try {
    mol = rdkit.get_mol(fragmentSmiles);
    const molBlock = mol?.get_molblock?.();
    if (typeof molBlock !== "string" || molBlock.includes("V3000")) return null;

    const lines = molBlock.split(/\r?\n/);
    if (lines.length < 5) return null;
    const atomCount = Number.parseInt(lines[3]?.slice(0, 3).trim() ?? "", 10);
    const bondCount = Number.parseInt(lines[3]?.slice(3, 6).trim() ?? "", 10);
    if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return null;

    const atomStart = 4;
    const bondStart = atomStart + atomCount;
    const symbols = Array.from({ length: atomCount }, (_, index) =>
      (lines[atomStart + index] ?? "").slice(31, 34).trim(),
    );
    const charges = parseMolBlockCharge(lines, atomCount);
    const valence = Array.from({ length: atomCount }, () => 0);

    for (let index = 0; index < bondCount; index += 1) {
      const line = lines[bondStart + index] ?? "";
      const atom1 = Number.parseInt(line.slice(0, 3).trim(), 10) - 1;
      const atom2 = Number.parseInt(line.slice(3, 6).trim(), 10) - 1;
      const bondType = Number.parseInt(line.slice(6, 9).trim(), 10);
      if (atom1 < 0 || atom2 < 0 || atom1 >= atomCount || atom2 >= atomCount) continue;
      const order = bondType === 2 ? 2 : bondType === 3 ? 3 : bondType === 4 ? 1.5 : 1;
      valence[atom1] += order;
      valence[atom2] += order;
    }

    let total = 0;
    for (let index = 0; index < atomCount; index += 1) {
      const symbol = symbols[index];
      const atomicMass = NOMINAL_MASS[symbol];
      if (atomicMass === undefined) return null;
      total += atomicMass;
      if (symbol === "H") continue;

      const target = typicalValence(symbol, charges[index], valence[index]);
      const implicitHydrogens = Math.max(0, Math.round(target - valence[index]));
      total += implicitHydrogens;
    }

    return total;
  } catch (error) {
    console.warn("Mass-spec fragment nominal-mass calculation failed:", fragmentSmiles, error);
    return null;
  } finally {
    mol?.delete?.();
  }
}

async function alcoholAlphaCleavagePeaks(
  parentSmiles: string | null,
  parentNominalMass: number | null,
): Promise<MassSpectrumPeak[]> {
  const fragmentSets: string[][] = [];
  for (const reactionSmarts of FRAGMENT_REACTIONS.alcoholAlphaCleavagePairs) {
    fragmentSets.push(...await runFragmentReactionSets(parentSmiles, reactionSmarts));
  }
  const peaksByMass = new Map<number, MassSpectrumPeak>();

  for (const fragmentSet of fragmentSets) {
    const fragmentSmiles = fragmentSet[0];
    const companionSmiles = fragmentSet[1];
    if (!fragmentSmiles) continue;

    const mz = await nominalMzForFragment(fragmentSmiles);
    if (mz === null || mz <= 10) continue;

    const neutralLossMass = parentNominalMass !== null ? Math.max(0, parentNominalMass - mz) : null;
    const previewAlternatives: Array<{ structure: string; label: string }> = [
      { structure: fragmentSmiles, label: `ion fragment · m/z ${mz}` },
    ];
    if (companionSmiles) {
      previewAlternatives.push({
        structure: companionSmiles,
        label: neutralLossMass !== null ? `neutral radical · ${neutralLossMass}` : "neutral radical",
      });
    }

    const explanation = neutralLossMass !== null
      ? `Alcohol α-cleavage breaks a C–C bond directly adjacent to the carbinol carbon. The oxygen-containing side retains the charge and is displayed in the course-style carbocation form R₂C(+)-OH so the drawing matches the fragment assignment typically written by hand. The complementary neutral radical responsible for the mass difference (${neutralLossMass}) is shown alongside the ion fragment; its radical dot is retained at the bond-cleavage site.`
      : "Alcohol α-cleavage breaks a C–C bond directly adjacent to the carbinol carbon. The oxygen-containing side retains the charge and is displayed in the course-style carbocation form R₂C(+)-OH; the complementary neutral partner is a radical. Symmetry-equivalent cleavages are merged.";

    const peak: MassSpectrumPeak = {
      mz,
      relativeIntensity: 65,
      label: `m/z ${mz} · α-cleavage`,
      kind: "fragment",
      explanation,
      fragmentSmiles,
      previewStructure: fragmentSmiles,
      previewLabel: `m/z ${mz} · α-cleavage`,
      previewAlternatives,
    };

    const existing = peaksByMass.get(mz);
    if (!existing || (existing.previewAlternatives?.length ?? 0) < previewAlternatives.length) {
      peaksByMass.set(mz, peak);
    }
  }

  return [...peaksByMass.values()].sort((a, b) => a.mz - b.mz);
}

function countToken(smiles: string, token: string) {
  return smiles.split(token).length - 1;
}

function fragmentHalogenCompanions(
  peak: MassSpectrumPeak,
  fragmentSmiles: string,
): MassSpectrumPeak[] {
  const companions: MassSpectrumPeak[] = [];
  const bromines = countToken(fragmentSmiles, "Br");
  const chlorines = countToken(fragmentSmiles, "Cl");

  // For one halogen, expose the characteristic fragment-isotope partner too.
  // Multi-halogen envelopes are intentionally left to a future full fragment
  // isotope convolution rather than pretending a two-line pattern is complete.
  if (bromines === 1) {
    companions.push({
      ...peak,
      mz: peak.mz + 2,
      relativeIntensity: Number((peak.relativeIntensity * (0.4931 / 0.5069)).toFixed(1)),
      label: `${peak.label} · M+2 (⁸¹Br)`,
      explanation: `${peak.explanation} The bromine-containing fragment also gives the expected nearly 1:1 ⁷⁹Br/⁸¹Br isotope partner.`,
    });
  } else if (chlorines === 1) {
    companions.push({
      ...peak,
      mz: peak.mz + 2,
      relativeIntensity: Number((peak.relativeIntensity * (0.2424 / 0.7576)).toFixed(1)),
      label: `${peak.label} · M+2 (³⁷Cl)`,
      explanation: `${peak.explanation} The chlorine-containing fragment also gives the expected ~3:1 ³⁵Cl/³⁷Cl isotope partner.`,
    });
  }

  return companions;
}

async function reactionFragmentPeaks(
  parentSmiles: string | null,
  reactionSmarts: string,
  label: string,
  explanation: string,
  intensity: number,
  minimumMz = 20,
): Promise<MassSpectrumPeak[]> {
  const products = await runFragmentReactions(parentSmiles, reactionSmarts);
  const peaks: MassSpectrumPeak[] = [];
  const seen = new Set<number>();

  for (const fragmentSmiles of products) {
    const mz = await nominalMzForFragment(fragmentSmiles);
    if (mz === null || mz < minimumMz || seen.has(mz)) continue;
    seen.add(mz);

    const peak: MassSpectrumPeak = {
      mz,
      relativeIntensity: intensity,
      label: `m/z ${mz} · ${label}`,
      kind: "fragment",
      explanation,
      fragmentSmiles,
      previewStructure: fragmentSmiles,
      previewLabel: `m/z ${mz} · ${label}`,
    };

    peaks.push(peak, ...fragmentHalogenCompanions(peak, fragmentSmiles));
  }

  return peaks;
}

export async function predictMassSpectrum(
  formula: string,
  exactMass: number | null,
  functionalGroups: FunctionalGroupResult[],
  structure = "",
): Promise<MassSpectrumResult> {
  const counts = parseMolecularFormula(formula);
  const nominal = nominalMass(counts);
  const molecularIon = exactMass ?? nominal;
  const peaks: MassSpectrumPeak[] = [];
  const notes: string[] = [
    "Mass-spectrum intensities are educational EI-style estimates, not instrument-calibrated predictions.",
    "Displayed fragment structures are representative ion skeletons; radical/charge localization may be resonance-delocalized in the actual EI fragment.",
    "Fragment peaks are generated from structure-level EI cleavage rules (including alcohol alpha cleavage, ester cleavage, carbonyl neutral losses, and selected aryl-halogen channels) and remain educational estimates.",
  ];

  const parentSmiles = structure ? await sourceToSmiles(structure) : null;

  if (molecularIon !== null) {
    const envelope = isotopeEnvelope(counts, 4);
    for (let shift = 0; shift < envelope.length; shift += 1) {
      const intensity = envelope[shift];
      if (intensity < 0.15) continue;

      if (shift === 0) {
        peaks.push({
          mz: Number(molecularIon.toFixed(3)),
          relativeIntensity: Number(intensity.toFixed(1)),
          label: "M⁺•",
          kind: "molecular-ion",
          explanation: "Predicted intact molecular radical cation. The radical/positive charge is generally delocalized, so the preview labels the ion without arbitrarily pinning the charge to one atom.",
          previewStructure: parentSmiles ?? undefined,
          previewLabel: "M⁺•",
        });
        continue;
      }

      const isotopePatterns = representativeIsotopePatterns(counts, shift, 2);
      const previewAlternatives: Array<{ structure: string; label: string }> = [];

      for (const pattern of isotopePatterns) {
        const isotopologue = await applyRepresentativeIsotopes(parentSmiles, pattern);
        if (!isotopologue) continue;
        const label = isotopePatternDescription(pattern);
        if (previewAlternatives.some((entry) => entry.structure === isotopologue && entry.label === label)) continue;
        previewAlternatives.push({ structure: isotopologue, label });
      }

      const isotopePattern = isotopePatterns[0] ?? null;
      const patternDescription = isotopePattern ? isotopePatternDescription(isotopePattern) : null;
      const contributorLabels = previewAlternatives.map((entry) => entry.label);
      const primaryPreview = previewAlternatives[0]?.structure ?? parentSmiles ?? undefined;

      peaks.push({
        mz: Number((molecularIon + shift).toFixed(3)),
        relativeIntensity: Number(intensity.toFixed(1)),
        label: `M+${shift}`,
        kind: "isotope",
        explanation: patternDescription
          ? `Natural-isotope contribution ${shift} nominal mass unit${shift === 1 ? "" : "s"} above M. The preview shows representative isotopologues that contribute to this same isotope-envelope peak.`
          : `Natural-isotope contribution ${shift} nominal mass unit${shift === 1 ? "" : "s"} above M.`,
        previewStructure: primaryPreview,
        previewLabel: `M+${shift}`,
        previewContributorLabels: contributorLabels.length > 0 ? contributorLabels : undefined,
        previewAlternatives: previewAlternatives.length > 0 ? previewAlternatives : undefined,
      });
    }

    const fragments: Array<MassSpectrumPeak | null> = [];

    if (hasGroup(functionalGroups, ["Alcohol", "Primary alcohol", "Secondary alcohol", "Tertiary alcohol", "Benzyl alcohol"])) {
      peaks.push(...await alcoholAlphaCleavagePeaks(parentSmiles, nominal));

      const fragmentSmiles = await runFragmentReaction(parentSmiles, FRAGMENT_REACTIONS.alcoholDehydration);
      fragments.push(fragmentPeak(
        molecularIon,
        18.011,
        "M − H₂O",
        "Alcohols commonly show dehydration under EI conditions; the displayed structure is a representative dehydrated fragment skeleton formed by elimination toward a saturated beta carbon, avoiding artificial cumulated-diene products.",
        35,
        fragmentSmiles,
      ));
    }

    if (hasGroup(functionalGroups, ["Carboxylic acid", "Benzoic acid", "Cinnamic acid", "Acrylic acid", "Crotonic acid", "Enoic acid"])) {
      const fragmentSmiles = await runFragmentReaction(parentSmiles, FRAGMENT_REACTIONS.acidDecarboxylation);
      fragments.push(fragmentPeak(
        molecularIon,
        44.01,
        "M − CO₂",
        "Decarboxylation can give a diagnostic neutral loss of CO₂; the displayed structure is the corresponding decarboxylated skeleton.",
        28,
        fragmentSmiles,
      ));
    }

    if (hasGroup(functionalGroups, ["Aldehyde", "Ketone", "Enone", "Enal", "Benzaldehyde"])) {
      const aldehydeLike = hasGroup(functionalGroups, ["Aldehyde", "Enal", "Benzaldehyde"]);
      const fragmentSmiles = await runFragmentReaction(
        parentSmiles,
        aldehydeLike ? FRAGMENT_REACTIONS.aldehydeDecarbonylation : FRAGMENT_REACTIONS.ketoneDecarbonylation,
      );
      fragments.push(fragmentPeak(
        molecularIon,
        28.01,
        "M − CO",
        "Carbonyl compounds may show loss of CO; the displayed structure is a representative decarbonylated fragment skeleton when that transformation can be resolved from the parent graph.",
        24,
        fragmentSmiles,
      ));
    }

    if (hasGroup(functionalGroups, ["Ester", "Enoate", "Lactone"])) {
      peaks.push(...await reactionFragmentPeaks(
        parentSmiles,
        FRAGMENT_REACTIONS.esterAcylium,
        "ester acyl cleavage",
        "EI cleavage of the ester C(O)–O bond can retain charge on the acyl side, producing a resonance-stabilized acylium-type ion.",
        68,
      ));

      peaks.push(...await reactionFragmentPeaks(
        parentSmiles,
        FRAGMENT_REACTIONS.esterAlcoholSideCation,
        "ester O–alkyl cleavage",
        "Cleavage on the alcohol side of an ester can retain charge on an alkyl or benzyl group; benzyl ions are additionally resonance stabilized.",
        58,
        25,
      ));
    }

    if ((counts.Br ?? 0) > 0) {
      peaks.push(...await reactionFragmentPeaks(
        parentSmiles,
        FRAGMENT_REACTIONS.arylBromineLoss,
        "M − Br•",
        "Aryl bromides can fragment by C–Br homolysis, leaving a resonance-stabilized aryl-derived cation.",
        34,
      ));
    }

    if ((counts.Cl ?? 0) > 0) {
      peaks.push(...await reactionFragmentPeaks(
        parentSmiles,
        FRAGMENT_REACTIONS.arylChlorineLoss,
        "M − Cl•",
        "Aryl chlorides can fragment by C–Cl homolysis, leaving an aryl-derived cation.",
        22,
      ));
    }

    if (hasGroup(functionalGroups, ["Alkylbenzene", "Toluene", "Benzyl alcohol", "Benzyl amine", "Benzyl halide"])) {
      peaks.push({
        mz: 91,
        relativeIntensity: 75,
        label: "m/z 91",
        kind: "diagnostic",
        explanation: "Benzylic fragmentation often forms the resonance-stabilized tropylium/benzyl ion.",
        fragmentSmiles: "[CH2+]c1ccccc1",
        previewStructure: "[CH2+]c1ccccc1",
        previewLabel: "m/z 91",
      });
    }

    if (hasGroup(functionalGroups, ["Benzene", "Phenol", "Aniline", "Aryl ether", "Aryl halide", "Nitrobenzene"])) {
      peaks.push({
        mz: 77,
        relativeIntensity: 32,
        label: "m/z 77",
        kind: "diagnostic",
        explanation: "A phenyl-type fragment is common for many aromatic compounds.",
        fragmentSmiles: "c1cc[cH+]cc1",
        previewStructure: "c1cc[cH+]cc1",
        previewLabel: "m/z 77",
      });
    }

    peaks.push(...fragments.filter((value): value is MassSpectrumPeak => Boolean(value)));
  }

  if ((counts.Cl ?? 0) > 0) notes.push("Chlorine gives a diagnostic M:M+2 isotope pattern of roughly 3:1 for one Cl atom.");
  if ((counts.Br ?? 0) > 0) notes.push("Bromine gives a diagnostic M:M+2 isotope pattern of roughly 1:1 for one Br atom.");
  if ((counts.N ?? 0) % 2 === 1 && nominal !== null) notes.push("Nitrogen rule: an odd nominal molecular mass is consistent with an odd number of nitrogens for typical closed-shell organic molecules.");

  const merged = new Map<string, MassSpectrumPeak>();
  for (const peak of peaks) {
    const key = peak.mz.toFixed(2);
    const existing = merged.get(key);
    if (!existing || peak.relativeIntensity > existing.relativeIntensity) merged.set(key, peak);
  }
  const finalPeaks = [...merged.values()].sort((a, b) => a.mz - b.mz);
  const basePeak = finalPeaks.reduce<MassSpectrumPeak | null>((best, peak) => !best || peak.relativeIntensity > best.relativeIntensity ? peak : best, null);

  return {
    formula,
    molecularIonMz: molecularIon === null ? null : Number(molecularIon.toFixed(4)),
    nominalMass: nominal,
    basePeakMz: basePeak?.mz ?? null,
    peaks: finalPeaks,
    notes,
  };
}
