import type { SubjectId } from "../../navigation/subjects";
/**
 * Versioned, bounded storage for PocketChem's automatic workspace recovery.
 *
 * One record per page ("workspace:<page>") holds that page's latest inputs and, separately, the
 * completed results that were actually shown. Records are stored as JSON strings so only plain
 * data can ever be persisted, and so a damaged record fails to parse instead of half-loading.
 *
 * The storage engine sits behind a tiny backend interface: IndexedDB in the browser, an in-memory
 * backend for tests and for simulated reloads. Everything here is local; there is no network use.
 *
 * Never stored: RDKit or Ketcher objects, React state objects, search controllers, abort
 * controllers or search frontiers. `assertPlainJson` rejects anything that is not plain JSON data.
 */

export const PERSISTENCE_SCHEMA_VERSION = 1;
/** Identifies the build that wrote a record; informational, never used to trust results. */
export const PERSISTENCE_APP_VERSION = "pocketchem-stage8b1";
/** Largest serialized record accepted, in characters of JSON. */
export const DEFAULT_MAX_RECORD_CHARS = 6_000_000;

export type PersistedPage = "synthesis" | "properties" | "reactions" | "spectroscopy" | "ranking" | "multicatalytic" | "conformations" | "genchem" | "equilibrium" | "kinetics" | "thermo" | "mechanics" | "circuits" | "rc" | "forces" | "energy" | "collisions" | "replication" | "transcription" | "translation" | "dogma" | "regulation" | "genetics" | "celldivision" | "aminoacids" | "proteins" | "enzymes" | "glycolysis" | "gluconeogenesis" | "tca" | "etc" | "metabolism";

/**
 * The subject each persisted page belongs to. Saved-analysis records carry their subject explicitly; records written
 * before Stage 11 have no subject field and are read as the subject of their page (all Organic Chemistry).
 */
export const PAGE_SUBJECT: Record<PersistedPage, SubjectId> = {
  synthesis: "organic",
  properties: "organic",
  reactions: "organic",
  spectroscopy: "organic",
  ranking: "organic",
  multicatalytic: "organic",
  conformations: "organic",
  genchem: "general",
  equilibrium: "general",
  kinetics: "general",
  thermo: "general",
  mechanics: "physics",
  circuits: "physics",
  rc: "physics",
  forces: "physics",
  energy: "physics",
  collisions: "physics",
  replication: "biology",
  transcription: "biology",
  translation: "biology",
  dogma: "biology",
  regulation: "biology",
  genetics: "biology",
  celldivision: "biology",
  aminoacids: "biochemistry",
  proteins: "biochemistry",
  enzymes: "biochemistry",
  glycolysis: "biochemistry",
  gluconeogenesis: "biochemistry",
  tca: "biochemistry",
  etc: "biochemistry",
  metabolism: "biochemistry",
};

export type PersistenceErrorCode =
  | "unavailable"
  | "quota"
  | "too-large"
  | "unserializable"
  | "io";

export class PersistenceError extends Error {
  code: PersistenceErrorCode;
  constructor(code: PersistenceErrorCode, message: string) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
  }
}

/** Results exactly as they were computed and displayed, tied to the engine that produced them. */
export type WorkspaceResults<R> = {
  computedAt: string;
  /** Page-specific result-format/engine version; see each page's workspace module. */
  engineVersion: number;
  /** True once the inputs or settings no longer match the ones that produced `data`. */
  stale: boolean;
  /** Page-specific outcome kind, e.g. "found-interrupted" or "complete". */
  status: string;
  data: R;
};

export type WorkspaceRecord<I, R> = {
  kind: "workspace";
  id: string;
  page: PersistedPage;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  inputs: I;
  results: WorkspaceResults<R> | null;
};

export type LoadResult<I, R> =
  | { kind: "none" }
  | { kind: "unavailable"; error: PersistenceError }
  | { kind: "ok"; record: WorkspaceRecord<I, R>; migratedFrom: number | null }
  | { kind: "corrupt"; reason: string }
  | { kind: "incompatible"; reason: string; schemaVersion: number | null };

export type SaveResult = { ok: true } | { ok: false; code: PersistenceErrorCode; message: string };

// ---- backends --------------------------------------------------------------------------------

export interface StorageBackend {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** In-memory backend for tests; can simulate a byte quota and an unavailable database. */
export class MemoryBackend implements ListableBackend {
  readonly map: Map<string, string>;
  quotaChars: number | null;
  failWith: PersistenceError | null = null;
  putCount = 0;

  constructor(options: { map?: Map<string, string>; quotaChars?: number | null } = {}) {
    this.map = options.map ?? new Map();
    this.quotaChars = options.quotaChars ?? null;
  }

  async get(key: string) {
    if (this.failWith) throw this.failWith;
    return this.map.get(key);
  }

  async put(key: string, value: string) {
    if (this.failWith) throw this.failWith;
    if (this.quotaChars !== null) {
      let total = value.length;
      for (const [existingKey, existing] of this.map) if (existingKey !== key) total += existing.length;
      if (total > this.quotaChars) throw new PersistenceError("quota", "The browser storage quota was exceeded.");
    }
    this.putCount += 1;
    this.map.set(key, value);
  }

  async delete(key: string) {
    if (this.failWith) throw this.failWith;
    this.map.delete(key);
  }

  async list() {
    if (this.failWith) throw this.failWith;
    return [...this.map.entries()].map(([key, value]) => ({ key, value }));
  }
}

const DB_NAME = "pocketchem-workspace";
/**
 * Version 1 had one object store ("records": automatic workspace recovery). Version 2 adds
 * "analyses" (the Saved Analyses library). Upgrading keeps every existing record.
 */
export const DB_VERSION = 2;
export const WORKSPACE_STORE_NAME = "records";
export const ANALYSES_STORE_NAME = "analyses";

function toPersistenceError(error: unknown, fallback: string): PersistenceError {
  if (error instanceof PersistenceError) return error;
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  const message = error instanceof Error && error.message ? error.message : fallback;
  if (name === "QuotaExceededError") return new PersistenceError("quota", "The browser storage quota was exceeded.");
  if (name === "SecurityError" || name === "InvalidStateError" || name === "NotAllowedError") {
    return new PersistenceError("unavailable", "Browser storage is not available in this context.");
  }
  return new PersistenceError("io", message);
}

/** A storage backend that can also list everything it holds (the Saved Analyses library). */
export interface ListableBackend extends StorageBackend {
  list(): Promise<Array<{ key: string; value: string | undefined }>>;
}

export type IndexedDbBackends = { workspace: StorageBackend; analyses: ListableBackend };

/**
 * IndexedDB backends over one shared connection: the automatic workspace store and the Saved
 * Analyses store. String values, each write in its own transaction.
 */
export function createIndexedDbBackends(factory?: IDBFactory | null): IndexedDbBackends | null {
  let idb: IDBFactory | undefined;
  try {
    idb = factory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  } catch {
    idb = undefined; // Access itself can throw when storage is blocked.
  }
  if (!idb) return null;
  const factoryRef = idb;
  let dbPromise: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factoryRef.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(toPersistenceError(error, "Could not open browser storage."));
        return;
      }
      request.onupgradeneeded = () => {
        // Creates what is missing and never touches what exists, so a version 1 database keeps its records.
        const db = request.result;
        for (const name of [WORKSPACE_STORE_NAME, ANALYSES_STORE_NAME]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Let another tab upgrade or delete the database; reopen lazily on the next use.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(toPersistenceError(request.error, "Could not open browser storage."));
      request.onblocked = () => reject(new PersistenceError("unavailable", "Browser storage is blocked by another tab."));
    });
    dbPromise = attempt;
    attempt.catch(() => {
      if (dbPromise === attempt) dbPromise = null;
    });
    return attempt;
  }

  async function run<T>(
    storeName: string,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest[],
    result: (requests: IDBRequest[]) => T,
  ): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let requests: IDBRequest[] = [];
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(storeName, mode);
        requests = work(transaction.objectStore(storeName));
      } catch (error) {
        reject(toPersistenceError(error, "Browser storage failed."));
        return;
      }
      // Resolve on transaction completion so a write is durable, not merely queued.
      transaction.oncomplete = () => resolve(result(requests));
      transaction.onerror = () => reject(toPersistenceError(transaction.error ?? requests[0]?.error, "Browser storage failed."));
      transaction.onabort = () => reject(toPersistenceError(transaction.error ?? requests[0]?.error, "Browser storage write was aborted."));
    });
  }

  function backendFor(storeName: string): StorageBackend {
    return {
      get: (key) =>
        run(storeName, "readonly", (store) => [store.get(key)], ([request]) => {
          const value = request?.result;
          return typeof value === "string" ? value : undefined;
        }),
      put: (key, value) => run(storeName, "readwrite", (store) => [store.put(value, key)], () => undefined),
      delete: (key) => run(storeName, "readwrite", (store) => [store.delete(key)], () => undefined),
    };
  }

  const analyses: ListableBackend = {
    ...backendFor(ANALYSES_STORE_NAME),
    list: () =>
      run(ANALYSES_STORE_NAME, "readonly", (store) => [store.getAllKeys(), store.getAll()], ([keys, values]) => {
        const keyList = (keys?.result ?? []) as unknown[];
        const valueList = (values?.result ?? []) as unknown[];
        return keyList.map((key, index) => ({
          key: String(key),
          value: typeof valueList[index] === "string" ? (valueList[index] as string) : undefined,
        }));
      }),
  };

  return { workspace: backendFor(WORKSPACE_STORE_NAME), analyses };
}

/** The automatic-workspace backend (kept for callers that only need that store). */
export function createIndexedDbBackend(factory?: IDBFactory | null): StorageBackend | null {
  return createIndexedDbBackends(factory)?.workspace ?? null;
}

// ---- plain-data guard -------------------------------------------------------------------------

/**
 * Throws if `value` is anything other than plain JSON data: functions, symbols, bigints, class
 * instances (Map, Set, AbortController, DOM or RDKit objects...), non-finite numbers or cycles.
 * Object properties holding `undefined` are allowed (JSON omits them).
 */
export function assertPlainJson(value: unknown, path = "$", ancestors: object[] = []): void {
  if (value === null) return;
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) throw new PersistenceError("unserializable", `${path} is not a finite number.`);
      return;
    case "object": {
      if (ancestors.length > 64) throw new PersistenceError("unserializable", `${path} is nested too deeply.`);
      if (ancestors.includes(value as object)) throw new PersistenceError("unserializable", `${path} contains a cycle.`);
      const next = [...ancestors, value as object];
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item === undefined) throw new PersistenceError("unserializable", `${path}[${index}] is undefined.`);
          assertPlainJson(item, `${path}[${index}]`, next);
        });
        return;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new PersistenceError("unserializable", `${path} is not plain data.`);
      }
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (item === undefined) continue;
        assertPlainJson(item, `${path}.${key}`, next);
      }
      return;
    }
    default:
      throw new PersistenceError("unserializable", `${path} has an unsupported type (${typeof value}).`);
  }
}

// ---- the store --------------------------------------------------------------------------------

export type WorkspaceStoreOptions = {
  maxRecordChars?: number;
  appVersion?: string;
  schemaVersion?: number;
  /** migrations[n] upgrades a raw schema-n record to schema n + 1. */
  migrations?: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>;
  now?: () => Date;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class WorkspaceStore {
  readonly schemaVersion: number;
  readonly maxRecordChars: number;
  private readonly appVersion: string;
  private readonly migrations: NonNullable<WorkspaceStoreOptions["migrations"]>;
  private readonly now: () => Date;

  private readonly backend: StorageBackend | null;

  constructor(backend: StorageBackend | null, options: WorkspaceStoreOptions = {}) {
    this.backend = backend;
    this.schemaVersion = options.schemaVersion ?? PERSISTENCE_SCHEMA_VERSION;
    this.maxRecordChars = options.maxRecordChars ?? DEFAULT_MAX_RECORD_CHARS;
    this.appVersion = options.appVersion ?? PERSISTENCE_APP_VERSION;
    this.migrations = options.migrations ?? {};
    this.now = options.now ?? (() => new Date());
  }

  get available() {
    return this.backend !== null;
  }

  static key(page: PersistedPage) {
    return `workspace:${page}`;
  }

  /** Reads, validates and (if needed) migrates the page's record. Never throws. */
  async load<I, R>(page: PersistedPage): Promise<LoadResult<I, R>> {
    if (!this.backend) {
      return { kind: "unavailable", error: new PersistenceError("unavailable", "Browser storage is not available.") };
    }
    const key = WorkspaceStore.key(page);
    let text: string | undefined;
    try {
      text = await this.backend.get(key);
    } catch (error) {
      return { kind: "unavailable", error: toPersistenceError(error, "Browser storage could not be read.") };
    }
    if (text === undefined) return { kind: "none" };

    const reject = async (result: { kind: "corrupt"; reason: string } | { kind: "incompatible"; reason: string; schemaVersion: number | null }) => {
      // Keep the unreadable record aside (one slot per page) instead of silently deleting it.
      try {
        await this.backend?.put(`${key}#rejected`, text as string);
        await this.backend?.delete(key);
      } catch {
        // If even that fails the record simply stays; the page still starts clean.
      }
      return result;
    };

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reject({ kind: "corrupt", reason: "The saved workspace is not valid JSON." });
    }
    if (!isObject(raw) || raw.kind !== "workspace" || raw.page !== page) {
      return reject({ kind: "corrupt", reason: "The saved workspace has an unexpected shape." });
    }
    const version = raw.schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      return reject({ kind: "corrupt", reason: "The saved workspace has no valid version." });
    }
    if (version > this.schemaVersion) {
      return reject({
        kind: "incompatible",
        reason: `The saved workspace was written by a newer version of PocketChem (format ${version}).`,
        schemaVersion: version,
      });
    }

    let upgraded: Record<string, unknown> = raw;
    let current = version;
    try {
      while (current < this.schemaVersion) {
        const migrate = this.migrations[current];
        if (!migrate) {
          return reject({
            kind: "incompatible",
            reason: `No migration path from saved format ${current} to ${this.schemaVersion}.`,
            schemaVersion: version,
          });
        }
        upgraded = { ...migrate(upgraded), schemaVersion: current + 1 };
        current += 1;
      }
    } catch {
      return reject({ kind: "corrupt", reason: "The saved workspace could not be migrated." });
    }

    const problem = this.envelopeProblem(upgraded);
    if (problem) return reject({ kind: "corrupt", reason: problem });
    return {
      kind: "ok",
      record: upgraded as unknown as WorkspaceRecord<I, R>,
      migratedFrom: version === this.schemaVersion ? null : version,
    };
  }

  private envelopeProblem(raw: Record<string, unknown>): string | null {
    const text = (value: unknown) => typeof value === "string" && value.length > 0;
    if (!text(raw.id) || !text(raw.appVersion) || !text(raw.createdAt) || !text(raw.updatedAt)) {
      return "The saved workspace is missing required fields.";
    }
    if (!isObject(raw.inputs)) return "The saved workspace has no inputs.";
    if (raw.results !== null && raw.results !== undefined) {
      const results = raw.results;
      if (
        !isObject(results) ||
        !text(results.computedAt) ||
        typeof results.engineVersion !== "number" ||
        typeof results.stale !== "boolean" ||
        !text(results.status) ||
        results.data === undefined
      ) {
        return "The saved results are malformed.";
      }
    }
    return null;
  }

  /** Writes the page record in one transaction. Never throws. */
  async save<I, R>(
    page: PersistedPage,
    parts: { inputs: I; results: WorkspaceResults<R> | null; createdAt?: string },
  ): Promise<SaveResult> {
    if (!this.backend) return { ok: false, code: "unavailable", message: "Browser storage is not available." };
    const stamp = this.now().toISOString();
    const record: WorkspaceRecord<I, R> = {
      kind: "workspace",
      id: WorkspaceStore.key(page),
      page,
      schemaVersion: this.schemaVersion,
      appVersion: this.appVersion,
      createdAt: parts.createdAt ?? stamp,
      updatedAt: stamp,
      inputs: parts.inputs,
      results: parts.results,
    };
    let text: string;
    try {
      assertPlainJson(record);
      text = JSON.stringify(record);
    } catch (error) {
      const failure = toPersistenceError(error, "The workspace could not be serialized.");
      return { ok: false, code: failure.code === "io" ? "unserializable" : failure.code, message: failure.message };
    }
    if (text.length > this.maxRecordChars) {
      return { ok: false, code: "too-large", message: "The workspace is too large to save." };
    }
    try {
      await this.backend.put(WorkspaceStore.key(page), text);
      return { ok: true };
    } catch (error) {
      const failure = toPersistenceError(error, "Browser storage could not be written.");
      return { ok: false, code: failure.code, message: failure.message };
    }
  }

  async remove(page: PersistedPage): Promise<SaveResult> {
    if (!this.backend) return { ok: false, code: "unavailable", message: "Browser storage is not available." };
    try {
      await this.backend.delete(WorkspaceStore.key(page));
      return { ok: true };
    } catch (error) {
      const failure = toPersistenceError(error, "Browser storage could not be updated.");
      return { ok: false, code: failure.code, message: failure.message };
    }
  }
}

let defaultBackends: IndexedDbBackends | null | undefined;
let defaultStore: WorkspaceStore | null = null;

/** The application-wide IndexedDB backends (shared connection); null when the browser blocks IndexedDB. */
export function getIndexedDbBackends(): IndexedDbBackends | null {
  if (defaultBackends === undefined) defaultBackends = createIndexedDbBackends();
  return defaultBackends;
}

/** The application-wide store (IndexedDB, or unavailable when the browser blocks it). */
export function getWorkspaceStore(): WorkspaceStore {
  if (!defaultStore) defaultStore = new WorkspaceStore(getIndexedDbBackends()?.workspace ?? null);
  return defaultStore;
}

/** Test hook: replace the application-wide store. */
export function setWorkspaceStoreForTests(store: WorkspaceStore | null) {
  defaultStore = store;
}
