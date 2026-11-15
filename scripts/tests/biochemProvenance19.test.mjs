// Stage 19: provenance of the metabolic models' reference claims. Source-checked claims must agree numerically with the model;
// claims without a source must not be presented as verified; existing model values are unchanged.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
let P, L, N;
before(async () => {
  P = await loadModule("/src/utils/biochem/metabolism/provenance.ts");
  L = await loadModule("/src/utils/biochem/metabolism/ledger.ts");
  N = await loadModule("/src/utils/biochem/metabolism/network.ts");
});
after(async () => { await closeEngine(); });

describe("provenance records", () => {
  test("the table is internally consistent", () => { assert.deepEqual(P.validateProvenance(), []); });
  test("every source is an https page with an access date, and none is a source that blocked retrieval", () => {
    for (const s of P.SOURCES) { assert.match(s.url, /^https:\/\/openstax\.org\/books\/biology-2e\/pages\//); assert.match(s.accessed, /^\d{4}-\d{2}-\d{2}$/); }
    assert.ok(!P.SOURCES.some((s) => /ncbi\.nlm\.nih\.gov/.test(s.url)), "NCBI Bookshelf could not be read, so it must not be cited as checked");
  });
  test("claims missing a source are never labelled checked", () => {
    for (const c of P.CLAIMS) { if (c.sourceIds.length === 0) assert.equal(c.status, "unverified", c.id); }
    const bad = [{ id: "x", topic: "tca", statement: "s", status: "source-checked", sourceIds: [] }];
    assert.ok(P.validateProvenance(bad).some((p) => p.includes("without a source")));
    assert.ok(P.validateProvenance([{ id: "y", topic: "tca", statement: "s", status: "unverified", sourceIds: ["openstax-7-2"], caveat: "c" }]).some((p) => p.includes("cites a source")));
    assert.ok(P.validateProvenance([{ id: "z", topic: "tca", statement: "s", status: "partly-checked", sourceIds: ["nope"], caveat: "c" }]).some((p) => p.includes("unknown source")));
  });
  test("the specific recalled-only claims stay unverified (proton stoichiometry, ATP per carrier, glucose totals)", () => {
    for (const id of ["etc-proton-stoichiometry", "etc-atp-per-carrier", "etc-glucose-total", "gluco-bypass", "reg-f26bp"]) assert.equal(P.CLAIMS.find((c) => c.id === id).status, "unverified", id);
  });
  test("every checked or partly-checked claim carries a caveat or a numeric agreement check", () => {
    for (const c of P.CLAIMS.filter((x) => x.status !== "unverified")) assert.ok(c.check || c.caveat, c.id);
  });
  test("each topic of the metabolism UI has at least one claim", () => {
    for (const t of ["glycolysis", "gluconeogenesis", "pyruvate-oxidation", "tca", "etc", "regulation"]) assert.ok(P.claimsFor([t]).length > 0, t);
  });
});

describe("model agrees with the checked source statements", () => {
  test("every numeric check equals the value the source states", () => {
    const checks = P.CLAIMS.filter((c) => c.check);
    assert.ok(checks.length >= 7);
    for (const c of checks) assert.equal(c.check.model(), c.check.sourceValue, `${c.id}: ${c.check.label}`);
  });
  test("glycolysis: 2 invested, 4 formed, net 2 (independent of the claim table)", () => {
    assert.deepEqual(L.glycolysisAtpBreakdown(), { invested: 2, produced: 4, net: 2 });
  });
  test("glucose complete oxidation releases 6 CO2 (2 + 4), the sum of two checked statements", () => {
    assert.equal(L.glucoseLedger("malate-aspartate").co2, 6);
  });
});

describe("models and wiring are unchanged", () => {
  test("the stated oxidative-phosphorylation assumptions are the ones the provenance table flags", () => {
    assert.deepEqual({ ...L.OXPHOS_ASSUMPTIONS }, { protonsPerNadh: 10, protonsPerFadh2: 6, protonsPerAtp: 4 });
    assert.equal(L.atpPerNadh(), 2.5); assert.equal(L.atpPerFadh2(), 1.5);
    assert.equal(L.glucoseLedger("malate-aspartate").totalAtp, 32);
    assert.equal(L.glucoseLedger("glycerol-phosphate").totalAtp, 30);
  });
  test("the network still validates", () => { assert.deepEqual(N.validateNetwork(), []); });
  test("the five metabolism pages show the provenance panel for their topics", () => {
    const expect = { GlycolysisPage: "glycolysis", GluconeogenesisPage: "gluconeogenesis", CitricAcidPage: "tca", ElectronTransportPage: "etc", MetabolicMapPage: "etc" };
    for (const [file, topic] of Object.entries(expect)) {
      const src = read("src", "components", "biochem", "metabolism", `${file}.tsx`);
      assert.match(src, /<ProvenancePanel topics=\{/, file);
      assert.ok(src.includes(`"${topic}"`), `${file} lists ${topic}`);
    }
  });
});
