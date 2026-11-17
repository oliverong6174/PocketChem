import type { SubjectId } from "../../navigation/subjects";
/**
 * The Saved Analyses library: named snapshots a user chooses to keep, stored in their own
 * IndexedDB object store ("analyses") and completely separate from each page's automatic workspace.
 *
 * A saved analysis is a copy of what a page showed: its inputs (structures and settings) and the
 * results exactly as displayed, with the original computed-at time, engine version, stale flag and
 * status. Nothing is recomputed when one is saved, listed, renamed, duplicated or opened. Records are
 * plain JSON, checked with `assertPlainJson` on the way in and validated by the owning page's
 * validators on the way out, so a damaged or newer-format record can be listed and deleted but never
 * crashes the app.
 *
 * Saving always creates a new record. Overwriting is a separate, explicit `update(id, …)`.
 */
import {
  PAGE_SUBJECT,
  PERSISTENCE_APP_VERSION,
  PersistenceError,
  assertPlainJson,
  getIndexedDbBackends,
  type ListableBackend,
  type PersistedPage,
  type WorkspaceResults,
} from "./workspaceStore";

export const ANALYSIS_SCHEMA_VERSION = 1;
export const MAX_SAVED_ANALYSES = 200;
export const MAX_ANALYSIS_NAME_CHARS = 120;
export const MAX_ANALYSIS_SUMMARY_CHARS = 400;
const DEFAULT_MAX_RECORD_CHARS = 6_000_000;

export type SavedAnalysisRecord<I = unknown, R = unknown> = {
  kind: "saved-analysis";
  id: string;
  page: PersistedPage;
  /** Explicit subject (Stage 11). Older records lack it and are read as PAGE_SUBJECT[page]. */
  subject?: SubjectId;
  name: string;
  schemaVersion: number;
  /** Build that first saved the record (kept as written, also by duplicates). */
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  /** One line shown in the library list. */
  summary: string;
  inputs: I;
  results: WorkspaceResults<R> | null;
};

export type SavedAnalysisSummary = {
  id: string;
  page: PersistedPage;
  subject: SubjectId;
  name: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  /** Page-specific outcome kind of the saved results, or null for an inputs-only snapshot. */
  status: string | null;
  /** The structures changed after the results were computed, as recorded when saved. */
  stale: boolean;
  engineVersion: number | null;
  sizeChars: number;
};

export type LibraryErrorCode =
  | "unavailable"
  | "quota"
  | "too-large"
  | "unserializable"
  | "not-found"
  | "damaged"
  | "incompatible"
  | "unsupported-page"
  | "invalid-name"
  | "library-full"
  | "io";

export type LibraryError = { code: LibraryErrorCode; message: string };
export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: LibraryError };

/** An entry that cannot be listed normally: unreadable, or written by a newer version. */
export type LibraryProblem = {
  id: string;
  kind: "damaged" | "incompatible";
  message: string;
  /** Name, when it could still be read. */
  name: string | null;
};

export type PageValidators<I = unknown, R = unknown> = {
  /** Result-format version of the page's current code; saved results with another value are flagged. */
  engineVersion: number;
  validateInputs: (raw: unknown) => I | null;
  validateResults: (raw: unknown) => R | null;
};

export type OpenedAnalysis<I = unknown, R = unknown> = {
  record: SavedAnalysisRecord<I, R>;
  inputs: I;
  /** Validated results (original metadata kept), or null if none were saved or they could not be shown. */
  results: WorkspaceResults<R> | null;
  resultsDropped: boolean;
  engineMismatch: boolean;
  migratedFrom: number | null;
};

export type AnalysisLibraryOptions = {
  validators?: Partial<Record<PersistedPage, PageValidators>>;
  maxRecordChars?: number;
  maxRecords?: number;
  schemaVersion?: number;
  /** migrations[n] upgrades a raw schema-n record to schema n + 1. */
  migrations?: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>;
  now?: () => Date;
  newId?: () => string;
};

const PAGES: readonly string[] = ["synthesis", "properties", "reactions", "spectroscopy", "ranking", "multicatalytic", "conformations", "genchem", "equilibrium", "kinetics", "thermo", "stoichiometry", "gaslaws", "electrochem", "mechanics", "circuits", "rc", "forces", "energy", "collisions", "waves", "optics", "interference", "replication", "transcription", "translation", "dogma", "regulation", "genetics", "celldivision", "membrane", "signaling", "neuron", "aminoacids", "proteins", "enzymes", "glycolysis", "gluconeogenesis", "tca", "etc", "metabolism"];
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function fail<T>(code: LibraryErrorCode, message: string): LibraryResult<T> {
  return { ok: false, error: { code, message } };
}

function fromThrown<T>(error: unknown): LibraryResult<T> {
  if (error instanceof PersistenceError) {
    const code: LibraryErrorCode = error.code === "unserializable" ? "unserializable" : error.code;
    return fail(code, error.message);
  }
  return fail("io", error instanceof Error ? error.message : "Browser storage failed.");
}

function defaultId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A deep copy of plain data. Anything that is not plain JSON (a Map, a class instance, NaN, a
 * function) is rejected first, because copying through JSON would silently turn it into something else.
 */
function plainCopy<T>(value: T): T {
  assertPlainJson(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Trimmed, single-line, non-empty and bounded; null when the name is unusable. */
export function cleanAnalysisName(name: string): string | null {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > MAX_ANALYSIS_NAME_CHARS) return null;
  return cleaned;
}

export class AnalysisLibrary {
  private readonly backend: ListableBackend | null;
  private readonly validators: Partial<Record<PersistedPage, PageValidators>>;
  private readonly maxRecordChars: number;
  private readonly maxRecords: number;
  private readonly schemaVersion: number;
  private readonly migrations: NonNullable<AnalysisLibraryOptions["migrations"]>;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(backend: ListableBackend | null, options: AnalysisLibraryOptions = {}) {
    this.backend = backend;
    this.validators = options.validators ?? {};
    this.maxRecordChars = options.maxRecordChars ?? DEFAULT_MAX_RECORD_CHARS;
    this.maxRecords = options.maxRecords ?? MAX_SAVED_ANALYSES;
    this.schemaVersion = options.schemaVersion ?? ANALYSIS_SCHEMA_VERSION;
    this.migrations = options.migrations ?? {};
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? defaultId;
  }

  get available() {
    return this.backend !== null;
  }

  /** Library operations run one at a time, so read-modify-write sequences cannot interleave. */
  private run<T>(job: () => Promise<LibraryResult<T>>): Promise<LibraryResult<T>> {
    const next = this.queue.then(job, job).catch((error) => fromThrown<T>(error));
    this.queue = next.catch(() => undefined);
    return next;
  }

  // ---- parsing -----------------------------------------------------------------------------

  /** Parses, migrates and envelope-checks one stored value. Page content is not looked at. */
  private parse(key: string, text: string | undefined):
    | { ok: true; record: SavedAnalysisRecord; migratedFrom: number | null }
    | { ok: false; kind: "damaged" | "incompatible"; message: string; name: string | null } {
    if (text === undefined) return { ok: false, kind: "damaged", message: "The saved analysis is empty.", name: null };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, kind: "damaged", message: "The saved analysis could not be read.", name: null };
    }
    if (!isObject(raw) || raw.kind !== "saved-analysis") {
      return { ok: false, kind: "damaged", message: "The saved analysis has an unexpected shape.", name: null };
    }
    const name = typeof raw.name === "string" ? raw.name : null;
    const version = raw.schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      return { ok: false, kind: "damaged", message: "The saved analysis has no valid version.", name };
    }
    if (version > this.schemaVersion) {
      return { ok: false, kind: "incompatible", message: `Saved by a newer version of PocketChem (format ${version}).`, name };
    }
    let upgraded: Record<string, unknown> = raw;
    let current = version;
    try {
      while (current < this.schemaVersion) {
        const migrate = this.migrations[current];
        if (!migrate) {
          return { ok: false, kind: "incompatible", message: `No way to upgrade saved format ${current}.`, name };
        }
        upgraded = { ...migrate(upgraded), schemaVersion: current + 1 };
        current += 1;
      }
    } catch {
      return { ok: false, kind: "damaged", message: "The saved analysis could not be upgraded.", name };
    }
    const problem = this.envelopeProblem(key, upgraded);
    if (problem) return { ok: false, kind: "damaged", message: problem, name };
    return { ok: true, record: upgraded as unknown as SavedAnalysisRecord, migratedFrom: version === this.schemaVersion ? null : version };
  }

  private envelopeProblem(key: string, raw: Record<string, unknown>): string | null {
    if (raw.id !== key) return "The saved analysis does not match its storage key.";
    if (!isText(raw.page) || !PAGES.includes(raw.page)) return "The saved analysis has an unknown page type.";
    if (raw.subject !== undefined && raw.subject !== PAGE_SUBJECT[raw.page as PersistedPage]) return "The saved analysis names a subject that does not match its page type.";
    if (!isText(raw.name) || raw.name.length > MAX_ANALYSIS_NAME_CHARS) return "The saved analysis has no usable name.";
    if (!isText(raw.appVersion) || !isText(raw.createdAt) || !isText(raw.updatedAt)) return "The saved analysis is missing required fields.";
    if (typeof raw.summary !== "string") return "The saved analysis has no summary.";
    if (!isObject(raw.inputs)) return "The saved analysis has no inputs.";
    if (raw.results !== null) {
      const results = raw.results;
      if (
        !isObject(results) || !isText(results.computedAt) || typeof results.engineVersion !== "number" ||
        typeof results.stale !== "boolean" || !isText(results.status) || results.data === undefined
      ) {
        return "The saved results are malformed.";
      }
    }
    return null;
  }

  private summaryOf(record: SavedAnalysisRecord, sizeChars: number): SavedAnalysisSummary {
    return {
      id: record.id,
      page: record.page,
      subject: record.subject ?? PAGE_SUBJECT[record.page],
      name: record.name,
      summary: record.summary,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: record.results?.status ?? null,
      stale: record.results?.stale ?? false,
      engineVersion: record.results?.engineVersion ?? null,
      sizeChars,
    };
  }

  private serialize(record: SavedAnalysisRecord): LibraryResult<string> {
    let text: string;
    try {
      assertPlainJson(record);
      text = JSON.stringify(record);
    } catch (error) {
      return fromThrown(error);
    }
    if (text.length > this.maxRecordChars) return fail("too-large", "This analysis is too large to save.");
    return { ok: true, value: text };
  }

  private async allKeys(): Promise<string[]> {
    if (!this.backend) return [];
    return (await this.backend.list()).map((entry) => entry.key);
  }

  private async freshId(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = this.newId();
      if (id && (await this.backend?.get(id)) === undefined) return id;
    }
    throw new PersistenceError("io", "Could not allocate a unique id for the saved analysis.");
  }

  // ---- operations --------------------------------------------------------------------------

  /** Saves a new analysis. Never overwrites: every call makes a new record with a new id. */
  save<I, R>(
    page: PersistedPage,
    parts: { name: string; summary: string; inputs: I; results: WorkspaceResults<R> | null },
  ): Promise<LibraryResult<SavedAnalysisSummary>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      const name = cleanAnalysisName(parts.name);
      if (!name) return fail("invalid-name", `Give the analysis a name of 1 to ${MAX_ANALYSIS_NAME_CHARS} characters.`);
      if ((await this.allKeys()).length >= this.maxRecords) {
        return fail("library-full", `The library holds at most ${this.maxRecords} analyses. Delete one to save another.`);
      }
      const id = await this.freshId();
      const stamp = this.now().toISOString();
      const record: SavedAnalysisRecord<I, R> = {
        kind: "saved-analysis",
        id,
        page,
        subject: PAGE_SUBJECT[page],
        name,
        schemaVersion: this.schemaVersion,
        appVersion: PERSISTENCE_APP_VERSION,
        createdAt: stamp,
        updatedAt: stamp,
        summary: parts.summary.slice(0, MAX_ANALYSIS_SUMMARY_CHARS),
        // A copy: later edits to the live objects cannot reach the stored snapshot.
        inputs: plainCopy(parts.inputs),
        results: parts.results === null ? null : plainCopy(parts.results),
      };
      const text = this.serialize(record as SavedAnalysisRecord);
      if (!text.ok) return text;
      await this.backend.put(id, text.value);
      return { ok: true, value: this.summaryOf(record as SavedAnalysisRecord, text.value.length) };
    });
  }

  /** Explicit overwrite of an existing analysis (never used by Save). Keeps id, name and creation time. */
  update<I, R>(
    id: string,
    parts: { summary?: string; inputs: I; results: WorkspaceResults<R> | null },
  ): Promise<LibraryResult<SavedAnalysisSummary>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      const stored = await this.backend.get(id);
      if (stored === undefined) return fail("not-found", "That saved analysis no longer exists.");
      const existing = this.parse(id, stored);
      if (!existing.ok) return fail(existing.kind, existing.message);
      const record: SavedAnalysisRecord = {
        ...existing.record,
        updatedAt: this.now().toISOString(),
        summary: (parts.summary ?? existing.record.summary).slice(0, MAX_ANALYSIS_SUMMARY_CHARS),
        inputs: plainCopy(parts.inputs),
        results: parts.results === null ? null : plainCopy(parts.results),
      };
      const text = this.serialize(record);
      if (!text.ok) return text;
      await this.backend.put(id, text.value);
      return { ok: true, value: this.summaryOf(record, text.value.length) };
    });
  }

  /** Every saved analysis, newest first, plus the entries that cannot be opened (so they can be deleted). */
  list(): Promise<LibraryResult<{ items: SavedAnalysisSummary[]; problems: LibraryProblem[] }>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      const items: SavedAnalysisSummary[] = [];
      const problems: LibraryProblem[] = [];
      for (const entry of await this.backend.list()) {
        const parsed = this.parse(entry.key, entry.value);
        if (parsed.ok) items.push(this.summaryOf(parsed.record, entry.value?.length ?? 0));
        else problems.push({ id: entry.key, kind: parsed.kind, message: parsed.message, name: parsed.name });
      }
      items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1));
      return { ok: true, value: { items, problems } };
    });
  }

  /** Reads one analysis and validates it with its page's validators. Nothing is recomputed. */
  open<I = unknown, R = unknown>(id: string): Promise<LibraryResult<OpenedAnalysis<I, R>>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      const text = await this.backend.get(id);
      if (text === undefined) return fail("not-found", "That saved analysis no longer exists.");
      const parsed = this.parse(id, text);
      if (!parsed.ok) return fail(parsed.kind, parsed.message);
      const { record, migratedFrom } = parsed;
      const validators = this.validators[record.page];
      if (!validators) return fail("unsupported-page", "This kind of analysis cannot be opened by this version of PocketChem.");
      const inputs = validators.validateInputs(record.inputs);
      if (inputs === null) return fail("damaged", "The saved structures and settings could not be used.");
      let results: WorkspaceResults<unknown> | null = null;
      let resultsDropped = false;
      if (record.results) {
        const data = validators.validateResults(record.results.data);
        if (data === null) resultsDropped = true;
        else results = { ...record.results, data };
      }
      return {
        ok: true,
        value: {
          record: record as SavedAnalysisRecord<I, R>,
          inputs: inputs as I,
          results: results as WorkspaceResults<R> | null,
          resultsDropped,
          engineMismatch: Boolean(results && results.engineVersion !== validators.engineVersion),
          migratedFrom,
        },
      };
    });
  }

  /** Changes only the name (and modification time); inputs and results are carried over untouched. */
  rename(id: string, name: string): Promise<LibraryResult<SavedAnalysisSummary>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      const cleaned = cleanAnalysisName(name);
      if (!cleaned) return fail("invalid-name", `Give the analysis a name of 1 to ${MAX_ANALYSIS_NAME_CHARS} characters.`);
      const text = await this.backend.get(id);
      if (text === undefined) return fail("not-found", "That saved analysis no longer exists.");
      const parsed = this.parse(id, text);
      if (!parsed.ok) return fail(parsed.kind, parsed.message);
      const record: SavedAnalysisRecord = { ...parsed.record, name: cleaned, updatedAt: this.now().toISOString() };
      const out = this.serialize(record);
      if (!out.ok) return out;
      await this.backend.put(id, out.value);
      return { ok: true, value: this.summaryOf(record, out.value.length) };
    });
  }

  /** A new record with a new id and everything else copied, including the original result metadata. */
  duplicate(id: string, name?: string): Promise<LibraryResult<SavedAnalysisSummary>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      const text = await this.backend.get(id);
      if (text === undefined) return fail("not-found", "That saved analysis no longer exists.");
      const parsed = this.parse(id, text);
      if (!parsed.ok) return fail(parsed.kind, parsed.message);
      if ((await this.allKeys()).length >= this.maxRecords) {
        return fail("library-full", `The library holds at most ${this.maxRecords} analyses. Delete one to save another.`);
      }
      const chosen = cleanAnalysisName(name ?? `${parsed.record.name} (copy)`.slice(0, MAX_ANALYSIS_NAME_CHARS));
      if (!chosen) return fail("invalid-name", `Give the analysis a name of 1 to ${MAX_ANALYSIS_NAME_CHARS} characters.`);
      const stamp = this.now().toISOString();
      const copy: SavedAnalysisRecord = {
        ...(JSON.parse(JSON.stringify(parsed.record)) as SavedAnalysisRecord),
        id: await this.freshId(),
        name: chosen,
        createdAt: stamp,
        updatedAt: stamp,
      };
      const out = this.serialize(copy);
      if (!out.ok) return out;
      await this.backend.put(copy.id, out.value);
      return { ok: true, value: this.summaryOf(copy, out.value.length) };
    });
  }

  /** Removes exactly one analysis (also an unreadable one). Other records and workspaces are untouched. */
  delete(id: string): Promise<LibraryResult<{ id: string }>> {
    return this.run(async () => {
      if (!this.backend) return fail("unavailable", "Browser storage is not available.");
      if ((await this.backend.get(id)) === undefined) return fail("not-found", "That saved analysis no longer exists.");
      await this.backend.delete(id);
      return { ok: true, value: { id } };
    });
  }
}

let defaultLibrary: AnalysisLibrary | null = null;
let validatorSet: Partial<Record<PersistedPage, PageValidators>> = {};

/**
 * Pages register how their saved records are validated. Done by the app at startup, so the library
 * itself stays page-agnostic and imports no chemistry.
 */
export function registerAnalysisValidators(validators: Partial<Record<PersistedPage, PageValidators>>) {
  validatorSet = { ...validatorSet, ...validators };
  defaultLibrary = null; // rebuilt with the new set on next use
}

/** The application-wide library (IndexedDB, or unavailable when the browser blocks it). */
export function getAnalysisLibrary(): AnalysisLibrary {
  if (!defaultLibrary) defaultLibrary = new AnalysisLibrary(getIndexedDbBackends()?.analyses ?? null, { validators: validatorSet });
  return defaultLibrary;
}

/** Test hook: replace the application-wide library. */
export function setAnalysisLibraryForTests(library: AnalysisLibrary | null) {
  defaultLibrary = library;
}
