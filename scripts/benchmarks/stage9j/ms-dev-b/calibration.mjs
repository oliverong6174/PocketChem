// Certainty-label calibration across the Stage 9I development set (after-fix run) and Stage 9J set B (baseline run).
// Reports coverage, accuracy among each label, and abstention separately. Pure post-processing of saved runs; no engine call.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const sets = {
  "9I-dev (15, tuned-on)": path.join(here, "..", "..", "stage9i", "ms-dev", "results", "after-fix.json"),
  "9J-B (8, not tuned-on)": path.join(here, "results", "baseline.json"),
};
const out = {};
const all = [];
for (const [name, file] of Object.entries(sets)) {
  const { records } = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = {};
  for (const r of records) {
    const label = r.basePeakCertainty ?? "none";
    rows[label] ??= { n: 0, baseCorrect: 0, fragCorrect: 0, fragN: 0 };
    rows[label].n += 1;
    if (r.dimensions.basePeak.status === "correct") rows[label].baseCorrect += 1;
    if (r.dimensions.fragments) { rows[label].fragN += 1; if (r.dimensions.fragments.status === "correct") rows[label].fragCorrect += 1; }
    all.push({ label, ok: r.dimensions.basePeak.status === "correct" });
  }
  out[name] = rows;
}
const pooled = {};
for (const a of all) { pooled[a.label] ??= { n: 0, ok: 0 }; pooled[a.label].n += 1; if (a.ok) pooled[a.label].ok += 1; }
const wilson = (k, n) => { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d; return [Math.round((c - h) * 100), Math.round((c + h) * 100)]; };
for (const v of Object.values(pooled)) v.wilson95pct = wilson(v.ok, v.n);
out.pooled = pooled;
fs.writeFileSync(path.join(here, "results", "calibration.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
