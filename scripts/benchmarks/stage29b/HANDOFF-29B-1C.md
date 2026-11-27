# Stage 29B-1C handoff (verification recovery complete)

Branch `stage10-ui-overhaul`. Stage start `5ede6a0`. Nothing pushed. Stage 29B-2 not started.

## Verification (final production build)
- `npm run build` (includes `tsc -b`): pass.
- `scripts/browser/stage29b1cLiveCheck.mjs`: 100/100.
- `scripts/browser/stage29b1cGapsCheck.mjs`: 41/43. Both failures are the vitamin B12 defect below.
- Focused tests (24 files, sequential): 463/468; the 5 failures were outdated assertions, updated, and their two files then passed 21/21.
- Tests touching the KET converter (7 files): 210/210. Unrestricted `npm test` not run.
- Changed-file ESLint: one error, `MoleculeDrawer.tsx` set-state-in-effect, also present at HEAD.

## The stalled verification
- The live check completed on rerun; the original stall did not reproduce, so its cause is not established.
- The gaps check stalled for real reasons: aromatic N-H structures never analysed (fixed), and B12 blocks the page.
- CDP commands are now bounded (45 s) and name the command that hung.
- C: filled up mid-session: 85 `pocketchem-chrome-*` profiles (6.2 GB) left by browser checks; deleted with approval. `stop()` now kills the Chrome process tree and removes the profile. A failed browser start also cleans up.

## Defects fixed in recovery
- `ketMoleculeToV3000` dropped Ketcher's `implicitHCount`, so tryptophan, histidine, indole, pyrrole and purines loaded but reported "Draw a molecule" (predates this stage).
- It also dropped `stereoLabel`: a racemic (`&`) or relative (`or`) drawing copied from the Properties figure was flagged absolute.

## Implemented in this stage (second part)
- Representative default forms (`utils/preferredForms.ts`, `NameVariantChooser.tsx`): glucose loads beta-D-glucopyranose, leucine loads L-leucine; every other form stays reachable. Confirmed as wanted; replaces the 29B-1A "never assume L or an anomer" rule.
- Aromatic N-H restoration for names whose packed SMILES omit it (`utils/aromaticNH.ts`).
- Default builds exclude the CC BY-NC pKa index (`scripts/vite/restrictedData.mjs`); `npm run build:personal` keeps it. The loader returns null when it is absent.
- Reactions hides "Use in Reactions" when arriving by a transfer from Properties.

## Remaining defects and limits
- Vitamin B12: the name loads, but property/reaction analysis blocks the main thread for over 45 s and throws an uncaught WebAssembly exception. Not fixed.
- "Use in Reactions" returns on a later visit to Reactions, even though that molecule was already transferred.
- Racemic/relative groups: preserved for single-molecule drawings on the Properties identity and highlight figures. Multi-component drawings and figures built from engine SMILES do not carry them.
- Analysis itself (CIP labels, reaction engine) still treats the SMILES without groups.
- Touch pan verified by emulation only; no external editor tested for copy/paste.
- Older browser scripts edited for the removed "Editor ready" chip were not run.

## Git
See `git log 5ede6a0..HEAD`. Unrelated untracked files and the stash were left alone.
