export type FunctionalGroupConfidence = "High" | "Medium" | "Low";

export type FunctionalGroupMatch = {
  atoms: number[];
  bonds: number[];
};

export type ChemicalPatternCategory =
  | "functionalGroup"
  | "substituent"
  | "motif"
  | "scaffold"
  | "ion";

export type FunctionalGroupResult = {
  name: string;
  priority: number;
  nomenclaturePriority: number;
  confidence: FunctionalGroupConfidence;
  suffix: string;
  prefix: string;
  equivalentNames?: string[];
  count: number;
  mcatNote: string;

  matches: FunctionalGroupMatch[];
  displayMatches?: FunctionalGroupMatch[];
  displaySmarts?: string;
  category?: ChemicalPatternCategory;
};

export type FunctionalGroupPattern = Omit<
  FunctionalGroupResult,
  "count" | "matches" | "displayMatches"
> & {
  smarts: string;
  displaySmarts?: string;
  category?: ChemicalPatternCategory;
};

export type FunctionalGroupHierarchy = {
  mainGroup: FunctionalGroupResult | null;
  primaryGroups: FunctionalGroupResult[];
  functionalGroups: FunctionalGroupResult[];
};