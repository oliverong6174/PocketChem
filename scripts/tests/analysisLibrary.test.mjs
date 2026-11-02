// Phase 4 / Stage 8B-3A: the Saved Analyses library and its Synthesis integration.
//
// The library runs on an in-memory backend (quota and failure injection) and on a small in-memory
// IDBFactory that models object stores and database versions, so the version 1 -> 2 upgrade that
// adds the "analyses" store is exercised too. Two fake Ketcher editors cover opening a saved
// analysis. The only real chemistry is one trivial one-step search, used to prove that a real route
// with its verification and compatibility data is stored and returned unchanged.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const clone = (value) => JSON.parse(JSON.stringify(value));

let store;
let lib;
let transfer;
let synthesis;
let controllerModule;
let realResults;
let realInputs;

before(async () => {
  await loadEngine();
  store = await loadModule("/src/utils/persistence/workspaceStore.ts");
  lib = await loadModule("/src/utils/persistence/analysisLibrary.ts");
  transfer = await loadModule("/src/utils/persistence/handoffTransfer.ts");
  synthesis = await loadModule("/src/utils/persistence/synthesisWorkspace.ts");
  controllerModule = await loadModule("/src/utils/persistence/workspacePersistence.ts");
  const runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  const { reactionRegistry } = await loadModule("/src/utils/reactionUtils.ts");

  const controller = new runModule.SearchRunController({ rules: reactionRegistry, totalMs: 20000 });
  await controller.start({ startingSmiles: "Cc1ccc(O)cc1.CBr", targetSmiles: "COc1ccc(C)cc1" });
  const state = controller.getState();
  assert.equal(state.outcome.kind, "found", JSON.stringify(state.outcome));
  const data = {
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
  realResults = { computedAt: "2026-10-28T09:00:00.000Z", engineVersion: 1, stale: false, status: "found", data };
  realInputs = { reactantKet: ket([["C", 0, 0], ["C", 1, 0]]), targetKet: ket([["O", 0, 0]]), reactantKey: "CBr.Cc1ccc(O)cc1", targetKey: "COc1ccc(C)cc1", copies: 1 };
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------------

function ket(atoms) {
  return JSON.stringify({
    root: { nodes: [{ $ref: "mol0" }] },
    mol0: { type: "molecule", atoms: atoms.map(([label, x, y]) => ({ label, location: [x, y, 0] })), bonds: atoms.length > 1 ? [{ type: 1, atoms: [0, 1] }] : [] },
  });
}
const emptyKet = JSON.stringify({ root: { nodes: [] } });

let counter = 0;
const newId = () => `id-${++counter}`;
const validators = () => ({
  synthesis: {
    engineVersion: 1,
    validateInputs: synthesis.validateSynthesisInputs,
    validateResults: synthesis.validateSynthesisResults,
  },
});
const makeLibrary = (backend = new store.MemoryBackend(), options = {}) =>
  new lib.AnalysisLibrary(backend, { validators: validators(), newId, ...options });
const parts = (overrides = {}) => ({
  name: "p-cresol → 4-methylanisole",
  summary: synthesis.describeSynthesisAnalysis(realResults.data, realResults.status, realResults.stale),
  inputs: realInputs,
  results: realResults,
  ...overrides,
});
const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.error));
  return result.value;
};
const failed = (result, code) => {
  assert.equal(result.ok, false, "expected a failure");
  assert.equal(result.error.code, code, result.error.message);
  return result.error;
};

/** A small in-memory IDBFactory: database versions, upgrades, multiple object stores. */
function fakeIdb({ openError = null, writeError = null, version = 0, stores = new Map() } = {}) {
  const disk = { version, stores };
  const upgrades = [];
  const factory = {
    open(name, requestedVersion) {
      const request = {};
      setImmediate(() => {
        if (openError) {
          request.error = openError;
          request.onerror?.();
          return;
        }
        const oldVersion = disk.version;
        const handle = {
          objectStoreNames: { contains: (storeName) => disk.stores.has(storeName) },
          createObjectStore: (storeName) => { disk.stores.set(storeName, new Map()); upgrades.push(storeName); },
          close() {},
          transaction(storeName, mode) {
            const data = disk.stores.get(storeName);
            if (!data) throw Object.assign(new Error(`No such object store: ${storeName}`), { name: "NotFoundError" });
            const tx = {};
            let pending = 0;
            const finish = () => {
              pending -= 1;
              if (pending === 0) setImmediate(() => tx.oncomplete?.());
            };
            const schedule = (apply) => {
              const req = {};
              pending += 1;
              setImmediate(() => {
                if (mode === "readwrite" && writeError) {
                  tx.error = writeError;
                  tx.onabort?.();
                  return;
                }
                req.result = apply();
                req.onsuccess?.();
                finish();
              });
              return req;
            };
            tx.objectStore = () => ({
              get: (key) => schedule(() => data.get(key)),
              put: (value, key) => schedule(() => { data.set(key, value); }),
              delete: (key) => schedule(() => { data.delete(key); }),
              getAll: () => schedule(() => [...data.values()]),
              getAllKeys: () => schedule(() => [...data.keys()]),
            });
            return tx;
          },
        };
        request.result = handle;
        if (requestedVersion > oldVersion) {
          disk.version = requestedVersion;
          request.onupgradeneeded?.({ oldVersion, newVersion: requestedVersion });
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { factory, disk, upgrades };
}

// ---- database creation and migration --------------------------------------------------------------------

describe("analyses object store: creation and migration", () => {
  test("[db] a fresh database gets both object stores at version 2", async () => {
    const { factory, disk, upgrades } = fakeIdb();
    const backends = store.createIndexedDbBackends(factory);
    assert.ok(backends);
    await backends.analyses.put("a", "x");
    assert.equal(disk.version, 2);
    assert.deepEqual([...disk.stores.keys()].sort(), ["analyses", "records"]);
    assert.equal(upgrades.length, 2);
    assert.equal(store.DB_VERSION, 2);
  });

  test("[db] upgrading a version 1 database adds 'analyses' and keeps every existing workspace record", async () => {
    const records = new Map();
    const writer = newStoreOnMap(records);
    await writer.save("synthesis", { inputs: realInputs, results: null });
    await writer.save("properties", { inputs: { ket: null }, results: null });
    const { factory, disk, upgrades } = fakeIdb({ version: 1, stores: new Map([["records", records]]) });

    const backends = store.createIndexedDbBackends(factory);
    const library = makeLibrary(backends.analyses);
    ok(await library.list()); // first use triggers the upgrade
    assert.equal(disk.version, 2);
    assert.deepEqual(upgrades, ["analyses"], "only the missing store is created");
    const workspace = new store.WorkspaceStore(backends.workspace);
    assert.equal((await workspace.load("synthesis")).kind, "ok", "the automatic workspace survived the upgrade");
    assert.equal((await workspace.load("properties")).kind, "ok");
  });

  test("[db] opening an already upgraded database again creates nothing and loses nothing", async () => {
    const { factory, upgrades } = fakeIdb();
    const first = store.createIndexedDbBackends(factory);
    const library = makeLibrary(first.analyses);
    ok(await library.save("synthesis", parts()));
    const created = upgrades.length;
    const second = store.createIndexedDbBackends(factory); // a later visit / restart
    assert.equal(ok(await makeLibrary(second.analyses).list()).items.length, 1);
    assert.equal(upgrades.length, created);
  });

  test("[db] without IndexedDB the library is simply unavailable and reports it", async () => {
    assert.equal(store.createIndexedDbBackends(null), null);
    const library = makeLibrary(null);
    assert.equal(library.available, false);
    failed(await library.save("synthesis", parts()), "unavailable");
    failed(await library.list(), "unavailable");
    failed(await library.open("x"), "unavailable");
  });

  test("[db] an open or write error becomes a typed library error, never an exception", async () => {
    const blocked = makeLibrary(store.createIndexedDbBackends(fakeIdb({ openError: Object.assign(new Error("no"), { name: "SecurityError" }) }).factory).analyses);
    failed(await blocked.list(), "unavailable");
    const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const full = makeLibrary(store.createIndexedDbBackends(fakeIdb({ writeError: quota }).factory).analyses);
    failed(await full.save("synthesis", parts()), "quota");
  });
});

function newStoreOnMap(map) {
  return new store.WorkspaceStore(new store.MemoryBackend({ map }));
}

// ---- operations ------------------------------------------------------------------------------------------

describe("library operations", () => {
  test("[save/list/open] a saved synthesis comes back exactly, across a simulated restart, without any recalculation", async () => {
    const { factory } = fakeIdb();
    const library = makeLibrary(store.createIndexedDbBackends(factory).analyses);
    const saved = ok(await library.save("synthesis", parts()));
    assert.equal(saved.page, "synthesis");
    assert.equal(saved.status, "found");
    assert.match(saved.summary, /p-cresol \+ bromomethane → 4-methylanisole · 1 verified route/);

    const restarted = makeLibrary(store.createIndexedDbBackends(factory).analyses);
    const listed = ok(await restarted.list());
    assert.deepEqual(listed.items.map((item) => item.id), [saved.id]);
    assert.deepEqual(listed.problems, []);
    const opened = ok(await restarted.open(saved.id));
    assert.deepEqual(opened.inputs, clone(realInputs));
    assert.deepEqual(opened.results.data, clone(realResults.data));
    assert.equal(opened.results.engineVersion, 1);
    assert.equal(opened.resultsDropped, false);
    assert.equal(opened.engineMismatch, false);
  });

  test("[verification] verification, inventory provenance, compatibility findings and route steps are carried over unchanged", async () => {
    const library = makeLibrary();
    const saved = ok(await library.save("synthesis", parts()));
    const opened = ok(await library.open(saved.id));
    const route = opened.results.data.routes[0];
    const original = realResults.data.routes[0];
    assert.equal(route.verification.status, original.verification.status);
    assert.deepEqual(route.verification.inventory, clone(original.verification.inventory));
    assert.deepEqual(route.compatibility ?? null, clone(original.compatibility ?? null));
    assert.deepEqual(route.steps.map((s) => [s.stepNumber, s.ruleId, s.reactantComponents, s.productComponents]), original.steps.map((s) => clone([s.stepNumber, s.ruleId, s.reactantComponents, s.productComponents])));
    assert.deepEqual(route.steps.map((s) => s.compatibility ?? null), original.steps.map((s) => clone(s.compatibility ?? null)));
  });

  test("[save] saving the same analysis again makes a separate record; nothing is overwritten silently", async () => {
    const library = makeLibrary();
    const first = ok(await library.save("synthesis", parts()));
    const second = ok(await library.save("synthesis", parts()));
    assert.notEqual(first.id, second.id);
    assert.equal(ok(await library.list()).items.length, 2);
    const same = ok(await library.save("synthesis", parts({ name: first.name === "x" ? "y" : first.name })));
    assert.equal(ok(await library.list()).items.length, 3);
    void same;
  });

  test("[update] overwriting is a separate, explicit call; it keeps id, name and creation time", async () => {
    let tick = 0;
    const library = makeLibrary(new store.MemoryBackend(), { now: () => new Date(Date.UTC(2026, 9, 28, 10, 0, tick++)) });
    const first = ok(await library.save("synthesis", parts()));
    const other = ok(await library.save("synthesis", parts({ name: "other" })));
    const changed = clone(realResults);
    changed.data.outcomeMessage = "A different outcome";
    const updated = ok(await library.update(first.id, { inputs: realInputs, results: changed, summary: "updated summary" }));
    assert.equal(updated.id, first.id);
    assert.equal(updated.name, first.name);
    assert.equal(updated.createdAt, first.createdAt);
    assert.notEqual(updated.updatedAt, first.updatedAt);
    assert.equal(ok(await library.open(first.id)).results.data.outcomeMessage, "A different outcome");
    assert.equal(ok(await library.open(other.id)).results.data.outcomeMessage, realResults.data.outcomeMessage, "other records untouched");
    failed(await library.update("missing", { inputs: realInputs, results: null }), "not-found");
  });

  test("[list] newest first, with each page type, status and summary", async () => {
    let tick = 0;
    const library = makeLibrary(new store.MemoryBackend(), { now: () => new Date(Date.UTC(2026, 9, 28, 10, 0, tick++)) });
    const a = ok(await library.save("synthesis", parts({ name: "first" })));
    const b = ok(await library.save("synthesis", parts({ name: "second", results: { ...realResults, status: "found-interrupted", stale: true } })));
    const items = ok(await library.list()).items;
    assert.deepEqual(items.map((i) => i.id), [b.id, a.id]);
    assert.equal(items[0].status, "found-interrupted");
    assert.equal(items[0].stale, true);
    assert.equal(items[1].stale, false);
  });

  test("[rename] changes only the name and modification time; chemistry and metadata are byte-identical", async () => {
    let tick = 0;
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend, { now: () => new Date(Date.UTC(2026, 9, 28, 10, 0, tick++)) });
    const saved = ok(await library.save("synthesis", parts({ results: { ...realResults, stale: true, engineVersion: 0 } })));
    const before = JSON.parse(backend.map.get(saved.id));
    const renamed = ok(await library.rename(saved.id, "  A   better   name "));
    assert.equal(renamed.name, "A better name");
    const after = JSON.parse(backend.map.get(saved.id));
    assert.equal(JSON.stringify(after.results), JSON.stringify(before.results), "results untouched");
    assert.equal(JSON.stringify(after.inputs), JSON.stringify(before.inputs));
    assert.equal(after.createdAt, before.createdAt);
    assert.notEqual(after.updatedAt, before.updatedAt);
    failed(await library.rename(saved.id, "   "), "invalid-name");
    failed(await library.rename(saved.id, "x".repeat(121)), "invalid-name");
    failed(await library.rename("missing", "name"), "not-found");
  });

  test("[duplicate] a new id and name, with every result and its original metadata preserved", async () => {
    const library = makeLibrary();
    const saved = ok(await library.save("synthesis", parts({ results: { ...realResults, engineVersion: 0, stale: true, status: "found-interrupted" } })));
    const copy = ok(await library.duplicate(saved.id));
    assert.notEqual(copy.id, saved.id);
    assert.equal(copy.name, `${saved.name} (copy)`);
    const a = ok(await library.open(saved.id));
    const b = ok(await library.open(copy.id));
    assert.deepEqual(b.results, a.results, "computed-at, engine version, stale flag, status and data all identical");
    assert.deepEqual(b.inputs, a.inputs);
    assert.equal(b.record.appVersion, a.record.appVersion);
    assert.equal(ok(await library.duplicate(saved.id, "Chosen name")).name, "Chosen name");
    failed(await library.duplicate("missing"), "not-found");
  });

  test("[delete] removes exactly one record; other analyses and the page workspaces stay", async () => {
    const records = new Map();
    const workspace = newStoreOnMap(records);
    await workspace.save("synthesis", { inputs: realInputs, results: null });
    const library = makeLibrary();
    const a = ok(await library.save("synthesis", parts({ name: "a" })));
    const b = ok(await library.save("synthesis", parts({ name: "b" })));
    ok(await library.delete(a.id));
    assert.deepEqual(ok(await library.list()).items.map((i) => i.id), [b.id]);
    failed(await library.delete(a.id), "not-found");
    assert.equal((await workspace.load("synthesis")).kind, "ok", "the automatic workspace is separate and untouched");
  });

  test("[immutable] editing the live workspace or the original objects afterwards never changes a saved analysis", async () => {
    const library = makeLibrary();
    const liveInputs = clone(realInputs);
    const liveResults = clone(realResults);
    const saved = ok(await library.save("synthesis", parts({ inputs: liveInputs, results: liveResults })));
    liveInputs.copies = 2;
    liveInputs.reactantKet = null;
    liveResults.data.routes.length = 0;
    liveResults.status = "cancelled";
    const records = new Map();
    await newStoreOnMap(records).save("synthesis", { inputs: liveInputs, results: liveResults }); // the workspace autosaves the edit
    const opened = ok(await library.open(saved.id));
    assert.equal(opened.inputs.copies, 1);
    assert.equal(opened.results.data.routes.length, 1);
    assert.equal(opened.results.status, "found");
  });

  test("[limits] too large, unserializable, unnamed and over-capacity saves are refused cleanly", async () => {
    failed(await makeLibrary(new store.MemoryBackend(), { maxRecordChars: 500 }).save("synthesis", parts()), "too-large");
    failed(await makeLibrary().save("synthesis", parts({ inputs: { bad: new Map() } })), "unserializable");
    failed(await makeLibrary().save("synthesis", parts({ name: "  " })), "invalid-name");
    const small = makeLibrary(new store.MemoryBackend(), { maxRecords: 2 });
    ok(await small.save("synthesis", parts({ name: "1" })));
    const second = ok(await small.save("synthesis", parts({ name: "2" })));
    failed(await small.save("synthesis", parts({ name: "3" })), "library-full");
    failed(await small.duplicate(second.id), "library-full");
    ok(await small.delete(second.id));
    ok(await small.save("synthesis", parts({ name: "3" })));
  });

  test("[quota] a full browser store loses nothing: the failed save stores nothing and earlier analyses stay", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const kept = ok(await library.save("synthesis", parts({ name: "kept" })));
    backend.quotaChars = JSON.stringify(parts()).length / 2;
    failed(await library.save("synthesis", parts({ name: "too much" })), "quota");
    failed(await library.duplicate(kept.id), "quota");
    backend.quotaChars = null;
    assert.deepEqual(ok(await library.list()).items.map((i) => i.id), [kept.id]);
    backend.failWith = new store.PersistenceError("unavailable", "blocked");
    failed(await library.list(), "unavailable");
  });
});

// ---- damaged, newer and unsupported records -----------------------------------------------------------------

describe("damaged and incompatible records", () => {
  const good = () => ({ ...JSON.parse(JSON.stringify({ kind: "saved-analysis", id: "g", page: "synthesis", name: "g", schemaVersion: 1, appVersion: "x", createdAt: "2026-01-01", updatedAt: "2026-01-01", summary: "s", inputs: realInputs, results: realResults })) });

  test("[damaged] bad entries are listed as problems and can be deleted; the library, other entries and PocketChem keep working", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("synthesis", parts()));
    backend.map.set("broken", "{not json");
    backend.map.set("wrong-kind", JSON.stringify({ kind: "workspace" }));
    backend.map.set("id-mismatch", JSON.stringify({ ...good(), id: "someone-else" }));
    backend.map.set("no-name", JSON.stringify({ ...good(), id: "no-name", name: "" }));
    backend.map.set("bad-results", JSON.stringify({ ...good(), id: "bad-results", results: { computedAt: "d" } }));
    backend.map.set("future", JSON.stringify({ ...good(), id: "future", schemaVersion: 99, name: "From the future" }));
    const listed = ok(await library.list());
    assert.deepEqual(listed.items.map((i) => i.id), [saved.id]);
    assert.deepEqual(listed.problems.map((p) => p.id).sort(), ["bad-results", "broken", "future", "id-mismatch", "no-name", "wrong-kind"]);
    const future = listed.problems.find((p) => p.id === "future");
    assert.equal(future.kind, "incompatible");
    assert.equal(future.name, "From the future");
    for (const id of ["broken", "wrong-kind", "id-mismatch", "no-name", "bad-results"]) {
      failed(await library.open(id), "damaged");
    }
    failed(await library.open("future"), "incompatible");
    failed(await library.rename("future", "x"), "incompatible");
    failed(await library.duplicate("future"), "incompatible");
    ok(await library.delete("future"));
    ok(await library.delete("broken"));
    assert.equal(backend.map.has("future") || backend.map.has("broken"), false);
    assert.equal(ok(await library.open(saved.id)).results.status, "found");
  });

  test("[open] damaged results are dropped with the structures kept; unusable structures and unknown pages are errors", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const damagedResults = good();
    damagedResults.id = "dr";
    damagedResults.results.data.routes = [{ id: 5 }];
    backend.map.set("dr", JSON.stringify(damagedResults));
    const opened = ok(await library.open("dr"));
    assert.equal(opened.resultsDropped, true);
    assert.equal(opened.results, null);
    assert.deepEqual(opened.inputs, clone(realInputs));

    const damagedInputs = good();
    damagedInputs.id = "di";
    damagedInputs.inputs.copies = 7;
    backend.map.set("di", JSON.stringify(damagedInputs));
    failed(await library.open("di"), "damaged");

    const other = good();
    other.id = "reactions-record";
    other.page = "reactions";
    backend.map.set("reactions-record", JSON.stringify(other));
    failed(await library.open("reactions-record"), "unsupported-page");
  });

  test("[versions] results from another engine version are flagged and kept as saved; an older record format migrates", async () => {
    const backend = new store.MemoryBackend();
    const library = makeLibrary(backend);
    const saved = ok(await library.save("synthesis", parts({ results: { ...realResults, engineVersion: 0 } })));
    const opened = ok(await library.open(saved.id));
    assert.equal(opened.engineMismatch, true);
    assert.equal(opened.results.engineVersion, 0, "not silently upgraded");

    const v2 = makeLibrary(backend, { schemaVersion: 2, migrations: { 1: (record) => ({ ...record, summary: `${record.summary} [migrated]` }) } });
    const migrated = ok(await v2.open(saved.id));
    assert.equal(migrated.migratedFrom, 1);
    assert.equal(migrated.record.schemaVersion, 2);
    assert.match(migrated.record.summary, /\[migrated\]$/);
    const noPath = makeLibrary(backend, { schemaVersion: 3, migrations: { 1: (r) => r } });
    failed(await noPath.open(saved.id), "incompatible");
    const older = makeLibrary(backend, { schemaVersion: 1 });
    backend.map.set("newer", JSON.stringify({ ...good(), id: "newer", schemaVersion: 2 }));
    failed(await older.open("newer"), "incompatible");
  });
});

// ---- opening into two editors, transactionally ------------------------------------------------------------

describe("opening a saved analysis into the two editors", () => {
  const OLD_A = ket([["N", 0, 0]]);
  const OLD_B = ket([["Cl", 0, 0]]);
  const NEW_A = ket([["O", 0, 0]]);
  const NEW_B = ket([["S", 0, 0]]);
  let keys;
  before(async () => {
    const identity = await loadModule("/src/utils/persistence/ketIdentity.ts");
    keys = { NEW_A: await identity.ketIdentityKey(NEW_A), NEW_B: await identity.ketIdentityKey(NEW_B) };
  });

  function fakeEditor(initial, behavior = {}) {
    const state = { ket: initial, sets: [] };
    return {
      state,
      api: {
        getKet: async () => (behavior.getKet ? behavior.getKet(state) : state.ket),
        setMolecule: async (structure) => {
          const call = state.sets.length;
          state.sets.push(structure);
          if (behavior.setMolecule) return behavior.setMolecule(structure, state, call);
          state.ket = structure;
        },
      },
    };
  }
  const entries = (a, b, over = {}) => [
    { api: a.api, source: NEW_A, expectKey: keys.NEW_A, ...(over.a ?? {}) },
    { api: b.api, source: NEW_B, expectKey: keys.NEW_B, ...(over.b ?? {}) },
  ];
  function controllerFor(backend, clock = fakeTimers()) {
    return new controllerModule.WorkspacePersistence({
      store: new store.WorkspaceStore(backend), page: "synthesis", engineVersion: 1,
      validateInputs: synthesis.validateSynthesisInputs, validateResults: synthesis.validateSynthesisResults, timers: clock.timers,
    });
  }
  function fakeTimers() {
    const pending = new Map();
    let next = 1;
    return {
      timers: { set: (cb) => { const id = next++; pending.set(id, cb); return id; }, clear: (id) => pending.delete(id) },
      get pendingCount() { return pending.size; },
      fire() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb()); },
    };
  }
  async function liveWorkspace() {
    const disk = new Map();
    await newStoreOnMap(disk).save("synthesis", { inputs: { ...realInputs, reactantKet: OLD_A, targetKet: OLD_B }, results: realResults });
    const backend = new store.MemoryBackend({ map: disk });
    const clock = fakeTimers();
    const controller = controllerFor(backend, clock);
    await controller.recover();
    controller.resumeAfterRestore();
    return { disk, backend, controller, clock, before: disk.get("workspace:synthesis") };
  }

  test("[open] both editors receive their structures and are verified; the workspace is replaced in one later write", async () => {
    const { controller, disk, backend, before: saved } = await liveWorkspace();
    const token = controller.token();
    const a = fakeEditor(OLD_A);
    const b = fakeEditor(OLD_B);
    const outcome = await transfer.transferIntoEditors(entries(a, b), controller);
    assert.equal(outcome.kind, "adopted");
    assert.equal(a.state.ket, NEW_A);
    assert.equal(b.state.ket, NEW_B);
    assert.deepEqual(outcome.editors.map((e) => e.key), [keys.NEW_A, keys.NEW_B]);
    assert.equal(controller.isCurrent(token), false, "everything started for the old workspace is stale");
    assert.equal(disk.get("workspace:synthesis"), saved, "nothing written yet");
    assert.equal(backend.putCount, 0);
  });

  test("[open] a saved analysis with an empty editor clears that editor", async () => {
    const { controller } = await liveWorkspace();
    const a = fakeEditor(OLD_A);
    const b = fakeEditor(OLD_B);
    const outcome = await transfer.transferIntoEditors(entries(a, b, { b: { source: null, expectKey: null } }), controller);
    assert.equal(outcome.kind, "adopted");
    assert.equal(b.state.ket, emptyKet);
    assert.equal(outcome.editors[1].ket, null);
  });

  test("[failure] the second editor failing after the first changed rolls both back, verified, and the workspace is untouched", async () => {
    const { controller, disk, before: saved } = await liveWorkspace();
    const a = fakeEditor(OLD_A);
    const b = fakeEditor(OLD_B, { setMolecule: async (s, state, call) => { if (call === 0) { state.ket = NEW_B; throw new Error("failed halfway"); } state.ket = s; } });
    const token = controller.token();
    const outcome = await transfer.transferIntoEditors(entries(a, b), controller);
    assert.equal(outcome.kind, "rolled-back");
    assert.equal(a.state.ket, OLD_A, "the first editor is back");
    assert.equal(b.state.ket, OLD_B, "the partly changed editor is back");
    assert.equal(controller.isCurrent(token), true);
    assert.equal(controller.isLive, true);
    assert.equal(disk.get("workspace:synthesis"), saved);
  });

  test("[failure] a structure that arrives but is not the saved one counts as failed", async () => {
    const { controller } = await liveWorkspace();
    const a = fakeEditor(OLD_A, { setMolecule: async (s, state, call) => { state.ket = call === 0 ? NEW_B : s; } }); // wrong molecule arrives
    const b = fakeEditor(OLD_B);
    const outcome = await transfer.transferIntoEditors(entries(a, b), controller);
    assert.equal(outcome.kind, "rolled-back");
    assert.equal(a.state.ket, OLD_A);
    assert.equal(b.state.sets.length, 0, "the second editor was never touched");
  });

  test("[failure] if an editor cannot be put back, saving stops, the stored workspace is kept, and Clear starts over", async () => {
    const { controller, disk, backend, clock, before: saved } = await liveWorkspace();
    const a = fakeEditor(OLD_A, { setMolecule: async () => { throw new Error("editor broken"); } });
    const b = fakeEditor(OLD_B);
    assert.equal((await transfer.transferIntoEditors(entries(a, b), controller)).kind, "editor-unknown");
    assert.equal(controller.isLive, false);
    controller.requestSave(() => ({ inputs: realInputs, results: null }));
    assert.equal(clock.pendingCount, 0);
    assert.equal(backend.putCount, 0);
    assert.equal(disk.get("workspace:synthesis"), saved);
    await controller.discard();
    assert.equal(disk.has("workspace:synthesis"), false);
  });

  test("[race] a pending autosave cannot land during or after opening, and a record still loading is superseded", async () => {
    const { controller, backend, clock } = await liveWorkspace();
    controller.requestSave(() => ({ inputs: { ...realInputs, copies: 2 }, results: null })); // an edit made just before opening
    const outcome = await transfer.transferIntoEditors(entries(fakeEditor(OLD_A), fakeEditor(OLD_B)), controller);
    assert.equal(outcome.kind, "adopted");
    clock.fire();
    await controller.flush();
    assert.equal(backend.putCount, 0, "the stale save was dropped");

    const disk = new Map();
    await newStoreOnMap(disk).save("synthesis", { inputs: realInputs, results: null });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    class Slow extends store.MemoryBackend { async get(key) { await gate; return super.get(key); } }
    const slow = controllerFor(new Slow({ map: disk }));
    const recovery = slow.recover();
    assert.equal((await transfer.transferIntoEditors(entries(fakeEditor(OLD_A), fakeEditor(OLD_B)), slow)).kind, "adopted");
    release();
    assert.equal((await recovery).kind, "superseded", "an older asynchronous restoration cannot overwrite the opened analysis");
  });

  test("[reload] after opening, the opened analysis is what comes back; after a failed open, the previous workspace does", async () => {
    // success
    const live = await liveWorkspace();
    await transfer.transferIntoEditors(entries(fakeEditor(OLD_A), fakeEditor(OLD_B)), live.controller);
    live.controller.requestSave(() => ({ inputs: { ...realInputs, reactantKet: NEW_A, targetKet: NEW_B, reactantKey: keys.NEW_A, targetKey: keys.NEW_B }, results: realResults }));
    await live.controller.flush();
    const reopened = await controllerFor(new store.MemoryBackend({ map: live.disk })).recover();
    assert.equal(reopened.kind, "restored");
    assert.equal(reopened.inputs.reactantKet, NEW_A);

    // failure
    const failing = await liveWorkspace();
    const broken = fakeEditor(OLD_B, { setMolecule: async (s, state, call) => { if (call === 0) throw new Error("no"); state.ket = s; } });
    assert.equal((await transfer.transferIntoEditors(entries(fakeEditor(OLD_A), broken), failing.controller)).kind, "rolled-back");
    const back = await controllerFor(new store.MemoryBackend({ map: failing.disk })).recover();
    assert.equal(back.inputs.reactantKet, OLD_A);
    assert.deepEqual(back.results.data.routes.map((r) => r.id), realResults.data.routes.map((r) => r.id));
  });
});

// ---- page integration (source-level; browser behaviour is checked manually) ------------------------------------

describe("Synthesis and navigation integration", () => {
  const page = read("src", "components", "SynthesisPage.tsx");
  const app = read("src", "App.tsx");
  const saved = read("src", "components", "SavedAnalysesPage.tsx");
  const open = () => page.slice(page.indexOf("async function applySavedAnalysis"), page.indexOf("useEffect(() => {\n    beginOpenRef.current = beginOpen;"));

  test("[save] Save Analysis needs a finished search, reads the latest editors first, and always creates a new analysis", () => {
    assert.match(page, /disabled=\{!resultMeta \|\| isSearching \|\| isClearing \|\| isOpening \|\| saveBusy\}/);
    const body = page.slice(page.indexOf("async function saveCurrentAnalysis"), page.indexOf("function defaultAnalysisName"));
    assert.ok(body.indexOf("snapshotTask.flushNow()") >= 0 && body.indexOf("snapshotTask.flushNow()") < body.indexOf("captureWorkspace()"));
    assert.match(body, /\.save\("synthesis"/);
    assert.doesNotMatch(body, /\.update\(/, "Save never overwrites");
    assert.match(body, /!capture\.results/);
    assert.match(body, /describeSynthesisAnalysis\(results\.data, results\.status, results\.stale\)/);
  });

  test("[open] opening restores structures and results without searching, and is labelled as a saved analysis", () => {
    const body = open();
    assert.ok(body.length > 1500);
    assert.doesNotMatch(body, /findSynthesis\(|controller\.start\(|\.start\(\{|verifyMultistepRoute|reactionRegistry|hydrateRouteLabels/);
    assert.match(body, /transferIntoEditors\(/);
    assert.match(body, /Opened saved analysis/);
    assert.match(page, /These results were not recomputed/);
    assert.match(body, /persistence\.requestSave\(\(\) => \(\{ inputs: opened\.inputs, results: opened\.results \}\)\)/);
  });

  test("[open] it waits for recovery and both editors, handles each request once, and never overwrites unsaved work silently", () => {
    assert.match(page, /if \(!openRequest \|\| recovery === null \|\| !editorsReady\) return;/);
    assert.match(page, /if \(handledOpenRef\.current === openRequest\.id\) return;/);
    assert.ok(page.indexOf("}, [recovery, persistence]);") < page.indexOf("if (!openRequest || recovery === null"), "the open effect runs after the recovery effect");
    assert.match(page, /if \(captureWorkspace\(\) !== null\) \{[\s\S]{0,200}setOpenPrompt/);
    assert.match(page, /Save current, then open/);
    assert.match(page, /Replace without saving/);
    assert.match(page, /If the current workspace could not be saved, nothing is replaced/);
  });

  test("[open] a search in progress, an open in progress and a drawing restore all block each other", () => {
    assert.match(page, /latestRef\.current\.isSearching \|\| openingRef\.current/);
    assert.match(page, /isSearching \|\| isClearing \|\| openingRef\.current\) return;/);
    assert.match(page, /persistence\.isCurrent\(token\) && !openingRef\.current/);
  });

  test("[navigation] the Saved page is in the navigation; a pending open is forgotten by any other page change", () => {
    assert.match(app, /\{ id: "saved", label: "Saved" \}/);
    assert.match(app, /if \(!options\?\.keepOpenRequest\) setPendingOpen\(null\);/);
    assert.match(app, /switchPage\(target, \{ keepOpenRequest: true \}\)/, "the page comes from ANALYSIS_APP_PAGE, where Synthesis maps to multiStep");
    assert.match(app, /onOpenHandled=\{\(requestId\) => setPendingOpen\(\(current\) => \(current\?\.id === requestId \? null : current\)\)\}/);
    assert.match(app, /openRequest=\{pendingOpen\?\.page === "multiStep" \? pendingOpen : null\}/);
    assert.match(app, /onClick=\{\(\) => switchPage\(page\.id\)\}/, "tabs never keep an open request");
  });

  test("[ui] the library lists name, page, date, summary and status; has Open, Rename, Duplicate and a confirmed Delete; handles empty and error states", () => {
    for (const fragment of ["item.name", "PAGE_LABELS", "formatWhen(item.createdAt)", "item.summary", "STATUS_LABELS", "Open", "Rename", "Duplicate", "Yes, delete", "Nothing saved yet", "could not be read", "Damaged: "]) {
      assert.ok(saved.includes(fragment), fragment);
    }
    assert.match(saved, /confirmDelete === item\.id/);
    assert.match(saved, /OPENABLE_ANALYSIS_PAGES/);
  });

  test("[scope] the analysis pages and the Multi-Catalytic workspace save into the library; the chemistry layers import none of it", () => {
    const users = [];
    for (const file of fs.readdirSync(path.join(root, "src", "components"))) {
      if (file.endsWith(".tsx") && /getAppAnalysisLibrary/.test(read("src", "components", file))) users.push(file);
    }
    assert.deepEqual(users.sort(), ["RankingPage.tsx", "ReactionWorkspacePanel.tsx", "ReactionsPage.tsx", "SavedAnalysesPage.tsx", "SpectroscopyPage.tsx", "SynthesisPage.tsx"]); // Properties lives in App.tsx; the Multi-Catalytic page saves through ReactionWorkspacePanel (Stage 9B-2B)
    const libraryFiles = read("src", "utils", "persistence", "analysisLibrary.ts") + read("src", "utils", "persistence", "handoffTransfer.ts");
    assert.doesNotMatch(libraryFiles, /reactionRegistry|findMultistep|predictReaction|rdkit/i, "the library layer imports no chemistry");
    assert.doesNotMatch(read("src", "utils", "persistence", "analysisLibraryApp.ts"), /import\/export|exportAnalyses|importAnalyses/);
  });

  test("[recovery] the automatic workspace stays independent: separate object store, no library calls in the workspace code", () => {
    const workspace = read("src", "utils", "persistence", "workspaceStore.ts") + read("src", "utils", "persistence", "workspacePersistence.ts");
    assert.doesNotMatch(workspace, /AnalysisLibrary|saved-analysis/);
    assert.match(workspace, /WORKSPACE_STORE_NAME = "records"/);
    assert.match(workspace, /ANALYSES_STORE_NAME = "analyses"/);
  });

  test("[summary] the list line says what was found, how, and whether it is a snapshot", () => {
    const data = realResults.data;
    assert.match(synthesis.describeSynthesisAnalysis(data, "found", false), /^p-cresol \+ bromomethane → 4-methylanisole · 1 verified route, shortest \d+ steps?$/);
    assert.match(synthesis.describeSynthesisAnalysis(data, "found-interrupted", true), /search stopped early · snapshot of earlier structures$/);
    assert.match(synthesis.describeSynthesisAnalysis({ ...data, routes: [] }, "no-route-within-budget", false), /no route found$/);
  });
});
