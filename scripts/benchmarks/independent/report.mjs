// Builds independent-validation-tables.md from the result files (no engine needed).
//   node scripts/benchmarks/independent/report.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(path.join(here, "results", name), "utf8"));
const initial = load("independent-results-run2b-pre-fix-engine-final-scorer.json");
const post = load("independent-results-run4-final.json");

const DIMENSIONS = ["structure", "connectivity", "regiochemistry", "stereochemistry", "classification", "conditions", "ambiguity", "unsupported", "routeDiscovery", "routeVerification", "routePlausibility", "workspace"];
const subsets = (data) => ({
  "reference-validated, held-out": data.records.filter((r) => r.provenance !== "provisional" && !r.overlapsFixtures),
  "provisional (excluded from validated figures)": data.records.filter((r) => r.provenance === "provisional"),
  "verified but overlapping existing fixtures": data.records.filter((r) => r.provenance !== "provisional" && r.overlapsFixtures),
});
const tally = (records, dimension) => {
  const counts = {};
  for (const record of records) {
    const verdict = record.dimensions[dimension];
    if (!verdict || verdict.status === "n/a") continue;
    counts[verdict.status] = (counts[verdict.status] ?? 0) + 1;
  }
  return counts;
};
const fmt = (counts) => Object.entries(counts).map(([status, n]) => `${status} ${n}`).join(", ") || "-";

const lines = [];
lines.push("# Independent benchmark: generated tables", "");
lines.push(`Cases: ${post.records.length}. Verdicts are never combined into one accuracy number; each dimension is reported on the cases that have an expectation for it.`, "");
for (const [title, data] of [["Pre-fix engine (before the benchmark-driven fixes), final scorer", initial], ["Post-fix engine (current)", post]]) {
  lines.push(`## ${title}`, "");
  for (const [name, records] of Object.entries(subsets(data))) {
    lines.push(`### ${name} (${records.length} cases)`, "", "| dimension | verdicts |", "|---|---|");
    for (const dimension of DIMENSIONS) {
      const counts = tally(records, dimension);
      if (Object.keys(counts).length > 0) lines.push(`| ${dimension} | ${fmt(counts)} |`);
    }
    lines.push("");
  }
}
lines.push("## Per-category, reference-validated held-out, post-fix engine", "", "| category | cases | connectivity | regiochemistry | stereochemistry | classification | other |", "|---|---|---|---|---|---|---|");
const validated = subsets(post)["reference-validated, held-out"];
for (const category of [...new Set(validated.map((r) => r.category))]) {
  const rows = validated.filter((r) => r.category === category);
  const other = ["conditions", "ambiguity", "unsupported", "routeDiscovery", "routePlausibility", "workspace"].map((d) => (Object.keys(tally(rows, d)).length ? `${d}: ${fmt(tally(rows, d))}` : null)).filter(Boolean).join("; ");
  lines.push(`| ${category} | ${rows.length} | ${fmt(tally(rows, "connectivity"))} | ${fmt(tally(rows, "regiochemistry"))} | ${fmt(tally(rows, "stereochemistry"))} | ${fmt(tally(rows, "classification"))} | ${other || "-"} |`);
}
lines.push("", "## Case table (verdict per dimension; pre-fix -> post-fix when different)", "", "| id | provenance | overlap | dimension verdicts | known gap |", "|---|---|---|---|---|");
const byId = Object.fromEntries(initial.records.map((r) => [r.id, r]));
for (const record of post.records) {
  const before = byId[record.id];
  const cells = Object.entries(record.dimensions)
    .filter(([, v]) => v.status !== "n/a")
    .map(([dimension, v]) => {
      const old = before?.dimensions[dimension]?.status;
      return old && old !== v.status ? `${dimension}: ${old} -> ${v.status}` : `${dimension}: ${v.status}`;
    })
    .join("; ");
  lines.push(`| ${record.id} | ${record.provenance} | ${record.overlapsFixtures ? "yes" : ""} | ${cells} | ${record.knownGap ? "yes" : ""} |`);
}
lines.push("", "## Runtime and resources (post-fix run)", "", `Total ${post.summary.runtime.totalMs} ms over ${post.records.length} cases; slowest case ${post.summary.runtime.slowestMs} ms; peak RSS ${post.summary.runtime.peakRssMB} MB.`, "");
const routes = post.records.filter((r) => r.kind === "route").map((r) => `${r.id}: ${r.engine.outcome}, ${r.engine.ms} ms, ${r.engine.ruleSequence.join(" > ")}`);
lines.push("Route searches (15 s budget each): " + routes.join(" | "), "");
fs.writeFileSync(path.join(here, "independent-validation-tables.md"), lines.join("\n"));
console.log(lines.join("\n"));
