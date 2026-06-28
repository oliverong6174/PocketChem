export const ELEMENT_ORDER = [
  "C",
  "H",
  "N",
  "O",
  "F",
  "Cl",
  "Br",
  "I",
  "S",
  "P",
];

export const CHAIN_PREFIXES: Record<number, string> = {
  1: "meth",
  2: "eth",
  3: "prop",
  4: "but",
  5: "pent",
  6: "hex",
  7: "hept",
  8: "oct",
  9: "non",
  10: "dec",
};

export const COMMON_VALENCES: Record<string, number> = {
  C: 4,
  N: 3,
  O: 2,
  S: 2,
  P: 3,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
};