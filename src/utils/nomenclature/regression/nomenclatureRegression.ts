import { analyzeFunctionalGroupHierarchy } from "../../functionalGroups";
import { analyzeNomenclatureAndProperties } from "../nomenclatureEngine";
import type { NamingStatus } from "../types";

export type NomenclatureRegressionCase = {
  id: string;
  smiles: string;
  expectedNames: string[];
  forbiddenNames?: string[];
  expectedCommonName?: string | null;
  expectedStatus?: NamingStatus;
  expectedMainSuffix?: string | null;
  note?: string;
};

/**
 * Representative structures rather than a naming dictionary. These cases are
 * deliberately independent of commonNames.ts: they verify the output of the
 * complete functional-group -> parent -> prefix/suffix pipeline.
 */
export const NOMENCLATURE_REGRESSION_CASES: NomenclatureRegressionCase[] = [
  // Structure-aware common names + retained heterocycle nomenclature.
  {
    id: "adenine-retained-purine",
    smiles: "N1=CNC2=NC=NC(N)=C12",
    expectedNames: ["6-aminopurine"],
    expectedCommonName: "adenine",
    expectedStatus: "retained",
    expectedMainSuffix: null,
    note: "Adenine must retain the purine parent instead of being flattened into an acyclic imine name.",
  },
  {
    id: "guanine-retained-purine",
    smiles: "Nc1nc2[nH]cnc2c(=O)[nH]1",
    expectedNames: ["2-aminopurin-6-one"],
    expectedCommonName: "guanine",
    expectedStatus: "retained",
    expectedMainSuffix: "-one",
  },
  {
    id: "cytosine-retained-pyrimidine",
    smiles: "Nc1ccnc(=O)[nH]1",
    expectedNames: ["4-aminopyrimidin-2-one"],
    expectedCommonName: "cytosine",
    expectedStatus: "retained",
    expectedMainSuffix: "-one",
  },
  {
    id: "thymine-retained-pyrimidine",
    smiles: "Cc1c[nH]c(=O)[nH]c1=O",
    expectedNames: ["5-methylpyrimidin-2,4-dione"],
    expectedCommonName: "thymine",
    expectedStatus: "retained",
  },
  {
    id: "uracil-retained-pyrimidine",
    smiles: "O=c1cc[nH]c(=O)[nH]1",
    expectedNames: ["pyrimidin-2,4-dione"],
    expectedCommonName: "uracil",
    expectedStatus: "retained",
  },
  {
    id: "open-chain-glucose-structure-common-name",
    smiles: "OC[C@@H](O)[C@@H](O)[C@H](O)[C@@H](O)C=O",
    expectedNames: ["glucose"],
    expectedCommonName: "glucose",
    expectedStatus: "common",
    note: "Exact stereochemical carbohydrate identity should take precedence over a long generic chain name.",
  },
  {
    id: "cyclic-glucose-structure-common-name",
    smiles: "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O",
    expectedNames: ["glucose"],
    expectedCommonName: "glucose",
    expectedStatus: "common",
    note: "A stereochemically recognized cyclic sugar should not be displayed as a generic oxane derivative.",
  },
  {
    id: "sucrose-whole-structure-common-name",
    smiles: "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O",
    expectedNames: ["sucrose"],
    expectedCommonName: "sucrose",
    expectedStatus: "common",
    forbiddenNames: ["oxolane", "oxane"],
    note: "Exact sucrose must resolve before generic oxolane/oxane retained-parent naming.",
  },
  {
    id: "lactose-whole-structure-common-name",
    smiles: "C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](OC([C@@H]([C@H]2O)O)O)CO)O)O)O)O",
    expectedNames: ["lactose"],
    expectedCommonName: "lactose",
    expectedStatus: "common",
  },
  {
    id: "maltose-whole-structure-common-name",
    smiles: "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](OC([C@@H]([C@H]2O)O)O)CO)O)O)O)O",
    expectedNames: ["maltose"],
    expectedCommonName: "maltose",
    expectedStatus: "common",
  },
  {
    id: "cellobiose-whole-structure-common-name",
    smiles: "C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](OC([C@@H]([C@H]2O)O)O)CO)O)O)O)O",
    expectedNames: ["cellobiose"],
    expectedCommonName: "cellobiose",
    expectedStatus: "common",
  },
  {
    id: "trehalose-whole-structure-common-name",
    smiles: "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@@H]([C@H]([C@@H]([C@H](O2)CO)O)O)O)O)O)O)O",
    expectedNames: ["trehalose"],
    expectedCommonName: "trehalose",
    expectedStatus: "common",
  },
  {
    id: "aspirin-structure-common-name",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
    expectedNames: ["aspirin", "2-acetyloxybenzoic acid"],
    expectedCommonName: "aspirin",
  },

  // Retained heterocycle parent/numbering regressions.
  { id: "2-methylpyridine", smiles: "Cc1ncccc1", expectedNames: ["2-methylpyridine"], expectedStatus: "retained" },
  { id: "imidazole", smiles: "c1ncc[nH]1", expectedNames: ["imidazole"], expectedStatus: "retained" },
  { id: "indole", smiles: "c1ccc2[nH]ccc2c1", expectedNames: ["indole"], expectedStatus: "retained" },
  { id: "quinoline", smiles: "c1ccc2ncccc2c1", expectedNames: ["quinoline"], expectedStatus: "retained" },
  { id: "isoquinoline", smiles: "c1ccc2cnccc2c1", expectedNames: ["isoquinoline"], expectedStatus: "retained" },
  { id: "benzimidazole", smiles: "c1ccc2[nH]cnc2c1", expectedNames: ["benzimidazole"], expectedStatus: "retained" },
  { id: "oxazole", smiles: "c1ocnc1", expectedNames: ["oxazole"], expectedStatus: "retained" },
  { id: "thiazole", smiles: "c1scnc1", expectedNames: ["thiazole"], expectedStatus: "retained" },
  { id: "piperidine", smiles: "N1CCCCC1", expectedNames: ["piperidine"], expectedStatus: "retained" },
  { id: "morpholine", smiles: "O1CCNCC1", expectedNames: ["morpholine"], expectedStatus: "retained" },

  { id: "methane", smiles: "C", expectedNames: ["methane"] },
  { id: "ethane", smiles: "CC", expectedNames: ["ethane"] },
  { id: "ethanol", smiles: "CCO", expectedNames: ["ethanol"] },
  { id: "propan-2-ol", smiles: "CC(O)C", expectedNames: ["propan-2-ol", "2-propanol"] },
  { id: "ethanal", smiles: "CC=O", expectedNames: ["ethanal"], expectedCommonName: "acetaldehyde" },
  { id: "propanone", smiles: "CC(=O)C", expectedNames: ["propanone", "propan-2-one"], expectedCommonName: "acetone" },
  { id: "ethanoic-acid", smiles: "CC(=O)O", expectedNames: ["ethanoic acid"], expectedCommonName: "acetic acid" },
  { id: "methyl-ethanoate", smiles: "COC(=O)C", expectedNames: ["methyl ethanoate"] },
  { id: "ethanamide", smiles: "CC(=O)N", expectedNames: ["ethanamide"], expectedCommonName: "acetamide" },
  { id: "ethanenitrile", smiles: "CC#N", expectedNames: ["ethanenitrile"], expectedCommonName: "acetonitrile" },
  { id: "ethanamine", smiles: "CCN", expectedNames: ["ethanamine", "ethylamine"] },
  { id: "methoxymethane", smiles: "COC", expectedNames: ["methoxymethane", "dimethyl ether"] },
  { id: "nitroethane", smiles: "CC[N+](=O)[O-]", expectedNames: ["nitroethane"] },
  {
    id: "prefix-alphabetization",
    smiles: "CC(C)(C)C(CC)CC",
    expectedNames: ["3-ethyl-2,2-dimethylpentane"],
    note: "Alphabetize ethyl before methyl; ignore the multiplicative prefix di-.",
  },

  // Defensive oxygen-classification regressions.
  {
    id: "ethyl-nitrate",
    smiles: "CCO[N+](=O)[O-]",
    expectedNames: ["ethyl nitrate"],
    forbiddenNames: ["ethanol", "hydroxyethane"],
    expectedStatus: "functional-class",
    note: "C-O-NO2 must be a nitrate ester, never an alcohol/hydroxy substituent.",
  },
  {
    id: "dimethyl-peroxide",
    smiles: "COOC",
    expectedNames: ["dimethyl peroxide"],
    forbiddenNames: ["methanol", "hydroxymethane"],
    expectedStatus: "functional-class",
  },
  {
    id: "methyl-hydroperoxide",
    smiles: "COO",
    expectedNames: ["methyl hydroperoxide"],
    expectedStatus: "functional-class",
  },

  // Sulfur functional classes.
  { id: "dimethyl-sulfide", smiles: "CSC", expectedNames: ["dimethyl sulfide"], expectedStatus: "functional-class" },
  { id: "dimethyl-sulfoxide", smiles: "CS(=O)C", expectedNames: ["dimethyl sulfoxide"], expectedStatus: "functional-class" },
  { id: "dimethyl-sulfone", smiles: "CS(=O)(=O)C", expectedNames: ["dimethyl sulfone"], expectedStatus: "functional-class" },

  // Retained parent recognition.
  { id: "benzene", smiles: "c1ccccc1", expectedNames: ["benzene"], expectedStatus: "retained" },
  { id: "pyridine", smiles: "n1ccccc1", expectedNames: ["pyridine"], expectedStatus: "retained" },
  { id: "furan", smiles: "o1cccc1", expectedNames: ["furan"], expectedStatus: "retained" },
  { id: "thiophene", smiles: "s1cccc1", expectedNames: ["thiophene"], expectedStatus: "retained" },

  // Ring-attached terminal suffix forms.
  {
    id: "cyclohexanecarboxylic-acid",
    smiles: "C1CCCCC1C(=O)O",
    expectedNames: ["cyclohexanecarboxylic acid"],
    expectedMainSuffix: "-carboxylic acid",
  },
  {
    id: "cyclohexanecarboxylic-acid-branched-smiles",
    smiles: "C1(CCCCC1)C(=O)O",
    expectedNames: ["cyclohexanecarboxylic acid"],
    forbiddenNames: ["heptanoic acid"],
    expectedMainSuffix: "-carboxylic acid",
    note: "Equivalent branched SMILES form emitted by Ketcher must retain the ring parent.",
  },
  {
    id: "2-acetylcyclohexane-1-carboxylic-acid",
    smiles: "C1CCC(C(=O)C)C(C(=O)O)C1",
    expectedNames: ["2-acetylcyclohexane-1-carboxylic acid"],
    forbiddenNames: ["2-acetylcyclohexanecarboxylic acid"],
    expectedMainSuffix: "-carboxylic acid",
    note: "A second ring substituent requires the suffix-bearing ring atom to be shown explicitly as locant 1.",
  },
  {
    id: "2-methylcyclohexane-1-carboxylic-acid",
    smiles: "CC1CCCCC1C(=O)O",
    expectedNames: ["2-methylcyclohexane-1-carboxylic acid"],
    expectedMainSuffix: "-carboxylic acid",
  },
  {
    id: "cyclohexanecarbaldehyde",
    smiles: "C1CCCCC1C=O",
    expectedNames: ["cyclohexanecarbaldehyde"],
  },
  {
    id: "cyclohexanecarbonitrile",
    smiles: "C1CCCCC1C#N",
    expectedNames: ["cyclohexanecarbonitrile"],
  },
  {
    id: "cyclohexanecarboxamide",
    smiles: "C1CCCCC1C(=O)N",
    expectedNames: ["cyclohexanecarboxamide"],
  },

  // Heteroatom locants and prefix handling.
  {
    id: "n-methylethanamine",
    smiles: "CCN(C)",
    expectedNames: ["N-methylethanamine", "N-methylethan-1-amine"],
  },
  {
    id: "n-n-dimethylethanamine",
    smiles: "CCN(C)C",
    expectedNames: ["N,N-dimethylethanamine", "N,N-dimethylethan-1-amine"],
  },
];

export type NomenclatureRegressionFailure = {
  id: string;
  smiles: string;
  actualName: string;
  actualCommonName: string | null;
  actualStatus: NamingStatus;
  reasons: string[];
};

export type NomenclatureRegressionReport = {
  total: number;
  passed: number;
  failed: number;
  failures: NomenclatureRegressionFailure[];
};

export async function runNomenclatureRegressionSuite(): Promise<NomenclatureRegressionReport> {
  const failures: NomenclatureRegressionFailure[] = [];

  for (const testCase of NOMENCLATURE_REGRESSION_CASES) {
    const hierarchy = await analyzeFunctionalGroupHierarchy(testCase.smiles);
    const identity = await analyzeNomenclatureAndProperties(
      testCase.smiles,
      hierarchy.functionalGroups,
      hierarchy.mainGroup
    );

    const actual = identity.nomenclature;
    const reasons: string[] = [];

    if (!testCase.expectedNames.includes(actual.estimatedName)) {
      reasons.push(`expected one of: ${testCase.expectedNames.join(" | ")}`);
    }

    if (testCase.forbiddenNames?.includes(actual.estimatedName)) {
      reasons.push(`forbidden regression name returned: ${actual.estimatedName}`);
    }

    if (
      testCase.expectedCommonName !== undefined &&
      actual.commonName !== testCase.expectedCommonName
    ) {
      reasons.push(
        `expected common name ${String(testCase.expectedCommonName)}, got ${String(actual.commonName)}`
      );
    }

    if (testCase.expectedStatus && actual.namingStatus !== testCase.expectedStatus) {
      reasons.push(`expected status ${testCase.expectedStatus}, got ${actual.namingStatus}`);
    }

    if (
      testCase.expectedMainSuffix !== undefined &&
      actual.mainSuffix !== testCase.expectedMainSuffix
    ) {
      reasons.push(
        `expected main suffix ${String(testCase.expectedMainSuffix)}, got ${String(actual.mainSuffix)}`
      );
    }

    if (reasons.length > 0) {
      failures.push({
        id: testCase.id,
        smiles: testCase.smiles,
        actualName: actual.estimatedName,
        actualCommonName: actual.commonName,
        actualStatus: actual.namingStatus,
        reasons,
      });
    }
  }

  return {
    total: NOMENCLATURE_REGRESSION_CASES.length,
    passed: NOMENCLATURE_REGRESSION_CASES.length - failures.length,
    failed: failures.length,
    failures,
  };
}
