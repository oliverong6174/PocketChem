# Stage 16 handoff: gene regulation, genetics and cell division

Branch `stage10-ui-overhaul`. Nothing pushed. Stage 17 not started.

## 1. Starting checkpoint
`bc24bdf` (Stage 15 final). Starting status: only the long-standing untracked files (`CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`,
`scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`), left untouched and unstaged.

## 2. Gene-regulation capabilities (`#/biology/gene-regulation`)
- **lac operon**: lactose/glucose switches, LacI repressor ↔ allolactose, operator, promoter, CAP site, cAMP–CRP, RNA polymerase, lacZYA output. One or
  two copies of the operon (chromosome + F′) with per-copy lacI (+/−/ˢ), operator (+/ᶜ), promoter, lacZ, plus a defective cAMP–CRP system. Levels are
  ordinal (none / basal-leaky / low / high); a bound repressor gives *basal*, not zero. Step events: conditions → repressor/inducer → cAMP–CRP →
  RNAP → output. A cis/trans table is derived by placing each mutation on one molecule with a lacZ⁺ reporter (lacI⁻ and lacIˢ trans, lacOᶜ and lacP⁻ cis).
- **trp operon**: low / moderate / high tryptophan; trpR, operator, leader start codon, the two leader Trp codons and the attenuator can each be lost.
  Repression (initiation) and attenuation (read-through) are separate axes. The leader RNA is drawn with regions 1–4, the leader peptide
  (MKAIFVLKGWWRTS, translated by the Stage 15 engine), the ribosome and the hairpins that form: 2:3 antiterminator at low Trp (ribosome stalled on region 1),
  3:4 terminator at high Trp (ribosome at the stop codon covers region 2), 1:2 + 3:4 with no ribosome. Transcription–translation coupling is stated in the steps.
- **Eukaryotic gene**: enhancer (present / mutated / absent, orientation, distance), silencer, TATA promoter; activator, repressor and Mediator (trans);
  histone acetylation and promoter methylation. Outputs: chromatin state, activator/repressor binding, Mediator bridge, Pol II, a qualitative level.
  Acetylation + methylation and activator + repressor are reported as **uncertain**, not guessed.
- Learning: selectable components (click or Tab+Enter) with kind (cis DNA element / trans protein / small molecule / …), current state and what a
  mutation does; Practice questions from state (including cis/trans); Challenge predicts increase / decrease / about the same / cannot be predicted for a
  declared perturbation, then applies it.

## 3. Genetics and inheritance (`#/biology/genetics`)
Monohybrid, dihybrid, test cross (button + interpretation), incomplete dominance (snapdragon), codominance (MN), multiple alleles (ABO), X-linked recessive
(colour vision, female × male), two linked genes with coupling/repulsion and a recombination fraction r (0–0.5, ≤ 3 decimals). Parents' chromosome pairs
(maternal solid, paternal hatched), gamete classes with exact probabilities, Punnett square, genotype and phenotype distributions (exact fractions + ratio),
a crossing-over figure (before/after, parental vs recombinant chromatids). Each locus states its genotype → phenotype rule on screen. Explore / Practice
(pick every possible gamete; questions) / Challenge (enter a fraction, decimal or % before the square is shown).

## 4. Mitosis and meiosis (`#/biology/mitosis-meiosis`)
Mitosis: G1, S, prophase, prometaphase, metaphase, anaphase, telophase+cytokinesis. Meiosis: G1, S, prophase I (pairing), prophase I (crossing over),
metaphase I, anaphase I, telophase I, prophase II, metaphase II, anaphase II, telophase II (four cells). Controls: play/pause, step, first, stage timeline
(buttons and slider), chromosome selection, crossing over (which maternal and paternal chromatid), metaphase I orientation per pair, metaphase II sister
orientation per cell and pair, nondisjunction scenario (meiosis I or II, which pair, which cell, which pole). Chromosome number, chromatids and DNA
content (C) are shown per cell at every stage and in a table; the state at every stage (cells, chromosomes, chromatids, bivalents, chiasmata, spindle
attachment, poles faced) comes from `buildMitosis`/`buildMeiosis`, the diagram only places it.

## 5. Shared chromosome and allele model
`src/utils/biology/chromosome.ts`: loci (alleles, rule), layouts (mono, di, linked, incomplete, codominant, abo, xlinked), individuals (maternal/paternal
homologs), chromatids with per-locus origin, `exchange`/`tetrad` (the one crossover operation). `genetics.ts` and `cellDivision.ts` both consume it, so the
Genetics parent object is the object the meiosis tool segregates. `meiosisDistribution` (average of `meiosisCore` over all equally likely settings, crossover
probability 2r per bivalent) equals `gametesOf` exactly (tested for nine genotype/r cases), while a single run is labelled one outcome.

## 6. Integration with Stage 15
- Genetics → "Open in DNA → RNA → protein": the first 18 codons of HBB with the Glu6Val variant (missense) are translated by `analyzeDogma` and sent
  through a one-shot, validated hand-off (`handoff16.ts`); the dominance of the allele is *stated*, no phenotype is inferred from sequence.
- The trp leader peptide is produced with Stage 15's `translateFrom`; Genetics ↔ Mitosis & meiosis hand-offs carry the genotype both ways.
- Stage 15 tools were not rebuilt; their tests (100) and the Stage 15 live check (60/60, after updating its tab list and card count to the new state) pass; the only edits to Stage 15 files are the dogma hand-off effect, `PredictPanel`
  optional labels, and the Biology overview.

## 7. Interactive learning features
Explore / Practice / Challenge on all three tools; Practice hides labels or results until revealed; Challenge answers are computed from the same states that
draw the diagram (tests compare them with independently derived values). Keyboard-operable selectable chromosomes and regulatory components,
`aria-live` captions, text alternatives (`role="img"` labels carry the state), reduced-motion respected (CSS transition only; the step player is the only timer).

## 8. Scientific simplifications and limitations
- Expression levels are ordinal ranks, not rates; lac: allolactose assumed whenever lactose is present (no inducer exclusion/kinetics), CAP site assumed intact.
- trp leader is **schematic** (real peptide and the 1:2/2:3/3:4 logic; not the E. coli nucleotide sequence); pairing is decided by complementarity and
  ribosome coverage, not RNA energies.
- Eukaryotic model: declared elements and marks only; TATA-dependence is model-specific; pioneer factors, insulators, alternative promoters not modelled.
- Genetics: expected proportions, exact fractions; r is an input (no distance/sequence prediction, no interference, no double crossovers); one X-linked
  example (female × male).
- Division: 2n = 2 or 4, autosomes only, at most one crossover per pair (between the two genes), one nondisjunction at a time; sister orientation at
  metaphase II applies per cell and pair; no synaptonemal-complex or chiasma-maintenance detail.

## 9. Navigation and persistence
New tools registered in `BIOLOGY_TOOLS` (new group `inheritance`; overview lists working tools, planned items have no buttons), Saved Analyses labels
"Biology · Gene regulation / Genetics & inheritance / Mitosis & meiosis". Persisted pages `regulation`, `genetics`, `celldivision` (`biologyTools16.ts`,
engine version 1 each): system, all three systems' conditions, selected component, challenge index; parent genotypes, recombination fraction, step; process,
individual, meiosis settings, stage, selected chromosome, revealed flag, learning mode. Validators build new objects, reject unknown ids/alleles/steps/
settings/selections and never coerce; results are rebuilt from inputs. Existing records and subjects untouched.

## 10. Numerical and mechanistic tests (one process at a time)
| Suite | Tests |
|---|---|
| `biologyRegulation16` | 34 |
| `biologyGenetics16` | 30 |
| `biologyDivision16` | 32 |
| `biologyPlatform16` | 24 |
| Stage 15 (`biologyCode15`, `biologyProcesses15`, `biologyPlatform15`) | 100 |

All 220 pass. References are hand-derived (3:1, 9:3:3:1, 1:2:1, test crosses, ABO, X-linked, AB/ab at r = 0.2 → 2/5, 2/5, 1/10, 1/10; lac/trp/eukaryotic
tables; chromosome/chromatid/C counts per stage; meiosis I/II nondisjunction complements; conservation of chromosomes and chromatids). Existing suites rerun:
analysis library, persistence, Physics 13/14, General Chemistry 11/12, ui polish (353/360 first run). Six assertions that enumerate registries were updated to
include the new pages/group (`analysisLibraryAllPages`, `analysisLibraryPages`, `generalChemPlatform11/12`, `physicsPlatform14`, and the Stage 15 tool list in
`biologyPlatform15`); they pass (143/143). **Not caused by this stage:** `ui10.test.mjs` "subject registry: five branches…" expects three available subjects
but Stage 15 already made Biology a fourth (count was 4 at `bc24bdf`); `branches.test.mjs` has a known-gap TODO. Not run: the full `npm test`, organic/synthesis suites.

## 11. Browser verification and screenshot inspection
`scripts/browser/stage16LiveCheck.mjs` (headless Chrome, production build): **124/124**, no page exceptions. Covers navigation (all Biology tabs, Organic/Physics/
General tabs unchanged), lac under four lactose/glucose conditions, two-copy cis effect, component selection, trp repression vs attenuation (5 mutation cases),
eukaryotic cis/trans/uncertain cases, monohybrid/dihybrid/incomplete/X-linked/ABO crosses, linked genes (r = 0.2, 0.35, 0.5, invalid 0.7, repulsion), mitosis
and meiosis counts at every stage, bivalents and chiasmata, crossing over, both nondisjunction types, Play/Pause, chromosome selection by click and keyboard,
Genetics ↔ Meiosis ↔ DNA → RNA → protein hand-offs and gamete-frequency agreement, Explore/Practice/Challenge of all three tools, save → reopen, autosave restore
after reload, no overflow and a paper-coloured diagram for 3 tools × (1440, 820, 375) × (light, dark), phone one-cell focus view.
Screenshots were inspected (`node_modules/.cache/pc-live16`, `pc-live16c`, git-ignored). Defects found by inspection and fixed: diagrams rendering at
minimum width; **upper-case table headers turning lowercase alleles into capitals** (Punnett and distribution tables); lac row title colliding with the
repressor; operator label clipped; bivalent allele labels crowding (now one label per locus on the outer side unless sister alleles differ); blank first
column in the Punnett table; "M/P" tag overlapping the parent label; eukaryotic nucleosomes overlapping DNA elements; trp ribosome drawn under the wrong
residue and overlapping its label; arcs crossing region labels; anaphase chromosomes overlapping at the spindle midline; Trp icon colliding with the
hairpin label; layout select overflowing its panel; tiny single-cell view on phones.

## 12. Build, TypeScript and lint
`npx tsc -p tsconfig.app.json --noEmit` and `npm run build`: pass (new lazy chunks: Regulation 36.6 kB, Genetics 17.3 kB, Cell division 25.2 kB; built in ~6 s).
`npx eslint .`: 18 problems, the same files as at Stage 15 (none in files touched by this stage); touched paths lint clean.

## 13. Performance and memory
Tests and browser runs were single-process (no overlapping runs); free memory was not measured. `meiosisDistribution` for a dihybrid builds 64 core runs and
for linked genes 40 (instant). One live-check run takes about four minutes. Leftover headless Chrome processes from earlier runs occasionally stop the next
launch (`Timed out waiting for Chrome`); only task-owned processes (profile `pocketchem-chrome-*`) were terminated.

## 14. Unsupported systems
Other operons (ara, gal…), riboswitches, RNA interference, alternative splicing control, insulators; polygenic/quantitative traits, epistasis, sex-linked
dominant and Y-linked traits, pedigrees, population genetics, double crossovers/interference, three-point crosses, meiosis of the X/Y pair, polyploidy,
chromosome structure changes, multi-chromosome meiosis beyond two pairs, planned items remain unbuilt (Cell structure explorer, Population genetics,
Physiology pathways, Evolution and phylogenetics).

## 15. Commits
- `a505bfe` feat(biology): shared chromosome/allele model, genetics, mitosis and meiosis, and gene-regulation engines
- `956211f` feat(biology): Gene regulation, Genetics & inheritance and Mitosis & meiosis tools with persistence and navigation
- final commit: registry-test updates, visual fixes from screenshot inspection, browser check, docs and this handoff (see `git log`)

## 16. Final Git status
Only the five long-standing untracked files listed in section 1; nothing staged.

## 17. Recommended Stage 17 scope
Biology depth rather than breadth: (1) pedigree analysis built on the shared chromosome model (X-linked and autosomal recessive pedigrees from genotypes);
(2) a second regulation system (ara or gal operon, or a riboswitch) reusing the cis/trans engine; (3) a hand-off from the trp/lac regulatory elements to
sequence-level mutation views; (4) persist Practice quiz progress; (5) add the Stage 16 live check to a documented single-process runner that also reaps
Chrome processes. Alternatively start Biochemistry (enzyme kinetics) with the same learning-mode pattern.
