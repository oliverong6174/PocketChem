# Stage 10B handoff — conformational name input, ranking, shared input, consistent tool headers

Branch `stage10-ui-overhaul`. Local commits only; nothing pushed. Stage 11 not started.

## What was done
1. **Conformations name/IUPAC input** — `MoleculeInputField` (`src/components/ui/`) replaces the SMILES-only box. Resolution is `resolveWithFallback` (`src/utils/moleculeInputFallback.ts`): always the shared `resolveMoleculeInput` (offline ChEBI names, SMILES, ambiguity/failure reporting). SMILES is loaded exactly as written. Examples are now entered by name through the same path.
2. **Conservative systematic-name reader** (`src/utils/conformations/systematicName.ts`) — consulted only after the shared resolver reports "not found", and its SMILES is re-validated through the shared resolver. Subset: substituted cyclohexanes (Me, Et, iPr, tBu, F, Cl, Br, I, OH) with cis/trans only for exactly two substituents on different carbons (verified against the computed chair, not assumed); 2,3-dihalobutanes with (2R,3R)/(2S,3S)/(2R,3S)/meso, verified against RDKit CIP labels. Names without cis/trans stay stereo-unspecified and the UI says so. Everything else is refused with the subset listed; ambiguous database names are reported, not resolved.
3. **Conformational stability ranking** (`ranking.ts`, `RankingList.tsx`) — automatic chair A/B ranking and six principal torsion conformers; user comparison list (max 5, de-duplicated, persisted in the workspace inputs, energies recomputed, never stored). Abstains with a reason where no parameters exist (no invented numbers); ties share a rank; hidden in Practice mode; states it ranks within one molecule only and points to the Ranking tool.
4. **Consistent organisation** — new `ToolHeader` primitive (group eyebrow, title, purpose, editor status, evidence badge, three-step strip) on Properties, Ranking, Spectroscopy, Reactions, Multi-Step, Multi-Catalytic (both the Workspace and Ordered-sequence modes' text preserved; the workspace "how steps run" caveat moved to a Callout).
5. **Molecule input layout** — MoleculeDrawer name entry: Add/Replace explanation hint (Reactions), `aria-describedby`, alert role on errors, wrapped full-width input with 44px buttons on phones. Enter/Add/Replace behaviour and processing callbacks unchanged.

## Bugs found and fixed during integration
- Saved-comparison validator had `/^d{1,4}$/` (missing `\d`), which would reject every saved chair face choice; caught by a new round-trip test.
- Legacy `.conf-smiles{display:flex}` landed on the new field wrapper and squeezed the input to a few characters (found in screenshots); fixed in `conformations.css`.
- Old persistence fixtures lacked `comparison`; updated (old saves load as `comparison: []`).

## Verification (this session)
- `tsc -b` clean; `vite build` succeeds (existing chunk-size warning).
- ESLint: 18 problems, all pre-existing engine/Spectroscopy/MoleculeDrawer baseline items; none in new files.
- Node tests: 399/399 on ui10, uiPolish, reactionWorkspace, conformations* (incl. 40 in the 10B/9N workspace files), persistence*, analysisLibrary*, multicatalyticPersistence.
- Live headless Chrome, production build: `stage10bLiveCheck.mjs` 27/27, `stage10LiveCheck.mjs` 30/30, `stage9nLiveCheck.mjs` 35/35.
- Screenshots inspected: Ranking, Multi-Catalytic, Conformations (desktop and 375px) after the layout fix.

## Not verified / limitations
- `synthesisUi.test.mjs` "explicit two-copy inventory" (~28 s search-budget test) fails; it fails identically on the pre-change baseline (engine untouched). Full `npm test` not rerun.
- Offline mode not separately exercised (no network calls added; names resolve from the bundled database).
- Reactions, Multi-Step, Multi-Catalytic, Spectroscopy internals (results areas) were given the shared header and consistent entry, not restructured onto `Workspace/Inspector`; Properties dashboard chip tabs unchanged. Conformations keeps its own header.
- Spectroscopy plots in light theme, Synthesis with a found route, and populated Multi-Catalytic inventory not visually inspected.
- `stage10ConfShots.mjs` hung when run in this session and was not relied on.
- Ranking values are the page's teaching model (A-values, simple torsion terms), not absolute or force-field energies.
- Untracked, left alone: `CLAUDE.md`, `stage5-*`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`.

## Commits
`git log --oneline` top three: Conformations feature commit, shared ToolHeader/input commit, live-check commit.
