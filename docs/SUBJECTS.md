# Subject architecture

PocketChem is one application with several subject branches, not several applications. The shell, themes, design tokens,
learning-mode switch, diagram frame, chart, saved-analysis library and persistence are shared. A subject contributes tools.

## Registry (`src/navigation/subjects.ts`)

| Piece | Purpose |
| --- | --- |
| `SUBJECTS` | The five subjects (organic, general, physics, biology, biochemistry): label, product `mode`, `status` (`available` or `planned`), URL `slug`, tagline, and the *planned* areas shown on the preview. |
| `SUBJECT_TOOLS` | Tools per subject (`id`, URL `slug`, label, summary, group, icon). Planned subjects have an empty list: they cannot render a tool until implemented. |
| `routeHash` / `parseRoute` | `#/<subject>/<tool>` deep links. Unknown, malformed or planned routes parse to `null` and are ignored. |
| `isAvailable(id)` | `status === "available"` **and** at least one tool. |

## Two product patterns

- **Scientific Workbench** (Organic, General, Physics): inputs, numerical parameters, diagrams and graphs, results, interpretation.
  Reuse `ToolHeader`, `Panel`, `DiagramFrame`, `LineChart`, `KeyFigures`, `Explanation`, `Callout`, `Disclosure`, `Segmented`.
- **Interactive Learning** (Biology, Biochemistry): labelled explorable diagrams, Explore / Practice / Challenge, progressive
  explanations. Reuse `LearningModeSwitch` (a page declares only the modes it actually supports) and `DiagramFrame`.
  General Chemistry already uses Explore + Practice (predict-then-observe) and Conformations uses Explore + Practice.

These are shared vocabularies, not templates; a tool may use whichever parts it needs.

## Adding a subject (checklist)

1. Mark it `available` in `SUBJECTS`; add its tools to `SUBJECT_TOOLS` (ids stable, slugs unique within the subject).
2. Render its panels in `App.tsx` under the same shell (see the `activeSubject === "general"` branch). Lazy-load tool pages.
3. Evidence level: show an `EvidenceBadge` (`estimate`, `rule`, `model`, `saved`) so uncertainty is visible.
4. Persistence: add a `PersistedPage` in `utils/persistence/workspaceStore.ts`, its subject in `PAGE_SUBJECT`, a workspace
   module with `validateInputs` / `validateResults` and an engine version, and register it in `analysisLibraryApp.ts`
   (`OPENABLE_ANALYSIS_PAGES`, `ANALYSIS_APP_PAGE`, validators) and the labels in `SavedAnalysesPage.tsx`.
5. Tests: numerical references derived independently of the implementation; subject/route tests; a saved-record round trip;
   a live-browser check (copy `scripts/browser/stage11LiveCheck.mjs`).
6. Do not show calculators or buttons for things that do not exist; list them as *Planned* only.

## Saved records and subjects

Saved-analysis records carry an explicit `subject`. Records written before Stage 11 have no `subject` field and are read as
`PAGE_SUBJECT[page]` (all Organic Chemistry). A record whose `subject` contradicts its page is reported as damaged and is
never opened. The record schema version is unchanged (the field is additive and optional on read).

## Shared scientific components

- `ui/LineChart.tsx`: dependency-free SVG chart in real pixels (labelled axes with units, nice ticks, shaded bands,
  labelled markers, a draggable/keyboard-operable "current" marker that is a `role=slider`). Callers pass numbers from
  their model so the plot and readouts cannot disagree. Put it in a `DiagramFrame` (paper surface).
- `utils/chartTicks.ts`: tick generation.
- `utils/generalChem/format.ts`: significant-figure and pH formatting.

## Physics (Stage 13)

Physics is an implemented Scientific Workbench subject with tools `phOverview`, `phMechanics`, `phCircuits`, `phRc` and `phSaved`
(`PHYSICS_TOOLS`, routes `#/physics/overview|mechanics|circuits|rc-transient|saved`). `App.tsx` keeps one non-Organic tool state
(`SubjectToolId`); `switchSubject` selects the open tool when it belongs to the target subject and otherwise that subject's Overview.

- Pure models (no React) live in `src/utils/physics/`: `mechanics.ts` (analytic constant-acceleration kinematics, landing event, summaries),
  `circuits.ts` (series/parallel resistor trees, KCL/KVL checks, editing helpers), `circuitLayout.ts` (the drawing derived from the same tree),
  `rc.ts` (first-order RC transient), `simClock.ts` (frame-rate-independent clock arithmetic), `format.ts` (SI formatting).
- Simulation UI helpers are in `src/components/physics/sim.tsx` (`useSimClock` with requestAnimationFrame only while playing, `SimControls`,
  `ParamSlider`, arrows) and `useSimTime.ts` (shared time kept local and committed to saved inputs when the user stops).
  Charts reuse `ui/LineChart`; autosave and Saved Analyses reuse `generalChem/useGcWorkspace`.
- Persistence pages `mechanics`, `circuits`, `rc` (subject `physics`) are validated in `utils/persistence/physicsTools.ts`, which also rejects
  contradictory records (a time beyond the end of the motion, a selected component that is not in the circuit).
- Not supported, stated in the tools: air resistance, forces, non-series/parallel circuit topologies, AC, inductors, multi-capacitor circuits.

### Physics, Stage 14 additions

Three more Physics tools share the Stage 13 simulation infrastructure (`useSimClock`, `useSimTime`, `SimControls`, arrows, `LineChart` via
`TimeChart`, `useGcWorkspace`, `GcPredictPanel`): `phForces`, `phEnergy`, `phCollisions` (routes `#/physics/forces|energy|collisions`, pages
`forces`, `energy`, `collisions`). Tool groups are now `analyze`, `mechanics`, `electricity`, `synthesize`, `library` (`TOOL_GROUPS`); the shell
shows a group label only when a subject has tools in it, so Organic and General are unchanged.

- `utils/physics/forces.ts`: static/kinetic friction engine (piecewise analytic motion), normal force N = mg cosθ − F sinφ with contact loss, inclines,
  and a block + hanging mass on one friction engine. `energy.ts`: four time-based scenarios with one ledger KE + PE + Q = E(0) + W_applied.
  `collisions.ts`: momentum + restitution, collision only when the bodies are closing, impulse always, average force only with a given duration.
- Learning content (`mechanicsLearning.ts`) includes a free-body-diagram quiz whose correct answer is computed from the physics.

## Biology (Stage 15)

Biology is an implemented Interactive Learning subject with tools `bioOverview`, `bioReplication`, `bioTranscription`, `bioTranslation`,
`bioDogma` and `bioSaved` (`BIOLOGY_TOOLS`, routes `#/biology/overview|dna-replication|transcription|translation|dna-rna-protein|saved`; new tool
group `geneExpression`). Pages are lazy-loaded in `App.tsx` and share `useGcWorkspace` (autosave, Save Analysis, open-from-Saved).

- Pure engines (no React) live in `src/utils/biology/`: `sequence.ts` (validated parsing, strands, 5'/3' helpers), `geneticCode.ts`,
  `translate.ts` (frames, ORFs), `mutations.ts` (classification by translating the mutant), `dogma.ts`, `replication.ts` (one fork, leading/lagging,
  Okazaki fragments, primer removal, ligation), `transcription.ts` (bubble, cap, splicing, polyadenylation), `translation.ts` (A/P/E-site timeline),
  `bioLearning.ts` (questions derived from engine state), `bioSummary.ts` (summaries and assumptions), `examples.ts`.
- Every timeline is a list of snapshots built from the sequence; diagrams (`ReplicationDiagram`, `TranscriptionDiagram`, `RibosomeDiagram`) only draw one snapshot.
- Each tool has Explore / Practice (labels hidden, questions) / Challenge (predict, then reveal); the step player (`bioHooks.ts`) is the only timer.
- Persistence pages `replication`, `transcription`, `translation`, `dogma` (subject `biology`) are validated in `utils/persistence/biologyTools.ts`; a
  step beyond the timeline, an invalid sequence or a mutation that does not fit make a record damaged.
- Bacterial and eukaryotic machinery are kept apart (replication enzymes, σ factor vs general factors, no splicing/cap/poly(A) in bacteria, RF1/RF2 vs eRF1).

## Biology (Stage 16): regulation, genetics and cell division

Three more working tools: `bioRegulation` (`#/biology/gene-regulation`, group `geneExpression`), `bioGenetics` (`#/biology/genetics`) and `bioDivision`
(`#/biology/mitosis-meiosis`), both in the new group `inheritance` ("Genetics & cell division"). Saved pages: `regulation`, `genetics`, `celldivision`
(engine versions in `utils/persistence/biologyTools16.ts`; strict validators; every derived result is rebuilt on open).

- `src/utils/biology/chromosome.ts` is the shared chromosome/allele model: loci with a stated genotype → phenotype rule (complete, incomplete,
  codominant, multiple alleles, X-linked), layouts (which loci lie on which chromosome pair), individuals (maternal/paternal homologs), chromatids
  and the one crossover operation. `genetics.ts` (exact fractions: gametes, crosses, test cross, two-locus linkage with a stated recombination
  fraction) and `cellDivision.ts` (mitosis and meiosis stage engines, crossing over, independent assortment, nondisjunction) both use it, so a genotype
  set on one page is the object segregated on the other. `meiosisDistribution` averages the meiosis engine over every equally likely setting and is
  tested to equal the Genetics model exactly; one illustrated meiosis is never presented as a distribution.
- `geneRegulation.ts` holds the lac operon (repressor, allolactose, CAP–cAMP, operator/promoter mutations, a second copy for cis/trans), the trp operon
  (repression separate from attenuation; a schematic leader whose 1:2/2:3/3:4 pairing is derived from complementarity and ribosome coverage) and a
  small eukaryotic model (enhancer, silencer, Mediator, chromatin, histone acetylation, DNA methylation, Pol II; some combinations are *uncertain*).
  Levels are ordinal and qualitative, never rates.
- Hand-offs between tools (`handoff16.ts`) are one-shot and validated by the receiver: Genetics → Mitosis & meiosis → Genetics, and Genetics →
  DNA → RNA → protein (an allele shown as a specified sequence variant; no phenotype is inferred from sequence).
- Diagrams are SVG with fixed paper colours, shapes and labels that do not rely on colour alone (maternal solid, paternal hatched), selectable
  components (keyboard operable), reduced-motion respected, and a focused one-cell view on phones.
- Tests: `biologyRegulation16`, `biologyGenetics16`, `biologyDivision16`, `biologyPlatform16`; browser check `scripts/browser/stage16LiveCheck.mjs`.

## Biochemistry (Stage 17): amino acids, protein structure and enzymes

Biochemistry is the fifth available subject (Interactive Learning). Tools: `bcAminoAcids` (`#/biochemistry/amino-acids`), `bcProteins`
(`#/biochemistry/protein-structure`), `bcEnzymes` (`#/biochemistry/enzymes`), all in the group `biomolecules`, plus Overview and Saved. Saved pages
`aminoacids`, `proteins`, `enzymes` (subject `biochemistry`; versioned in `utils/persistence/biochemTools17.ts`, strict validators, derived results rebuilt on open).

- `src/utils/biochem/aminoAcids.ts` is the single reference table for the 20 standard L-amino acids: SMILES with explicit stereochemistry (the one chemical
  identity used for drawing, peptide assembly, formulas and masses), textbook pKa values (Lehninger), Kyte–Doolittle hydropathy, Zamyatnin volumes, class,
  CIP descriptors. `scripts/tests/biochemData17.test.mjs` checks every row against RDKit (formula from InChI, CIP labels, exact mass) and against separately
  typed reference values. `ionization.ts` (Henderson–Hasselbalch charge, pI, titration curve), `peptide.ts` (strict parsing, assembly SMILES with atom roles,
  formula, masses, GRAVY, peptide-bond facts), `aaStructure.ts` (RDKit substructure roles and highlighted SVG; reuses the Organic Chemistry RDKit loader).
- `protein.ts` holds ideal secondary-structure geometry (α-helix i→i+4 bonds, helical wheel, β-sheet bond patterns, turns), the Ramachandran region
  classifier (separate glycine and proline regions), a qualitative folding-forces demonstration (pH, thermal energy, reducing agent, denaturant on a made-up
  domain) and curated substitutions (sickle-cell Glu6Val, proline in a helix, an insulin disulfide, a buried leucine, a salt bridge). It makes no folding
  prediction and gives no stability numbers; each substitution reports what the model *supports* and what is *uncertain*.
- `enzyme.ts`: Michaelis–Menten kinetics with the general reversible-inhibition scheme (α = 1 + [I]/Ki, α′ = 1 + [I]/Ki′), apparent parameters, species
  fractions, double-reciprocal lines, a schematic energy profile (RT ln 10 per decade), three binding models and one worked serine-protease mechanism.
  The velocity curve, the Lineweaver–Burk lines, the species bars and the readouts all come from the same α and α′.
- `learning.ts` derives every Practice question and Challenge from those engines (never typed in separately).
- Diagrams are SVG with fixed paper colours, glyphs or text beside every color (class shapes ● ⬢ ◆ ▲ ▼, Ramachandran glyphs, ✔ ~ ✖), keyboard-operable
  residues and Ramachandran marker, and the shared `LineChart` (a slider marker) for titration and kinetic curves; structures come from the local RDKit build
  (no network).
- Hand-off: the Translation tool's final peptide opens in the peptide builder (`handoff16.ts`, kind `peptide`; validated by the receiver; peptides longer
  than 30 residues are cut to the explorer's limit and the page says so).
- Tests: `biochemData17`, `biochemModels17`, `biochemPlatform17`; browser check `scripts/browser/stage17LiveCheck.mjs`.

## Biochemistry (Stage 18): metabolic pathways

Five tools in the new `metabolism` group (`bcGlycolysis`, `bcGluconeogenesis`, `bcTca`, `bcEtc`, `bcMetabolism`; slugs `glycolysis`, `gluconeogenesis`,
`citric-acid-cycle`, `electron-transport`, `metabolic-map`). Saved pages `glycolysis`, `gluconeogenesis`, `tca`, `etc`, `metabolism`
(`utils/persistence/biochemTools18.ts`; strict validators, versioned, derived results rebuilt on open).

- `utils/biochem/metabolism/network.ts` is the single curated network: metabolites (id, formula, charge, carbons, compartments, optional RDKit-verified
  structure), enzymes, reactions (stoichiometry, direction, reversibility, compartment, pathway roles with per-glucose multiplicity), pathways and curated
  regulatory effects. `validateNetwork()` rejects duplicate ids, unknown references, bad coefficients, unavailable compartments and any reaction that does not
  balance for atoms and charge. One reaction is described once and may play several pathway roles (e.g. malate dehydrogenase: forward in the cycle, reverse in
  gluconeogenesis; succinate dehydrogenase is complex II).
- Bookkeeping convention: neutral acid forms with NAD⁺ as a cation and explicit H⁺, so atoms and charge balance exactly. The UI states this wherever it
  matters. Metabolites without a verified structure (CoA derivatives, nucleotides) are drawn schematically, never invented.
- `ledger.ts` sums stoichiometry × multiplicity (net equations, carrier ledgers, glucose totals, futile-cycle costs); ATP from oxidative phosphorylation is an
  estimate (10 and 6 H⁺ per electron pair, about 4 H⁺ per ATP, two shuttle options). `regulation.ts` gives only directions (higher, lower, reference,
  uncertain) relative to an all-normal reference; conflicting signals are reported as uncertain. `etc.ts` derives inhibitor/uncoupler outcomes from chain
  topology and stated rules. Nothing computes a rate, flux, concentration or time course.
- `learning.ts` generates Practice questions, predict-then-reveal challenges and integrated-map scenario statements (each labelled as following from
  stoichiometry, curated regulation, the respiratory model, or as not modelled) from those same modules.
- Diagrams are SVG on a paper surface (`LaneDiagram`, `CycleDiagram`, `MitoDiagram`, `MapDiagram`); on narrow screens they scroll sideways inside their frame and
  bring the selected part into view. Every node and arrow is a real metabolite or reaction and is keyboard-operable.
- Tests: `biochemMetabolism18` (network, glycolysis, gluconeogenesis, cycle, respiratory chain, RDKit structure checks), `biochemPlatform18` (navigation,
  validators, saved round trips, learning consistency); browser check `scripts/browser/stage18LiveCheck.mjs`.

## Cross-subject platform (Stage 19)

- **One registry.** `navigation/subjects.ts` stays the only list of subjects and tools. `utils/concepts/conceptIndex.ts` holds hand-written *concepts* (id, name, subject, summary, aliases, related terms, one destination, related concepts); *tool* entries are generated from `SUBJECT_TOOLS`, so a renamed or removed tool cannot leave a stale search result. `validateConceptIndex()` and `validateRelations()` fail on any destination or relation that does not name a real tool.
- **Search** (`utils/concepts/search.ts`, `components/shell/ConceptSearch.tsx`): local and deterministic. Fixed ranking ladder (exact name 1000, alias 900, name prefix 800, alias prefix 700, name words 600, alias words 500, related term 450, spread across fields 350, tool description 250, single-word typo 200, description 120); ties break on kind (concept, tool, saved), name, key. Typo tolerance is limited to one query word of 5+ letters at edit distance 1 and is labelled "approximate". Saved analyses are listed from the existing library and open through `openSavedAnalysis`. Ctrl/Cmd+K, the shell's Search button, subject and type filters, listbox keyboard navigation. It never resolves molecule names or SMILES (those stay in each tool's structure input).
- **Relations** (`utils/concepts/relations.ts`, `components/ui/RelatedConcepts.tsx`): five types (related, prerequisite, mechanism, continues, tool), each with an explanation and, where two models do not exchange numbers, a caution. A "Continue learning" panel appears on selected tools. Opening a link calls `NavigationContext.openDestination`, which uses the same switch functions as the tab bar (unsaved work is flushed first; the address bar and Back/Forward follow).
- **Context transfer** (`utils/concepts/context.ts`, `utils/biology/handoff16.ts`): only an explicit button moves data, through the one-shot handoff slot, validated by the destination's own validator. Supported: Translation → peptide builder (sequence, N to C, cut at 30 residues and said so) and Transcription → Translation (finished mRNA and organism). Not supported by design: amino-acid pKa to the acid–base tool, enzyme kinetics to metabolic flux, thermodynamics to cellular rates.
- **Metabolism provenance** (`utils/biochem/metabolism/provenance.ts`, `ProvenancePanel`): each claim is "checked against a source", "partly checked" or "not independently checked". Numeric claims are tested against the model.
- **Organic results layout**: Ranking shows how its order was decided; Spectroscopy labels results "predicted, not measured" and no longer hides the name field; Reactions lists its alternative outcomes at a glance; Multi-Step lists the route's steps at a glance; the Multi-Catalytic reaction list no longer overlaps rows.
- Tests: `conceptSearch19`, `conceptRelations19`, `biochemProvenance19`; browser checks `scripts/browser/stage19LiveCheck.mjs` and `stage19LayoutCheck.mjs`.
