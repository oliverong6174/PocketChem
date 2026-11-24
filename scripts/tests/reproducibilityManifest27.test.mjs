// Stage 27: the reproducibility manifest is hand-authored (statuses are never generated) and this test checks it against the repository:
// reference files exist and their SHA-256 hashes match, every module and test file it names exists, evidence statuses equal the
// evidence registry's, and reference-case identifiers exist in the suite. No network access.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scripts", "reference", "stage27", "reproducibility-manifest.json"), "utf8"));
const EV = await loadModule("/src/utils/evidence/evidence27.ts");
after(async () => { await closeEngine(); });
const sha = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex");

describe("reproducibility manifest", () => {
  test("[MANIFEST-1] reference datasets exist and their hashes match", () => {
    assert.ok(manifest.referenceData.length >= 3);
    for (const d of manifest.referenceData) { assert.ok(fs.existsSync(path.join(root, d.file)), d.file); assert.equal(sha(d.file), d.sha256, `${d.file} changed: update the manifest deliberately`); assert.match(d.retrieved, /^\d{4}-\d{2}-\d{2}$/); assert.ok(["source-verified", "secondary-compilation"].includes(d.status), d.id); }
  });
  test("[MANIFEST-2] scientific modules, tests and browser checks named in the manifest exist", () => {
    for (const f of [...manifest.modules.map((m) => m.file), ...manifest.tests.map((t) => t.file), ...manifest.browserChecks.map((b) => b.file)]) assert.ok(fs.existsSync(path.join(root, f)), f);
  });
  test("[MANIFEST-3] evidence statuses recorded in the manifest equal the evidence registry (the manifest cannot upgrade a claim)", () => {
    assert.deepEqual(manifest.evidence.map((e) => e.id).sort(), EV.EVIDENCE.map((e) => e.id).sort());
    for (const e of manifest.evidence) { const r = EV.evidenceById(e.id); assert.equal(e.source, r.source, e.id); assert.equal(e.calc, r.calc, e.id); assert.equal(e.kind, r.kind, e.id); }
  });
  test("[MANIFEST-4] every referenced reference-case identifier exists in the suite, and the suite file is the one named", () => {
    const suite = fs.readFileSync(path.join(root, "scripts", "tests", "scientificReference27.test.mjs"), "utf8");
    for (const id of manifest.referenceCases) assert.ok(suite.includes(`[${id}]`) || /^BIOCHEM-FA-\d+$/.test(id), id);
    assert.equal(new Set(manifest.referenceCases).size, manifest.referenceCases.length);
  });
  test("[MANIFEST-5] constants and unit conventions are listed, and the declared unsupported scenarios are non-empty", () => {
    for (const k of ["R", "F", "kB", "NA", "e", "c"]) assert.ok(manifest.constants[k], k);
    assert.ok(manifest.unitConventions.length >= 5); assert.ok(manifest.unsupportedScenarios.length >= 8);
  });
  test("[MANIFEST-6] test commands are bounded: none is the unrestricted npm test", () => {
    for (const t of manifest.tests) assert.doesNotMatch(t.command, /npm( run)? test\s*$/, t.command);
  });
  test("[MANIFEST-7] no test result is recorded as passing unless a count is given", () => {
    for (const r of manifest.results) { assert.ok(Number.isInteger(r.passed) && Number.isInteger(r.total) && r.passed <= r.total, r.name); assert.match(r.run, /^\d{4}-\d{2}-\d{2}$/); }
  });
});
