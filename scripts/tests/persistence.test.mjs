// Phase 4 / Stage 8B-1: workspace recovery foundation (store, controller, page validators).
//
// Everything runs against an in-memory backend that behaves like the IndexedDB one (string values,
// quota errors, shared "disk" across simulated reloads) with fake timers, so the tests are
// deterministic. The only real chemistry is one trivial one-step search and a small Properties
// analysis used to prove that real outputs are plain, serializable data.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");

let storeModule;
let controllerModule;
let ketIdentity;
let synthesis;
let properties;
let registry;
let runModule;

before(async () => {
  await loadEngine();
  storeModule = await loadModule("/src/utils/persistence/workspaceStore.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  ketIdentity = await loadModule("/src/utils/persistence/ketIdentity.ts");
  synthesis = await loadModule("/src/utils/persistence/synthesisWorkspace.ts");
  properties = await loadModule("/src/utils/persistence/propertiesWorkspace.ts");
  runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  ({ reactionRegistry: registry } = await loadModule("/src/utils/reactionUtils.ts"));
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------------

function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    timers: {
      set: (callback) => {
        const id = next++;
        pending.set(id, callback);
        return id;
      },
      clear: (id) => pending.delete(id),
    },
    get pendingCount() {
      return pending.size;
    },
    fire() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const newStore = (backend, options) => new storeModule.WorkspaceStore(backend, options);
const makeResults = (data, extra = {}) => ({ computedAt: "2026-10-22T12:00:00.000Z", engineVersion: 1, stale: false, status: "complete", data, ...extra });

/** A minimal KET molecule document: atoms are [label, x, y, extras]; bonds are [a, b, type, stereo]. */
function ket(...molecules) {
  const doc = { root: { nodes: molecules.map((_, index) => ({ $ref: `mol${index}` })) } };
  molecules.forEach((molecule, index) => {
    doc[`mol${index}`] = {
      type: "molecule",
      atoms: molecule.atoms.map(([label, x, y, extra]) => ({ label, location: [x, y, 0], ...(extra ?? {}) })),
      bonds: molecule.bonds.map(([a, b, type = 1, stereo]) => ({ type, atoms: [a, b], ...(stereo ? { stereo } : {}) })),
    };
  });
  return JSON.stringify(doc);
}
// CHFClBr with the C-F bond drawn wedged (1) or hashed (6): the two enantiomers.
const halo = (stereo, shift = 0) => ket({
  atoms: [["C", shift, 0], ["F", shift + 1, 0], ["Cl", shift - 1, 0.5], ["Br", shift, -1]],
  bonds: [[0, 1, 1, stereo], [0, 2], [0, 3]],
});
const ethane = (isotope) => ket({ atoms: [["C", 0, 0, isotope ? { isotope } : undefined], ["C", 1, 0]], bonds: [[0, 1]] });
const ammonium = (charge) => ket({ atoms: [["N", 0, 0, { charge }], ["C", 1, 0]], bonds: [[0, 1]] });
const water = ket({ atoms: [["O", 0, 0]], bonds: [] });
const synInputs = (overrides = {}) => ({
  reactantKet: ethane(), targetKet: water, reactantKey: "CC", targetKey: "O", copies: 1, ...overrides,
});

// ---- store: envelope, reload, independence -------------------------------------------------------

describe("workspace store", () => {
  test("[store] saves and loads a record; a simulated reload (new store, same disk) recovers it", async () => {
    const disk = new Map();
    const first = newStore(new storeModule.MemoryBackend({ map: disk }));
    const inputs = synInputs();
    assert.deepEqual(await first.save("synthesis", { inputs, results: makeResults({ note: "x" }) }), { ok: true });
    const second = newStore(new storeModule.MemoryBackend({ map: disk })); // browser restart
    const loaded = await second.load("synthesis");
    assert.equal(loaded.kind, "ok");
    assert.deepEqual(loaded.record.inputs, inputs);
    assert.equal(loaded.record.results.data.note, "x");
    assert.equal(loaded.record.schemaVersion, storeModule.PERSISTENCE_SCHEMA_VERSION);
    assert.equal(loaded.record.appVersion, storeModule.PERSISTENCE_APP_VERSION);
    assert.match(loaded.record.createdAt, /^\d{4}-/);
    assert.equal(loaded.migratedFrom, null);
  });

  test("[store] pages are independent: saving, clearing or corrupting one never touches another", async () => {
    const disk = new Map();
    const store = newStore(new storeModule.MemoryBackend({ map: disk }));
    await store.save("synthesis", { inputs: synInputs(), results: null });
    await store.save("properties", { inputs: { ket: null }, results: null });
    await store.remove("synthesis");
    assert.equal((await store.load("synthesis")).kind, "none");
    assert.equal((await store.load("properties")).kind, "ok");
    disk.set("workspace:properties", "not json");
    assert.equal((await store.load("properties")).kind, "corrupt");
    assert.equal((await store.load("synthesis")).kind, "none");
  });

  test("[store] malformed records are corrupt, set aside and removed, never half-loaded", async () => {
    const disk = new Map();
    const store = newStore(new storeModule.MemoryBackend({ map: disk }));
    const good = JSON.stringify({
      kind: "workspace", id: "workspace:synthesis", page: "synthesis", schemaVersion: 1, appVersion: "a",
      createdAt: "2026-01-01", updatedAt: "2026-01-01", inputs: {}, results: null,
    });
    const bad = {
      "not json": "{broken",
      "wrong shape": JSON.stringify([1, 2]),
      "wrong page": good.replace('"page":"synthesis"', '"page":"properties"'),
      "no version": good.replace('"schemaVersion":1', '"schemaVersion":"x"'),
      "no inputs": good.replace('"inputs":{}', '"inputs":5'),
      "bad results": good.replace('"results":null', '"results":{"computedAt":"d"}'),
      "missing id": good.replace('"id":"workspace:synthesis"', '"id":""'),
    };
    for (const [label, text] of Object.entries(bad)) {
      disk.clear();
      disk.set("workspace:synthesis", text);
      const loaded = await store.load("synthesis");
      assert.equal(loaded.kind, "corrupt", label);
      assert.equal(disk.has("workspace:synthesis"), false, `${label}: removed`);
      assert.equal(disk.get("workspace:synthesis#rejected"), text, `${label}: kept aside`);
    }
    disk.clear();
    disk.set("workspace:synthesis", good);
    assert.equal((await store.load("synthesis")).kind, "ok");
  });

  test("[store] a newer schema is incompatible (kept aside); older schemas migrate; a missing migration is incompatible", async () => {
    const disk = new Map();
    const v1 = newStore(new storeModule.MemoryBackend({ map: disk }));
    await v1.save("synthesis", { inputs: { n: 1 }, results: null });
    const v1Text = disk.get("workspace:synthesis");

    // A build that only understands format 0... cannot read format 1.
    const older = newStore(new storeModule.MemoryBackend({ map: disk }), { schemaVersion: 1 });
    disk.set("workspace:synthesis", v1Text.replace('"schemaVersion":1', '"schemaVersion":2'));
    const newer = await older.load("synthesis");
    assert.equal(newer.kind, "incompatible");
    assert.equal(newer.schemaVersion, 2);
    assert.match(newer.reason, /newer version/);
    assert.ok(disk.get("workspace:synthesis#rejected").includes('"schemaVersion":2'), "newer data is preserved, not deleted");

    // A build at format 2 migrates format-1 records.
    disk.clear();
    disk.set("workspace:synthesis", v1Text);
    const v2 = newStore(new storeModule.MemoryBackend({ map: disk }), {
      schemaVersion: 2,
      migrations: { 1: (record) => ({ ...record, inputs: { ...record.inputs, migrated: true } }) },
    });
    const migrated = await v2.load("synthesis");
    assert.equal(migrated.kind, "ok");
    assert.equal(migrated.migratedFrom, 1);
    assert.equal(migrated.record.schemaVersion, 2);
    assert.equal(migrated.record.inputs.migrated, true);

    disk.clear();
    disk.set("workspace:synthesis", v1Text);
    const noPath = newStore(new storeModule.MemoryBackend({ map: disk }), { schemaVersion: 3, migrations: { 1: (r) => r } });
    assert.equal((await noPath.load("synthesis")).kind, "incompatible");
  });

  test("[store] oversized, quota, unavailable and unserializable writes fail safely and do not throw", async () => {
    const small = newStore(new storeModule.MemoryBackend(), { maxRecordChars: 200 });
    const tooLarge = await small.save("synthesis", { inputs: { text: "x".repeat(500) }, results: null });
    assert.deepEqual([tooLarge.ok, tooLarge.code], [false, "too-large"]);

    const quota = newStore(new storeModule.MemoryBackend({ quotaChars: 50 }));
    const full = await quota.save("synthesis", { inputs: synInputs(), results: null });
    assert.deepEqual([full.ok, full.code], [false, "quota"]);

    const none = newStore(null);
    assert.equal(none.available, false);
    assert.equal((await none.save("synthesis", { inputs: {}, results: null })).code, "unavailable");
    assert.equal((await none.load("synthesis")).kind, "unavailable");

    const broken = new storeModule.MemoryBackend();
    broken.failWith = new storeModule.PersistenceError("unavailable", "blocked");
    const blocked = newStore(broken);
    assert.equal((await blocked.load("synthesis")).kind, "unavailable");
    assert.equal((await blocked.save("synthesis", { inputs: {}, results: null })).code, "unavailable");

    const store = newStore(new storeModule.MemoryBackend());
    for (const bad of [new Map(), () => 1, new AbortController(), Number.NaN, 10n]) {
      const result = await store.save("synthesis", { inputs: { bad }, results: null });
      assert.deepEqual([result.ok, result.code], [false, "unserializable"], String(bad));
    }
    const cyclic = {};
    cyclic.self = cyclic;
    assert.equal((await store.save("synthesis", { inputs: cyclic, results: null })).code, "unserializable");
    assert.doesNotThrow(() => storeModule.assertPlainJson({ a: undefined, b: [1, "x", null, { c: true }] }));
  });

  test("[store] the persisted record never contains runtime objects (source guard)", () => {
    const sources = ["workspaceStore.ts", "workspacePersistence.ts", "synthesisWorkspace.ts", "propertiesWorkspace.ts"].map((file) => read("src", "utils", "persistence", file)).join("\n");
    assert.doesNotMatch(sources, /from "\.\.\/(rdkit|ketcher)|from "react"|new AbortController/);
  });
});

// ---- controller: lifecycle, stale async, clear/reset, failures --------------------------------------------

describe("workspace persistence lifecycle", () => {
  function controllerFor(backend, clock, overrides = {}) {
    const store = newStore(backend);
    return new controllerModule.WorkspacePersistence({
      store,
      page: "synthesis",
      engineVersion: 1,
      validateInputs: synthesis.validateSynthesisInputs,
      validateResults: (raw) => raw,
      debounceMs: 800,
      timers: clock.timers,
      ...overrides,
    });
  }
  const capture = (inputs = synInputs(), results = null) => () => ({ inputs, results });

  test("[lifecycle] nothing is written before recovery finishes (empty defaults cannot overwrite saved work)", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    controller.requestSave(capture());
    assert.equal(clock.pendingCount, 0, "no timer while loading");
    await controller.flush();
    assert.equal(backend.putCount, 0);
    assert.equal((await controller.recover()).kind, "none");
    controller.requestSave(capture());
    assert.equal(clock.pendingCount, 1);
  });

  test("[lifecycle] saved work is recovered; saving the recovered state again writes nothing new", async () => {
    const disk = new Map();
    const writer = controllerFor(new storeModule.MemoryBackend({ map: disk }), fakeTimers());
    await writer.recover();
    const clock = fakeTimers();
    const first = controllerFor(new storeModule.MemoryBackend({ map: disk }), clock);
    await first.recover();
    first.requestSave(capture(synInputs(), makeResults({ n: 1 })));
    clock.fire();
    await first.flush();

    const backend = new storeModule.MemoryBackend({ map: disk });
    const reloadClock = fakeTimers();
    const reloaded = controllerFor(backend, reloadClock);
    const outcome = await reloaded.recover();
    assert.equal(outcome.kind, "restored");
    assert.deepEqual(outcome.inputs, synInputs());
    assert.equal(outcome.results.data.n, 1);
    assert.equal(outcome.engineMismatch, false);
    assert.equal(outcome.resultsDropped, false);
    reloaded.resumeAfterRestore();
    reloaded.requestSave(capture(outcome.inputs, outcome.results));
    reloadClock.fire();
    await reloaded.flush();
    assert.equal(backend.putCount, 0, "identical state is not rewritten");
  });

  test("[lifecycle] between reading a saved record and the page applying it, nothing is written (defaults cannot replace it)", async () => {
    const disk = new Map();
    await newStore(new storeModule.MemoryBackend({ map: disk })).save("synthesis", { inputs: synInputs(), results: makeResults({ n: 1 }) });
    const backend = new storeModule.MemoryBackend({ map: disk });
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    const outcome = await controller.recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(controller.currentPhase, "restoring");
    controller.requestSave(() => null); // the page's still-empty default state
    controller.requestSave(capture(synInputs({ copies: 2 })));
    assert.equal(clock.pendingCount, 0);
    clock.fire();
    await controller.flush();
    assert.equal(backend.putCount, 0);
    assert.ok(disk.has("workspace:synthesis"), "the saved record is untouched");
    controller.resumeAfterRestore();
    assert.equal(controller.isLive, true);
    controller.requestSave(capture(synInputs({ copies: 2 })));
    assert.equal(clock.pendingCount, 1);
  });

  test("[lifecycle] a failed editor restore can stop saving so the saved copy is never overwritten", async () => {
    const disk = new Map();
    await newStore(new storeModule.MemoryBackend({ map: disk })).save("synthesis", { inputs: synInputs(), results: null });
    const backend = new storeModule.MemoryBackend({ map: disk });
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.resumeAfterRestore();
    controller.disable();
    controller.requestSave(() => null);
    assert.equal(clock.pendingCount, 0);
    await controller.discard(); // Clear starts over
    assert.equal(controller.isLive, true);
  });

  test("[lifecycle] rapid changes are coalesced into one write", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    for (let copies = 0; copies < 5; copies += 1) controller.requestSave(capture(synInputs({ copies: copies % 2 ? 2 : 1 })));
    assert.equal(clock.pendingCount, 1);
    clock.fire();
    await controller.flush();
    assert.equal(backend.putCount, 1);
  });

  test("[stale] Clear during a slow recovery wins: the late record is never applied and is deleted", async () => {
    const disk = new Map();
    await newStore(new storeModule.MemoryBackend({ map: disk })).save("synthesis", { inputs: synInputs(), results: null });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    class SlowBackend extends storeModule.MemoryBackend {
      async get(key) { await gate; return super.get(key); }
    }
    const controller = controllerFor(new SlowBackend({ map: disk }), fakeTimers());
    const recovery = controller.recover();
    const clearing = controller.discard();
    release();
    assert.equal((await recovery).kind, "superseded");
    await clearing;
    assert.equal(disk.has("workspace:synthesis"), false);
    assert.equal(controller.isLive, true, "the cleared page keeps working and saving");
  });

  test("[reset] discard cancels a scheduled save, so a cleared page cannot be resurrected", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.requestSave(capture());
    clock.fire();
    await controller.flush();
    assert.equal(backend.map.has("workspace:synthesis"), true);

    controller.requestSave(capture(synInputs({ copies: 2 })));
    const token = controller.token();
    await controller.discard();
    assert.equal(controller.isCurrent(token), false, "follow-up async restoration work is invalidated");
    clock.fire();
    await controller.flush();
    assert.equal(backend.map.has("workspace:synthesis"), false);
  });

  test("[reset] a write that was already queued when Clear happens cannot land after it", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.requestSave(capture());
    clock.fire(); // enqueues the write
    await controller.discard(); // epoch bump + delete, queued behind the write
    await controller.flush();
    assert.equal(backend.map.has("workspace:synthesis"), false);
  });

  test("[reset] capturing nothing removes the record", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.requestSave(capture());
    clock.fire();
    await controller.flush();
    assert.equal(backend.map.has("workspace:synthesis"), true);
    controller.requestSave(() => null);
    clock.fire();
    await controller.flush();
    assert.equal(backend.map.has("workspace:synthesis"), false);
  });

  test("[failure] quota errors are reported, never thrown, and the next successful write clears the error", async () => {
    const backend = new storeModule.MemoryBackend({ quotaChars: 10 });
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.requestSave(capture());
    clock.fire();
    await controller.flush();
    assert.equal(controller.getStatus().saveError.code, "quota");
    backend.quotaChars = null;
    controller.requestSave(capture(synInputs({ copies: 2 })));
    clock.fire();
    await controller.flush();
    assert.equal(controller.getStatus().saveError, null);
    assert.equal(backend.map.has("workspace:synthesis"), true);
  });

  test("[failure] results that are too large are dropped but the inputs are still saved, and the page is told", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const store = newStore(backend, { maxRecordChars: 20_000 });
    const controller = new controllerModule.WorkspacePersistence({
      store, page: "synthesis", engineVersion: 1, validateInputs: synthesis.validateSynthesisInputs, validateResults: (raw) => raw, timers: clock.timers,
    });
    await controller.recover();
    controller.requestSave(capture(synInputs(), makeResults({ blob: "y".repeat(50_000) })));
    clock.fire();
    await controller.flush();
    assert.equal(controller.getStatus().resultsOmitted, true);
    const loaded = await store.load("synthesis");
    assert.equal(loaded.kind, "ok");
    assert.equal(loaded.record.results, null);
    assert.deepEqual(loaded.record.inputs, synInputs());
  });

  test("[failure] unavailable storage disables saving and does not break recovery", async () => {
    const broken = new storeModule.MemoryBackend();
    broken.failWith = new storeModule.PersistenceError("unavailable", "blocked");
    const clock = fakeTimers();
    const controller = controllerFor(broken, clock);
    const outcome = await controller.recover();
    assert.equal(outcome.kind, "unavailable");
    assert.equal(controller.getStatus().available, false);
    controller.requestSave(capture());
    assert.equal(clock.pendingCount, 0);
  });

  test("[versions] older-engine results are flagged, damaged results are dropped but inputs survive, damaged inputs are rejected", async () => {
    const disk = new Map();
    const store = newStore(new storeModule.MemoryBackend({ map: disk }));
    await store.save("synthesis", { inputs: synInputs(), results: makeResults({ ok: true }, { engineVersion: 0 }) });
    let outcome = await controllerFor(new storeModule.MemoryBackend({ map: disk }), fakeTimers()).recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.engineMismatch, true, "shown as a saved snapshot, not silently upgraded");
    assert.equal(outcome.results.engineVersion, 0, "the saved engine version is kept as written");

    outcome = await controllerFor(new storeModule.MemoryBackend({ map: disk }), fakeTimers(), { validateResults: () => null }).recover();
    assert.equal(outcome.kind, "restored");
    assert.equal(outcome.resultsDropped, true);
    assert.equal(outcome.results, null);
    assert.deepEqual(outcome.inputs, synInputs());

    outcome = await controllerFor(new storeModule.MemoryBackend({ map: disk }), fakeTimers(), { validateInputs: () => null }).recover();
    assert.equal(outcome.kind, "rejected");
  });

  test("[lifecycle] leaving the page flushes the pending save instead of dropping it", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.requestSave(capture(synInputs({ copies: 2 })));
    controller.detach();
    await controller.flush();
    assert.equal(JSON.parse(backend.map.get("workspace:synthesis")).inputs.copies, 2);
  });

  test("[lifecycle] recover() is idempotent (StrictMode double effects) and sees one read", async () => {
    let reads = 0;
    class CountingBackend extends storeModule.MemoryBackend {
      async get(key) { reads += 1; return super.get(key); }
    }
    const controller = controllerFor(new CountingBackend(), fakeTimers());
    const [a, b] = await Promise.all([controller.recover(), controller.recover()]);
    assert.equal(a, b);
    assert.equal(reads, 1);
  });

  test("[pages] two controllers on two pages keep independent records and lifecycles", async () => {
    const backend = new storeModule.MemoryBackend();
    const clock = fakeTimers();
    const store = newStore(backend);
    const make = (page) => new controllerModule.WorkspacePersistence({ store, page, engineVersion: 1, validateInputs: (raw) => raw, validateResults: (raw) => raw, timers: clock.timers });
    const a = make("synthesis");
    const b = make("properties");
    await Promise.all([a.recover(), b.recover()]);
    a.requestSave(() => ({ inputs: { who: "a" }, results: null }));
    b.requestSave(() => ({ inputs: { who: "b" }, results: null }));
    clock.fire();
    await Promise.all([a.flush(), b.flush()]);
    await a.discard();
    assert.equal(backend.map.has("workspace:synthesis"), false);
    assert.equal(JSON.parse(backend.map.get("workspace:properties")).inputs.who, "b");
  });
});

// ---- structure identity and fidelity ---------------------------------------------------------------

describe("structure fidelity and input/result consistency", () => {
  test("[structure] KET text survives the store byte-for-byte, including stereo wedges, isotopes, charges and components", async () => {
    const store = newStore(new storeModule.MemoryBackend());
    const inputs = synInputs({ reactantKet: ket(
      { atoms: [["C", 0, 0], ["F", 1, 0], ["Cl", -1, 0.5], ["Br", 0, -1]], bonds: [[0, 1, 1, 1], [0, 2], [0, 3]] },
      { atoms: [["C", 5, 0, { isotope: 13 }], ["N", 6, 0, { charge: 1 }]], bonds: [[0, 1]] },
      { atoms: [["O", 9, 0]], bonds: [] },
    ) });
    await store.save("synthesis", { inputs, results: null });
    const loaded = await store.load("synthesis");
    assert.equal(loaded.record.inputs.reactantKet, inputs.reactantKet);
    assert.equal(await ketIdentity.ketIdentityKey(loaded.record.inputs.reactantKet), await ketIdentity.ketIdentityKey(inputs.reactantKet));
  });

  test("[structure] the identity key sees stereochemistry, isotopes, charges and components but not coordinates or order", async () => {
    const key = ketIdentity.ketIdentityKey;
    const wedge = await key(halo(1));
    const hash = await key(halo(6));
    assert.ok(wedge && hash && wedge !== hash, "enantiomers differ");
    assert.equal(await key(halo(1, 40)), wedge, "moving the drawing does not change the key");
    assert.notEqual(await key(ethane(13)), await key(ethane()), "isotope");
    assert.notEqual(await key(ammonium(1)), await key(ammonium(0)), "charge");
    const two = ket({ atoms: [["C", 0, 0]], bonds: [] }, { atoms: [["O", 3, 0]], bonds: [] });
    const swapped = ket({ atoms: [["O", 3, 0]], bonds: [] }, { atoms: [["C", 0, 0]], bonds: [] });
    assert.equal(await key(two), await key(swapped), "component order is irrelevant");
    assert.equal((await key(two)).split(".").length, 2, "components stay separate");
    assert.equal(await key(null), null);
    assert.equal(await key("{not json"), null);
    assert.equal(await key(JSON.stringify({ root: { nodes: [] } })), null, "an empty canvas has no structure");
    assert.equal(ketIdentity.ketHasStructureText(water), true);
    assert.equal(ketIdentity.ketHasStructureText(JSON.stringify({ root: { nodes: [] } })), false);
  });

  test("[consistency] the input key changes with structures or the copies setting, so old results are not treated as current", () => {
    const base = synthesis.synthesisInputKey("CC.O", "CCO", 1);
    assert.equal(synthesis.synthesisInputKey("CC.O", "CCO", 1), base);
    assert.notEqual(synthesis.synthesisInputKey("CC.O", "CCO", 2), base);
    assert.notEqual(synthesis.synthesisInputKey("CC.O", "CCC", 1), base);
    assert.notEqual(synthesis.synthesisInputKey("CC", "CCO", 1), base);
  });
});

// ---- synthesis: real route, validation -------------------------------------------------------------

describe("synthesis workspace (one real, trivial route)", () => {
  let route;
  let results;

  before(async () => {
    const controller = new runModule.SearchRunController({ rules: registry, totalMs: 20000 });
    await controller.start({ startingSmiles: "Cc1ccc(O)cc1.CBr", targetSmiles: "COc1ccc(C)cc1" });
    const state = controller.getState();
    assert.equal(state.outcome.kind, "found", JSON.stringify(state.outcome));
    route = state.routes[0];
    results = {
      inputKey: synthesis.synthesisInputKey("CBr.Cc1ccc(O)cc1", "COc1ccc(C)cc1", 1),
      startingSmiles: "Cc1ccc(O)cc1.CBr",
      targetSmiles: "COc1ccc(C)cc1",
      copies: 1,
      startingNames: ["p-cresol", "bromomethane"],
      targetName: "4-methylanisole",
      routes: state.routes,
      outcomeMessage: state.outcome.message,
      interruptedNote: null,
      elapsedMs: 1234,
    };
  });

  test("[results] a real route is plain data, survives the store unchanged and passes validation", async () => {
    storeModule.assertPlainJson(results);
    const store = newStore(new storeModule.MemoryBackend());
    assert.deepEqual(await store.save("synthesis", { inputs: synInputs(), results: makeResults(results, { status: "found" }) }), { ok: true });
    const loaded = await store.load("synthesis");
    const restored = synthesis.validateSynthesisResults(loaded.record.results.data);
    assert.ok(restored);
    const original = JSON.parse(JSON.stringify(results));
    assert.deepEqual(restored, original);
    const savedRoute = restored.routes[0];
    assert.equal(savedRoute.verification.status, route.verification.status, "verification status is kept as computed");
    assert.deepEqual(savedRoute.steps.map((s) => s.ruleId), route.steps.map((s) => s.ruleId));
    assert.deepEqual(savedRoute.verification.inventory, JSON.parse(JSON.stringify(route.verification.inventory)), "inventory provenance");
    assert.deepEqual(savedRoute.compatibility ?? null, JSON.parse(JSON.stringify(route.compatibility ?? null)), "compatibility findings stay separate from verification");
    assert.ok(JSON.stringify(results).length < 500_000, "a small route stays small");
  });

  test("[results] damaged, incomplete or oversized results are refused as a whole", () => {
    const clone = () => JSON.parse(JSON.stringify(results));
    assert.ok(synthesis.validateSynthesisResults(clone()));
    const cases = {
      "route without steps": (r) => { r.routes[0].steps = []; },
      "step without components": (r) => { delete r.routes[0].steps[0].reactantComponents; },
      "verification without arrays": (r) => { delete r.routes[0].verification.unusedStartingMaterials; },
      "route is not an object": (r) => { r.routes[0] = 5; },
      "bad copies": (r) => { r.copies = 3; },
      "bad key": (r) => { r.inputKey = 7; },
      "too many routes": (r) => { r.routes = Array.from({ length: 51 }, () => r.routes[0]); },
      "not an object": () => null,
    };
    for (const [label, mutate] of Object.entries(cases)) {
      const damaged = clone();
      const value = mutate(damaged) === null ? null : damaged;
      assert.equal(synthesis.validateSynthesisResults(value), null, label);
    }
  });

  test("[inputs] saved inputs are validated: type errors, non-KET text and oversized KET are rejected", () => {
    assert.ok(synthesis.validateSynthesisInputs(synInputs()));
    assert.ok(synthesis.validateSynthesisInputs(synInputs({ reactantKet: null, targetKet: null })));
    for (const bad of [
      synInputs({ copies: 3 }), synInputs({ reactantKet: "{nope" }), synInputs({ targetKet: "[]" }),
      synInputs({ reactantKet: "x".repeat(1_600_000) }), synInputs({ reactantKey: 5 }), null, "text",
    ]) assert.equal(synthesis.validateSynthesisInputs(bad), null);
  });

  test("[status] only meaningful outcomes can be saved; errors and stalls are not results", () => {
    for (const kind of ["found", "found-interrupted", "cancelled", "no-route-within-budget", "no-route-within-bounds"]) {
      assert.equal(synthesis.isSynthesisOutcomeKind(kind), true, kind);
    }
    for (const kind of ["error", "stalled", "running", ""]) assert.equal(synthesis.isSynthesisOutcomeKind(kind), false, kind);
  });
});

// ---- properties: real small analysis ---------------------------------------------------------------------------

describe("properties workspace (one small real analysis)", () => {
  let results;

  before(async () => {
    const annotation = await loadModule("/src/utils/moleculeAnnotation.ts");
    const resonance = await loadModule("/src/utils/resonanceUtils.ts");
    const chirality = await loadModule("/src/utils/chiralityUtils.ts");
    const groups = await loadModule("/src/utils/functionalGroups/index.ts");
    const naming = await loadModule("/src/utils/nomenclatureUtils.ts");
    const acidity = await loadModule("/src/utils/ranking/acidBase/analyzeAcidity.ts");
    const basicity = await loadModule("/src/utils/ranking/acidBase/analyzeBasicity.ts");
    const reactionUtils = await loadModule("/src/utils/reactionUtils.ts");
    const smiles = "C[C@H](N)C(=O)O";
    const [moleculeAnnotation, resonanceResults, chiralityResults, hierarchy] = await Promise.all([
      annotation.getMoleculeAnnotation(smiles),
      resonance.analyzeResonance(smiles),
      chirality.analyzeChirality(smiles),
      groups.analyzeFunctionalGroupHierarchy(smiles),
    ]);
    const functionalGroups = hierarchy.functionalGroups ?? [];
    const [reactionPathways, moleculeIdentity, acidityResults, basicityResults] = await Promise.all([
      reactionUtils.predictReactionPathways(smiles, functionalGroups),
      naming.analyzeNomenclatureAndProperties(smiles, hierarchy.primaryGroups, hierarchy.mainGroup),
      acidity.analyzeAcidity(smiles, hierarchy.primaryGroups),
      basicity.analyzeBasicity(smiles, hierarchy.primaryGroups),
    ]);
    results = {
      inputKey: "C[C@H](N)C(=O)O", smiles, molfile: null, functionalGroups, acidityResults, basicityResults,
      resonanceResults, chiralityResults, moleculeAnnotation, moleculeIdentity, reactionPathways,
    };
  });

  const inputs = (overrides = {}) => ({
    ket: water, key: "O", analysisPanel: "overview", selectedConcept: "functionalGroups",
    selectedHybridization: "all", selectedBondType: "all", ...overrides,
  });

  test("[results] real Properties output is plain data, round-trips through the store unchanged and validates", async () => {
    storeModule.assertPlainJson(results);
    const store = newStore(new storeModule.MemoryBackend());
    assert.deepEqual(await store.save("properties", { inputs: inputs(), results: makeResults(results) }), { ok: true });
    const loaded = await store.load("properties");
    const restored = properties.validatePropertiesResults(loaded.record.results.data);
    assert.ok(restored);
    assert.deepEqual(restored, JSON.parse(JSON.stringify(results)));
    assert.match(restored.smiles, /@/, "the stereocentre is kept");
    assert.ok(restored.chiralityResults.length > 0);
    assert.ok(restored.moleculeIdentity.nomenclature, "name and its explanation are kept as displayed");
  });

  test("[results] damaged Properties results and inputs are refused", () => {
    const clone = () => JSON.parse(JSON.stringify(results));
    assert.ok(properties.validatePropertiesResults(clone()));
    for (const mutate of [
      (r) => { r.functionalGroups = {}; },
      (r) => { r.smiles = "   "; },
      (r) => { r.moleculeAnnotation = { atoms: 5, bonds: [] }; },
      (r) => { r.moleculeIdentity = { nomenclature: {} }; },
      (r) => { r.molfile = 5; },
    ]) {
      const damaged = clone();
      mutate(damaged);
      assert.equal(properties.validatePropertiesResults(damaged), null);
    }
    assert.ok(properties.validatePropertiesInputs(inputs()));
    assert.ok(properties.validatePropertiesInputs(inputs({ ket: null, key: null })));
    for (const bad of [inputs({ analysisPanel: "nope" }), inputs({ selectedConcept: "x" }), inputs({ ket: "{bad" }), inputs({ selectedBondType: "quadruple" }), null]) {
      assert.equal(properties.validatePropertiesInputs(bad), null);
    }
  });
});

// ---- page integration (source-level; the browser behaviour is checked manually) ---------------------------------

describe("page integration", () => {
  const page = read("src", "components", "SynthesisPage.tsx");
  const app = read("src", "App.tsx");

  test("[source] only Synthesis, Properties, Ranking and Spectroscopy use persistence (Reactions is 8B-2B)", () => {
    const users = [];
    for (const file of fs.readdirSync(path.join(root, "src", "components"))) {
      if (file.endsWith(".tsx") && /useWorkspacePersistence/.test(read("src", "components", file))) users.push(file);
    }
    assert.deepEqual(users.sort(), ["RankingPage.tsx", "SpectroscopyPage.tsx", "SynthesisPage.tsx"]);
    assert.match(app, /useWorkspacePersistence/);
    for (const other of ["ReactionsPage.tsx", "MultiCatalyticPage.tsx"]) {
      assert.doesNotMatch(read("src", "components", other), /persistence|indexedDB/i, other);
    }
  });

  test("[source] Clear and Reset discard the saved workspace and invalidate pending restoration", () => {
    assert.match(page, /persistence\.discard\(\)/);
    assert.match(app, /persistence\.discard\(\)/);
  });

  test("[source] progress updates never trigger a save: saves depend on settled state only", () => {
    const effect = page.slice(page.indexOf("requestSave("), page.indexOf("requestSave(") + 600);
    assert.doesNotMatch(page.slice(page.indexOf("// Autosave"), page.indexOf("// Autosave") + 1500), /searchProgress|searchElapsedMs/);
    assert.ok(effect.length > 0);
  });

  test("[source] results are marked as restored and never re-run automatically", () => {
    assert.match(page, /Restored from your previous session/);
    assert.doesNotMatch(page.slice(page.indexOf("function applyRestoredWorkspace"), page.indexOf("function applyRestoredWorkspace") + 4000), /findSynthesis\(|controller\.start\(/);
    assert.match(app, /Restored from your previous session/);
  });
});

// ---- the IndexedDB backend, against a small in-memory IDBFactory ------------------------------------------

describe("IndexedDB backend", () => {
  /** Just enough of IndexedDB: one database, object stores, request/transaction callbacks fired asynchronously. */
  function fakeIdb({ openError = null, writeError = null } = {}) {
    const stores = new Map();
    const created = [];
    const factory = {
      open(name, version) {
        const request = {};
        setImmediate(() => {
          if (openError) {
            request.error = openError;
            request.onerror?.();
            return;
          }
          const names = new Set(stores.keys());
          const db = {
            objectStoreNames: { contains: (store) => names.has(store) },
            createObjectStore: (store) => { stores.set(store, new Map()); names.add(store); created.push([name, version, store]); },
            close() {},
            transaction(store, mode) {
              const data = stores.get(store);
              const tx = {};
              const schedule = (apply) => {
                const req = {};
                setImmediate(() => {
                  if (mode === "readwrite" && writeError) {
                    tx.error = writeError;
                    tx.onabort?.();
                    return;
                  }
                  req.result = apply();
                  req.onsuccess?.();
                  setImmediate(() => tx.oncomplete?.());
                });
                return req;
              };
              tx.objectStore = () => ({
                get: (key) => schedule(() => data.get(key)),
                put: (value, key) => schedule(() => { data.set(key, value); }),
                delete: (key) => schedule(() => { data.delete(key); }),
              });
              return tx;
            },
          };
          request.result = db;
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    };
    return { factory, stores, created };
  }

  test("[idb] creates its store once, writes durably, reads, overwrites and deletes", async () => {
    const { factory, stores, created } = fakeIdb();
    const backend = storeModule.createIndexedDbBackend(factory);
    assert.ok(backend);
    assert.equal(await backend.get("k"), undefined);
    await backend.put("k", "one");
    await backend.put("k", "two");
    assert.equal(await backend.get("k"), "two");
    assert.equal(stores.get("records").get("k"), "two");
    await backend.delete("k");
    assert.equal(await backend.get("k"), undefined);
    assert.equal(created.length, 1, "the object store is created once");
  });

  test("[idb] a full WorkspaceStore works on it, including a simulated browser restart", async () => {
    const { factory } = fakeIdb();
    const first = newStore(storeModule.createIndexedDbBackend(factory));
    await first.save("properties", { inputs: { ket: water }, results: null });
    const restarted = newStore(storeModule.createIndexedDbBackend(factory));
    const loaded = await restarted.load("properties");
    assert.equal(loaded.kind, "ok");
    assert.equal(loaded.record.inputs.ket, water);
  });

  test("[idb] quota and open failures become typed errors instead of exceptions", async () => {
    const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const store = newStore(storeModule.createIndexedDbBackend(fakeIdb({ writeError: quota }).factory));
    assert.equal((await store.save("synthesis", { inputs: {}, results: null })).code, "quota");

    const blocked = newStore(storeModule.createIndexedDbBackend(fakeIdb({ openError: Object.assign(new Error("no"), { name: "SecurityError" }) }).factory));
    assert.equal((await blocked.load("synthesis")).kind, "unavailable");
    assert.equal((await blocked.save("synthesis", { inputs: {}, results: null })).code, "unavailable");
  });

  test("[idb] no IndexedDB at all means persistence is simply unavailable", async () => {
    assert.equal(storeModule.createIndexedDbBackend(null), null);
    assert.equal(newStore(storeModule.createIndexedDbBackend(null)).available, false);
  });
});
