export type MassGraphAtom = {
  index: number;
  symbol: string;
  charge: number;
  implicitHydrogens: number;
};

export type MassGraphBond = {
  index: number;
  a: number;
  b: number;
  /** Numeric bond order used for valence/resonance heuristics. */
  order: number;
  /** Original V2000 bond type so fragment molblocks preserve aromatic bonds. */
  type: number;
};

export type MassGraph = {
  atoms: MassGraphAtom[];
  bonds: MassGraphBond[];
};

export type FragmentContributor = {
  label: string;
  explanation: string;
  fragmentSmiles?: string;
};
