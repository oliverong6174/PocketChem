# Handoff 29R: history cleanup and GitHub synchronization (2026-11-27)

Done. The cleaned `stage10-ui-overhaul` branch is on GitHub. No feature work. Stage 29B-2 not started.
`<home>` below is the user folder.

| # | Item | Result |
|---|---|---|
| 1 | Original / cleaned HEAD | `f24c921d663eaeb8e858855f9dc1d3d11a15200f` / `a011db575eb814a08b5d2a25e3e19d641ea72bf4` |
| 2 | Backup | `<home>\Documents\PocketChem-history-backup-20261127\` |
| 3 | Commits before / after rewrite | 214 / 214 (order, identities and dates identical; none dropped or empty) |
| 4 | Hash mapping | [history-rewrite/commit-map.tsv](history-rewrite/commit-map.tsv), [history-rewrite/MANIFEST.md](history-rewrite/MANIFEST.md) |
| 5 | Claude trailers removed | 197 |
| 6 | Published trailers retained | 9 (at or before `0e65cdf`) |
| 7 | Third-party material excluded | 739 files, listed by source in the manifest |
| 8 | Local archive | `<backup>\excluded-material\` (byte-compared, list in `excluded-files.txt`) |
| 12 | Commits pushed | 215 (214 rewritten + notices), then the commit adding this file |
| 13 | Branch | <https://github.com/oliverong6174/PocketChem/tree/stage10-ui-overhaul> |
| 14 | Verified remote HEAD | `150c950db8ed277a976da272d3a4ab4b46b4b7f9` before this file's commit |
| 16 | Remote `main` | Unchanged at `4ce1bbb`; nothing merged. `phase4-convergent-synthesis` unchanged at `0e65cdf` |

The backup holds `mirror.git` (all refs and the stash), `all-refs.bundle` (verified complete), the five
untracked files, the original Git config and the rewrite and verification scripts. Never push it.

## 9. Licensing and security findings

- ChEBI index: CC BY 4.0, redistribution permitted with attribution. The app names ChEBI as the source but
  shows no license or link; `THIRD-PARTY-NOTICES.md` now records both. Adding them in the app is a follow-up.
- RDKit.js: shipped WASM matches the npm package; BSD-3-Clause text added to the notices.
- IUPAC pKa index (CC BY-NC 4.0): never tracked, ignored, left out of the default build (checked with the
  file present).
- Short quoted excerpts remain in benchmark cases, including OpenStax text under CC BY-NC-SA 4.0. Some script
  comments wrongly say "CC BY 4.0". Review before any commercial use.
- NIST: only selected peak values remain in case and result files.
- Local user paths were in 23 files (more than the 8 first reported); all replaced.
- Pattern scan of the pushed range found no tokens, private keys or third-party email addresses. The commit
  author email was already on all 65 earlier published commits.
- The repository is public and has no license file for PocketChem itself. That is the owner's choice.
- History published before `0e65cdf` was not audited.

## 10. Original functionality

`src/`, tests and benchmark scripts are unchanged. Across all 214 checkpoints the only differences from the
originals are the exclusions and path replacements (one report script holds a replaced path in its text).

## 11. Verification (clean clone, Node v24.21.0)

- `npm run build` (TypeScript and production build): passed.
- 22 focused test files (29B, naming, molecular resolution, tests importing benchmark modules): 369 passed,
  0 failed, 5 skipped for lack of the optional pKa index. With the index copied in, that file passed 15/15.
- Rewrite checks: 13/13 passed, including no excluded blob reachable and identical author and committer lines.
- Not run: full `npm test`, lint, browser or offline checks. Excluded-data benchmark scripts were not re-run.

## 15. Remaining blockers and cautions

No publication blocker for this branch. Cautions:

- Local `phase4-convergent-synthesis`, `stage9h-fresh-evaluation`, `stage9l-scientific-correctness` and
  `backup/stage10-ui-overhaul-original` still contain the **unrewritten** commits. Do not push or merge them,
  and do not use `git push --all` or `--mirror`. `phase4-convergent-synthesis` tracks a remote branch, so a
  plain `git push` while on it would publish original history.
- Cherry-pick from those branches only after checking for excluded files and trailers.
- Known limitation, unchanged: vitamin B12 loads by name, but property and reaction analysis blocks the page
  for over 45 s and throws a WebAssembly exception (see [HANDOFF-29B-1C.md](HANDOFF-29B-1C.md)).

## 17. Safe checkpoint for further work

Continue in `<home>\Documents\PocketChem` on `stage10-ui-overhaul`, which now tracks
`origin/stage10-ui-overhaul`. Start from the branch tip (the commit adding this file). The removed reference
files are still on disk there as ignored local inputs. The stash and the five untracked files are untouched.
Automatic commit and PR attribution remains disabled in user settings.

`<home>\Documents\PocketChem-publish\` is the temporary rewrite clone. It is not needed any more.
