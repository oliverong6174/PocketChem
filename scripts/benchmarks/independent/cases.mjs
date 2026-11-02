// Stage 9D independent benchmark: cases and provenance.
//
// RULES FOR THIS FILE
//  * Expected answers are written from organic-chemistry knowledge BEFORE any PocketChem run and are
//    frozen in a commit before results are produced (see the commit history). They are never copied from
//    PocketChem output. Reactant SMILES were only checked for parseability and CIP labels.
//  * The reaction rule that a case exercises is chosen by reading the registry's reagent text, i.e. it is an
//    INPUT of the case (the reagent system), not an expected output.
//  * Provenance levels:
//      verified-primary    a primary-literature citation whose bibliographic data and reported finding were
//                          confirmed through a search this session
//      verified-secondary  a reliable secondary reference (textbook, university course page, review, curated
//                          reaction database) whose retrieved text explicitly supports the specific claim
//      provisional         author knowledge, or support only from tutoring/answer sites, or retrieved text that
//                          does not cover the specific claim. Provisional cases are EXCLUDED from every
//                          reference-validated accuracy figure.
//  * "checkedOn" is the date the supporting search was run (2026-11-02).

export const CHECKED_ON = "2026-11-02";

export const SOURCES = {
  "reusch-e2": { cite: "Reusch, W. Virtual Textbook of Organic Chemistry (MSU): Steric Hindrance in E2 Elimination of 2-Bromo-2,3-Dimethylbutane by Alkoxide Bases", url: "https://www2.chemistry.msu.edu/faculty/reusch/virttxtjml/e2steric.htm", says: "methoxide gives about 80% of the more substituted alkene; tert-butoxide reverses the ratio to about 25:75" },
  "hamburg-sn2": { cite: "Univ. Hamburg organic chemistry lectures: Nucleophilic substitution and optical activity (2-bromooctane / 2-octanol)", url: "https://www-archiv.fdm.uni-hamburg.de/b-online/library/newton/Chy251_253/Lectures/Sn2OpticalActivity/Sn2OpticalActivity.html", says: "SN2 at 2-bromooctane proceeds with complete inversion (Hughes experiments)" },
  "ncstate-sn2": { cite: "NC State OpenStax-derived text, 11.2 The SN2 Reaction", url: "https://ncstate.pressbooks.pub/organicchem/chapter/11-2-the-sn2-reaction/", says: "SN2 is concerted backside attack with inversion of configuration" },
  "ubc-hbo": { cite: "UBC CHEM 203 lecture notes (15 Oct 2014): hydroboration-oxidation", url: "https://groups.chem.ubc.ca/chem203/15Oct14.pdf", says: "syn addition of H and B; anti-Markovnikov OH; retention on oxidation" },
  "jove-oxymerc": { cite: "JoVE Science Education 8.7: Oxymercuration-Reduction of Alkenes", url: "https://www.jove.com/t/11778", says: "mercurinium ion intermediate, no carbocation rearrangement, Markovnikov OH" },
  "vanderbilt-alkynes": { cite: "Vanderbilt University organic chemistry course, Chapter 9 Alkynes", url: "https://cdn.vanderbilt.edu/vu-wordpress-0/wp-content/uploads/sites/210/2017/04/19175255/Chapter_9.pdf", says: "Hg2+ hydration gives methyl ketones from terminal alkynes; hindered boranes give aldehydes" },
  "libretexts-alkyne-red": { cite: "LibreTexts (CCBC Organic Chemistry 1) 9.06 Reduction of Alkynes", url: "https://chem.libretexts.org/Workbench/Community_College_of_Baltimore_County_Organic_Chemistry_1/09%3A_Alkynes/9.06%3A_10.6_Reduction_of_Alkynes", says: "Lindlar gives cis alkenes; Na/NH3 gives trans alkenes" },
  "wikipedia-semihydrog": { cite: "Wikipedia: Semi-hydrogenation of alkynes", url: "https://en.wikipedia.org/wiki/Semi-hydrogenation_of_alkynes", says: "Lindlar catalyst: Pd/CaCO3 poisoned with lead; cis alkenes" },
  "orgosolver-dibal": { cite: "OrgoSolver reaction library: ester to aldehyde (DIBAL-H, -78 C)", url: "https://orgosolver.com/reaction-library/ester-reaction-guides/ester-to-aldehyde-dibalh", says: "one equivalent DIBAL-H at -78 C stops at the aldehyde; excess or warming over-reduces" },
  "pmc-dibal": { cite: "DIBALH: from known fundamental to an unusual reaction (PMC9042244)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9042244/", says: "DIBAL-H partial reduction of esters to aldehydes at low temperature" },
  "ic-os3": { cite: "Imperial College organic synthesis lecture 3", url: "https://www.ch.ic.ac.uk/local/organic/tutorial/OS_Lecture3_0304.pdf", says: "two equivalents of RMgX react with an ester to give a tertiary alcohol; LiAlH4 reduces esters to primary alcohols" },
  "uis-eas": { cite: "LibreTexts (Univ. of Illinois Springfield CHE 269) 18.07 EAS of Substituted Benzenes", url: "https://chem.libretexts.org/Courses/University_of_Illinois_Springfield/UIS%3A_CHE_269_(Morsch_and_Andrews)/Chapters/Chapter_18%3A_Electrophilic_Aromatic_Substitution/18.07_EAS_of_Substituted_Benzenes", says: "bromination of nitrobenzene needs strong heating and gives the meta isomer chiefly; toluene nitration ~58% ortho, ~37-39% para, 3-4.5% meta" },
  "ncstate-fc": { cite: "NC State: Chemistry of Benzene: Electrophilic Aromatic Substitution, solutions to problems", url: "https://ncstate.pressbooks.pub/orgchemstudentsolutions/?p=1894", says: "neopentyl chloride with benzene/AlCl3 gives 2-methyl-2-phenylbutane via a methyl shift (other pages in the search disagreed)" },
  "libretexts-grignard": { cite: "LibreTexts: Grignard Reagents (Synthesis of Aldehydes and Ketones)", url: "https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Supplemental_Modules_%28Organic_Chemistry%29/Aldehydes_and_Ketones/Synthesis_of_Aldehydes_and_Ketones/Grignard_Reagents", says: "Grignard + nitrile gives a ketone on hydrolysis" },
  "chemguide-grignard": { cite: "Chemguide: An introduction to Grignard reagents", url: "https://chemguide.co.uk/organicprops/haloalkanes/grignard.html", says: "Grignard + CO2 then acid gives a carboxylic acid with one more carbon; Grignard + ethylene oxide gives a primary alcohol with two more carbons" },
  "iupac-birch": { cite: "IUPAC Pure Appl. Chem. 2003, 75, 1443 (Birch reduction)", url: "https://rsync.iupac.org/publications/pac/2003/pdf/7510x1443.pdf", says: "electron-donating substituents (OMe, Me, NR2) give 2,5-dihydro products, i.e. the substituent stays on a double bond" },
  "wikipedia-mch": { cite: "Wikipedia: Methylenecyclohexane", url: "https://en.wikipedia.org/wiki/Methylenecyclohexane", says: "made from cyclohexanone by Wittig methylenation" },
  "ncstate-halogenation": { cite: "NC State: 5.4 Halogenation of Alkenes: Addition of X2", url: "https://ncstate.pressbooks.pub/ch220/chapter/halogenation-of-alkenes-addition-of-x2/", says: "anti addition through a bromonium ion; cyclopentene gives only trans-1,2-dibromocyclopentane as a racemate" },
  "libretexts-syn-diol": { cite: "LibreTexts: Vicinal Syn Dihydroxylation", url: "https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Supplemental_Modules_%28Organic_Chemistry%29/Alkenes/Reactivity_of_Alkenes/Vicinal_Syn_Dihydroxylation", says: "OsO4 adds syn through a cyclic osmate ester; cyclohexene gives cis-1,2-cyclohexanediol" },
  "jove-epoxidation": { cite: "JoVE / LibreTexts epoxidation pages (mCPBA)", url: "https://chem.libretexts.org/Courses/Nassau_Community_College/Organic_Chemistry_I_and_II/Map%253A_Organic_Chemistry_(Wade)/08%253A_Reactions_of_Alkenes/8.12%253A_Oxidation_of_Alkenes_-_Epoxidation", says: "concerted syn addition: a cis alkene gives a cis epoxide and a trans alkene a trans epoxide" },
  "ucla-pcc": { cite: "UCLA Illustrated Glossary of Organic Chemistry: PCC", url: "https://www.chem.ucla.edu/~harding/IGOC/P/pcc.html", says: "PCC oxidizes primary alcohols to aldehydes and secondary alcohols to ketones; anhydrous so no over-oxidation" },
  "moc-pcc": { cite: "Master Organic Chemistry: Oxidation of primary alcohols to aldehydes using PCC", url: "https://www.masterorganicchemistry.com/?p=3401", says: "PCC stops at the aldehyde; Jones (aqueous, strongly acidic) gives the carboxylic acid" },
  "ncstate-amines": { cite: "NC State: 12.4 Synthesis of Amines (reduction of nitriles, amides, nitro compounds)", url: "https://ncstate.pressbooks.pub/ch220/chapter/synthesis-of-amines/", says: "LiAlH4 reduces nitriles to primary amines and amides to amines; nitroarenes are reduced to amines by H2/catalyst or Fe/Sn/Zn with acid" },
  "openstax-conj": { cite: "OpenStax Organic Chemistry 14.3 Kinetic versus Thermodynamic Control of Reactions", url: "https://openstax.org/books/organic-chemistry/pages/14-3-kinetic-versus-thermodynamic-control-of-reactions", says: "HBr + 1,3-butadiene: 1,2 adduct (kinetic) favored at low T (71:29 at 0 C), 1,4 adduct (thermodynamic) at higher T (15:85 at 40 C)" },
  "rsc-naphthalene-fc": { cite: "J. Chem. Soc. 1966 (RSC) acylation of naphthalenes; solvent-dependent isomer ratios and reversible acylation", url: "https://pubs.rsc.org/en/Content/ArticleLanding/1966/J3/J39660000181", says: "the alpha/beta product ratio depends on solvent (CS2 vs nitrobenzene); alpha is kinetic, beta thermodynamic (shown for substituted naphthalenes)" },
  "libretexts-wacker": { cite: "LibreTexts: Wacker Oxidation", url: "https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Supplemental_Modules_(Organic_Chemistry)/Reactions/Organic_Reactions/Wacker_Oxidation", says: "PdCl2/CuCl2/O2 converts terminal alkenes to methyl ketones (Markovnikov)" },
  "katsuki-sharpless-1980": { cite: "Katsuki, T.; Sharpless, K. B. J. Am. Chem. Soc. 1980, 102, 5974-5976 (bibliographic data confirmed via Chem-Station)", url: "https://en.chem-station.com/?p=1560", says: "Ti(OiPr)4/dialkyl tartrate/TBHP enantioselective epoxidation of allylic alcohols; configuration set by the tartrate" },
  "orgosolver-bv": { cite: "OrgoSolver: Baeyer-Villiger oxidation (mCPBA, RCO3H)", url: "https://orgosolver.com/reaction-library/alkene-reaction-guides/baeyer-villiger-reaction", says: "cyclohexanone + peracid gives the ring-expanded lactone (epsilon-caprolactone)" },
  "namereaction-mitsunobu": { cite: "name-reaction.com / Chem-Station: Mitsunobu reaction", url: "https://www.name-reaction.com/mitsunobu-reaction", says: "secondary alcohols undergo complete inversion (SN2) with PPh3/DEAD and a carboxylic acid" },
  "heck-1979": { cite: "Heck, R. F. Acc. Chem. Res. 1979, 12, 146-151", url: "https://uwindsor.ca/people/jgreen/sites/uwindsor.ca.people.jgreen/files/acr-1979-12-146_heck_0.pdf", says: "Pd-catalyzed arylation of alkenes; syn insertion and syn beta-H elimination; trans-cinnamates" },
  "suzuki-1979": { cite: "Miyaura, N.; Yamada, K.; Suzuki, A. Tetrahedron Lett. 1979, 20, 3437-3440; Miyaura, N.; Suzuki, A. Chem. Rev. 1995, 95, 2457-2483 (confirmed this session)", url: "https://eprints.lib.hokudai.ac.jp/repo/huscap/all/44006/tetrahedronletters1979.pdf", says: "Pd-catalyzed cross-coupling of organoboron compounds with organic halides" },
  "sonogashira-1975": { cite: "Sonogashira, K.; Tohda, Y.; Hagihara, N. Tetrahedron Lett. 1975, 16, 4467-4470 (confirmed this session)", url: "https://www.thieme-connect.com/products/ejournals/html/10.1055/a-2467-6312", says: "Pd/Cu coupling of terminal alkynes with aryl/vinyl halides" },
  "corey-suggs-1975": { cite: "Corey, E. J.; Suggs, J. W. Tetrahedron Lett. 1975, 16, 2647-2650 (confirmed this session)", url: "https://www.organic-chemistry.org/abstracts/literature/599.shtm", says: "pyridinium chlorochromate oxidizes alcohols to carbonyl compounds" },
};

/** Convenience for SMILES with backslashes. */
const B = String.fromCharCode(92);
const Z = (a, b) => `${a}/C=C${B}${b}`;

const M = { primary: "verified-primary", secondary: "verified-secondary", provisional: "provisional" };

export const CASES = [
  // ----------------------------------------------------------------- substitution / elimination
  {
    id: "SE-01", category: "substitution-elimination", kind: "step",
    title: "SN2 with inversion: (R)-2-bromooctane + hydroxide",
    reactants: ["CCCCCC[C@@H](C)Br"], rule: "haloalkane-sn2-hydroxide",
    expect: { products: [{ smiles: "CCCCCC[C@H](C)O", role: "sole", cip: ["S"] }] },
    provenance: { level: M.secondary, sources: ["hamburg-sn2", "ncstate-sn2"], note: "Inversion is sourced; the (S) label follows because O replaces Br with the same CIP rank order (CIP of the hand-written product checked with RDKit)." },
  },
  {
    id: "SE-02", category: "substitution-elimination", kind: "step",
    title: "E2 with an unhindered alkoxide: 2-bromo-2,3-dimethylbutane gives the more substituted alkene",
    reactants: ["CC(C)C(C)(C)Br"], rule: "haloalkane-e2-zaitsev",
    expect: { products: [{ smiles: "CC(C)=C(C)C", role: "major" }, { smiles: "C=C(C)C(C)C", role: "minor" }] },
    provenance: { level: M.secondary, sources: ["reusch-e2"], note: "Reusch reports methoxide; the rule lists NaOEt (also an unhindered alkoxide)." },
  },
  {
    id: "SE-03", category: "substitution-elimination", kind: "step",
    title: "E2 with a bulky base: the same substrate gives the less substituted alkene as major",
    reactants: ["CC(C)C(C)(C)Br"], rule: "haloalkane-e2-hofmann",
    expect: { products: [{ smiles: "C=C(C)C(C)C", role: "major" }, { smiles: "CC(C)=C(C)C", role: "minor" }] },
    provenance: { level: M.secondary, sources: ["reusch-e2"], note: "tert-butoxide reverses the ratio to about 25:75 (more:less substituted)." },
  },
  {
    id: "SE-04", category: "substitution-elimination", kind: "step",
    title: "No SN2 at a tertiary carbon: tert-butyl bromide + cyanide",
    reactants: ["CC(C)(C)Br"], rule: "haloalkane-sn2-cyanide",
    expect: { outcome: "no-reaction", forbidden: ["CC(C)(C)C#N"] },
    provenance: { level: M.provisional, sources: ["ncstate-sn2"], note: "The retrieved text describes SN2 at a secondary halide; blocking at tertiary carbon is standard but was not explicitly sourced." },
  },
  {
    id: "SE-05", category: "substitution-elimination", kind: "step",
    title: "SN1 hydrolysis of a tertiary chloride (water as nucleophile)",
    reactants: ["CCC(C)(C)Cl"], rule: "haloalkane-sn1-solvolysis-water",
    expect: { products: [{ smiles: "CCC(C)(C)O", role: "major" }] },
    provenance: { level: M.provisional, sources: [], note: "No source retrieved; textbook SN1." },
  },

  // ----------------------------------------------------------------- alkenes
  {
    id: "AL-01", category: "alkenes", kind: "step",
    title: "HBr + 1-methylcyclohexene: Markovnikov, tertiary bromide",
    reactants: ["CC1=CCCCC1"], rule: "alkene-hx-addition-hbr",
    expect: { products: [{ smiles: "CC1(Br)CCCCC1", role: "sole" }], forbidden: ["CC1CCCCC1Br"] },
    provenance: { level: M.provisional, sources: [], note: "Supported only by tutoring sites in the search." },
  },
  {
    id: "AL-02", category: "alkenes", kind: "step",
    title: "HBr with peroxides + 2-methylbut-1-ene: anti-Markovnikov",
    reactants: ["C=C(C)CC"], rule: "alkene-hbr-peroxide",
    expect: { products: [{ smiles: "BrCC(C)CC", role: "sole" }], forbidden: ["CCC(C)(C)Br"] },
    provenance: { level: M.provisional, sources: [], note: "Supported only by tutoring sites in the search." },
  },
  {
    id: "AL-03", category: "alkenes", kind: "step",
    title: "Hydroboration-oxidation of 1-methylcyclohexene: trans-2-methylcyclohexanol (racemic)",
    reactants: ["CC1=CCCCC1"], rule: "alkene-hydroboration-oxidation",
    expect: { products: [{ smiles: "CC1CCCCC1O", role: "sole", cip: ["RR", "SS"], mixture: "racemic" }], forbidden: ["CC1(O)CCCCC1"] },
    provenance: { level: M.secondary, sources: ["ubc-hbo"], note: "Syn addition + anti-Markovnikov sourced; trans follows (OH and CH3 on opposite faces)." },
  },
  {
    id: "AL-04", category: "alkenes", kind: "step",
    title: "Oxymercuration-demercuration of 3,3-dimethylbut-1-ene: no rearrangement",
    reactants: ["C=CC(C)(C)C"], rule: "alkene-oxymercuration-demercuration",
    expect: { products: [{ smiles: "CC(O)C(C)(C)C", role: "sole" }], forbidden: ["CC(C)(O)C(C)C"] },
    provenance: { level: M.secondary, sources: ["jove-oxymerc"], note: "" },
  },
  {
    id: "AL-05", category: "alkenes", kind: "step",
    title: "Acid-catalyzed hydration of 3,3-dimethylbut-1-ene: methyl shift gives the tertiary alcohol",
    reactants: ["C=CC(C)(C)C"], rule: "alkene-acid-hydration",
    expect: { products: [{ smiles: "CC(C)(O)C(C)C", role: "major" }] },
    provenance: { level: M.provisional, sources: ["jove-oxymerc"], note: "The rearranged product was not sourced (one answer site in the search claimed the unrearranged alcohol, contradicting the mechanism)." },
    knownGap: "PocketChem does not model carbocation rearrangement in acid-catalyzed hydration (the rule documents it).",
  },
  {
    id: "AL-06", category: "alkenes", kind: "step",
    title: "Reductive ozonolysis of methylenecyclohexane: cyclohexanone + formaldehyde",
    reactants: ["C=C1CCCCC1"], rule: "alkene-ozonolysis-reductive",
    expect: { products: [{ smiles: "O=C1CCCCC1", role: "formed" }, { smiles: "C=O", role: "formed" }] },
    provenance: { level: M.provisional, sources: [], note: "The retrieved study was gas-phase ozone, not a reductive workup." },
  },
  {
    id: "AL-07", category: "alkenes", kind: "step",
    title: "Anti addition of Br2 to cyclopentene: trans-1,2-dibromocyclopentane (racemic)",
    reactants: ["C1CC=CC1"], rule: "alkene-halogenation-bromine",
    expect: { products: [{ smiles: "BrC1CCCC1Br", role: "sole", cip: ["RR", "SS"], mixture: "racemic" }] },
    provenance: { level: M.secondary, sources: ["ncstate-halogenation"], note: "" },
  },
  {
    id: "AL-08", category: "alkenes", kind: "step",
    title: "OsO4 syn dihydroxylation of cyclohexene: cis-cyclohexane-1,2-diol (meso)",
    reactants: ["C1CCC=CC1"], rule: "alkene-syn-dihydroxylation",
    expect: { products: [{ smiles: "OC1CCCCC1O", role: "sole", cip: ["RS"] }] },
    provenance: { level: M.secondary, sources: ["libretexts-syn-diol"], note: "" },
  },
  {
    id: "AL-09", category: "alkenes", kind: "step",
    title: "OsO4 syn dihydroxylation of 1-methylcyclohexene: cis diol (a case outside the H1=H1 stereo templates)",
    reactants: ["CC1=CCCCC1"], rule: "alkene-syn-dihydroxylation",
    expect: { products: [{ smiles: "CC1(O)CCCCC1O", role: "sole", stereoSpecified: true, relative: "cis" }] },
    provenance: { level: M.secondary, sources: ["libretexts-syn-diol"], note: "Syn addition is sourced for cyclohexene; the cis outcome for 1-methylcyclohexene follows from the same mechanism." },
  },
  {
    id: "AL-10", category: "alkenes", kind: "step",
    title: "Epoxidation of (E)-hex-3-ene: trans-2,3-diethyloxirane (racemic)",
    reactants: ["CC/C=C/CC"], rule: "alkene-epoxidation",
    expect: { products: [{ smiles: "CCC1OC1CC", role: "sole", cip: ["RR", "SS"], mixture: "racemic" }] },
    provenance: { level: M.secondary, sources: ["jove-epoxidation"], note: "" },
  },
  {
    id: "AL-11", category: "alkenes", kind: "step",
    title: "Catalytic hydrogenation of 1,2-dimethylcyclohexene: cis-1,2-dimethylcyclohexane (syn addition)",
    reactants: ["CC1=C(C)CCCC1"], rule: "alkene-hydrogenation",
    expect: { products: [{ smiles: "CC1CCCCC1C", role: "sole", cip: ["RS"] }] },
    provenance: { level: M.provisional, sources: [], note: "Syn addition of H2 is in the retrieved tutoring pages only." },
  },

  // ----------------------------------------------------------------- alkynes
  {
    id: "AY-01", category: "alkynes", kind: "step",
    title: "Hg2+ hydration of 3-methylbut-1-yne: methyl ketone",
    reactants: ["C#CC(C)C"], rule: "alkyne-mercury-hydration-terminal",
    expect: { products: [{ smiles: "CC(=O)C(C)C", role: "sole" }], forbidden: ["O=CCC(C)C"] },
    provenance: { level: M.secondary, sources: ["vanderbilt-alkynes"], note: "" },
  },
  {
    id: "AY-02", category: "alkynes", kind: "step",
    title: "Hindered-borane hydroboration-oxidation of 4-methylpent-1-yne: aldehyde",
    reactants: ["C#CCC(C)C"], rule: "alkyne-hydroboration-oxidation",
    expect: { products: [{ smiles: "O=CCCC(C)C", role: "sole" }], forbidden: ["CC(=O)CC(C)C"] },
    provenance: { level: M.secondary, sources: ["vanderbilt-alkynes"], note: "One retrieved page claimed ketones for all alkynes; the aldehyde is the textbook outcome for hindered boranes." },
  },
  {
    id: "AY-03", category: "alkynes", kind: "step",
    title: "Lindlar reduction of hex-3-yne: (Z)-hex-3-ene",
    reactants: ["CCC#CCC"], rule: "alkyne-lindlar-reduction-internal",
    expect: { products: [{ smiles: Z("CC", "CC"), role: "sole", geometry: "Z" }] },
    provenance: { level: M.secondary, sources: ["libretexts-alkyne-red", "wikipedia-semihydrog"], note: "" },
  },
  {
    id: "AY-04", category: "alkynes", kind: "step",
    title: "Na/NH3 reduction of hex-3-yne: (E)-hex-3-ene",
    reactants: ["CCC#CCC"], rule: "alkyne-dissolving-metal-reduction-internal",
    expect: { products: [{ smiles: "CC/C=C/CC", role: "sole", geometry: "E" }] },
    provenance: { level: M.secondary, sources: ["libretexts-alkyne-red"], note: "" },
  },
  {
    id: "AY-05", category: "alkynes", kind: "step",
    title: "Acetylide alkylation: pent-1-yne + NaNH2, then ethyl bromide, gives hept-3-yne",
    reactants: ["C#CCCC", "CCBr"], rule: "terminal-alkyne-alkylation",
    expect: { products: [{ smiles: "CCC#CCCC", role: "sole" }] },
    provenance: { level: M.provisional, sources: [], note: "The acetylide-alkylation search returned nothing." },
  },

  // ----------------------------------------------------------------- carbonyl
  {
    id: "CB-01", category: "carbonyl", kind: "step",
    title: "Grignard addition to an aldehyde: cyclohexanecarbaldehyde + MeMgBr gives a secondary alcohol",
    reactants: ["O=CC1CCCCC1", "C[Mg]Br"], rule: "aldehyde-organometallic-addition",
    expect: { products: [{ smiles: "CC(O)C1CCCCC1", role: "sole" }] },
    provenance: { level: M.provisional, sources: [], note: "Standard; the retrieved pages covered esters, CO2, epoxides and nitriles, not aldehydes." },
  },
  {
    id: "CB-02", category: "carbonyl", kind: "step",
    title: "Excess Grignard + ester: ethyl benzoate + 2 MeMgBr gives a tertiary alcohol",
    reactants: ["CCOC(=O)c1ccccc1", "C[Mg]Br"], rule: "ester-grignard-addition",
    expect: { products: [{ smiles: "CC(C)(O)c1ccccc1", role: "major" }] },
    provenance: { level: M.secondary, sources: ["ic-os3"], note: "" },
  },
  {
    id: "CB-03", category: "carbonyl", kind: "step",
    title: "DIBAL-H at -78 C: methyl hexanoate to hexanal",
    reactants: ["CCCCCC(=O)OC"], rule: "ester-dibal-reduction",
    expect: { products: [{ smiles: "CCCCCC=O", role: "major" }], forbidden: ["CCCCCCO"], conditions: { catalysis: "none" } },
    provenance: { level: M.secondary, sources: ["orgosolver-dibal", "pmc-dibal"], note: "" },
  },
  {
    id: "CB-04", category: "carbonyl", kind: "step",
    title: "LiAlH4 reduction of an ester gives two alcohols: ethyl phenylacetate to 2-phenylethanol + ethanol",
    reactants: ["CCOC(=O)Cc1ccccc1"], rule: "ester-lah-reduction",
    expect: { products: [{ smiles: "OCCc1ccccc1", role: "formed" }, { smiles: "CCO", role: "formed" }], conditions: { catalysis: "none" } },
    provenance: { level: M.secondary, sources: ["ic-os3"], note: "" },
  },
  {
    id: "CB-05", category: "carbonyl", kind: "step",
    title: "Chemoselective ketone reduction in a keto ester (NaBH4 does not reduce esters)",
    reactants: ["CC(=O)CCC(=O)OC"], rule: "ketone-reduction",
    expect: { products: [{ smiles: "CC(O)CCC(=O)OC", role: "sole" }], forbidden: ["CC(O)CCCO"] },
    provenance: { level: M.provisional, sources: ["ic-os3"], note: "The ester half (NaBH4 does not reduce esters) was sourced; ketone selectivity in the same molecule was not." },
  },
  {
    id: "CB-06", category: "carbonyl", kind: "step",
    title: "Wittig methylenation: cyclohexanone to methylenecyclohexane",
    reactants: ["O=C1CCCCC1", "CBr"], rule: "ketone-wittig",
    expect: { products: [{ smiles: "C=C1CCCCC1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["wikipedia-mch"], note: "" },
  },
  {
    id: "CB-07", category: "carbonyl", kind: "step",
    title: "Cannizzaro: benzaldehyde with concentrated NaOH gives benzyl alcohol and benzoic acid/benzoate",
    reactants: ["O=Cc1ccccc1", "O=Cc1ccccc1"], rule: "aldehyde-cannizzaro",
    expect: { products: [{ smiles: "OCc1ccccc1", role: "formed" }, { smiles: "OC(=O)c1ccccc1", role: "formed" }] },
    provenance: { level: M.provisional, sources: [], note: "Retrieved only from educational-company pages." },
  },

  // ----------------------------------------------------------------- aromatic substitution
  {
    id: "AR-01", category: "aromatic-substitution", kind: "step",
    title: "Nitration of toluene: ortho and para both formed (ortho slightly more), meta minor",
    reactants: ["Cc1ccccc1"], rule: "aromatic-nitration",
    expect: { products: [{ smiles: "Cc1ccccc1[N+](=O)[O-]", role: "major" }, { smiles: "Cc1ccc([N+](=O)[O-])cc1", role: "major" }, { smiles: "Cc1cccc([N+](=O)[O-])c1", role: "minor" }] },
    provenance: { level: M.secondary, sources: ["uis-eas"], note: "Distribution about 58:38:4 (o:p:m); ortho and para are both major classes." },
  },
  {
    id: "AR-02", category: "aromatic-substitution", kind: "step",
    title: "Bromination of nitrobenzene: meta",
    reactants: ["O=[N+]([O-])c1ccccc1"], rule: "aromatic-halogenation-bromination",
    expect: { products: [{ smiles: "O=[N+]([O-])c1cccc(Br)c1", role: "major" }] },
    provenance: { level: M.secondary, sources: ["uis-eas"], note: "" },
  },
  {
    id: "AR-03", category: "aromatic-substitution", kind: "step",
    title: "Friedel-Crafts acylation of anisole: para",
    reactants: ["COc1ccccc1", "CC(=O)Cl"], rule: "aromatic-friedel-crafts-acylation",
    expect: { products: [{ smiles: "COc1ccc(C(C)=O)cc1", role: "major" }, { smiles: "COc1ccccc1C(C)=O", role: "minor" }] },
    provenance: { level: M.provisional, sources: ["uis-eas"], note: "The retrieved text covered bromination of anisole (para main, ~10% ortho), not acylation." },
  },
  {
    id: "AR-04", category: "aromatic-substitution", kind: "step",
    title: "Friedel-Crafts acylation fails on a strongly deactivated ring (nitrobenzene)",
    reactants: ["O=[N+]([O-])c1ccccc1", "CC(=O)Cl"], rule: "aromatic-friedel-crafts-acylation",
    expect: { outcome: "no-reaction", forbidden: ["CC(=O)c1cccc([N+](=O)[O-])c1"] },
    provenance: { level: M.provisional, sources: [], note: "No source retrieved for this limitation." },
  },
  {
    id: "AR-05", category: "aromatic-substitution", kind: "step",
    title: "Friedel-Crafts alkylation with rearrangement: neopentyl chloride gives 2-methyl-2-phenylbutane",
    reactants: ["c1ccccc1", "CC(C)(C)CCl"], rule: "aromatic-friedel-crafts-alkylation",
    expect: { products: [{ smiles: "CCC(C)(C)c1ccccc1", role: "major" }], forbidden: ["CC(C)(C)Cc1ccccc1"] },
    provenance: { level: M.secondary, sources: ["ncstate-fc"], note: "Two other retrieved pages disagreed; the methyl-shift product is the mechanistically consistent one." },
    knownGap: "PocketChem's Friedel-Crafts rule documents that it shows direct attachment and does not model carbocation rearrangement.",
  },

  // ----------------------------------------------------------------- organometallic / coupling
  {
    id: "OM-01", category: "organometallic", kind: "step",
    title: "Grignard + CO2: cyclopentylmagnesium bromide gives cyclopentanecarboxylic acid",
    reactants: ["Br[Mg]C1CCCC1"], rule: "organometallic-carboxylation",
    expect: { products: [{ smiles: "OC(=O)C1CCCC1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["chemguide-grignard"], note: "" },
  },
  {
    id: "OM-02", category: "organometallic", kind: "step",
    title: "Grignard + ethylene oxide: PhMgBr gives 2-phenylethanol",
    reactants: ["Br[Mg]c1ccccc1", "C1CO1"], rule: "epoxide-grignard-opening",
    expect: { products: [{ smiles: "OCCc1ccccc1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["chemguide-grignard"], note: "Sourced for MeMgBr (1-propanol); the aryl case follows." },
  },
  {
    id: "OM-03", category: "organometallic", kind: "step",
    title: "Gilman reagent conjugate addition: cyclohex-2-enone + Me2CuLi gives 3-methylcyclohexanone",
    reactants: ["O=C1C=CCCC1", "[Li+].C[Cu-]C"], rule: "organocuprate-conjugate-addition",
    expect: { products: [{ smiles: "CC1CCCC(=O)C1", role: "sole" }], forbidden: ["CC1(O)C=CCCC1"] },
    provenance: { level: M.provisional, sources: [], note: "The search only confirmed 1,4-addition in general." },
  },
  {
    id: "OM-04", category: "organometallic", kind: "step",
    title: "Suzuki coupling: 4-bromotoluene + phenylboronic acid gives 4-methylbiphenyl",
    reactants: ["Cc1ccc(Br)cc1", "OB(O)c1ccccc1"], rule: "suzuki-coupling",
    expect: { products: [{ smiles: "Cc1ccc(-c2ccccc2)cc1", role: "sole" }], conditions: { catalysis: "catalytic" } },
    provenance: { level: M.primary, sources: ["suzuki-1979"], note: "Bibliographic data confirmed; the transformation class is the paper's subject." },
  },
  {
    id: "OM-05", category: "organometallic", kind: "step",
    title: "Sonogashira coupling: 4-iodoanisole + phenylacetylene gives 4-methoxytolan",
    reactants: ["COc1ccc(I)cc1", "C#Cc1ccccc1"], rule: "sonogashira-coupling",
    expect: { products: [{ smiles: "COc1ccc(C#Cc2ccccc2)cc1", role: "sole" }], conditions: { catalysis: "catalytic" } },
    provenance: { level: M.primary, sources: ["sonogashira-1975"], note: "Bibliographic data confirmed." },
  },
  {
    id: "OM-06", category: "organometallic", kind: "step",
    title: "Grignard + nitrile: benzonitrile + EtMgBr gives propiophenone",
    reactants: ["N#Cc1ccccc1", "CC[Mg]Br"], rule: "nitrile-grignard-ketone",
    expect: { products: [{ smiles: "CCC(=O)c1ccccc1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["libretexts-grignard"], note: "" },
  },

  // ----------------------------------------------------------------- oxidation / reduction
  {
    id: "OR-01", category: "oxidation-reduction", kind: "step",
    title: "PCC oxidation of a primary alcohol stops at the aldehyde (octan-1-ol)",
    reactants: ["CCCCCCCCO"], rule: "primary-alcohol-mild-oxidation",
    expect: { products: [{ smiles: "CCCCCCCC=O", role: "sole" }], forbidden: ["CCCCCCCC(=O)O"], conditions: { catalysis: "none" } },
    provenance: { level: M.primary, sources: ["corey-suggs-1975", "ucla-pcc", "moc-pcc"], note: "Primary paper bibliographically confirmed; selectivity statement from the secondary pages." },
  },
  {
    id: "OR-02", category: "oxidation-reduction", kind: "step",
    title: "Jones oxidation takes a primary alcohol to the carboxylic acid (hexan-1-ol)",
    reactants: ["CCCCCCO"], rule: "primary-alcohol-strong-oxidation",
    expect: { products: [{ smiles: "CCCCCC(=O)O", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["moc-pcc"], note: "" },
  },
  {
    id: "OR-03", category: "oxidation-reduction", kind: "step",
    title: "Birch reduction of anisole: 1-methoxycyclohexa-1,4-diene",
    reactants: ["COc1ccccc1"], rule: "aromatic-birch-reduction",
    expect: { products: [{ smiles: "COC1=CCC=CC1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["iupac-birch"], note: "" },
  },
  {
    id: "OR-04", category: "oxidation-reduction", kind: "step",
    title: "Reduction of a nitroarene to the aniline (4-nitrotoluene)",
    reactants: ["Cc1ccc([N+](=O)[O-])cc1"], rule: "nitroarene-reduction",
    expect: { products: [{ smiles: "Cc1ccc(N)cc1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["ncstate-amines"], note: "" },
  },
  {
    id: "OR-05", category: "oxidation-reduction", kind: "step",
    title: "LiAlH4 reduction of an amide to an amine (N-methylbenzamide)",
    reactants: ["CNC(=O)c1ccccc1"], rule: "amide-lah-reduction",
    expect: { products: [{ smiles: "CNCc1ccccc1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["ncstate-amines"], note: "" },
  },
  {
    id: "OR-06", category: "oxidation-reduction", kind: "step",
    title: "LiAlH4 reduction of a nitrile to a primary amine (hexanenitrile)",
    reactants: ["CCCCCC#N"], rule: "nitrile-lah-reduction",
    expect: { products: [{ smiles: "CCCCCCN", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["ncstate-amines"], note: "" },
  },

  // ----------------------------------------------------------------- competing pathways / ambiguity
  {
    id: "CP-01", category: "competing-pathways", kind: "step",
    title: "HBr + 1,3-butadiene without a stated temperature: 1,2 and 1,4 adducts are both legitimate",
    reactants: ["C=CC=C"], rule: ["diene-hx-1-2-hbr", "diene-hx-1-4-hbr"],
    expect: { outcome: "ambiguous", products: [{ smiles: "C=CC(C)Br", role: "formed" }, { smiles: "CC=CCBr", role: "formed" }] },
    provenance: { level: M.secondary, sources: ["openstax-conj"], note: "1,2 favored at low T (71:29 at 0 C), 1,4 at higher T (15:85 at 40 C): the ratio is temperature-controlled." },
  },
  {
    id: "CP-02", category: "competing-pathways", kind: "step",
    title: "Friedel-Crafts acylation of naphthalene: alpha versus beta is solvent-dependent (ambiguous)",
    reactants: ["c1ccc2ccccc2c1", "CC(=O)Cl"], rule: "aromatic-friedel-crafts-acylation",
    expect: { outcome: "ambiguous", products: [{ smiles: "CC(=O)c1cccc2ccccc12", role: "formed" }, { smiles: "CC(=O)c1ccc2ccccc2c1", role: "formed" }] },
    provenance: { level: M.secondary, sources: ["rsc-naphthalene-fc"], note: "Shown for substituted naphthalenes; the solvent dependence for naphthalene itself is qualitative." },
  },

  // ----------------------------------------------------------------- deliberately unsupported
  {
    id: "US-01", category: "unsupported", kind: "unsupported",
    title: "Wacker oxidation: oct-1-ene to octan-2-one (PdCl2/CuCl2/O2)",
    reactants: ["C=CCCCCCC"], reagentPattern: "Wacker|PdCl|PdCl2|oxygen",
    expect: { products: [{ smiles: "CC(=O)CCCCCC", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["libretexts-wacker"], note: "" },
  },
  {
    id: "US-02", category: "unsupported", kind: "unsupported",
    title: "Ring-closing metathesis (Grubbs): diethyl diallylmalonate to diethyl cyclopent-3-ene-1,1-dicarboxylate",
    reactants: ["C=CCC(CC=C)(C(=O)OCC)C(=O)OCC"], reagentPattern: "metathesis|Grubbs|Ru=",
    expect: { products: [{ smiles: "CCOC(=O)C1(C(=O)OCC)CC=CC1", role: "sole" }] },
    provenance: { level: M.provisional, sources: [], note: "No source retrieved for RCM." },
  },
  {
    id: "US-03", category: "unsupported", kind: "unsupported",
    title: "Sharpless asymmetric epoxidation of geraniol (enantioselective, ligand-controlled)",
    reactants: ["CC(C)=CCCC(C)=CCO"], reagentPattern: "Sharpless|tartrate|DET|Ti\\(O",
    expect: { products: [{ smiles: "CC(C)=CCCC1(C)OC1CO", role: "sole", stereoSpecified: true }] },
    provenance: { level: M.primary, sources: ["katsuki-sharpless-1980"], note: "Bibliographic data and enantioselectivity confirmed; the absolute configuration for a given tartrate enantiomer was NOT confirmed, so only 'stereodefined' is scored." },
  },
  {
    id: "US-04", category: "unsupported", kind: "unsupported",
    title: "Baeyer-Villiger oxidation: cyclohexanone to epsilon-caprolactone",
    reactants: ["O=C1CCCCC1"], reagentPattern: "Baeyer|Villiger|peracid.*ketone|mCPBA.*ketone",
    expect: { products: [{ smiles: "O=C1CCCCCO1", role: "sole" }] },
    provenance: { level: M.secondary, sources: ["orgosolver-bv"], note: "" },
  },
  {
    id: "US-05", category: "unsupported", kind: "unsupported",
    title: "Mitsunobu inversion: (S)-octan-2-ol + benzoic acid gives (R)-octan-2-yl benzoate",
    reactants: ["CCCCCC[C@H](C)O", "OC(=O)c1ccccc1"], reagentPattern: "Mitsunobu|DEAD|DIAD|PPh3.*DE",
    expect: { products: [{ smiles: "CCCCCC[C@H](C)OC(=O)c1ccccc1", role: "sole", stereoSpecified: true }] },
    provenance: { level: M.secondary, sources: ["namereaction-mitsunobu"], note: "Inversion is sourced; CIP labels of the ester were not asserted." },
  },

  // ----------------------------------------------------------------- multi-step routes (search)
  {
    id: "RT-01", category: "multistep-route", kind: "route",
    title: "Styrene to acetophenone (hydration, then oxidation)",
    start: "C=Cc1ccccc1", target: "CC(=O)c1ccccc1",
    expect: { feasible: true, allowedRules: ["alkene-acid-hydration", "alkene-oxymercuration-demercuration", "secondary-alcohol-oxidation-pcc", "secondary-alcohol-oxidation-strong"], forbiddenRules: ["alkene-hydroboration-oxidation"] },
    provenance: { level: M.provisional, sources: ["jove-oxymerc", "ucla-pcc"], note: "Each step is standard; the Markovnikov hydration of styrene was not sourced." },
  },
  {
    id: "RT-02", category: "multistep-route", kind: "route",
    title: "Benzene to 1-bromo-3-nitrobenzene: nitration must come before bromination (meta directing)",
    start: "c1ccccc1", target: "O=[N+]([O-])c1cccc(Br)c1",
    expect: { feasible: true, allowedRules: ["aromatic-nitration", "aromatic-halogenation-bromination"], orderedBefore: ["aromatic-nitration", "aromatic-halogenation-bromination"] },
    provenance: { level: M.secondary, sources: ["uis-eas"], note: "Nitro is a meta director; bromination of nitrobenzene gives the meta isomer." },
  },
  {
    id: "RT-03", category: "multistep-route", kind: "route",
    title: "Toluene to 4-nitrobenzoic acid: nitrate first (o/p), then oxidize the methyl group",
    start: "Cc1ccccc1", target: "OC(=O)c1ccc([N+](=O)[O-])cc1",
    expect: { feasible: true, allowedRules: ["aromatic-nitration", "benzylic-oxidation"], orderedBefore: ["aromatic-nitration", "benzylic-oxidation"] },
    provenance: { level: M.provisional, sources: ["uis-eas"], note: "Nitration of toluene (o/p) is sourced; benzylic oxidation by KMnO4 was not." },
  },

  // ----------------------------------------------------------------- multi-catalytic / convergent workspaces
  {
    id: "WS-01", category: "multicatalytic", kind: "workspace",
    title: "Suzuki coupling, then hydride reduction: 4-bromobenzaldehyde + PhB(OH)2 to (biphenyl-4-yl)methanol",
    starts: ["O=Cc1ccc(Br)cc1", "OB(O)c1ccccc1"],
    script: [
      { ruleId: "suzuki-coupling", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "aldehyde-reduction", reactants: [{ attempt: 1, product: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction"], live: ["OCc1ccc(-c2ccccc2)cc1"], catalyticSteps: [1], noCatalystSteps: [2], intermediates: { 1: "O=Cc1ccc(-c2ccccc2)cc1" } },
    provenance: { level: M.provisional, sources: ["suzuki-1979"], note: "Suzuki is verified; chemoselectivity (CHO survives, then NaBH4) is standard but unsourced." },
  },
  {
    id: "WS-02", category: "multicatalytic", kind: "workspace",
    title: "Convergent: Sonogashira join of 4-iodoanisole and hex-1-yne, then Lindlar semi-hydrogenation (Z)",
    starts: ["COc1ccc(I)cc1", "C#CCCCC"],
    script: [
      { ruleId: "sonogashira-coupling", reactants: [{ material: 0 }, { material: 1 }] },
      { ruleId: "alkyne-lindlar-reduction-internal", reactants: [{ attempt: 1, product: 1 }] },
    ],
    expect: { statuses: ["reaction", "reaction"], live: [`CCCC/C=C${B}c1ccc(OC)cc1`], catalyticSteps: [1, 2], intermediates: { 1: "CCCCC#Cc1ccc(OC)cc1" } },
    provenance: { level: M.secondary, sources: ["sonogashira-1975", "libretexts-alkyne-red"], note: "Both steps are sourced individually; the sequence is not a literature route. Only one branch (the alkyne partner) is untransformed." },
  },
];
