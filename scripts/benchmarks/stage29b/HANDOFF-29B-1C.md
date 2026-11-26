# Stage 29B-1C handoff (written at a usage limit; final re-verification incomplete)

Start: `5ede6a0`, branch `stage10-ui-overhaul`. Nothing pushed. Stage 29B-2 not started.

## Verification status (read first)
- Last complete browser run: `scripts/browser/stage29b1cLiveCheck.mjs` 100/100 on the production build. It was run BEFORE the last changes (lint refactor of MolecularFigure/MoleculeViewer, ref via `useImperativeHandle`, removal of the "Editor ready" chips, Ranking instruction line).
- The rerun after those changes did NOT finish (stalled past 10 minutes after the first transfer screenshot; stopped, cause not investigated). **Re-run it first.** A leftover headless Chrome or `vite preview` on port 4430 may need closing.
- After those changes: `tsc -b` clean, build succeeds, new unit tests 17/17.
- Focused regression suites 418/418 (run before the MolecularFigure refactor). Unrestricted `npm test` not run.
- Lint: new files clean. SpectroscopyPage errors are pre-existing. Full changed-file lint was not repeated after the last edits.

## Implemented
- Viewer: `components/ui/MoleculeViewer.tsx` (zoom, wheel, pan, pinch, fit, 100%, Escape, focus return). Shows the same SVG markup, resized, not rasterised.
- `components/ui/MolecularFigure.tsx`: Expand, Copy, Open in. Used on Properties (identity, concepts), shared MolecularDepiction, biochem MoleculeSvg, Ranking, Reactions, Multi-Step, Multi-Catalytic, Spectroscopy. Sites with atom selection use the expand button only. Retro and some route drawings, and Spectroscopy, are expand-only (no copy/send). The small NMR/IR detail previews and route thumbnails have no viewer.
- Copy: Molfile (default, plain text), isomeric SMILES, PNG. Verified: Ctrl+V into PocketChem's Ketcher reproduces L-leucine. No external editor was tested.
- Transfer: `utils/moleculeTransfer.ts` and `ui/useIncomingMolecule.tsx`. Destinations: Properties, Ranking, Spectroscopy, Conformations, Reactions, Multi-Step (reactant editor), Multi-Catalytic (workspace mode). Molecule is loaded, not analysed. Occupied editor asks Replace / Keep current. Salts are not offered to Ranking, Spectroscopy, Conformations.
- Wording: removed implementation commentary (Aromaticity, counterparts, conformations, multi-catalytic, spectroscopy), separator dots in summaries and util strings (test expectations updated), "Editor ready" chips, two instruction lines.

## Defects found and fixed
- Generated Molfiles lacked the absolute-stereo flag, so Ketcher pasted a stereocentre as a racemic `&1` group.
- `buildConformationGraph` trimmed Molfiles, removing the empty title line, so they failed to parse.
- Concept atom/bond clicking did not attach until the selection changed (effect now also depends on the open panel). Not confirmed whether it predates this stage.
- Escape did not close the new menus (listener moved to capture).

## Observed, not changed
- "D-glucose" is underspecified and offers variants (existing behaviour). benzene, L-leucine, spermidine, cAMP, cholesterol, ATP resolved.
- Reactions still shows its older "Use in Reactions" offer next to the new confirmation (duplicate control).
- Not tested: Saved Analyses in the browser (persistence suites only), copy/send from non-Properties figures, transfer into Properties, touch pan on a real device.
- Older browser scripts were edited to stop waiting for "Editor ready"; they were not run. `.pr-instructions` is still referenced by older 29b scripts.

## Screenshots
`node_modules/.cache/stage29b-1c/`

## Git
See `git log 5ede6a0..HEAD`. Pre-existing untracked files and the stash were left alone.
