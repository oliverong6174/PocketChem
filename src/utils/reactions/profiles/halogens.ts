export type HalogenSymbol = "Cl" | "Br" | "I";

export type HalogenProfile = {
  symbol: HalogenSymbol;
  acid: "HCl" | "HBr" | "HI";
  acidSlug: "hcl" | "hbr" | "hi";
  elementName: "chlorine" | "bromine" | "iodine";
  anionName: "chloride" | "bromide" | "iodide";
  prefix: "chloro" | "bromo" | "iodo";
  hydrohalogenationName:
    | "Hydrochlorination"
    | "Hydrobromination"
    | "Hydroiodination";
  anionSmiles: "[Cl-]" | "[Br-]" | "[I-]";
};

export const HALOGENS: Readonly<Record<HalogenSymbol, HalogenProfile>> = Object.freeze({
  Cl: {
    symbol: "Cl",
    acid: "HCl",
    acidSlug: "hcl",
    elementName: "chlorine",
    anionName: "chloride",
    prefix: "chloro",
    hydrohalogenationName: "Hydrochlorination",
    anionSmiles: "[Cl-]",
  },
  Br: {
    symbol: "Br",
    acid: "HBr",
    acidSlug: "hbr",
    elementName: "bromine",
    anionName: "bromide",
    prefix: "bromo",
    hydrohalogenationName: "Hydrobromination",
    anionSmiles: "[Br-]",
  },
  I: {
    symbol: "I",
    acid: "HI",
    acidSlug: "hi",
    elementName: "iodine",
    anionName: "iodide",
    prefix: "iodo",
    hydrohalogenationName: "Hydroiodination",
    anionSmiles: "[I-]",
  },
});

export const HYDROHALOGENS: readonly HalogenProfile[] = [
  HALOGENS.Br,
  HALOGENS.Cl,
  HALOGENS.I,
];

export function isHalogenSymbol(value: unknown): value is HalogenSymbol {
  return value === "Cl" || value === "Br" || value === "I";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert one explicitly identified halogen-series member into generic X/HX
 * display text. This function never decides whether text belongs to a halogen
 * series; callers must already have structured series metadata.
 */
export function generalizeHalogenMemberText(
  text: string,
  symbol: HalogenSymbol,
): string {
  const profile = HALOGENS[symbol];
  const replacements: Array<[RegExp, string]> = [
    [new RegExp(escapeRegExp(profile.hydrohalogenationName), "gi"), "Hydrohalogenation"],
    [new RegExp(`\\b${escapeRegExp(profile.anionName)}\\b`, "gi"), "halide"],
    [new RegExp(`\\b${escapeRegExp(profile.elementName)}\\b`, "gi"), "halogen"],
    [new RegExp(`\\b${escapeRegExp(profile.prefix)}`, "gi"), "halo"],
    [new RegExp(`\\b${escapeRegExp(profile.acid)}\\b`, "g"), "HX"],
    [new RegExp(`${escapeRegExp(symbol)}₂`, "g"), "X₂"],
    [new RegExp(`${escapeRegExp(symbol)}2`, "g"), "X2"],
    [new RegExp(`(?<![A-Za-z])${escapeRegExp(symbol)}(?![A-Za-z])`, "g"), "X"],
  ];

  return replacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}
