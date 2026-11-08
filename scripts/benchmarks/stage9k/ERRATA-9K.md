# Stage 9K post-freeze limitations (append-only)

2026-11-06. Cases, answers, criteria, scorer, adapters, manifest and raw predictions remain exactly as frozen. See `results/diagnostics.json` for the machine-readable version. These observations do not replace scores or authorize a rerun.

* K-01: Five frozen reaction filters admit irrelevant pathways: RX-01/RX-04 include dibromocyclopropanation because CHBr3 contains HBr; RX-06 includes hydrohalogenation and allylic bromination; RX-08/RX-09 include isotope-labelled D2 alternatives. These are harness selection failures. Reference-product presence can still be inspected in the raw record, but the 13/13 connectivity score does not establish clean condition-specific product-set accuracy. No corrected score is substituted.
* K-02: RX-06's cyclooctene SMILES leaves E/Z unspecified, and an eight-membered ring supports both configurations. Its trans-dibromide expectation assumes cis-cyclooctene. The engine explicitly reports insufficient alkene geometry. The frozen B score remains incomplete; it is not evidence of a chemical error. A future fresh case must specify cis geometry before use.
* K-03: The frozen `routeQualityOnly.nonInfoFindings` annotation does not isolate chemical findings: it omits the actual `replay-failed` code from its exclusion list and includes support/incomplete levels. The primary tier-based sensitivity and specificity are unaffected. Separate diagnostic attribution uses concern/contradiction findings excluding replay and atom-bookkeeping findings: 4/5 positive routes have a chemical finding; 2/2 verified positives do. RQ-12 is detected by replay alone.
* K-04: RX-07's cis-1,2-dimethylcycloheptane target is meso, so the frozen word `racemic` is imprecise. The target and mirror canonicalize identically; relative stereo scoring is unaffected. The raw hydrogenation product is stereo-unspecified and has no stereo limitation warning.

All B textbook applications remain excluded from the A direct-reference accuracy figures, as declared before the run. No observation here silently edits historical ground truth.

The cyclooctene ambiguity is independently checkable from the distinct NIST records for [cis-cyclooctene](https://webbook.nist.gov/cgi/cbook.cgi?ID=C931873) and [trans-cyclooctene](https://webbook.nist.gov/cgi/cbook.cgi?ID=C931895).
