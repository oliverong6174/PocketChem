export type AtomCount = {
  element: string;
  count: number;
};

export type PropertyTendencyLevel =
  | "Very low"
  | "Low"
  | "Medium"
  | "High"
  | "Very high";

export type PropertyTendencyResult = {
  level: PropertyTendencyLevel;
  score: number;
  factors: string[];
  explanation: string;
};

export type MoleculePropertyResult = {
  molecularFormula: string;
  exactMass: string | null;
  molecularWeight: string | null;
  degreesOfUnsaturation: number | null;
  formalCharge: number;
  atomCounts: AtomCount[];
  heavyAtomCount: number;
  hydrogenBondDonors: number | null;
  hydrogenBondAcceptors: number | null;
  rotatableBonds: number | null;
  topologicalPolarSurfaceArea: string | null;
  logP: string | null;
  ringCount: number | null;
  notes: string[];
  boilingPointTendency: PropertyTendencyResult;
  waterSolubilityTendency: PropertyTendencyResult;
  membranePermeabilityTendency: PropertyTendencyResult;
  volatilityTendency: PropertyTendencyResult;
};

export type NamingStatus =
  | "systematic"
  | "retained"
  | "common"
  | "functional-class"
  | "unsupported";


export type StereoDescriptorKind = "tetrahedral" | "double-bond";
export type StereoDescriptorValue = "R" | "S" | "E" | "Z";

export type NomenclatureStereoDescriptor = {
  kind: StereoDescriptorKind;
  descriptor: StereoDescriptorValue;
  locant: number | null;
  atomIndex?: number;
  bondAtomIndices?: [number, number];
  source: "rdkit-cip";
};

export type NomenclatureResult = {
  estimatedName: string;
  commonName: string | null;
  displayName: string;
  namingConfidence: "High" | "Medium" | "Low";
  namingStatus: NamingStatus;
  parentChain: string | null;
  parentChainLength: number;
  mainSuffix: string | null;
  prefixes: string[];
  explanation: string;
  limitations: string[];
  motifs?: string[];
  stereodescriptors?: NomenclatureStereoDescriptor[];
  stereoPrefix?: string | null;
};

export type MoleculeIdentityResult = {
  nomenclature: NomenclatureResult;
  properties: MoleculePropertyResult;
};

export type ParsedAtom = {
  atomIndex: number;
  element: string;
  charge: number;
};

export type ParsedBond = {
  bondIndex: number;
  atomA: number;
  atomB: number;
  bondOrder: number;
};

export type ParsedMol = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  adjacency: Map<number, ParsedBond[]>;
};

export type ParentDescriptor = {
  kind: "chain" | "ring";
  path: number[];
  carbonCount: number;
  parentHydrocarbon: string | null;
  parentStem: string | null;
  aromaticRing?: boolean;
};

export type RingDescriptor = {
  ringAtoms: number[];
  ringBonds: ParsedBond[];
};

export type NamingFeatureType =
  | "carboxylicAcid"
  | "peroxyAcid"
  | "ester"
  | "acidChloride"
  | "acylAzide"
  | "anhydride"
  | "aldehyde"
  | "ketone"
  | "alcohol"
  | "amine"
  | "thiol"
  | "nitrile"
  | "amide"
  | "sulfonicAcid"
  | "sulfinicAcid"
  | "sulfenicAcid"
  | "sulfonamide"
  | "imine"
  | "thioaldehyde"
  | "thioketone"
  | "thioamide"
  | "thiocarboxylicAcid"
  | "alkene"
  | "alkyne";

export type NamingFeature = {
  type: NamingFeatureType;
  locants: number[];
  suffix: string;
  prefix: string;
  priority: number;
  alkylName?: string;
};

export type Substituent = {
  name: string;
  locant: number | string;
};

export type DescriptorMap = Record<string, unknown>;