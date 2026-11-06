# Stage 9K independent validation plan and ledger

Authority: the user's Stage 9K assignment in this session. Proceed autonomously; no production chemistry/UI edits, pushes, old holdout executions, or routine review approvals.

1. Record starting Git state and hashes of exposed scientific artifacts and unrelated untracked files. Read 9J reports and existing protocols/interfaces only.
2. Author approximately 60 new cases: database-backed nomenclature and EI spectra, plus separately labelled textbook-rule reaction and route applications. Save reference records and uncertainties. Use standalone RDKit only for molecular validity and overlap checks. Do not run predictions or inspect detailed prediction logic.
3. Finalize answers and pure scoring functions; verify synthetic scoring tests. Screen canonical isomeric and stereo-stripped structures against exposed 9F/9H/9I/9J data. Exclude exact overlaps from primary novel evaluation; disclose shared reagents, scaffolds and reaction families.
4. Freeze cases, evidence, scoring, protocol, and integrity manifest in a dedicated local commit before predictions. Record engine commit and src tree.
5. Audit 9J counts, replay/quality split, stereo claims, confidence arithmetic, comparator, commit contents and historic integrity. Read source only after freeze.
6. Execute each new case once with preserved raw records, errors, abstentions, timeouts and parameters. No retries to improve scores. Score saved outputs only.
7. Run relevant deterministic checks and required build; report separate dimensions, Wilson intervals, limitations, defects and prioritized follow-up fixes. Commit report and evidence. Verify final Git state; stop.

Independence disclosure: Codex is separate from the Claude Code implementer, but reads exposed reports and knows their failure categories. Selection is purposive and model-authored, not random or blind. Expected answers must come from external records or explicitly identified chemical-rule applications, never PocketChem output. Textbook extrapolations will be reported separately from direct exact-case reference validation.

Ruling: Use the existing task branch and restrict all writes to scripts/benchmarks/stage9k. The user named this checkout and requested local commits and preservation of existing files; no worktree relocation is necessary for this evaluation-only task. User autonomy instructions supersede skill approval gates and optional delegation. No agents are needed.

Progress: initial HEAD 7f4cdc021790f1d047f96ff9f2c89352ba4c58ee; branch stage9h-fresh-evaluation. Four pre-existing untracked paths: CLAUDE.md, scripts/browser/stage9fLiveCheck.mjs, stage5-changes.patch, stage5-status.txt. No tracked modifications.
