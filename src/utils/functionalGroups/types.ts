export type FunctionalGroupConfidence = "High" | "Medium" | "Low";

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
  matches: number[][];
};

export type FunctionalGroupHierarchy = {
  mainGroup: FunctionalGroupResult | null;
  primaryGroups: FunctionalGroupResult[];
  functionalGroups: FunctionalGroupResult[];
};

export type FunctionalGroupPattern = Omit<
  FunctionalGroupResult,
  "count" | "matches"
> & {
  smarts: string;
};