# Multi-Catalytic workspace: scientific validation (Stages 9B-2 / 9B-3)

Generated data: `results/multicatalytic-workspace.json`, produced by
`node scripts/benchmarks/multicatalyticBenchmark.mjs`. Every scenario runs real registry rules through the
real engine; no product is written by hand. Live-browser run: `node scripts/browser/multicatalyticLiveCheck.mjs`
(29/29 checks on the production build, headless Chrome 156, live Ketcher).

## What each level means, and what was established

The six levels are not interchangeable. A higher number is not implied by a lower one.

| # | Level | How it is established here | Established for these scenarios? |
|---|-------|----------------------------|----------------------------------|
| 1 | Syntactically valid structures | every lot parses in RDKit | Yes, all lots of all 12 scenarios |
| 2 | Structurally verified steps | `assessWorkspace` replays every committed step from the molecules that existed at that point, using PocketChem's own rules | Yes, `verified` for every scenario with a committed step |
| 3 | Chemically plausible | **asserted by the author with a textbook basis, not computed** (column `plausibility` in the benchmark) | Asserted only; see literature below |
| 4 | Selectivity-supported | only a rule's own numeric estimate counts (`major`); `single-outcome` is *not ranked*, `unranked` is missing information | Only D6a (radical bromination: tertiary bromide is the one `major`). Every other step is single-outcome or unranked |
| 5 | Condition-compatible | advisory, from declared `RuleConditions` only | Not established for any scenario: most rules declare no conditions (unassessed), the rest can reach at most "incomplete" |
| 6 | Experimentally established | **never established by PocketChem** | No. Literature support is listed below as pointers, not as validation of PocketChem's output |

## Scenario results (expected vs observed)

| ID | Chemistry (rules used) | Expected | Observed | Level 4 | Notes |
|----|------------------------|----------|----------|---------|-------|
| D1 | 1-hexyne → `alkyne-mercury-hydration-terminal` → 2-hexanone → `ketone-reduction` → 2-hexanol → `alcohol-socl2` | 2-chlorohexane; starting alkyne consumed | match | single-outcome ×3 | stereochemistry of the secondary chloride is not specified by the rule (racemic product represented without a stereocentre) |
| D2a | acetic acid + ethanol, `fischer-esterification` | ethyl acetate, both inputs consumed | match | single-outcome | equilibrium and water coproduct are not modeled (no coproduct lot is generated) |
| D2b | bromobenzene + phenylboronic acid, `suzuki-coupling` | biphenyl | match | single-outcome | Pd catalyst named by type only |
| D3+D4 | BuBr → `haloalkane-grignard-formation-bromide`; BuOH → `primary-alcohol-mild-oxidation`; `aldehyde-organometallic-addition`; `secondary-alcohol-oxidation-pcc` | octan-4-one; two independent branches (no shared ancestor) before the join | match; replay `verified`; dependency graph `[[],[],[1,2],[3]]` | single-outcome ×4 | the Grignard reagent is represented as `CCC[CH2][Mg][Br]` by the existing rule |
| D3b+D4b | 1-hexene → `alkene-acid-hydration`; propanoic acid → `carboxylic-acid-to-acid-chloride`; `alcohol-acid-chloride-esterification`; `ester-lah-reduction` | propan-1-ol + hexan-2-ol (2 molecules) | match | single-outcome ×4 | second two-branch convergence, different chemistry |
| D5 | `sonogashira-coupling` → `alkyne-lindlar-reduction-internal` → `alkene-hydrogenation` | hexylbenzene; Z-alkene intermediate | match | single-outcome ×3 | 3 catalytic steps, 3 distinct catalyst systems; Pd of Sonogashira is *generic* (type only), CuI is conditional ("as applicable") |
| D6a | `alkane-radical-bromination` on 2-methylbutane | step stops for a choice, nothing consumed; classes major + 3 disfavored; choosing outcome 0 gives 2-bromo-2-methylbutane | match | **major** (rule's own estimate) | the only level-4 support in the set |
| D6b | `heck-coupling` aryl bromide + methyl acrylate | step stops; 2 outcomes, both `unranked` | match | unranked ×2 | textbook expectation (E-cinnamate) is NOT claimed by the engine |
| D7 | `fischer-esterification` with one molecule, then a dependent oxidation | `needs-input`, then `dependency-failed`; ethanol untouched | match | n/a | |
| D8 | hexane + ethanol: oxidation of hexane (no reaction), dependent reduction, independent oxidation of ethanol | `no-reaction`, `reaction`, `dependency-failed` | match | n/a | |
| D9 | (S)-2-bromobutane `haloalkane-sn2-hydroxide`; [13CH3]CH2OH oxidation | inverted stereocentre; 13C label kept | match | single-outcome | E/Z geometry, charges and disconnected components are covered in `reactionWorkspace.test.mjs` |
| D10 | `ester-lah-reduction` of ethyl acetate beside hexane | 2 ethanol lots (primary + coproduct) + untouched hexane | match | single-outcome | coproduct role is the engine's product order, not independent knowledge |

## Literature pointers (not validation of PocketChem)

Verified this session against secondary sources (publisher or database pages, not the primary papers):

- Corey, E. J.; Suggs, J. W. *Tetrahedron Lett.* **1975**, 16, 2647–2650 (pyridinium chlorochromate oxidation of alcohols).
- Sonogashira, K.; Tohda, Y.; Hagihara, N. *Tetrahedron Lett.* **1975**, 16, 4467–4470 (Pd/Cu coupling of terminal alkynes with aryl/vinyl halides).
- Lindlar, H. *Helv. Chim. Acta* **1952**, 35, 446–450 (Pd/CaCO3 catalyst poisoned with lead for alkyne → alkene hydrogenation).
- Miyaura, N.; Yamada, K.; Suzuki, A. *Tetrahedron Lett.* **1979**, 20, 3437–3440, and Miyaura, N.; Suzuki, A. *Chem. Rev.* **1995**, 95, 2457–2483 (Pd-catalysed cross-coupling of organoboron compounds).

Textbook reactions used without an individually checked citation (**provisional**): Grignard reagent formation and addition to aldehydes, Fischer esterification, Hg²⁺-catalysed alkyne hydration, hydride reduction of ketones and esters, acid-catalysed alkene hydration, SOCl₂ conversion of alcohols to chlorides, acyl-chloride esterification, free-radical bromination selectivity. They are standard in introductory organic chemistry texts; none was checked against a primary source here.

## Catalyst and compatibility findings

- Catalyst identity is **explicit only where the registry text names it** (Pd/C, Lindlar catalyst, H₂SO₄, Hg²⁺ from HgSO₄). `Pd catalyst` and `acid catalyst` are recorded as *generic*: a type, not a species. Every curated role is checked by a test to appear in the rule's own `reagents`/`reagentNote`. Of the registry's 342 rules, 30 have curated roles; the other 312 keep their reagent text and are reported as unassessed (not "no catalyst").
- Each step runs on isolated compounds, so successive catalysts are never co-present. The report says so and sets `claims: {tandem: false, cooperative: false}` for every workspace. Several catalyst labels in one workspace do not demonstrate cooperative catalysis.
- Pairwise combination assessments exist only for the question "could these two steps share a pot?". Categories: documented conflict (a deterministic clash of declared acid/base/organometallic/hydride/oxidant conditions), incomplete, unassessed. **No pair is curated as documented-compatible**, so that category is never produced; absence of a conflict is "incomplete", never "compatible".

## Limitations that remain

- No selectivity ranking exists for almost all rules; `single-outcome` only means the engine offered one product.
- Only 30 of 342 rules have catalyst/reagent roles; 39 declare machine-readable conditions (see `catalystRoles.ts`, `RuleConditions`).
- Copies are availability counts; there are no amounts, yields, equivalents (beyond the number of molecules a rule consumes) or limiting reagents.
- Coproduct vs primary product is the engine's product order. Water and other small coproducts are mostly not generated by the rules.
- Salts drawn as one structure are split into separate ion lots (the disconnected components are preserved, not merged).
- A drawing that was not added to the inventory is not saved with the workspace.
- Level 6 (experimental feasibility) is outside what a rule-based model can establish.
