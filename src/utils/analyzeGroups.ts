export { analyzeFunctionalGroupHierarchy } from "./functionalGroups/analyzer";
export { getRDKit } from "./functionalGroups/rdkit";
export { getMoleculeSvg } from "./functionalGroups/svg";

export type {
  FunctionalGroupResult,
  FunctionalGroupPattern,
  FunctionalGroupHierarchy,
  FunctionalGroupConfidence,
} from "./functionalGroups/types";