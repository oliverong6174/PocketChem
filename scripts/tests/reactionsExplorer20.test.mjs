// Stage 20: the Reactions results explorer's logic, run on REAL engine output (2-butene, ethanol, a stereodefined bromoalkane) and
// on a large synthetic stress set built from those real pathways. Presentation only: nothing here asks the engine to change.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

let X;
let alkene, ethanol, stereo, none;
before(async () => {
  await loadEngine();
  X = await loadModule("/src/utils/reactions/resultsExplorer.ts");
  const ru = await loadModule("/src/utils/reactionUtils.ts");
  const groups = await loadModule("/src/utils/functionalGroups/index.ts");
  const run = async (smiles) => ru.predictReactionPathways(smiles, (await groups.analyzeFunctionalGroupHierarchy(smiles)).primaryGroups);
  alkene = await run("CC=CC");
  ethanol = await run("CCO");
  stereo = await run("C[C@H](Br)CC");
  none = await run("C");
});
after(async () => { await closeEngine(); });

const ids = (list) => list.map((p) => p.id);

describe("overview figures on real output", () => {
  test("the alkene produces a large, varied result set (a real stress case)", () => {
    assert.ok(alkene.length >= 20, `candidates ${alkene.length}`);
    assert.ok(X.groupResults(alkene).length >= 4);
  });
  test("counts are consistent and distinguish candidates, outcomes and distinct products", () => {
    for (const set of [alkene, ethanol, stereo]) {
      const s = X.summarizeResults(set, set.length + 2, 3);
      assert.equal(s.outcomes, set.length);
      assert.equal(s.candidates, set.length + 2, "candidates are reported separately from displayed outcomes");
      assert.equal(s.noReaction, 3);
      assert.equal(Object.values(s.byStatus).reduce((a, b) => a + b, 0), set.length);
      assert.equal(s.families.reduce((a, f) => a + f.count, 0), set.length);
      assert.ok(s.distinctProducts <= set.filter((p) => p.productSmiles).length + set.reduce((n, p) => n + (p.productVariants?.length ?? 0), 0));
      assert.equal(s.withSelectivity, set.filter((p) => p.selectivity.length > 0).length);
      assert.equal(s.withLimitations, set.filter((p) => p.limitations.length > 0).length);
    }
  });
  test("distinct products are counted by structure, not by name or by outcome", () => {
    const s = X.summarizeResults(alkene, alkene.length, 0);
    const byHand = new Set(alkene.map((p) => p.productSmiles).filter(Boolean));
    assert.equal(s.distinctProducts, byHand.size);
    assert.ok(s.distinctProducts < alkene.length, "several reagents lead to the same product, so products are fewer than outcomes");
  });
  test("an empty result gives zeros, not invented figures", () => {
    const s = X.summarizeResults([], 0, 0);
    assert.deepEqual([s.outcomes, s.distinctProducts, s.families.length, s.withLimitations, s.competing], [0, 0, 0, 0, 0]);
    assert.deepEqual(X.groupResults([]), []);
    assert.ok(none.length < alkene.length);
  });
  test("one result is one group of one", () => {
    const g = X.groupResults(alkene.slice(0, 1));
    assert.equal(g.length, 1); assert.equal(g[0].items.length, 1);
    assert.equal(X.summarizeResults(alkene.slice(0, 1), 1, 0).outcomes, 1);
  });
  test("stereoisomeric products are different products and are never merged", () => {
    const base = alkene.find((p) => p.productSmiles) ?? alkene[0];
    const a = { ...base, id: "s-a", productSmiles: "C[C@H](O)CC", productVariants: undefined };
    const b = { ...base, id: "s-b", productSmiles: "C[C@@H](O)CC", productVariants: undefined };
    const c = { ...base, id: "s-c", productSmiles: "CC(O)CC", productVariants: undefined };
    const s = X.summarizeResults([a, b, c], 3, 0);
    assert.equal(s.distinctProducts, 3);
    assert.deepEqual(X.productKeys(a), ["C[C@H](O)CC"]);
    const ab = X.groupResults([a, b]);
    assert.equal(ab[0].items.length, 2, "same family, two rows, none merged");
  });
  test("a stated product mixture counts each member and is flagged", () => {
    const base = alkene[0];
    const m = { ...base, id: "mix", productVariants: [{ completeSmiles: "CC(O)CC" }, { completeSmiles: "CCC(C)O" }] };
    const s = X.summarizeResults([m], 1, 0);
    assert.equal(s.distinctProducts, 2); assert.equal(s.mixtures, 1);
  });
  test("competition is reported only when another outcome shares the group", () => {
    const base = alkene[0];
    const solo = { ...base, id: "c1", competition: { group: "g1", specificity: 1 } };
    const twin = { ...base, id: "c2", competition: { group: "g2", specificity: 1 } };
    const twin2 = { ...base, id: "c3", competition: { group: "g2", specificity: 2 } };
    assert.equal(X.summarizeResults([solo], 1, 0).competing, 0);
    assert.equal(X.summarizeResults([solo, twin, twin2], 3, 0).competing, 2);
  });
});

describe("grouping keeps identity, order and every result", () => {
  test("each outcome is in exactly one group, objects are the engine's own, and order inside a group is the engine's", () => {
    const groups = X.groupResults(alkene);
    const flat = groups.flatMap((g) => g.items);
    assert.equal(flat.length, alkene.length);
    assert.deepEqual(new Set(ids(flat)), new Set(ids(alkene)));
    for (const item of flat) assert.ok(alkene.includes(item), "identity preserved (same object)");
    for (const g of groups) {
      assert.ok(g.items.every((p) => p.reactionType === g.key));
      const order = g.items.map((p) => alkene.indexOf(p));
      assert.deepEqual(order, [...order].sort((a, b) => a - b), `engine order kept inside ${g.key}`);
    }
  });
  test("groups appear in order of first appearance (the engine's own ordering decides)", () => {
    const keys = X.groupResults(alkene).map((g) => g.key);
    const firstSeen = [...new Set(alkene.map((p) => p.reactionType))];
    assert.deepEqual(keys, firstSeen);
  });
  test("every group has a readable label", () => {
    for (const g of X.groupResults(alkene)) assert.ok(/^[A-Z]/.test(g.label) && g.label.length > 3, g.key);
  });
  test("warnings and limitations travel with the result untouched", () => {
    const withNotes = alkene.filter((p) => p.limitations.length > 0);
    assert.ok(withNotes.length > 0, "the alkene has outcomes with stated limitations");
    const flat = X.groupResults(alkene).flatMap((g) => g.items);
    for (const p of withNotes) assert.deepEqual(flat.find((q) => q.id === p.id).limitations, p.limitations);
  });
});

describe("filtering hides rows but never changes or loses them", () => {
  test("no filter returns every outcome", () => { assert.deepEqual(ids(X.filterResults(alkene, X.NO_FILTER)), ids(alkene)); assert.equal(X.isFiltering(X.NO_FILTER), false); });
  test("a text filter keeps only matches, a subset of the input", () => {
    const f = X.filterResults(alkene, { query: "hydrogen", status: "all" });
    assert.ok(f.length > 0 && f.length < alkene.length);
    for (const p of f) assert.ok(alkene.includes(p));
    assert.ok(f.every((p) => /hydrogen/i.test([p.title, p.reagentLabel, p.productLabel, p.chapter].join(" "))));
  });
  test("multiword queries need every word; accents and case are ignored", () => {
    const a = X.filterResults(alkene, { query: "BROMINE water", status: "all" });
    const b = X.filterResults(alkene, { query: "bromine", status: "all" });
    assert.ok(a.length <= b.length);
    assert.deepEqual(ids(X.filterResults(alkene, { query: "  HYDROGEN ", status: "all" })), ids(X.filterResults(alkene, { query: "hydrogen", status: "all" })));
  });
  test("the status filter partitions the outcomes", () => {
    const total = X.STATUS_ORDER.reduce((n, status) => n + X.filterResults(alkene, { query: "", status }).length, 0);
    assert.equal(total, alkene.length);
  });
  test("a filter that matches nothing returns nothing and the full set is still intact", () => {
    assert.deepEqual(X.filterResults(alkene, { query: "zzzznomatch", status: "all" }), []);
    assert.equal(X.filterResults(alkene, X.NO_FILTER).length, alkene.length);
  });
});

describe("large result sets stay cheap to mount and fully reachable", () => {
  let stress;
  before(() => { stress = Array.from({ length: 25 }, (_, copy) => alkene.map((p) => ({ ...p, id: `${p.id}#${copy}` }))).flat(); });
  test("a 500+ outcome stress set groups, summarizes and filters quickly", () => {
    const t0 = performance.now();
    const s = X.summarizeResults(stress, stress.length, 0);
    const groups = X.groupResults(stress);
    const f = X.filterResults(stress, { query: "hydrogen", status: "all" });
    const ms = performance.now() - t0;
    assert.ok(stress.length >= 500);
    assert.equal(s.outcomes, stress.length);
    assert.equal(groups.flatMap((g) => g.items).length, stress.length, "no truncation");
    assert.ok(f.length > 0);
    assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
  });
  test("initially only the first group's rows are mounted, never the full result set", () => {
    const groups = X.groupResults(stress);
    const open = X.initialOpenGroups(groups);
    assert.equal(open.size, 1);
    const mounted = X.mountedRowCount(groups, open);
    assert.equal(mounted, groups[0].items.length);
    assert.ok(mounted < stress.length / 3, `mounted ${mounted} of ${stress.length}`);
    assert.equal(X.mountedRowCount(groups, new Set(groups.map((g) => g.key))), stress.length, "opening every group reaches every row");
  });
  test("an empty set opens nothing", () => { assert.equal(X.initialOpenGroups([]).size, 0); assert.equal(X.mountedRowCount([], new Set()), 0); });
});
