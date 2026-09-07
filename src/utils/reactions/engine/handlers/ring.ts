import { runReactionSmarts } from "../rdkitReaction";

type RingMode =
  | "epoxideOpening"
  | "epoxideOrganometallicOpening"
  | "epoxideNucleophileOpening";
type EpoxideNucleophile =
  | "water"
  | "hydroxide"
  | "alcohol"
  | "alkoxide"
  | "amine"
  | "ammonia"
  | "organometallic"
  | "halide";
type AttackPreference = "more-substituted" | "less-substituted";
type Halogen = "Cl" | "Br" | "I";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

type NucleophileTemplate = {
  reactantSuffix: string;
  attachedGroup: string;
};

function nucleophileTemplate(
  nucleophile: EpoxideNucleophile,
  halogen?: Halogen,
): NucleophileTemplate | null {
  if (nucleophile === "water" || nucleophile === "hydroxide") {
    return { reactantSuffix: "", attachedGroup: "[OH]" };
  }
  if (nucleophile === "alcohol") {
    return {
      reactantSuffix: ".[O;H1:4][#6:5]",
      attachedGroup: "[O:4][#6:5]",
    };
  }
  if (nucleophile === "alkoxide") {
    return {
      reactantSuffix: ".[O-:4][#6:5]",
      attachedGroup: "[O+0:4][#6:5]",
    };
  }
  if (nucleophile === "amine") {
    return {
      reactantSuffix: ".[N;H1,H2;+0:4]",
      attachedGroup: "[N:4]",
    };
  }
  if (nucleophile === "ammonia") {
    return { reactantSuffix: "", attachedGroup: "[NH2]" };
  }
  if (nucleophile === "organometallic") {
    return {
      reactantSuffix: ".[C:4][Mg,Li]",
      attachedGroup: "[C:4]",
    };
  }
  if (nucleophile === "halide" && halogen) {
    return { reactantSuffix: "", attachedGroup: `[${halogen}]` };
  }
  return null;
}

/**
 * Build epoxide-opening SMARTS in chemically ranked order.  Hydrogen counts
 * are used only to compare the two carbons of the SAME epoxide: fewer H means
 * more substituted. Equal-substitution cases remain as genuine alternatives.
 */
function epoxideOpeningSmarts(
  preference: AttackPreference,
  nucleophile: EpoxideNucleophile,
  halogen?: Halogen,
): string[] {
  const template = nucleophileTemplate(nucleophile, halogen);
  if (!template) return [];

  const { reactantSuffix, attachedGroup } = template;
  const output: string[] = [];

  const addUnequal = (moreH: 0 | 1, lessH: 1 | 2) => {
    const epoxide = `[O:1]1[C;H${moreH}:2][C;H${lessH}:3]1${reactantSuffix}`;
    const product = preference === "more-substituted"
      // attack C2; original epoxide oxygen stays on C3
      ? `[OH:1][C:3][C:2](${attachedGroup})`
      // attack C3; original epoxide oxygen stays on C2
      : `[OH:1][C:2][C:3](${attachedGroup})`;
    output.push(`${epoxide}>>${product}`);
  };

  addUnequal(0, 1);
  addUnequal(0, 2);
  addUnequal(1, 2);

  for (const hydrogenCount of [0, 1, 2] as const) {
    const epoxide = `[O:1]1[C;H${hydrogenCount}:2][C;H${hydrogenCount}:3]1${reactantSuffix}`;
    output.push(
      `${epoxide}>>[OH:1][C:2][C:3](${attachedGroup})`,
      `${epoxide}>>[OH:1][C:3][C:2](${attachedGroup})`,
    );
  }

  return output;
}

async function runRankedEpoxideOpening(
  reactants: string[],
  preference: AttackPreference,
  nucleophile: EpoxideNucleophile,
  halogen?: Halogen,
): Promise<string[]> {
  const products: string[] = [];
  for (const smarts of epoxideOpeningSmarts(preference, nucleophile, halogen)) {
    products.push(...await runReactionSmarts(reactants, smarts, 16));
  }
  return unique(products);
}

export async function epoxideOrganometallicOpening(
  epoxideSmiles: string,
  organometallicSmiles: string,
): Promise<string[]> {
  return runRankedEpoxideOpening(
    [epoxideSmiles, organometallicSmiles],
    "less-substituted",
    "organometallic",
  );
}

export async function ring(
  reactantInput: string | string[],
  options?: Record<string, unknown>,
): Promise<string[]> {
  const reactants = Array.isArray(reactantInput)
    ? reactantInput.filter(Boolean)
    : [reactantInput];
  const primary = reactants[0];
  if (!primary) return [];

  const mode = options?.mode as RingMode | undefined;

  if (mode === "epoxideOrganometallicOpening") {
    const organometallic = reactants[1];
    if (!organometallic) return [];
    return epoxideOrganometallicOpening(primary, organometallic);
  }

  if (mode === "epoxideNucleophileOpening") {
    const nucleophile = options?.nucleophile as EpoxideNucleophile | undefined;
    const preference = options?.attackPreference as AttackPreference | undefined;
    const halogen = options?.halogen as Halogen | undefined;
    if (!nucleophile || !preference) {
      console.warn("Epoxide nucleophile opening requires nucleophile and attackPreference.", options);
      return [];
    }
    return runRankedEpoxideOpening(reactants, preference, nucleophile, halogen);
  }

  if (mode !== "epoxideOpening") {
    console.warn("Ring handler missing or unsupported mode:", options);
    return [];
  }

  const nucleophile =
    (options?.nucleophile as EpoxideNucleophile | undefined) ?? "water";
  const preference =
    (options?.attackPreference as AttackPreference | undefined) ??
    (nucleophile === "water" ? "more-substituted" : "less-substituted");

  return runRankedEpoxideOpening([primary], preference, nucleophile);
}
