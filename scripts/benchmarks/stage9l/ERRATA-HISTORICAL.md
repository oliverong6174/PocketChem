# Stage 9L append-only historical corrections

This supplements (and does not edit) the original 9J report/errata and 9K audit.
Original predictions, expected answers, scores, manifests and reporting code stay
unchanged. `audit-saved.mjs` reads saved records only and independently recomputes
the arithmetic into `historical-audit.json`; it executes no chemistry engine.

1. **9J inventory:** 29 total = 12 flagged + 13 clear + 2 not-supported + 2
   ambiguous. The 27 figure excludes the two ambiguous cases. Binary denominators
   are 12 positives and 13 negatives, with unsupported and ambiguous cases separate.
2. **9J final-run detection:** combined pipeline 11/12 (Wilson 64.6–98.5%);
   chemical adverse findings 8/12 (39.1–86.2%); chemical findings among replay-verified
   positives 6/7 (48.7–97.4%). Ten positives have substantive non-replay findings,
   comprising eight chemical and two atom-bookkeeping detections. F07 alone is
   replay-only; F08/F09 also have atom bookkeeping; F10/F11 also have chemical
   findings. These overlapping detectors are not independent validation samples.
3. **False positives:** final 0/13, upper Wilson bound 22.8%; first and second
   saved configurations each include C10. Keep the configurations separate.
4. **Unsupported/ambiguous:** N01's historical label is a documented author error,
   not assessor evidence against selective propane bromination. Neither unsupported
   nor ambiguous cases silently enter sensitivity/specificity denominators.
5. **9K route attribution:** combined 5/5 includes RQ-12 replay-only. Chemical
   findings 4/5; on verified positives 2/2. The frozen annotation fails to isolate
   chemical findings, so it must not substantiate standalone chemical sensitivity.
6. **9J MS:** pooled eligible strict fragments 3/22, supported strict 0/4.
   Supported base peaks 5/5, heuristic 2/9, unreliable 2/9; all 23 emit numbers,
   hence zero numeric abstentions. Supported-label coverage is 5/23. The saved
   reversed candidate field is null and cannot support candidate-hit claims.
   `supported` is the actual enum; obsolete `predicted` produced a bad summary.
7. **9J comparator:** locant stripping, contradictory relative labels and the
   meso negative test remain historical defects. Use the new Stage 9L adapter
   with independently resolved structures for symmetry-dependent equivalence;
   no historical nomenclature score is replaced.
8. **Evidence limits:** neither categorical label performance nor small correlated
   strata prove probability calibration. NIST JCAMP records do not establish a
   universal 70 eV condition. Mechanistic plausibility is not experimental yield,
   measured product ratio or a global predictor accuracy estimate.
