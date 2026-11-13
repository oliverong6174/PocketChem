# Stage 15 handoff: first functional Biology branch

Branch `stage10-ui-overhaul`, starting checkpoint `a991ab1`. Nothing pushed. Stage 16 not started.

## 1. What was built
Biology is now an available Interactive Learning subject (`#/biology/...`) with a new tool group "Gene expression":

| Tool | Route | What it does |
|---|---|---|
| Overview | `#/biology/overview` | four working tool cards, planned list without buttons |
| DNA replication | `dna-replication` | one fork on a 8–40 bp duplex: helicase, topoisomerase, SSB, primase, leading and lagging polymerases, Okazaki fragments, primer removal, gap fill, ligase; fork direction, organism, fragment and primer length are inputs |
| Transcription & RNA processing | `transcription` | coding/template strands, transcription bubble with a 9 bp RNA–DNA hybrid, one nucleotide per step; bacterial σ-factor transcription; eukaryotic cap (≈20 nt), GU…AG splicing through a lariat (0–3 editable introns), cleavage at AAUAAA and poly(A) tail |
| Translation | `translation` | ribosome with E/P/A sites, codons, tRNA anticodons (3'→5' under the codon), peptide chain, translocation, termination with RF1/RF2 (bacteria) or eRF1 (eukaryotes), no-start / no-stop / partial-codon cases, bacterial choice of start AUG |
| DNA → RNA → protein | `dna-rna-protein` | one intronless gene: coding/template strands, mRNA, anticodons, amino acids in a codon ladder, three reading frames, every AUG, substitution/insertion/deletion with the consequence derived by translating the mutant |
| Saved | `saved` | shared library; records show "Biology · <tool>" |

Every tool has **Explore** (labelled, explanations), **Practice** (labels hidden until revealed; questions whose answers come from the engine state) and **Challenge** (predict, then the next step or the mutation is revealed).

## 2. Architecture
- Pure engines `src/utils/biology/`: `sequence.ts`, `geneticCode.ts`, `translate.ts`, `mutations.ts`, `dogma.ts`, `replication.ts`, `transcription.ts`, `translation.ts`, `bioLearning.ts`, `bioSummary.ts`, `examples.ts`. No React, no network.
- UI `src/components/biology/` (pages, three SVG diagrams, `bioShared.tsx`, `bioHooks.ts` with the only timer), `src/styles/biology.css`.
- Persistence `src/utils/persistence/biologyTools.ts`: pages `replication`, `transcription`, `translation`, `dogma` (subject `biology`), strict validators; wired in `workspaceStore.ts`, `analysisLibrary.ts`, `analysisLibraryApp.ts`, `SavedAnalysesPage.tsx`, `App.tsx`, `subjects.ts`. New icons `dna`, `rna`, `ribosome`; `ToolHeader` accepts group "Gene expression".
- Docs: `docs/SUBJECTS.md` has a Biology section.

## 3. Scientific assumptions (each also shown in the tool)
- Orientation is explicit everywhere (5'/3' labels, template drawn 3'→5' under the coding strand, antiparallel daughters, arrowheads at 3' ends). The leading template is derived from the fork direction (right → bottom strand; left → top strand).
- Replication: one fork (a real origin has two); primers and Okazaki fragments of a few nucleotides; one nucleotide per step; no proofreading, mismatch repair or supercoiling model. The leading primer at the origin and the last lagging primer stay RNA in the segment (stated).
- Transcription: promoter/terminator described, not drawn; processing shown sequentially although it overlaps transcription in cells; only GU–AG introns; branch point = last A before the terminal AG (real ones are upstream, degenerate); cleavage 15 nt after the first AAUAAA (real 10–30); tail drawn as 20 A.
- Translation: standard code only; one tRNA per codon (no wobble); only AUG starts; Shine–Dalgarno and Kozak described, not scored; factors named not simulated.
- Mutations: single edits (insertion/deletion 1–6 nt); the peptide is read in the original start's frame; no functional predictions.
- Bacterial and eukaryotic machinery are never mixed (tests assert that bacterial enzymes/σ never appear in eukaryote captions and the reverse; bacteria have no cap/splice/poly(A)).

## 4. Tests (one process at a time; machine has 16 GB)
- `scripts/tests/biologyCode15` (28), `biologyProcesses15` (50), `biologyPlatform15` (22): **100/100**. Expected values are hand-derived or computed with independent helpers in the test: codon degeneracy per amino acid (sums to 61), spot codons, reverse complements, three-frame reads, worked mutation cases, semi-conservative daughter strands for both fork directions, leading/lagging roles, no synthesis on double-stranded template, prefix property of the leading strand, one primer per fragment, ligase ordering, intron rules, branch point, poly(A) position (25 + 6 + 15), M-A-K-L-G-Y for three gene encodings, A/P/E movement, release factor by stop codon, question answers vs the model, strict validation, save/open round trips, existing-record coexistence.
- Existing suites rerun (Physics 13/14, General Chemistry 11/12, analysis library, persistence): **456/456**. Eight existing assertions encoded the pre-Biology state (Biology "planned", fixed page and group lists) and were updated to the new state in the same commit; no behaviour of Organic, General or Physics changed.
- `npx tsc -p tsconfig.app.json --noEmit` and `npm run build`: pass. `npx eslint .`: 18 problems, all in files this stage did not touch (`KetcherFrameApp`, `MoleculeDrawer`, `SpectroscopyPage`, `stereoNomenclature`, `reactions/engine/*`, `depictionEngine`); none in new or edited Biology/App/navigation code.
- Not run: the full `npm test` and the organic/synthesis regression suites (no Organic code was changed).

## 5. Browser verification
`scripts/browser/stage15LiveCheck.mjs` (headless Chrome, production build): **60/60**. Covers navigation and unchanged Organic/Physics tabs; replication stepping, diagram/state agreement, bacterial vs eukaryotic captions, direction switch and final strands, invalid input, Practice hide/reveal and quiz, Challenge lock/reveal, save → change → reopen; transcription cap timing, finished mRNA, lariat/tail, bacterium switch, invalid splice site; translation tRNA sites, release factor, start-AUG choice; dogma peptide, missense, frameshift, Challenge apply; no page overflow and a paper-coloured diagram for 4 tools × (1440, 820, 375) × (light, dark); no page exceptions. Screenshots in `node_modules/.cache/pc-live15` (git-ignored) were inspected: replication (desktop, phone), transcription mid-elongation and processed, ribosome (desktop, phone dark). Defects found by inspection and fixed: overlapping row labels and polymerase markers in the fork diagram; the bacterial gap filler named Pol III instead of Pol I; polymerase box covering bases in the transcription diagram; ribosome subunit labels colliding with tRNA amino acids; ribosome view not centred on the sites at phone width.

## 6. Limitations
- Diagrams are wide; at 375 px they scroll horizontally inside the figure (the page itself never overflows). Transcription/replication auto-scroll to the active site.
- Free-memory behaviour was not measured; processes were run singly with a 1.5 GB Node heap.
- The Copy button for the mRNA relies on the clipboard API and is not exercised in the live check; there is no direct hand-off into the Translation tool (the user pastes the mRNA).
- Quiz progress is not persisted (only inputs, mode and step); learning scores are session-only.
- Not pixel-inspected: every tool/viewport/theme combination (assertions cover overflow and paper colour for all); the RNA-processing diagram with two introns at phone width; tablet shots.
- Accessibility: diagrams are `role="img"` with state in the label and the text caption repeats each step; there is no per-element keyboard navigation inside the SVGs.

## 7. Commits
- `ca945ff` feat(biology): sequence utilities, genetic code, reading frames, translation, mutations
- `ee621f8` feat(biology): replication, transcription/processing and ribosome step engines
- `87b85a2` feat(biology): the four tools, persistence, navigation, existing-test updates
- final commit: browser check, docs and this handoff (see `git log`)

Final Git status: only the long-standing untracked files (`CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`), left untouched and unstaged.
