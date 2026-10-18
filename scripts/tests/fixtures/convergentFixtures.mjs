// Convergent-synthesis fixtures (Phase 4, Stage 0).
//
// Each fixture is a hand-written route over EXISTING registry rules. Nothing
// here changes chemistry: convergentFixtures.test.mjs replays every step
// against the real engine and fails if a rule stops giving the recorded
// product, so a fixture can never silently drift from what PocketChem does.
//
// Fields
//   supplied   starting materials, in a deliberately arbitrary order
//   copies     how many copies of each supplied material the route needs
//   steps      ordered; `reactants` are the STRUCTURAL reactants only. Reagents
//              and catalysts the rule supplies itself (supplyMode "auto") or
//              that are not modelled are never listed here.
//   product    the structure(s) the rule is expected to give for that input
//   branch     which independent branch the step belongs to
//   limits     chemical caveats that the planner must not hide
//
// Estimated selectivity is NOT a yield, and a copy is NOT a quantity of
// substance: the registry has no stoichiometry, so nothing in these fixtures
// claims a limiting reactant, equivalents or percentage yield.

export const FIXTURES = [
  {
    id: "fischer-isopropyl-propanoate",
    title: "Isopropyl propanoate: two independently prepared halves, then Fischer esterification",
    supplied: ["CC(C)=O", "CCC=O"],
    copies: [1, 1],
    target: "CCC(=O)OC(C)C",
    steps: [
      { ruleId: "aldehyde-oxidation", reactants: ["CCC=O"], product: ["CCC(=O)O"], branch: "acid" },
      { ruleId: "ketone-reduction", reactants: ["CC(C)=O"], product: ["CC(C)O"], branch: "alcohol" },
      {
        ruleId: "fischer-esterification",
        reactants: ["CC(C)O", "CCC(=O)O"],
        product: ["CCC(=O)OC(C)C"],
        branch: "coupling",
        joins: ["acid", "alcohol"],
      },
    ],
    limits: [
      "aldehyde-oxidation and ketone-reduction are representative (generic reagent) rules, not a specific named reagent.",
      "Fischer esterification is an equilibrium; PocketChem does not model water removal or excess alcohol.",
      "A secondary alcohol esterifies more slowly than a primary one; this is not reflected in the rule's product.",
    ],
  },
  {
    id: "williamson-cyclohexyl-propyl-ether",
    title: "Cyclohexyl propyl ether: an alkyl halide branch and an alcohol branch",
    supplied: ["O=C1CCCCC1", "C=CC"],
    copies: [1, 1],
    target: "CCCOC1CCCCC1",
    steps: [
      { ruleId: "alkene-hbr-peroxide", reactants: ["C=CC"], product: ["CCCBr"], branch: "halide" },
      { ruleId: "ketone-reduction", reactants: ["O=C1CCCCC1"], product: ["OC1CCCCC1"], branch: "alcohol" },
      {
        ruleId: "alcohol-williamson-ether",
        reactants: ["OC1CCCCC1", "CCCBr"],
        product: ["CCCOC1CCCCC1"],
        branch: "coupling",
        joins: ["alcohol", "halide"],
      },
    ],
    limits: [
      "The Williamson step needs a base to form the alkoxide; the rule does not list it as a structural reactant.",
      "Peroxide-initiated radical HBr addition gives the anti-Markovnikov 1-bromopropane.",
    ],
  },
  {
    id: "grignard-2-butanol-from-ethanol",
    title: "2-Butanol from ONE supplied material used twice (needs two copies of ethanol)",
    supplied: ["CCO"],
    copies: [2],
    target: "CCC(C)O",
    steps: [
      { ruleId: "primary-alcohol-mild-oxidation", reactants: ["CCO"], product: ["CC=O"], branch: "aldehyde" },
      { ruleId: "alcohol-hbr-substitution-primary", reactants: ["CCO"], product: ["CCBr"], branch: "organometallic" },
      {
        ruleId: "haloalkane-grignard-formation-bromide",
        reactants: ["CCBr"],
        product: ["CC[Mg]Br"],
        branch: "organometallic",
      },
      {
        ruleId: "aldehyde-organometallic-addition",
        reactants: ["CC=O", "CC[Mg]Br"],
        product: ["CCC(C)O"],
        branch: "coupling",
        joins: ["aldehyde", "organometallic"],
      },
    ],
    limits: [
      "Reusing ethanol is only valid with two copies; a single copy must be rejected.",
      "The engine returns 2-butanol with no stereodescriptor and no racemic-mixture marker even though a new stereocentre forms. Treat the product as a racemate by chemistry, but PocketChem does not flag it.",
      "Grignard formation and addition require anhydrous ether; the rules do not encode solvent or the incompatibility of Grignards with O-H groups.",
    ],
  },
  {
    id: "ester-reduction-coproduct",
    title: "Reduction of isopropyl propanoate: two alcohol products, one of which is also an earlier intermediate",
    supplied: ["CCC(=O)OC(C)C"],
    copies: [1],
    target: "CCCO",
    steps: [
      {
        ruleId: "ester-lah-reduction",
        reactants: ["CCC(=O)OC(C)C"],
        product: ["CC(C)O", "CCCO"],
        branch: "reduction",
      },
    ],
    limits: [
      "Both alcohols are real products. 2-Propanol has the same structure as the alcohol half of fixture 1 but is a different lot with different provenance.",
    ],
  },
  {
    id: "racemic-diol-coupling",
    title: "A racemic intermediate consumed by a coupling step",
    supplied: ["CC(=O)O", "C/C=C/C"],
    copies: [1, 1],
    // (R,R)/(S,S)-2,3-butanediol monoacetate: still a mixture, not enantiopure.
    target: "CC(=O)O[C@H](C)[C@@H](C)O",
    steps: [
      {
        ruleId: "alkene-syn-dihydroxylation",
        reactants: ["C/C=C/C"],
        product: ["C[C@@H](O)[C@@H](C)O"],
        branch: "diol",
        mixture: "racemic",
      },
      {
        ruleId: "fischer-esterification",
        reactants: ["C[C@@H](O)[C@@H](C)O", "CC(=O)O"],
        product: ["CC(=O)O[C@H](C)[C@@H](C)O"],
        branch: "coupling",
        joins: ["diol"],
        mixture: "inherited",
      },
    ],
    limits: [
      "syn-dihydroxylation of (E)-2-butene gives the racemic (R,R)/(S,S) pair; either member is only a representative.",
      "A diol has two OH groups; the rule's regiochemistry (which OH esterifies) is not guaranteed.",
      "The monoacetate is a racemate by chemistry. The planner keeps the mixture marker from step 1 and must not call the target enantiopure.",
    ],
  },
];

export const fixtureById = (id) => {
  const found = FIXTURES.find((fixture) => fixture.id === id);
  if (!found) throw new Error(`unknown fixture ${id}`);
  return found;
};
