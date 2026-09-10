import { getRDKit } from "../rdkit";
import {
  generateMechanisticDielsAlderCandidates,
  identifyDielsAlderProductRegioRelationship,
} from "./dielsAlderMechanism";
import {
  completeStereoRepresentative,
  prepareMechanisticStereoMolBlock,
  scoreStereoRepresentative,
  type RawGetMol,
} from "./depictionEngine";
import type { MechanisticStereoDirective } from "./runtime";

export type MechanisticStereoRegressionResult = {
  id: string;
  passed: boolean;
  message: string;
};

function rawGetMolFromRDKit(rdkit: any): RawGetMol {
  return (rdkit.__pocketchem_raw_get_mol ?? rdkit.get_mol.bind(rdkit)) as RawGetMol;
}

function stereoBondCounts(molBlock: string | null) {
  if (!molBlock) return { wedge: 0, hash: 0 };
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return { wedge: 0, hash: 0 };
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(lines[3].slice(3, 6).trim(), 10);
  let wedge = 0;
  let hash = 0;
  const start = 4 + atomCount;
  for (let index = 0; index < bondCount; index += 1) {
    const stereo = Number.parseInt((lines[start + index] ?? "").slice(9, 12).trim() || "0", 10);
    if (stereo === 1) wedge += 1;
    if (stereo === 6) hash += 1;
  }
  return { wedge, hash };
}

function dielsDirective(
  diene: string,
  dienophile: string,
  options: {
    dieneTerminalRelationship?: "same" | "opposite" | null;
    dienophileGeometry?: "E" | "Z" | null;
    activatedDienophile?: boolean;
  } = {},
): MechanisticStereoDirective {
  return {
    kind: "diels-alder",
    ruleId: "regression",
    reactantSmiles: [diene, dienophile],
    representativeFace: "back",
    relationship: "syn",
    referenceIds: ["openstax-da-14.4", "openstax-da-14.5", "openstax-da-30.6", "moc-da-regio"],
    dielsAlder: {
      dieneTerminalRelationship: options.dieneTerminalRelationship ?? null,
      dienophileGeometry: options.dienophileGeometry ?? null,
      activatedDienophile: options.activatedDienophile ?? false,
    },
  };
}

async function dielsAlderRegioCase(
  id: string,
  diene: string,
  expected: "1,2" | "1,4",
): Promise<MechanisticStereoRegressionResult> {
  const rdkit = await getRDKit();
  const rawGetMol = rawGetMolFromRDKit(rdkit);
  const result = generateMechanisticDielsAlderCandidates(rdkit, rawGetMol, diene, "C=CC(=O)OC");
  const relationships = new Set(
    result.products.map((product) => identifyDielsAlderProductRegioRelationship(rawGetMol, product)),
  );
  const passed =
    result.regio.preferredRelationship === expected &&
    result.products.length > 0 &&
    relationships.size === 1 &&
    relationships.has(expected);
  return {
    id,
    passed,
    message: passed
      ? `${id}: selected only the ${expected} Diels-Alder regioisomer.`
      : `${id}: expected ${expected}; directive=${result.regio.preferredRelationship}; products=${[
          ...relationships,
        ].join(",") || "none"}.`,
  };
}

async function dielsAlderDepictionCase(
  id: string,
  diene: string,
  dienophile: string,
  expectedWedge: number,
  expectedHash: number,
  options: {
    dieneTerminalRelationship?: "same" | "opposite" | null;
    dienophileGeometry?: "E" | "Z" | null;
    activatedDienophile?: boolean;
  } = {},
): Promise<MechanisticStereoRegressionResult> {
  const rdkit = await getRDKit();
  const rawGetMol = rawGetMolFromRDKit(rdkit);
  const generated = generateMechanisticDielsAlderCandidates(rdkit, rawGetMol, diene, dienophile);
  const constitutional = generated.products[0];
  if (!constitutional) {
    return { id, passed: false, message: `${id}: no constitutional Diels-Alder product generated.` };
  }

  const directive = dielsDirective(diene, dienophile, options);
  directive.dielsAlder = {
    ...directive.dielsAlder!,
    preferredRegioRelationship: generated.regio.preferredRelationship,
    dieneDirectorPosition: generated.regio.dieneDirectorPosition,
    regioConfidence: generated.regio.confidence,
    regioReason: generated.regio.reason,
  };
  const completed = completeStereoRepresentative(rawGetMol, constitutional, directive) ?? constitutional;
  const score = scoreStereoRepresentative(rawGetMol, completed, directive);
  const counts = stereoBondCounts(prepareMechanisticStereoMolBlock(rawGetMol, completed, directive));
  const passed = score === 1 && counts.wedge === expectedWedge && counts.hash === expectedHash;
  return {
    id,
    passed,
    message: passed
      ? `${id}: verified ${expectedWedge} wedge / ${expectedHash} dash with mechanism score 1.0.`
      : `${id}: expected ${expectedWedge} wedge / ${expectedHash} dash; got ${counts.wedge} / ${counts.hash}, score=${score}.`,
  };
}

/**
 * Mechanism-first regression suite. These are intentionally archetypes rather
 * than exact product-SMILES lookups so atom ordering and drawing direction do
 * not change the expected chemistry.
 */
export async function runMechanisticStereoRegressionSuite(): Promise<MechanisticStereoRegressionResult[]> {
  return Promise.all([
    // User-supplied directing rule, in both drawing directions:
    // 1-substituted diene -> 1,2; 2-substituted diene -> 1,4.
    dielsAlderRegioCase("DA-1-substituted-forward", "COC=CC=C", "1,2"),
    dielsAlderRegioCase("DA-1-substituted-reversed", "C=CC=COC", "1,2"),
    dielsAlderRegioCase("DA-2-substituted-forward", "C=C(OC)C=C", "1,4"),
    dielsAlderRegioCase("DA-2-substituted-reversed", "C=CC(OC)=C", "1,4"),
    dielsAlderRegioCase("DA-1-methyl", "CC=CC=C", "1,2"),
    dielsAlderRegioCase("DA-2-methyl", "C=C(C)C=C", "1,4"),

    // The four Diels-Alder stereochemical archetypes from the user's failing
    // screenshots. Wedge=solid, hash=dashed V2000 presentation bond.
    dielsAlderDepictionCase(
      "DA-cis-diester-two-dashes",
      "C=CC=C",
      "COC(=O)/C=C\\C(=O)OC",
      0,
      2,
      { dienophileGeometry: "Z", activatedDienophile: true },
    ),
    dielsAlderDepictionCase(
      "DA-cyclic-dinitrile-bridge-wedges",
      "C1=CC=CC1",
      "N#C/C=C\\C#N",
      2,
      2,
      { dienophileGeometry: "Z", activatedDienophile: true },
    ),
    dielsAlderDepictionCase(
      "DA-cyclohexadiene-propene-three-wedges",
      "C1=CC=CCC1",
      "C=CC",
      3,
      0,
    ),
    dielsAlderDepictionCase(
      "DA-dimethyl-diene-acrylate-three-dashes",
      "C/C=C/C=C/C",
      "C=CC(=O)OC",
      0,
      3,
      { activatedDienophile: true },
    ),
  ]);
}
