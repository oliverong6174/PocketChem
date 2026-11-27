// Stage 9E untouched evaluation subset.
//
// Written AFTER the Stage 9E engine work and BEFORE any of these cases was run. They exercise reaction classes whose rules were not
// modified in Stage 9E (epoxide REGIOCHEMISTRY, Williamson, Wittig, aldol, hydroboration, Diels-Alder). Expected answers come from
// the pages listed in SOURCES9E, each fetched in this session and checked by auditSources.mjs --cases cases9e.mjs. Expectations are
// frozen in the commit that adds this file; no case may be edited or removed after its result is seen. Optimization cases (cases.mjs and
// the Stage 9E development probes) are kept separate and are never mixed into this set's figures.
//
// Case shape is the one run.mjs/screen.mjs use for cases.mjs.
export const CHECKED_ON = "2026-11-02";
export const CORRECTIONS = [];

export const SOURCES = {
  "libretexts-epoxide-nassau": {
    cite: "LibreTexts (Nassau Community College) 8.14 Opening of Epoxides: Acidic versus Basic Conditions",
    url: "https://chem.libretexts.org/Courses/Nassau_Community_College/Organic_Chemistry_I_and_II/08%3A_Reactions_of_Alkenes/8.14%3A_Opening_of_Epoxides_-_Acidic_versus_Basic_Conditions",
    says: "an asymmetric epoxide in basic methanol opens by SN2 at the less substituted carbon; in acidic methanol the more substituted carbon reacts; with HX, when both carbons are primary or secondary the halide attacks the less substituted carbon, and if one carbon is tertiary it attacks the tertiary carbon",
  },
  "libretexts-epoxide-wade": {
    cite: "LibreTexts (Wade) 15.08 Opening of Epoxides",
    url: "https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Map%3A_Organic_Chemistry_(Wade)_Complete_and_Semesters_I_and_II/Map%3A_Organic_Chemistry_(Wade)/15%3A_Ethers_Epoxides_and_Thioethers/15.08%3A_Opening_of_Epoxides",
    says: "basic methanol: SN2 at the less substituted carbon; acidic methanol: the more substituted carbon is the site of reaction and product A predominates; HX: primary or secondary carbons react at the less substituted carbon, tertiary at the tertiary carbon",
  },
  "libretexts-ether-synthesis": {
    cite: "LibreTexts: Ether Synthesis (Williamson)",
    url: "https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Supplemental_Modules_%28Organic_Chemistry%29/Ethers/Synthesis_of_Ethers/Ether_Synthesis",
    says: "Williamson ether synthesis: an alkoxide displaces a halide from a primary alkyl halide by SN2; secondary and tertiary halides give elimination",
  },
  "libretexts-williamson-nassau": {
    cite: "LibreTexts (Nassau Community College) 14.03 The Williamson Ether Synthesis",
    url: "https://chem.libretexts.org/Courses/Nassau_Community_College/Organic_Chemistry_I_and_II/14%3A_Ethers_Epoxides_and_Thioethers/14.03%3A_The_Williamson_Ether_Synthesis",
    says: "use a primary alkyl halide: the strong alkoxide base gives E2 elimination with secondary and tertiary halides",
  },
  "ucla-wittig": {
    cite: "UCLA Illustrated Glossary of Organic Chemistry: Wittig reaction",
    url: "https://www.chem.ucla.edu/~harding/IGOC/W/wittig_reaction.html",
    says: "Wittig reaction: a phosphorus ylide converts an aldehyde or ketone into an alkene; benzaldehyde with methylenetriphenylphosphorane gives styrene",
  },
  "libretexts-aldol-openstax": {
    cite: "LibreTexts (OpenStax) 23.3 Dehydration of Aldol Products: Synthesis of Enones",
    url: "https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Organic_Chemistry_(OpenStax)/23%3A_Carbonyl_Condensation_Reactions/23.03%3A_Dehydration_of_Aldol_Products_-_Synthesis_of_Enones",
    says: "the aldol product of acetaldehyde, a beta-hydroxy aldehyde, loses water to give a conjugated enone, 2-butenal (crotonaldehyde)",
  },
  "wikipedia-3-hydroxybutanal": {
    cite: "Wikipedia: 3-Hydroxybutanal (acetaldol)",
    url: "https://en.wikipedia.org/wiki/3-Hydroxybutanal",
    says: "3-hydroxybutanal, also called acetaldol or aldol, is the aldol addition product of two molecules of acetaldehyde; dehydration gives crotonaldehyde",
  },
  "openstax-hydroboration": {
    cite: "OpenStax Organic Chemistry 8.5 Hydration of Alkenes: Addition of H2O by Hydroboration",
    url: "https://openstax.org/books/organic-chemistry/pages/8-5-hydration-of-alkenes-addition-of-h2o-by-hydroboration",
    says: "hydroboration followed by oxidation with hydrogen peroxide and base gives the anti-Markovnikov alcohol: the OH ends up on the less substituted alkene carbon, by syn addition",
  },
  "libretexts-diels-alder-winona": {
    cite: "LibreTexts (Winona State, Klein) 17.16 Diels-Alder: a closer look",
    url: "https://chem.libretexts.org/Courses/Winona_State_University/Klein_and_Straumanis_Guided/17%3A_Conjugated_Pi_Systems_and_Pericyclic_Reactions/17.16%3A_Diels-Alder_-_a_closer_look",
    says: "the Diels-Alder reaction is stereospecific: a cis dienophile generates a ring with cis substitution",
  },
  "alfredstate-diels-alder-lab": {
    cite: "Alfred State lab handout: Diels-Alder reaction of butadiene (from 3-sulfolene) with maleic anhydride",
    url: "https://web.alfredstate.edu/faculty/fongjd/Organic%20Chemistry%202/POWERPOINT%20PRESENTATIONS/LAB/lab5dielsalder.pdf",
    says: "butadiene and maleic anhydride give 4-cyclohexene-cis-1,2-dicarboxylic anhydride; the cis configuration of the carbonyl groups in maleic anhydride is retained",
  },
};

// Roles: "sole" = the only product; "major"/"minor" = ranked outcome the source states; "formed" = a legitimate outcome of an ambiguous case.
export const CASES = [
  {
    id: "HX-01",
    category: "epoxide-regiochemistry",
    kind: "step",
    title: "Propylene oxide + methoxide (basic methanol): SN2 at the less substituted carbon gives 1-methoxypropan-2-ol",
    reactants: ["CC1CO1", "[O-]C"],
    rule: "epoxide-base-alkoxide-opening",
    expect: { products: [{ smiles: "COCC(C)O", role: "sole" }], forbidden: ["COC(C)CO"] },
    provenance: { level: "verified-secondary", sources: ["libretexts-epoxide-nassau", "libretexts-epoxide-wade"], note: "The pages state the rule for an asymmetric epoxide; propylene oxide is an application of that rule, not a worked example on the page." },
  },
  {
    id: "HX-02",
    category: "epoxide-regiochemistry",
    kind: "step",
    title: "Propylene oxide + methanol/H+: attack at the more substituted carbon predominates (2-methoxypropan-1-ol), the other regioisomer is minor",
    reactants: ["CC1CO1", "CO"],
    rule: "epoxide-acid-alcohol-opening",
    expect: { products: [{ smiles: "COC(C)CO", role: "major" }, { smiles: "COCC(C)O", role: "minor" }] },
    provenance: { level: "verified-secondary", sources: ["libretexts-epoxide-nassau", "libretexts-epoxide-wade"], note: "Wade: 'product A predominates' (attack at the more substituted carbon). 'Predominates' is not a ratio; the minor role is the complementary regioisomer." },
  },
  {
    id: "HX-03",
    category: "epoxide-regiochemistry",
    kind: "step",
    title: "Propylene oxide + HBr (both epoxide carbons primary/secondary): bromide attacks the LESS substituted carbon, giving 1-bromopropan-2-ol",
    reactants: ["CC1CO1"],
    rule: "epoxide-hx-opening-hbr",
    expect: { products: [{ smiles: "CC(O)CBr", role: "sole" }], forbidden: ["CC(Br)CO"] },
    provenance: { level: "verified-secondary", sources: ["libretexts-epoxide-nassau", "libretexts-epoxide-wade"], note: "Both pages: 'When both the epoxide carbons are either primary or secondary the halogen anion will attack the less substituted carbon'." },
  },
  {
    id: "HX-04",
    category: "epoxide-regiochemistry",
    kind: "step",
    title: "2,2-Dimethyloxirane + HBr (one tertiary epoxide carbon): bromide attacks the tertiary carbon, giving 2-bromo-2-methylpropan-1-ol",
    reactants: ["CC1(C)CO1"],
    rule: "epoxide-hx-opening-hbr",
    expect: { products: [{ smiles: "CC(C)(Br)CO", role: "sole" }], forbidden: ["BrCC(C)(C)O"] },
    provenance: { level: "verified-secondary", sources: ["libretexts-epoxide-nassau", "libretexts-epoxide-wade"], note: "Both pages: 'if one of the epoxide carbons is tertiary, the halogen anion will primarily attack the tertiary carbon in an SN1-like reaction'." },
  },
  {
    id: "HX-05",
    category: "substitution-elimination",
    kind: "step",
    title: "Williamson: sodium ethoxide + 1-bromopropane gives ethyl propyl ether",
    reactants: ["CCCBr", "[O-]CC"],
    rule: "haloalkane-williamson-ether",
    expect: { products: [{ smiles: "CCCOCC", role: "sole" }] },
    provenance: { level: "verified-secondary", sources: ["libretexts-ether-synthesis", "libretexts-williamson-nassau"], note: "Primary alkyl halide + alkoxide: SN2 ether." },
  },
  {
    id: "HX-06",
    category: "competing-pathways",
    kind: "step",
    title: "Sodium ethoxide + tert-butyl bromide gives isobutylene (E2), not the ether",
    reactants: ["CC(C)(C)Br", "[O-]CC"],
    rule: ["haloalkane-williamson-ether", "haloalkane-e2-zaitsev"],
    expect: { products: [{ smiles: "C=C(C)C", role: "sole" }], forbidden: ["CCOC(C)(C)C"] },
    provenance: { level: "verified-secondary", sources: ["libretexts-ether-synthesis", "libretexts-williamson-nassau"], note: "Tertiary halide with a strong alkoxide: elimination, so the Williamson ether is not formed." },
  },
  {
    id: "HX-07",
    category: "carbonyl",
    kind: "step",
    title: "Wittig: benzaldehyde + methylenetriphenylphosphorane (from CH3Br) gives styrene",
    reactants: ["O=Cc1ccccc1", "CBr"],
    rule: "aldehyde-wittig",
    expect: { products: [{ smiles: "C=Cc1ccccc1", role: "sole" }] },
    provenance: { level: "verified-secondary", sources: ["ucla-wittig"], note: "The UCLA glossary page names this exact pair." },
  },
  {
    id: "HX-08",
    category: "carbonyl",
    kind: "step",
    title: "Aldol addition: two acetaldehyde give 3-hydroxybutanal",
    reactants: ["CC=O", "CC=O"],
    rule: "aldol-addition-general",
    expect: { products: [{ smiles: "CC(O)CC=O", role: "sole" }] },
    provenance: { level: "verified-secondary", sources: ["wikipedia-3-hydroxybutanal"], note: "Acetaldol is the addition product of two acetaldehyde." },
  },
  {
    id: "HX-09",
    category: "carbonyl",
    kind: "step",
    title: "Aldol condensation: two acetaldehyde give 2-butenal (crotonaldehyde), the E enal",
    reactants: ["CC=O", "CC=O"],
    rule: "aldol-condensation-general",
    expect: { products: [{ smiles: "CC=CC=O", role: "sole" }] },
    provenance: { level: "verified-secondary", sources: ["libretexts-aldol-openstax", "wikipedia-3-hydroxybutanal"], note: "Geometry is not asserted (the expected SMILES is unspecified)." },
  },
  {
    id: "HX-10",
    category: "alkenes",
    kind: "step",
    title: "Hydroboration-oxidation of 1-hexene gives hexan-1-ol (anti-Markovnikov)",
    reactants: ["C=CCCCC"],
    rule: "alkene-hydroboration-oxidation",
    expect: { products: [{ smiles: "CCCCCCO", role: "sole" }], forbidden: ["CCCCC(C)O"] },
    provenance: { level: "verified-secondary", sources: ["openstax-hydroboration"], note: "General anti-Markovnikov rule; 1-hexene is an application, not necessarily a worked example on the page." },
  },
  {
    id: "HX-11",
    category: "alkenes",
    kind: "step",
    title: "Diels-Alder: 1,3-butadiene + maleic anhydride gives the cis-fused 4-cyclohexene-1,2-dicarboxylic anhydride (meso)",
    reactants: ["C=CC=C", "O=C1OC(=O)C=C1"],
    rule: "diene-diels-alder",
    expect: { products: [{ smiles: "O=C1OC(=O)[C@H]2CC=CC[C@@H]12", role: "sole", cip: ["RS"] }] },
    provenance: { level: "verified-secondary", sources: ["libretexts-diels-alder-winona", "alfredstate-diels-alder-lab"], note: "cis dienophile gives cis substitution; the product is the meso (3aR,7aS) cis-fused anhydride." },
  },
];
