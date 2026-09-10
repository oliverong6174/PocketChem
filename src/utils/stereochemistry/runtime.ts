export type MechanisticStereoKind =
  | "diels-alder"
  | "epoxide-alcohol-opening"
  | "syn-vicinal"
  | "anti-vicinal"
  | "inversion"
  | "retention"
  | "racemization";

export type MechanisticStereoDirective = {
  kind: MechanisticStereoKind;
  ruleId: string;
  reactantSmiles: string[];
  /** Preferred drawing convention; chemistry always wins over this preference. */
  representativeFace: "front" | "back";
  /** Mechanistic relationship that must survive across substrates. */
  relationship?: "syn" | "anti" | "inversion" | "retention" | "racemic";
  /** Stable educational references used to justify the rule set. */
  referenceIds: string[];
  /** Diels-Alder stereochemical information recovered from the actual reactants. */
  dielsAlder?: {
    dieneTerminalRelationship: "same" | "opposite" | null;
    dienophileGeometry: "E" | "Z" | null;
    activatedDienophile: boolean;
    /** Normal-electron-demand directing rule from the actual reactants. */
    preferredRegioRelationship?: "1,2" | "1,4" | null;
    dieneDirectorPosition?: "terminal" | "internal" | null;
    regioConfidence?: "strong" | "moderate" | "ambiguous";
    regioReason?: string;
  };
};

type RuntimeEntry = {
  directive: MechanisticStereoDirective;
  expiresAt: number;
};

const directives = new Map<string, RuntimeEntry>();
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 512;

function cleanExpired(now = Date.now()) {
  for (const [key, entry] of directives) {
    if (entry.expiresAt <= now) directives.delete(key);
  }
  while (directives.size > MAX_ENTRIES) {
    const oldest = directives.keys().next().value;
    if (oldest === undefined) break;
    directives.delete(oldest);
  }
}

export function registerMechanisticStereoDirective(
  canonicalSmiles: string,
  directive: MechanisticStereoDirective,
) {
  const key = canonicalSmiles.trim();
  if (!key) return;
  cleanExpired();
  directives.delete(key);
  directives.set(key, { directive, expiresAt: Date.now() + TTL_MS });
}

export function getMechanisticStereoDirective(
  canonicalSmiles: string,
): MechanisticStereoDirective | null {
  cleanExpired();
  const entry = directives.get(canonicalSmiles.trim());
  if (!entry) return null;
  return entry.directive;
}

export function clearMechanisticStereoDirectives() {
  directives.clear();
}
