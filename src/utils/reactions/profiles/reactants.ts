import type {
  ReactantSupplyMode,
  ReactionReactantRequirement,
  ReactionReactantRole,
} from "../reactionTypes";

export type ReactantProfile = {
  id: string;
  label: string;
  aliases: readonly string[];
  supplyMode: ReactantSupplyMode;
  presetSmiles?: string;
  contributesToProduct: boolean;
  role: ReactionReactantRole;
};

const PROFILE_LIST: readonly ReactantProfile[] = [
  {
    id: "hydroxide",
    label: "hydroxide ion",
    aliases: ["hydroxide ion", "hydroxide", "OH-", "hydroxide anion"],
    supplyMode: "auto",
    presetSmiles: "[OH-]",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "cyanide",
    label: "cyanide ion",
    aliases: ["cyanide ion", "cyanide", "CN-", "cyanide anion"],
    supplyMode: "auto",
    presetSmiles: "[C-]#N",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "azide",
    label: "azide ion",
    aliases: ["azide ion", "azide", "N3-", "azide anion"],
    supplyMode: "auto",
    presetSmiles: "[N-]=[N+]=N",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "iodide",
    label: "iodide ion",
    aliases: ["iodide ion", "iodide", "I-", "iodide anion"],
    supplyMode: "auto",
    presetSmiles: "[I-]",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "bromide",
    label: "bromide ion",
    aliases: ["bromide ion", "bromide", "Br-", "bromide anion"],
    supplyMode: "auto",
    presetSmiles: "[Br-]",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "chloride",
    label: "chloride ion",
    aliases: ["chloride ion", "chloride", "Cl-", "chloride anion"],
    supplyMode: "auto",
    presetSmiles: "[Cl-]",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "fluoride",
    label: "fluoride ion",
    aliases: ["fluoride ion", "fluoride", "F-", "fluoride anion"],
    supplyMode: "auto",
    presetSmiles: "[F-]",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "ammonia",
    label: "ammonia",
    aliases: ["ammonia", "NH3", "NH₃"],
    supplyMode: "auto",
    presetSmiles: "N",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "water",
    label: "water",
    aliases: ["water", "H2O", "H₂O"],
    supplyMode: "auto",
    presetSmiles: "O",
    contributesToProduct: true,
    role: "nucleophile",
  },
  {
    id: "tert-butoxide",
    label: "tert-butoxide ion",
    aliases: ["tert-butoxide ion", "tert butoxide", "t-BuO-", "tert-butoxide"],
    supplyMode: "auto",
    presetSmiles: "CC(C)(C)[O-]",
    contributesToProduct: false,
    role: "base",
  },
  {
    id: "amide-base",
    label: "amide base",
    aliases: ["amide base", "amide ion", "NH2-", "NH₂⁻"],
    supplyMode: "auto",
    presetSmiles: "[NH2-]",
    contributesToProduct: false,
    role: "base",
  },
  {
    id: "carbon-dioxide",
    label: "carbon dioxide",
    aliases: ["carbon dioxide", "CO2", "CO₂"],
    supplyMode: "auto",
    presetSmiles: "O=C=O",
    contributesToProduct: true,
    role: "electrophile",
  },
] as const;

export const REACTANT_PROFILES: Readonly<Record<string, ReactantProfile>> =
  Object.freeze(
    Object.fromEntries(PROFILE_LIST.map((profile) => [profile.id, profile])),
  );

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const PROFILE_BY_ALIAS = new Map<string, ReactantProfile>();
for (const profile of PROFILE_LIST) {
  PROFILE_BY_ALIAS.set(normalizeAlias(profile.id), profile);
  PROFILE_BY_ALIAS.set(normalizeAlias(profile.label), profile);
  for (const alias of profile.aliases) {
    PROFILE_BY_ALIAS.set(normalizeAlias(alias), profile);
  }
}

export function findReactantProfile(
  requirement: ReactionReactantRequirement,
): ReactantProfile | null {
  if (requirement.id && REACTANT_PROFILES[requirement.id]) {
    return REACTANT_PROFILES[requirement.id];
  }
  return PROFILE_BY_ALIAS.get(normalizeAlias(requirement.label)) ?? null;
}

export function resolveReactantRequirement(
  requirement: ReactionReactantRequirement,
): ReactionReactantRequirement {
  const profile = findReactantProfile(requirement);
  if (!profile) {
    return {
      ...requirement,
      id: requirement.id ?? normalizeAlias(requirement.label).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      supplyMode: requirement.supplyMode ?? "user-structure",
      contributesToProduct: requirement.contributesToProduct ?? true,
      role: requirement.role ?? "structural-partner",
      searchAliases: requirement.searchAliases ?? [],
    };
  }

  return {
    ...requirement,
    id: requirement.id ?? profile.id,
    supplyMode: requirement.supplyMode ?? profile.supplyMode,
    presetSmiles: requirement.presetSmiles ?? profile.presetSmiles,
    searchAliases: [
      ...new Set([...(requirement.searchAliases ?? []), ...profile.aliases]),
    ],
    contributesToProduct:
      requirement.contributesToProduct ?? profile.contributesToProduct,
    role: requirement.role ?? profile.role,
  };
}
