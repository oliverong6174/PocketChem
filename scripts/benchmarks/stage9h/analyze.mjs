// Stage 9H analysis: reads ONLY the saved final results (never runs the engine). Prints per-capability tables with 95% Wilson intervals and writes results/analysis.json.
//   node scripts/benchmarks/stage9h/analyze.mjs
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const lock = JSON.parse(fs.readFileSync(path.join(here, "results", "final-lock.json"), "utf8"));
const result = JSON.parse(fs.readFileSync(path.join(here, lock.results), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));
const caseFile = (cap) => JSON.parse(fs.readFileSync(path.join(here, "cases", `${cap}.json`), "utf8")).cases;
const SCORED = new Set(manifest.scoredEvidenceTiers);
const byId = new Map(result.records.map((r) => [r.id, r]));
const CORRECT = new Set(["correct", "found", "within-range", "verified", "correct-abstention"]);
const wilson = (k, n) => { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]; };
const pct = (k, n) => (n ? `${k}/${n} = ${((100 * k) / n).toFixed(0)}% [${wilson(k, n).map((x) => (100 * x).toFixed(0)).join("-")}]` : "0/0");
const tally = (statuses) => { const t = {}; for (const s of statuses) t[s] = (t[s] ?? 0) + 1; return t; };
const out = { engineCommit: result.meta.engineCommit, engineSrcTree: result.meta.engineSrcTree, ranAt: result.meta.runAt, capabilities: {} };
const report = (cap, dim, statuses, extra = "") => {
  const t = tally(statuses), n = statuses.length, k = statuses.filter((s) => CORRECT.has(s)).length;
  (out.capabilities[cap] ??= {})[dim] = { n, correct: k, statuses: t, interval95: wilson(k, n) };
  console.log(`${cap.padEnd(13)} ${dim.padEnd(20)} ${pct(k, n).padEnd(26)} ${JSON.stringify(t)} ${extra}`);
};
const statusOf = (rec, dim) => (rec ? rec.dimensions[dim]?.status ?? null : "no-record");
for (const cap of ["nomenclature", "properties", "ranking", "ms", "ir", "reactions", "synthesis"]) {
  const cases = caseFile(cap); const scored = cases.filter((c) => SCORED.has(c.evidence)); const prov = cases.filter((c) => !SCORED.has(c.evidence));
  console.log(`\n== ${cap}: ${scored.length} scored, ${prov.length} provisional; engine errors/timeouts: ${cases.filter((c) => ["timed-out", "harness-or-engine-error"].includes(byId.get(c.id)?.status)).length}`);
  const dimStatuses = (set, dim, apply = () => true) => set.filter(apply).map((c) => { const s = statusOf(byId.get(c.id), dim); return s ?? "not-scored"; }).filter((s) => s !== "not-scored" && s !== "n/a");
  if (cap === "nomenclature") {
    for (const d of ["name", "constitutionName", "systematicName"]) report(cap, d, dimStatuses(scored, d));
    report(cap, "name (stereo-specified)", dimStatuses(scored, "name", (c) => c.stereo_specified));
    report(cap, "name (no stereo)", dimStatuses(scored, "name", (c) => !c.stereo_specified));
    const conf = scored.filter((c) => statusOf(byId.get(c.id), "name") === "wrong-confident").map((c) => `${c.title} -> ${byId.get(c.id).engine.displayName}`);
    console.log("  confident-wrong:", conf.join("; ") || "none"); out.capabilities[cap].confidentWrong = conf;
  }
  if (cap === "properties") { for (const d of ["formula", "molecularWeight", "exactMass", "formalCharge"]) report(cap, d, dimStatuses(scored, d)); report(cap, "logP (+-1.0)", dimStatuses(scored, "logP")); }
  if (cap === "ranking") {
    report(cap, "order (all)", dimStatuses(scored, "order"));
    const modes = [...new Set(scored.map((c) => c.mode_id))]; for (const m of modes) report(cap, `order [${m}]`, dimStatuses(scored, "order", (c) => c.mode_id === m));
    let p = { pairs: 0, right: 0, wrong: 0, abstained: 0 }; for (const c of scored) { const d = byId.get(c.id)?.dimensions.pairs; if (d) { const x = JSON.parse(d.detail); for (const k of Object.keys(p)) p[k] += x[k]; } }
    console.log(`  pairwise: ${pct(p.right, p.pairs)} right, ${p.wrong} wrong, ${p.abstained} unranked`); out.capabilities[cap].pairwise = p;
  }
  if (cap === "ms") {
    for (const d of ["molecularIon", "basePeak", "fragments", "isotopeM2"]) report(cap, d, dimStatuses(scored, d));
    let l = 0, f = 0; for (const c of scored) { const d = byId.get(c.id)?.dimensions.fragmentRecall; if (d) { const x = JSON.parse(d.detail); l += x.listed; f += x.present; } }
    console.log(`  fragment recall (non-strict): ${pct(f, l)}`); out.capabilities[cap].fragmentRecall = { listed: l, present: f };
    const classes = [...new Set(scored.map((c) => c.category))]; for (const cl of classes) report(cap, `basePeak [${cl}]`, dimStatuses(scored, "basePeak", (c) => c.category === cl));
  }
  if (cap === "ir") {
    for (const d of ["irPresent", "irAbsent"]) report(cap, d, dimStatuses(scored, d));
    for (const [d, key] of [["irPresentBands", "found"], ["irAbsentBands", "clean"]]) { let l = 0, f = 0; for (const c of scored) { const v = byId.get(c.id)?.dimensions[d]; if (v) { const x = JSON.parse(v.detail); l += x.listed; f += x[key]; } } console.log(`  ${d}: ${pct(f, l)}`); out.capabilities[cap][d] = { listed: l, ok: f }; }
  }
  if (cap === "reactions") {
    for (const set of [[scored, "scored"], [prov, "provisional (rule-derived)"]]) {
      console.log(`  -- ${set[1]}`);
      for (const d of ["connectivity", "regiochemistry", "ranking", "ambiguity", "stereochemistry"]) {
        const apply = set[0].filter((c) => c.criteria.includes(d)); if (!apply.length) continue;
        const statuses = apply.map((c) => { const rec = byId.get(c.id); if (!rec || rec.status !== "ran") return rec?.status ?? "no-record"; return rec.dimensions[d]?.status ?? "unclaimed-abstained"; });
        report(set[1] === "scored" ? cap : `${cap} (provisional)`, d, statuses);
      }
    }
    const oc = scored.filter((c) => c.expected.outcome === "determinate" && c.expected.products.length).length; console.log(`  scored determinate-with-product cases: ${oc}`);
  }
  if (cap === "synthesis") {
    for (const set of [[scored, "scored"], [prov, "provisional"]]) {
      const recs = set[0].map((c) => byId.get(c.id)); const found = recs.filter((r) => r?.dimensions.routeDiscovery?.status === "found");
      report(set[1] === "scored" ? cap : `${cap} (provisional)`, "routeDiscovery", recs.map((r) => r?.dimensions.routeDiscovery?.status ?? "no-record"));
      for (const r of recs) console.log(`    ${r.id} ${set[0].find((c) => c.id === r.id).title.slice(0, 60)} | ${r.dimensions.routeDiscovery?.status} ${r.engine?.ms}ms outcome=${r.engine?.outcomeKind} steps=${r.engine?.best?.steps.length ?? "-"} len=${r.dimensions.routeLength?.status ?? "-"} ver=${r.dimensions.routeVerification?.status ?? "-"} avoid=${r.dimensions.avoidance?.status ?? "-"}`);
      void found;
    }
  }
}
fs.writeFileSync(path.join(here, "results", "analysis.json"), JSON.stringify(out, null, 1));
console.log("\nwrote results/analysis.json");
