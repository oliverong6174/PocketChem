# Stage 29B-1 handoff — Properties dashboard

## Recovered Codex implementation
Codex stopped at its usage limit after committing three stages (identity `227b246`, dashboard `b5ff1db`, aromaticity `b060a25`). Its fourth stage (counterparts) and some follow-up edits were uncommitted. Those were inspected, kept, verified and committed in `70af4f3`. Nothing was rebuilt. Codex's last `tsc` log (`stage29b-tsc3.log`) showed errors; they no longer reproduce, and `tsc -b` is clean now. Its last lint log showed 4 errors, which are pre-existing (see below).

Abandoned process: a Codex-started `vite` dev server (PID 25748/26980, port 5173, started 15:23) was stopped. Four `codex.js` node processes belong to the Codex app itself and were left alone. No `.stage29b-baseline-MoleculeDrawer.tsx` exists anywhere in the repository (searched), so nothing needed removing.

## Remaining defects corrected in this session
- Base pKa ranges rendered as "-8–-4"; negative ranges now read "-8 to -4" (`AcidBasePanel.tsx`).
- "Reactivity at a glance" rows were separated by about 50 px because inline link buttons inherited a 44 px minimum height; now compact (`properties.css`).
- No other clipping, cramped panels or unreadable text was found in the screenshots reviewed.

## Behaviour summary
- **Identity**: an imported database name (e.g. "acetic acid", CHEBI id) is kept with provenance, bound to the canonical isomeric structure. Equivalent redraws keep it; chemical edits invalidate it, and the loader status message is cleared on edits.
- **Generic structures**: vitamin K resolves to a scaffold with an unspecified R. It is shown as "Generic structure", with no molecular weight, exact mass or DBE. Structure-derived name is "Unavailable". It is not silently replaced by vitamin K1; concrete entries (e.g. phylloquinone) are offered as an explicit choice.
- **Dashboard**: two-column editor/results on desktop, a stacked layout below 1024 px, one-line instructions, identity header over five tabs (Summary, Acid/Base, Aromaticity, Concepts, All Properties), and no inner result scroll boxes.
- **Acid/base**: a table of sites with behaviour, estimated pKa range, confidence and rank. The selected site is highlighted and the full original reasoning sits behind a "Detailed reasoning" disclosure.
- **Aromaticity**: RDKit ring-system perception, fused versus separate systems, per-system π counts, selectable atom/bond highlighting.
- **Counterparts**: preview, Apply, Cancel and Restore original, with stale-editor protection (refuses to replace if the drawing changed after the preview). Restore returns the original KET and provenance. Saved-analysis engine version migrates 1 to 2.

## Scientific limitations
Heuristic and bounded. Counterparts cover isolated all-carbon 5- and 7-membered rings only (charge/H edits). Antiaromatic previews assume a planar singlet. "Edit cost" does not predict stability or a real reaction. Unsupported cases (naphthalene, oxygen heterocycles, bridged rings, generic atoms) say so explicitly. Acid/base ranges are model estimates, not measurements.

## Test results (run sequentially; logs in `node_modules/.cache/stage29b-1/logs/`)
| Suite | Result |
|---|---|
| identity29b | 11/11 |
| aromaticity29b | 19/19 |
| counterparts29b | 12/12 |
| acidBasePresentation29b | 2/2 |
| analysisLibraryAllPages / analysisLibrary / analysisLibraryPages | 25 / 35 / 28, all pass |
| persistence / persistenceRankingSpectroscopy | 39 / 27, all pass |
| propertiesSections20 | 11/11 |
| nomenclature9f | 48/48 |
| ranking9f / ranking9g | 5 / 9, all pass |
| `tsc -b` | clean |
| `npm run build` | success (existing chunk-size warning only) |
| ESLint on changed files | 1 error, in `MoleculeDrawer.tsx:223` (`setNameQuery` in an effect). Pre-existing since 2026-10-05 and untouched. The last repo-wide lint log (before this session) also listed 4 errors elsewhere, e.g. `SpectroscopyPage.tsx`, not touched here. |
| `stage29bLiveCheck.mjs` (production build, real pointer/keyboard) | 68/68, run twice, before and after the polish fixes |

Unrestricted `npm test` was not run. After the final CSS and range fix, the build, browser check and affected tests were rerun; the full focused list above was run before that fix.

## Browser verification
The check covers the following:
- Real name input and Enter.
- Arrow-key tab navigation and ring selection by pointer.
- Preview, Cancel, Apply and Restore.
- Save, reopen and reanalyze of vitamin K.
- Six viewports (1920×1080, 1440×900, 1440×768, 1280×720, 820×900, 375×812) in light and dark, with no horizontal overflow or result scroll boxes.

I inspected the screenshots visually, and they are the evidence for layout quality. Known limitation: below about 1300 px wide the Ketcher toolbar is truncated by Ketcher's own responsive behaviour.

## Screenshots
- After: `node_modules/.cache/stage29b-1/after/`
- Before (Codex baseline): `node_modules/.cache/stage29b-1/before/`

Populated shots: summary (all sizes and themes), acid-base, aromaticity, counterpart-preview, antiaromatic-preview, all-properties, generic (vitamin K), complex (cholesterol), recognized (aspirin).

```powershell
explorer .\node_modules\.cache\stage29b-1
```

## Historical debt (not investigated further)
Stage 11 scored 47/54 and Stage 19 scored 55/56 against the unchanged Stage 28 build. The original Stage 28 report recorded Stage 19 as 51/56. This is preserved as reported, and no failure relevant to this assignment was found.

## Commits (local, not pushed)
- `227b246` fix: preserve molecular source identity and guard generic properties
- `b5ff1db` feat: expand Properties dashboard and condense acid base results
- `b060a25` feat: analyze and highlight aromatic ring systems with model limits
- `70af4f3` feat: preview aromatic and antiaromatic ring counterparts with apply and restore
- Final commit: docs and verification scripts (this file and the browser scripts)

## Final Git status
The only untracked files left are the five longstanding ones: `CLAUDE.md`, `scripts/benchmarks/stage9m/rd-probe.mjs`, `scripts/tests/.probe-names.mjs`, `stage5-changes.patch`, `stage5-status.txt`. The `phase1-synthesis-reliability` stash is intact (1 entry).
