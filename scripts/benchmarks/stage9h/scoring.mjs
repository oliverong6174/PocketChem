// Stage 9H scoring rules (pure functions; no engine import). Frozen with the cases. Engine adapters live in run.mjs; this file is also exercised by selftest/scoring.test.mjs on synthetic outputs.
// Every capability reports its own dimensions; nothing is merged into one number. "abstained" is neither correct nor wrong.
export const verdict = (status, detail = "") => ({ status, detail });
const NA = verdict("n/a");

// ---- nomenclature -----------------------------------------------------------------------------
const STEREO_PREFIX = /\(\s*(?:\d+[a-z]?[rsez]\s*,?\s*)+\)\s*-?|\(\s*[rsez]\s*\)\s*-?|\(\s*(?:rel|rac|\+-|±)[^)]*\)\s*-?/g;
export const normName = (name) => String(name ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[\s‐-―]/g, "").replace(/’/g, "'");
const stripStereo = (name) => normName(name).replace(STEREO_PREFIX, "");
export function scoreNomenclature(testCase, out) {
  const accepted = [...testCase.accepted_names, testCase.preferred_name].filter(Boolean);
  const exact = accepted.map(normName), bare = accepted.map(stripStereo);
  const shown = out.displayName || out.estimatedName;
  // The app displays "systematic (common)"; the candidate is correct when the whole string or any part outside/inside the parentheses is an accepted name.
  const parts = (candidate) => { const whole = normName(candidate); const split = String(candidate).split(/[()]/).map(normName).filter(Boolean); return [whole, ...split]; };
  const classify = (candidate) => {
    if (out.status === "unsupported") return verdict("abstained", `status unsupported: ${candidate}`);
    if (parts(candidate).some((p) => exact.includes(p))) return verdict("correct", candidate);
    return verdict(out.confidence === "High" ? "wrong-confident" : "wrong-flagged", `${candidate} (${out.confidence}) vs ${testCase.preferred_name}`);
  };
  return {
    name: classify(shown),
    constitutionName: out.status === "unsupported" ? verdict("abstained") : parts(shown).some((p) => bare.includes(stripStereo(p))) ? verdict("correct") : verdict("wrong", `${shown}`),
    systematicName: classify(out.estimatedName),
  };
}

// ---- properties -------------------------------------------------------------------------------
export function scoreProperties(testCase, p) {
  const ref = testCase.reference, num = (v) => Number.parseFloat(v), dims = {};
  const strip = (s) => String(s).replace(/[+-]\d*$/, "");
  dims.formula = strip(p.formula) === strip(ref.formula) ? verdict("correct") : verdict("wrong", `${p.formula} vs ${ref.formula}`);
  dims.molecularWeight = Math.abs(num(p.mw) - ref.molecular_weight) <= 0.1 ? verdict("correct") : verdict("wrong", `${p.mw} vs ${ref.molecular_weight}`);
  dims.exactMass = Math.abs(num(p.exactMass) - ref.exact_mass) <= 0.005 ? verdict("correct") : verdict("wrong", `${p.exactMass} vs ${ref.exact_mass}`);
  dims.formalCharge = p.charge === ref.formal_charge ? verdict("correct") : verdict("wrong", `${p.charge} vs ${ref.formal_charge}`);
  if (testCase.logp_exp?.value != null && p.logP != null) dims.logP = Math.abs(num(p.logP) - testCase.logp_exp.value) <= 1.0 ? verdict("correct", `${p.logP} vs ${testCase.logp_exp.value}`) : verdict("wrong", `${p.logP} vs ${testCase.logp_exp.value}`);
  return dims;
}

// ---- ranking ----------------------------------------------------------------------------------
// out.ranks[i] is the engine rank of testCase.smiles[i] (smaller = earlier in the expected order) or undefined when unranked.
export function scoreRanking(testCase, out, canonicalOf) {
  const group = new Map(); testCase.expected_order.forEach((g, gi) => g.forEach((s) => group.set(canonicalOf(s), gi)));
  let pairs = 0, right = 0, wrong = 0, abstained = 0;
  for (let a = 0; a < testCase.smiles.length; a += 1) for (let b = a + 1; b < testCase.smiles.length; b += 1) {
    const ga = group.get(canonicalOf(testCase.smiles[a])), gb = group.get(canonicalOf(testCase.smiles[b]));
    if (ga === undefined || gb === undefined) continue;
    pairs += 1; const ra = out.ranks[a], rb = out.ranks[b];
    if (ra === undefined || rb === undefined) { abstained += 1; continue; }
    if (Math.sign(ga - gb) === Math.sign(ra - rb)) right += 1; else wrong += 1;
  }
  const status = pairs === 0 ? "n/a" : wrong === 0 && abstained === 0 ? "correct" : wrong === 0 ? "abstained" : "wrong";
  return { order: verdict(status, `${right}/${pairs} pairs right, ${wrong} wrong, ${abstained} unranked`), pairs: verdict("count", JSON.stringify({ pairs, right, wrong, abstained })) };
}

// ---- mass spectrometry ------------------------------------------------------------------------
export function scoreMS(testCase, ms) {
  const e = testCase.expected, dims = {};
  if (e.molecular_ion_mz != null) dims.molecularIon = Math.round(ms.molecularIonMz) === e.molecular_ion_mz ? verdict("correct") : verdict("wrong", `${ms.molecularIonMz} vs ${e.molecular_ion_mz}`);
  dims.basePeak = Math.round(ms.basePeakMz ?? -1) === e.base_peak_mz ? verdict("correct") : verdict("wrong", `${ms.basePeakMz} vs ${e.base_peak_mz}`);
  if (e.key_fragments?.length) {
    const miss = e.key_fragments.filter((f) => !ms.peaks.some((p) => Math.abs(p.mz - f.mz) <= 0.5));
    dims.fragments = miss.length === 0 ? verdict("correct", `${e.key_fragments.length}/${e.key_fragments.length}`) : verdict("wrong", `missing m/z ${miss.map((f) => f.mz).join(", ")} (${e.key_fragments.length - miss.length}/${e.key_fragments.length} present)`);
    dims.fragmentRecall = verdict("count", JSON.stringify({ listed: e.key_fragments.length, present: e.key_fragments.length - miss.length }));
  }
  if (e.m_plus_2_ratio != null) {
    const mi = ms.peaks.find((p) => Math.abs(p.mz - ms.molecularIonMz) < 0.5), m2 = ms.peaks.find((p) => Math.abs(p.mz - (ms.molecularIonMz + 2)) < 0.5);
    const got = mi && m2 && mi.relativeIntensity > 0 ? m2.relativeIntensity / mi.relativeIntensity : null;
    dims.isotopeM2 = got === null ? verdict("wrong", "no M+2 peak") : Math.abs(got - e.m_plus_2_ratio) <= 0.2 * e.m_plus_2_ratio + 0.02 ? verdict("correct", got.toFixed(2)) : verdict("wrong", `${got.toFixed(2)} vs ${e.m_plus_2_ratio}`);
  }
  return dims;
}

// ---- infrared ---------------------------------------------------------------------------------
// out.peaks: [{ center:number|null, kind?:string }]
export function scoreIR(testCase, out) {
  const TOL = 20, dims = {}; const centers = out.peaks.map((p) => p.center).filter((c) => typeof c === "number");
  const present = testCase.ir.present ?? [], absent = testCase.ir.absent ?? [];
  const missing = present.filter((b) => !centers.some((c) => c >= b.range_cm1[0] - TOL && c <= b.range_cm1[1] + TOL));
  dims.irPresent = present.length === 0 ? NA : missing.length === 0 ? verdict("correct") : verdict("wrong", `missing ${missing.map((b) => b.label).join("; ")}`);
  const claimed = absent.filter((b) => out.peaks.some((p) => ["diagnostic", "supporting"].includes(p.kind ?? "diagnostic") && typeof p.center === "number" && p.center >= b.range_cm1[0] && p.center <= b.range_cm1[1]));
  dims.irAbsent = absent.length === 0 ? NA : claimed.length === 0 ? verdict("correct") : verdict("wrong", `claims ${claimed.map((b) => b.label).join("; ")}`);
  dims.irPresentBands = verdict("count", JSON.stringify({ listed: present.length, found: present.length - missing.length }));
  dims.irAbsentBands = verdict("count", JSON.stringify({ listed: absent.length, clean: absent.length - claimed.length }));
  return dims;
}

// ---- reactions --------------------------------------------------------------------------------
// out: { pathways (all), pool (those claiming the case's reagent tokens) }; h: { constitution, isomericCanon, mirror, hasStereoMark, hasTetraMark }
const membersOf = (p) => (p.productMixture?.memberSmiles?.length ? p.productMixture.memberSmiles : [p.productSmiles]).flatMap((s) => (s ?? "").split(".").filter(Boolean));
export async function scoreReaction(testCase, out, h) {
  const { pathways, pool } = out, exp = testCase.expected, dims = {};
  const poolProducts = pool.flatMap((p) => membersOf(p).map((smiles) => ({ smiles, constitution: h.constitution(smiles), pathway: p })));
  const anyProducts = pathways.filter((p) => p.productSmiles).flatMap((p) => membersOf(p).map((s) => h.constitution(s)));
  const wanted = exp.products.filter((p) => ["sole", "major", "formed"].includes(p.role));
  const offered = poolProducts.map((p) => p.constitution);
  const forbiddenPlain = (exp.forbidden ?? []).filter((s) => !h.hasStereoMark(s)), forbiddenStereo = (exp.forbidden ?? []).filter(h.hasStereoMark);
  const forbiddenHit = forbiddenPlain.filter((s) => offered.includes(h.constitution(s)));
  const missing = wanted.filter((p) => !offered.includes(h.constitution(p.smiles)));
  const claimed = pool.length > 0;
  const tokenText = (testCase.reagent_tokens ?? []).join("/");
  if (wanted.length === 0) {
    dims.connectivity = forbiddenHit.length ? verdict("wrong", `offers forbidden ${forbiddenHit.join(", ")}`) : verdict("correct", claimed ? "claimed but no forbidden product offered" : "no rule claims these reagents; nothing forbidden offered");
  } else if (!claimed) {
    const reachable = wanted.every((p) => anyProducts.includes(h.constitution(p.smiles)));
    dims.connectivity = verdict("abstained", `no rule claims reagents ${tokenText}${reachable ? "; reference product arises under other rules" : ""}`);
  } else if (forbiddenHit.length) dims.connectivity = verdict("wrong", `offers forbidden ${forbiddenHit.join(", ")}`);
  else if (missing.length) dims.connectivity = verdict("wrong", `missing ${missing.map((p) => p.smiles).join(", ")}; offered ${[...new Set(offered)].join(", ")}`);
  else dims.connectivity = verdict("correct");

  if (claimed && exp.outcome === "determinate") {
    const major = exp.products.filter((p) => p.role === "major").map((p) => h.constitution(p.smiles));
    const minor = exp.products.filter((p) => p.role === "minor").map((p) => h.constitution(p.smiles));
    const forb = forbiddenPlain.map(h.constitution);
    const sole = exp.products.filter((p) => p.role === "sole").map((p) => h.constitution(p.smiles));
    if (major.length > 0 || (sole.length > 0 && forb.length > 0)) {
      const ranked = pool.filter((p) => p.selectivityAssessment?.level === "major");
      const distinct = new Set(offered);
      let engineMajor = null;
      if (ranked.length) engineMajor = [...new Set(ranked.flatMap((p) => membersOf(p).map(h.constitution)))];
      else if (distinct.size === 1) engineMajor = [...distinct];
      if (major.length === 0) {
        dims.regiochemistry = forb.some((c) => offered.includes(c)) ? verdict("wrong", "offers the forbidden regioisomer") : sole.every((c) => offered.includes(c)) ? verdict("correct") : verdict("wrong", "expected regioisomer missing");
      } else if (!engineMajor) dims.regiochemistry = verdict("abstained", "several outcomes, none ranked major");
      else if (engineMajor.some((c) => major.includes(c)) && !engineMajor.some((c) => minor.includes(c) || forb.includes(c))) dims.regiochemistry = verdict("correct");
      else dims.regiochemistry = verdict("wrong", `engine major ${engineMajor.join(", ")}`);
    }
    if (major.length || minor.length) {
      const parts = [];
      for (const want of exp.products.filter((p) => p.role === "major" || p.role === "minor")) {
        const target = h.constitution(want.smiles);
        const hit = pool.find((p) => membersOf(p).some((m) => h.constitution(m) === target));
        if (!hit) continue;
        const level = hit.selectivityAssessment?.level ?? null;
        if (want.role === "major") parts.push(level === "major" ? "correct" : level === "minor" ? "wrong" : "abstained");
        else parts.push(level === "minor" ? "correct" : level === "major" ? "wrong" : "abstained");
      }
      if (parts.length) dims.ranking = parts.includes("wrong") ? verdict("wrong") : parts.every((s) => s === "correct") ? verdict("correct") : verdict("abstained", "outcomes unranked");
    }
  }
  if (claimed && exp.outcome === "ambiguous") {
    const majors = pool.filter((p) => p.selectivityAssessment?.level === "major");
    dims.ambiguity = majors.length === 0 ? verdict("correct", "no single winner declared") : verdict("wrong", "engine declares a major where the source reports a mixture");
  }
  if (claimed && ["specific", "racemic", "relative-only"].includes(exp.stereo)) {
    const results = [];
    for (const want of wanted) {
      const target = h.constitution(want.smiles);
      const members = poolProducts.filter((p) => p.constitution === target).map((p) => p.smiles);
      if (members.length === 0) continue;
      if (!members.some(h.hasStereoMark)) { results.push("incomplete"); continue; }
      const got = new Set(await Promise.all(members.map(h.isomericCanon)));
      const w = await h.isomericCanon(want.smiles), wm = await h.isomericCanon(h.mirror(want.smiles));
      const forbiddenCanon = await Promise.all(forbiddenStereo.filter((x) => h.constitution(x) === target).map(h.isomericCanon));
      if (forbiddenCanon.some((x) => got.has(x))) results.push("wrong");
      else if (exp.stereo === "specific") results.push(w === wm ? (got.has(w) ? "correct" : "wrong") : got.has(w) && !got.has(wm) ? "correct" : "wrong");
      else if (exp.stereo === "racemic") results.push(w === wm ? (got.has(w) ? "correct" : "wrong") : got.has(w) && got.has(wm) ? "correct" : "wrong");
      else results.push(got.has(w) || got.has(wm) ? "correct" : "wrong");
    }
    if (results.length) dims.stereochemistry = results.includes("wrong") ? verdict("wrong") : results.includes("incomplete") ? verdict("incomplete", "stereochemistry unspecified") : verdict("correct");
  }
  return dims;
}

// ---- synthesis --------------------------------------------------------------------------------
// out: { outcomeKind, best: null | { steps:[{ruleId,productSmiles}], verificationStatus }, ms }
export function scoreSynthesis(testCase, out, constitution) {
  const dims = {};
  dims.routeDiscovery = out.best ? verdict("found", `${out.ms} ms`) : verdict(["no-route-within-budget", "stalled", "deadline"].includes(out.outcomeKind) ? "timeout" : "not-found-within-bounds", out.outcomeKind);
  if (out.best) {
    dims.routeVerification = verdict(out.best.verificationStatus === "verified" ? "verified" : out.best.verificationStatus ?? "unverified");
    const n = out.best.steps.length;
    dims.routeLength = n >= testCase.n_steps_min && n <= testCase.n_steps_max ? verdict("within-range", `${n} steps`) : n < testCase.n_steps_min ? verdict("shorter", `${n} steps`) : verdict("longer", `${n} steps`);
    const avoid = new Set((testCase.route_must_avoid ?? []).map(constitution));
    const seen = out.best.steps.map((s) => constitution(s.productSmiles ?? "")).filter(Boolean);
    dims.avoidance = seen.some((c) => avoid.has(c)) ? verdict("wrong", "route passes through a forbidden intermediate") : verdict("correct");
  }
  return dims;
}

// ---- aggregation ------------------------------------------------------------------------------
export const SCORED_EVIDENCE = new Set(["reference-database", "reference-secondary", "verified-textbook-direct"]);
export function summarize(records) {
  const summary = {};
  for (const r of records) {
    const tier = SCORED_EVIDENCE.has(r.evidence) ? "scored" : "provisional";
    const bucket = (summary[r.capability] ??= {});
    for (const [dim, v] of Object.entries(r.dimensions)) {
      if (v.status === "n/a" || v.status === "count") continue;
      const key = `${dim} [${tier}]`; bucket[key] ??= {}; bucket[key][v.status] = (bucket[key][v.status] ?? 0) + 1;
    }
  }
  return summary;
}
