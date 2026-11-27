# Stage 19 handoff: unified scientific platform and interface integration

## 1. Verified starting checkpoint
Branch `stage10-ui-overhaul`, HEAD `3c20a1d` (Stage 18 final). Untracked and preserved: `CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`. A pre-existing git stash (`phase1-synthesis-reliability`) was left untouched. Node v24.21.0. I ran `git stash` once by mistake and restored it immediately with `git stash pop`; nothing was lost.

## 2. Unified scientific search
`Ctrl/Cmd+K` or the shell's **Search** button opens an accessible dialog (combobox + listbox, focus trap, Escape, focus returns to the opener). Search-as-you-type over a typed local index; subject filters (five subjects) and type filters (All / Concepts / Tools / Saved); each result shows its kind, subject, summary and why it matched; keys: Up/Down/Home/End/Enter/Esc. It does not touch molecule input and says so in its empty state. No external service.

## 3. Coverage and ranking
`src/utils/concepts/conceptIndex.ts`: 40 hand-written concepts across all five subjects (every example in the brief), plus one tool entry per registry tool generated from `SUBJECT_TOOLS`, so destinations cannot go stale. `validateConceptIndex()` fails on any destination or related concept that is not real. Ranking is a fixed ladder (exact name 1000, alias 900, name prefix 800, alias prefix 700, name words 600, alias words 500, related term 450, spread 350, tool description 250, one-word typo 200, description 120); ties break on concept, tool, saved, then name, then key. Typo tolerance applies only to one query word of 5+ letters at edit distance 1 and is labelled "approximate". A tool with the same name and destination as a matched concept is not listed twice. Verified in the browser: `ATP` ranks ATP and energy coupling first, then the cycle, oxidative phosphorylation, enzyme kinetics and Gibbs energy, each with a reason; `peptide` gives peptide bonds, Translation and the peptide-builder tool; `pH` gives pH (acid-base analyzer) and amino-acid ionization.

## 4. Cross-subject connections
`utils/concepts/relations.ts`: 5 relation types (related, prerequisite, mechanism, continues, tool), 19 relations, each with an explanation and, where two models do not exchange numbers, a caution (tested). Examples: amino acids to acid-base "No pKa is copied across"; enzymes to glycolysis "does not predict the flux"; thermodynamics to metabolism "does not predict cellular concentrations, rates or metabolic flux". `components/ui/RelatedConcepts` ("Continue learning") appears on 12 tools (Translation, Transcription, Gene regulation, DNA to RNA to protein, Amino acids, Enzymes, Thermodynamics, Acid-base, Kinetics, Work and energy, RC transient, Integrated map). Links open through `NavigationContext.openDestination`, which uses the same `switchPage / switchGeneralTool / switchSubject` as the tab bar, so unsaved work is flushed first and history follows.

## 5. Supported context transfers (explicit click only, validated, one-shot)
- Translation to the Biochemistry peptide builder (existed since Stage 16/17): now through `preparePeptideContext` (strict one-letter sequence, N to C order kept, cut at 30 residues and said so, no folded structure implied).
- New: Transcription to Translation. The finished mRNA (cap and tail omitted) and the organism are validated by the Translation validator; the user sees "Loaded the mRNA ..." and the button states it replaces the mRNA.
- Not implemented, by design (no justified numeric mapping): amino-acid pKa to the acid-base tool; enzyme kinetics to metabolic flux; thermodynamics to cellular rates. These are navigation plus explanation. Gene regulation to Translation is navigation only (the regulation diagrams carry no sequence).

## 6-8. Organic layout work (presentation only; no engine file changed)
I inspected populated states of the six pages (and Conformations as the reference) before changing anything. Defects found by looking, and changes made:
- Spectroscopy: the sticky, self-scrolling input card hid the name field under the pinned action row on viewports shorter than the card (measured). It is now static unless the viewport is at least 1200 px tall. Added a "Predicted, not measured" note beside the results.
- Ranking: ordering logic was implicit. Added "How the order was decided" (criterion, direction, how many ranked, ties, how many unranked and why) and a "Not ranked" state (a dash with a screen-reader label, after a first attempt clipped as "NO/T RANK" on a phone).
- Reactions: 12 equal cards over about 7,400 px with no overview. Added "Outcomes at a glance" (alternatives, not steps; status counts; jump list). Cards are unchanged.
- Multi-Step: added a "Route at a glance" ordered list (step, title, reagents) above the existing step cards and advisory text.
- Multi-Catalytic: the "Choose a reaction" list had overlapping rows (each subtitle over the next title) and a near-invisible grey subtitle in the light theme; fixed. A populated Workspace result (inventory, history, per-step conditions, assessment) was inspected.
- Properties: populated dashboard inspected at all sizes; no change needed.
- CSS order: `concepts.css` was imported before `App.css`, so one override silently lost; it now loads after `ui.css`.
Not done: see section 16.

## 9. Scientific provenance (Phase D)
`utils/biochem/metabolism/provenance.ts` and `ProvenancePanel` (collapsed "Sources and verification status" on the five metabolism tools). 17 claims, three honest statuses. Sources actually opened and read: OpenStax *Biology 2e* sections 7.2, 7.3, 7.4 (page URLs, access date 2026-11-15; no page numbers or quotations were invented).
- Source-checked: glycolysis 4 ATP formed, 2 used, net 2, and 2 NADH; pyruvate oxidation releases CO2 and NADH per pyruvate (2 CO2 per glucose); the cycle releases the other 4 CO2 and makes one GTP/ATP per turn; ATP yield proportional to protons pumped, FADH2 bypassing complex I.
- Partly checked: ADP activation of PFK; ATP/NADH/ADP regulation of IDH and alpha-KGDH and ATP on citrate synthase (the page does not list NADH on citrate synthase); cyanide and uncouplers; the 3 NADH per turn count.
- Unverified (stated as such in the UI): the 4/4/2 proton stoichiometry (10 and 6 per pair; the OpenStax figure uses simpler numbers), about 2.5 / 1.5 ATP per carrier, 30/32 ATP per glucose, gluconeogenesis bypass details, F2,6BP and AMP effects, the balanced-network convention.
NCBI Bookshelf (Berg) answered automated requests with a reCAPTCHA page, so nothing is attributed to Berg, Lehninger or Nelson and Cox as checked. Numeric source agreement is tested against the model. No metabolic model value changed and no scientific error was found.

## 10. Navigation and accessibility
One registry, no second navigation system. Search opens every tool; related links work; deep links and Back/Forward verified (search, tool, Back, Forward); a saved Biology analysis opened from a Physics page switches subject and tool. The dialog is `role=dialog aria-modal`, the input a combobox with `aria-activedescendant`, an `aria-live` result count, `aria-keyshortcuts` on the button, 44 px targets on phones, reduced-motion respected, no double focus ring. New panels use real headings, lists and notes. Not done: a textual-alternative audit of the existing interactive diagrams.

## 11. Scientific behaviour preservation
Under `src/utils`, only the new `concepts/`, the new `metabolism/provenance.ts` and a one-variant type addition in `biology/handoff16.ts` changed; the reaction, synthesis, spectroscopy, ranking and nomenclature engines are untouched. All existing suites run below pass.

## 12. Automated tests (sequential, `--test-concurrency=1`)
New: `conceptSearch19` (28), `conceptRelations19` (19), `biochemProvenance19` (12). Combined group (persistence, Saved Analyses, multicatalytic persistence, ranking 9F/9G, reactionWorkspace, ui10, uiPolish, conformations, General Chemistry / Physics / Biology / Biochemistry platform suites, metabolism 18, and the three new files): 708/708 after one fix. A pre-existing assertion in `biochemPlatform17` checked the source text `slice(0, PEPTIDE_LIMITS.max)` inside `PeptideHandoff.tsx`; the cut moved to `context.ts`, so that assertion now checks the new location and the behaviour is covered by `conceptRelations19`. The full `npm test` and the roughly 28 s synthesis search-budget suites were not run. Keyboard and dialog behaviour is covered in the browser (no DOM test library exists in the repo).

## 13. Browser verification (production build, real headless Chrome, one at a time)
- `stage19LiveCheck.mjs` 56/56: open by button, Ctrl and Meta (Alt+K does not), empty state, 8 search probes, filters, unsupported-topic guidance, keyboard selection, Enter navigation, Back/Forward, mouse selection, inputs untouched by opening search, Translation to peptide builder (MAKLGY intact, notice), amino acids to acid-base, Transcription to Translation (mRNA equal), enzyme and thermodynamics relations with cautions, saved-analysis reopening across subjects, other subjects' tab lists, dialog at 375/820/1440 in both themes.
- `stage19LayoutCheck.mjs` 48/48: Properties, Ranking, Spectroscopy, Reactions, Multi-Step, Multi-Catalytic populated, at 1440 light, 820 dark, 375 light, 375 dark: new markers present, zero page-level horizontal overflow.
- Regression: `stage18LiveCheck` 108/108, `stage10bLiveCheck` 27/27.
- Screenshots in `node_modules/.cache/pc-live19` were opened and inspected (search dialog at three widths, Ranking, Spectroscopy, Reactions, Multi-Step, Multi-Catalytic, Properties). The very tall Reactions tablet capture was too small to read in detail; it was checked only for overflow and markers.

## 14. Build, TypeScript, lint
`tsc -b` clean; `npm run build` succeeds (existing chunk-size warning). ESLint clean on all new and changed files except `SpectroscopyPage.tsx`, whose 3 errors and 1 warning (lines about 1465-1671) are the long-standing baseline, nowhere near this change. Repository-wide lint not run.

## 15. Resource and performance observations
No memory problems; Node tests and browsers ran sequentially, one headless Chrome at a time (the 48-check layout run takes about 15 minutes). Search is synchronous and effectively instant (the 28-test file runs in about 2.4 s). A hung `python -` call (VS Code REPL) was stopped; no task-owned process remains.

## 16. Remaining unsupported behaviour and known limits
- The concept index is hand-maintained (40 concepts); coverage is substantial, not exhaustive; search is lexical, not semantic.
- The Reactions result list is still very long (about 13,000 px at tablet width); only an overview and jump list were added, and the per-card hierarchy (primary outcome first, competing outcomes grouped) is not redone.
- Multi-Catalytic has no objective/branch summary strip; Properties was not restructured.
- Ketcher's own toolbar is clipped inside its frame at 375 px (embedded editor, unchanged).
- Provenance covers metabolism only; the proton and ATP-per-carrier numbers remain recalled, not verified.
- Related panels cover 12 tools, not every page; Physics and General Chemistry links are conceptual only.
- Planned subjects untouched; offline behaviour was not separately exercised (no network calls were added).

## 17. Local commits (nothing pushed)
- `f0ab426` search index, ranking, dialog, relations, Continue-learning panels, Transcription to Translation handoff, tests
- `e05f1f0` Organic results-layout fixes and summaries, CSS-order fix, layout check
- `0f14293` metabolism provenance panel and tests, Stage 19 live check, docs
- the commit containing this handoff follows (see `git log`)

## 18. Final Git status
Branch `stage10-ui-overhaul`; only the five long-standing unrelated untracked files remain (`CLAUDE.md`, `stage5-changes.patch`, `stage5-status.txt`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`).

## 19. Recommended Stage 20 scope
1. Reactions: a real results hierarchy per card (primary outcome first, competing outcomes grouped) and a Multi-Catalytic objective/branch summary.
2. Check the 4/4/2 proton and ATP-per-carrier claims against a retrievable textbook source, or keep them labelled.
3. Related panels and concept coverage for the remaining tools, with an authoring check that every new tool has a concept entry.
4. A textual-alternatives audit for the interactive diagrams.
