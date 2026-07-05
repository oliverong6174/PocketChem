export type BranchSubstituent = {
  name: string;
  locant: number;
};

export type BranchDescriptor = {
  atoms: Set<number>;
  path: number[];
  attachmentAtom: number;
  attachmentLocant: number;
};