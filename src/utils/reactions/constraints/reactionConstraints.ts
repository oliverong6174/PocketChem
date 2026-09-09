import type {
  ReactionConstraintId,
  ReactionFailureCategory,
  ReactionTrigger,
} from "../reactionTypes";

export type ReactionConstraintDefinition = {
  id: ReactionConstraintId;
  failureTrigger: ReactionTrigger;
  /**
   * Optional molecule-level escape hatch for site-selective chemistry. If a
   * compatible reactive site exists anywhere in the substrate, this failure
   * condition must not veto the reaction merely because a different site is
   * unreactive. This is essential for polyfunctional molecules.
   */
  satisfiedByTrigger?: ReactionTrigger;
  /** Optional diagnostic wording independent of the particular catalog rule. */
  title?: string;
  reagentLabel?: string;
  /** Constraints sharing a key collapse into one diagnostic card. */
  diagnosticGroup?: string;
  explanation: string;
  suggestion?: string;
  category: ReactionFailureCategory;
};

export const REACTION_CONSTRAINTS: Readonly<
  Record<ReactionConstraintId, ReactionConstraintDefinition>
> = Object.freeze({
  "generic-dehydration-not-vicinal-diol": {
    id: "generic-dehydration-not-vicinal-diol",
    failureTrigger: { includeSmarts: ["[C;X4]([OH])-[C;X4]([OH])"] },
    explanation:
      "This substrate contains adjacent alcohols. Under strongly acidic, heated conditions a vicinal diol follows pinacol-type rearrangement chemistry rather than ordinary isolated-alcohol dehydration.",
    suggestion:
      "Use the Pinacol Rearrangement condition for a vicinal diol instead of forcing the generic dehydration rule.",
    category: "mechanistic",
  },
  "oxidizable-alcohol-needs-carbon-h": {
    id: "oxidizable-alcohol-needs-carbon-h",
    failureTrigger: {
      includeSmarts: ["[C;X4;H0]([O;H1])([#6])([#6])[#6]"],
    },
    // Oxidation is site-selective. A tertiary OH elsewhere in a molecule must
    // not suppress oxidation of a primary or secondary alcohol in that same
    // molecule. Only report NO REACTION when no oxidizable alcohol site exists.
    satisfiedByTrigger: {
      includeSmarts: [
        "[CH2][OH]",
        "[CH]([#6])([#6])[OH]",
      ],
    },
    title: "NO REACTION — Tertiary Alcohol Oxidation",
    reagentLabel:
      "PCC, DMP, Swern, Jones reagent, NaOCl, or KMnO₄",
    diagnosticGroup: "tertiary-alcohol-oxidation",
    explanation:
      "A tertiary alcohol has no hydrogen on the carbon bearing OH, so that tertiary site cannot undergo ordinary alcohol-to-carbonyl oxidation. Primary or secondary alcohol sites elsewhere in the same molecule remain oxidizable.",
    suggestion:
      "If the molecule also contains a primary or secondary alcohol, oxidize that site normally; the tertiary alcohol is left unchanged under ordinary alcohol-oxidation conditions.",
    category: "mechanistic",
  },
  "sn2-alcohol-center-accessible": {
    id: "sn2-alcohol-center-accessible",
    failureTrigger: {
      includeSmarts: ["[C;X4;H0]([O;H1])([#6])([#6])[#6]"],
    },
    explanation:
      "These alcohol-conversion conditions rely on backside substitution at the carbon bearing oxygen. A tertiary center is too hindered for normal SN2 displacement.",
    suggestion:
      "Use carbocation-forming HX/Lucas-type conditions when a tertiary alkyl halide is desired, while considering competing elimination or rearrangement.",
    category: "steric",
  },
  "lucas-primary-room-temperature": {
    id: "lucas-primary-room-temperature",
    failureTrigger: { includeSmarts: ["[CH2][OH]"] },
    explanation:
      "An ordinary primary alcohol does not form a sufficiently stable carbocation on the room-temperature Lucas-test timescale, so no immediate substitution/turbidity is expected.",
    suggestion:
      "Use heat where appropriate or a dedicated primary-alcohol halogenation reagent such as SOCl₂ or PBr₃.",
    category: "mechanistic",
  },
  "terminal-alkyne-needs-sp-h": {
    id: "terminal-alkyne-needs-sp-h",
    failureTrigger: { includeSmarts: ["[#6][C]#[C][#6]"] },
    explanation:
      "Only terminal alkynes contain the acidic sp C–H proton needed for acetylide formation or terminal H/D exchange. An internal alkyne has no terminal proton to remove.",
    category: "missing-site",
  },
  "benzylic-oxidation-needs-h": {
    id: "benzylic-oxidation-needs-h",
    failureTrigger: { includeSmarts: ["[c][C;X4;H0]([#6])([#6])[#6]"] },
    explanation:
      "Strong benzylic side-chain oxidation requires at least one hydrogen on the benzylic carbon. A fully substituted benzylic carbon cannot enter the usual oxidation pathway.",
    category: "missing-site",
  },
  "benzylic-radical-halogenation-needs-h": {
    id: "benzylic-radical-halogenation-needs-h",
    failureTrigger: { includeSmarts: ["[c][C;X4;H0]([#6])([#6])[#6]"] },
    explanation:
      "Benzylic radical halogenation begins by abstracting a benzylic hydrogen. If that carbon has no hydrogen, the corresponding benzylic radical cannot form at that site.",
    category: "missing-site",
  },
  "e2-needs-beta-carbon": {
    id: "e2-needs-beta-carbon",
    failureTrigger: { includeSmarts: ["[CH3][Cl,Br,I]"] },
    explanation:
      "E2 elimination requires a β-carbon bearing a β-hydrogen. A methyl halide has no β-carbon, so an alkene cannot form by E2.",
    suggestion:
      "Methyl halides instead undergo SN2 very readily with suitable nucleophiles.",
    category: "missing-site",
  },
  "sn2-electrophile-accessible": {
    id: "sn2-electrophile-accessible",
    failureTrigger: {
      includeSmarts: ["[C;X4;H0]([#6])([#6])([#6])[Cl,Br,I]"],
    },
    explanation:
      "A tertiary electrophilic carbon is too sterically crowded for backside attack, so a normal SN2 displacement is blocked.",
    suggestion:
      "Depending on base/nucleophile and solvent, E2 or SN1/E1 chemistry is generally more plausible.",
    category: "steric",
  },
  "friedel-crafts-ring-not-strongly-deactivated": {
    id: "friedel-crafts-ring-not-strongly-deactivated",
    failureTrigger: { includeSmarts: ["[c][N+](=O)[O-]"] },
    title: "NO REACTION — Friedel–Crafts on a Strongly Deactivated Ring",
    reagentLabel: "Friedel–Crafts alkylation/acylation (AlCl₃)",
    diagnosticGroup: "friedel-crafts-strongly-deactivated-ring",
    explanation:
      "A nitro group strongly withdraws electron density from the aromatic ring, making it too deactivated for ordinary Friedel–Crafts alkylation or acylation.",
    suggestion: "Use a different bond-forming strategy or install the strongly deactivating group after Friedel–Crafts chemistry when the synthesis permits.",
    category: "electronic",
  },
  "friedel-crafts-amine-compatible": {
    id: "friedel-crafts-amine-compatible",
    failureTrigger: { includeSmarts: ["[c][N;H1,H2;+0]"] },
    title: "NO REACTION — Friedel–Crafts with an Unprotected Aniline",
    reagentLabel: "Friedel–Crafts alkylation/acylation (AlCl₃)",
    diagnosticGroup: "friedel-crafts-unprotected-aniline",
    explanation:
      "An unprotected aniline strongly coordinates to AlCl₃, tying up the Lewis acid and strongly deactivating the ring under ordinary Friedel–Crafts conditions.",
    suggestion: "Protect the amine before attempting Friedel–Crafts chemistry.",
    category: "electronic",
  },
});
