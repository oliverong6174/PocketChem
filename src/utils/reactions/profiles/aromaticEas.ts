export const AROMATIC_EAS_ELECTROPHILES = {
  nitro: {
    reactionSmarts: "[cH:1]>>[c:1][N+](=O)[O-]",
    maxProducts: 12,
  },
  "sulfonic-acid": {
    reactionSmarts: "[cH:1]>>[c:1]S(=O)(=O)O",
    maxProducts: 12,
  },
  bromo: {
    reactionSmarts: "[cH:1]>>[c:1]Br",
    maxProducts: 12,
  },
  chloro: {
    reactionSmarts: "[cH:1]>>[c:1]Cl",
    maxProducts: 12,
  },
  iodo: {
    reactionSmarts: "[cH:1]>>[c:1]I",
    maxProducts: 12,
  },
  fluoro: {
    reactionSmarts: "[cH:1]>>[c:1]F",
    maxProducts: 12,
  },
} as const;

export type AromaticEasElectrophileId = keyof typeof AROMATIC_EAS_ELECTROPHILES;

export function isAromaticEasElectrophileId(value: unknown): value is AromaticEasElectrophileId {
  return typeof value === "string" && value in AROMATIC_EAS_ELECTROPHILES;
}
