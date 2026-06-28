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

export type NomenclatureResult = {
  estimatedName: string;
  commonName: string | null;
  displayName: string;
  namingConfidence: "High" | "Medium" | "Low";
  parentChain: string | null;
  parentChainLength: number;
  mainSuffix: string | null;
  prefixes: string[];
  explanation: string;
  limitations: string[];
  motifs?: string[];
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
  | "ester"
  | "acidChloride"
  | "aldehyde"
  | "ketone"
  | "alcohol"
  | "amine"
  | "thiol"
  | "nitrile"
  | "amide";

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
  locant: number;
};

export type DescriptorMap = Record<string, unknown>;