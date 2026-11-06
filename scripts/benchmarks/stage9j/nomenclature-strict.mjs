// Re-scores the saved Stage 9I nomenclature rows (no engine run) with the stereo-sensitive equivalence of Stage 9J.
// Output is appended as a new file; the Stage 9I result and the frozen Stage 9H files are not modified.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const { namesEquivalent } = await import(pathToFileURL(path.join(here, "nameEquivalence.mjs")).href);
const cases = new Map(JSON.parse(fs.readFileSync(path.join(root, "scripts", "benchmarks", "stage9h", "cases", "nomenclature.json"), "utf8")).cases.map((c) => [c.id, c]));
const saved = JSON.parse(fs.readFileSync(path.join(root, "scripts", "benchmarks", "stage9i", "results", "nomenclature-dev.json"), "utf8"));
const rows = saved.rows.map((r) => {
  const c = cases.get(r.id);
  const refs = [...c.accepted_names, c.preferred_name].filter(Boolean);
  // The display name may append a trivial name, "systematic (trivial)". The systematic part alone is what is compared; a trailing
  // parenthetical made only of letters/spaces (no digits, commas or single CIP letters) is treated as the trivial name.
  const trailing = String(r.shown).match(/^(.*\S)\s+\(([A-Za-z][A-Za-z ]{3,})\)$/);
  const systematic = trailing ? trailing[1] : r.shown;
  const whole = refs.some((ref) => namesEquivalent(systematic, ref));
  const partial = !whole && trailing ? refs.some((ref) => namesEquivalent(trailing[2], ref)) : false; // right trivial name beside a wrong systematic name
  const strict = r.status === "unsupported" ? "abstained" : whole ? "correct" : r.confidence === "High" ? "wrong-confident" : "wrong-flagged";
  return { id: r.id, reference: r.reference, shown: r.shown, stage9iAware: r.nowAware, strictAware: strict, trivialNameOnlyMatch: partial };
});
const tally = (k) => rows.reduce((a, r) => ({ ...a, [r[k]]: (a[r[k]] ?? 0) + 1 }), {});
const summary = { cases: rows.length, stage9iErrataAware: tally("stage9iAware"), strictStereoAware: tally("strictAware"), changed: rows.filter((r) => r.stage9iAware !== r.strictAware).map((r) => `${r.id}: ${r.stage9iAware} -> ${r.strictAware} | ${r.reference} | ${r.shown}`), trivialNameOnlyMatches: rows.filter((r) => r.trivialNameOnlyMatch).map((r) => r.id) };
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", "nomenclature-strict.json"), JSON.stringify({ note: "Development re-scoring of exposed Stage 9H cases with stereo-sensitive synonym equivalence; not a blind result.", summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
