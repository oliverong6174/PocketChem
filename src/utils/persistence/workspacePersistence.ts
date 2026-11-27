/**
 * Per-page automatic workspace recovery.
 *
 * Lifecycle (the safeguard against saving empty defaults over a recoverable workspace):
 *
 *   loading    nothing is written; the page's initial empty state is not trusted.
 *   restoring  a saved record was read; nothing is written until the page has applied it and
 *              calls `resumeAfterRestore()`, so defaults can never replace recovered work.
 *   live       recovery finished (or there was nothing to recover); changes are saved, debounced.
 *   disabled   storage is unusable or the page asked to stop; nothing is written.
 *   suspended  a page transaction (for example adopting a molecule from Properties) is in progress;
 *              nothing is written and the previous phase returns on `resume()`, or the saved
 *              workspace is overwritten in one write by `replaceWorkspace()`.
 *
 * `recover()` reads and validates the saved record exactly once. The page then applies it to its
 * own state and from that moment captures that state when saving. `discard()` (Clear / Reset / "Discard recovered work") bumps
 * the epoch, which invalidates any in-flight recovery and any scheduled save, then deletes the
 * record. Storage operations run through one queue, so a delete always lands after earlier writes.
 */
import {
  WorkspaceStore,
  type PersistedPage,
  type PersistenceErrorCode,
  type WorkspaceRecord,
  type WorkspaceResults,
} from "./workspaceStore";

export type Capture<I, R> = { inputs: I; results: WorkspaceResults<R> | null };

export type RecoveryOutcome<I, R> =
  | { kind: "none" }
  | {
      kind: "restored";
      record: WorkspaceRecord<I, R>;
      /** validated inputs and (possibly dropped) results */
      inputs: I;
      results: WorkspaceResults<R> | null;
      /** results existed but failed validation and were not restored */
      resultsDropped: boolean;
      /** results were produced by a different engine/result-format version */
      engineMismatch: boolean;
      migratedFrom: number | null;
      /** epoch at recovery time; pass to `isCurrent` before applying anything asynchronously */
      epoch: number;
    }
  | { kind: "unavailable"; message: string }
  | { kind: "rejected"; reason: "corrupt" | "incompatible"; message: string }
  | { kind: "superseded" };

export type PersistenceStatus = {
  available: boolean;
  /** last failed write, if any (cleared by the next successful write) */
  saveError: { code: PersistenceErrorCode; message: string } | null;
  /** results were too large to store; inputs were saved without them */
  resultsOmitted: boolean;
};

export type Timers = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type WorkspacePersistenceConfig<I, R> = {
  store: WorkspaceStore;
  page: PersistedPage;
  /** Current result-format/engine version; saved results with another value are flagged. */
  engineVersion: number;
  /** Returns the validated inputs, or null if the saved inputs are unusable. */
  validateInputs: (raw: unknown) => I | null;
  /** Returns the validated results data, or null if it cannot be shown safely. */
  validateResults: (raw: unknown) => R | null;
  debounceMs?: number;
  timers?: Timers;
};

export class WorkspacePersistence<I, R> {
  private phase: "loading" | "restoring" | "live" | "disabled" | "suspended" = "loading";
  /** Where `resume()` goes back to; kept up to date if recovery finishes during a suspension. */
  private resumePhase: "loading" | "restoring" | "live" | "disabled" | null = null;
  private epoch = 0;
  private attached = true;
  private timer: unknown = null;
  private pendingCapture: (() => Capture<I, R> | null) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private recovery: Promise<RecoveryOutcome<I, R>> | null = null;
  private lastSaved: string | null = null;
  private createdAt: string | undefined;
  private hasRecord = false;
  private readonly listeners = new Set<(status: PersistenceStatus) => void>();
  private status: PersistenceStatus;
  private readonly debounceMs: number;
  private readonly timers: Timers;

  private readonly config: WorkspacePersistenceConfig<I, R>;

  constructor(config: WorkspacePersistenceConfig<I, R>) {
    this.config = config;
    this.debounceMs = config.debounceMs ?? 800;
    this.timers = config.timers ?? realTimers;
    this.status = { available: config.store.available, saveError: null, resultsOmitted: false };
  }

  get isLive() {
    return this.phase === "live";
  }

  get currentPhase() {
    return this.phase;
  }

  getStatus() {
    return this.status;
  }

  subscribe(listener: (status: PersistenceStatus) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(patch: Partial<PersistenceStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  /** Token for asynchronous follow-up work; false once Clear/Reset/discard has happened. */
  token() {
    return this.epoch;
  }

  isCurrent(token: number) {
    return token === this.epoch;
  }

  attach() {
    this.attached = true;
  }

  /** Page left or unmounted: save the latest state now instead of dropping the pending save. */
  detach() {
    this.attached = false;
    void this.flush();
  }

  /** Reads the saved record once. Repeated calls return the same promise (React StrictMode safe). */
  recover(): Promise<RecoveryOutcome<I, R>> {
    this.recovery ??= this.runRecovery();
    return this.recovery;
  }

  private async runRecovery(): Promise<RecoveryOutcome<I, R>> {
    const epoch = this.epoch;
    const loaded = await this.config.store.load<unknown, unknown>(this.config.page);
    if (epoch !== this.epoch) return { kind: "superseded" };

    if (loaded.kind === "none") {
      this.settle("live");
      return { kind: "none" };
    }
    if (loaded.kind === "unavailable") {
      this.settle("disabled");
      this.setStatus({ available: false });
      return { kind: "unavailable", message: loaded.error.message };
    }
    if (loaded.kind === "corrupt" || loaded.kind === "incompatible") {
      this.settle("live");
      return { kind: "rejected", reason: loaded.kind, message: loaded.kind === "corrupt" ? loaded.reason : loaded.reason };
    }

    const { record, migratedFrom } = loaded;
    const inputs = this.config.validateInputs(record.inputs);
    if (inputs === null) {
      // The envelope was fine but the page cannot use the inputs: set the record aside.
      this.settle("live");
      void this.enqueue(() => this.config.store.remove(this.config.page));
      return { kind: "rejected", reason: "corrupt", message: "The saved inputs could not be used." };
    }

    let results: WorkspaceResults<R> | null = null;
    let resultsDropped = false;
    if (record.results) {
      const data = this.config.validateResults(record.results.data);
      if (data === null) resultsDropped = true;
      else results = { ...record.results, data };
    }
    this.createdAt = record.createdAt;
    this.hasRecord = true;
    this.lastSaved = canonical({ inputs, results });
    this.settle("restoring");
    return {
      kind: "restored",
      record: record as WorkspaceRecord<I, R>,
      inputs,
      results,
      resultsDropped,
      engineMismatch: Boolean(results && results.engineVersion !== this.config.engineVersion),
      migratedFrom,
      epoch: this.epoch,
    };
  }

  /** Recovery finished: go to `phase`, or remember it if a suspension is in progress. */
  private settle(phase: "restoring" | "live" | "disabled") {
    if (this.phase === "suspended") this.resumePhase = phase;
    else this.phase = phase;
  }

  /** The page has applied (or deliberately skipped) the recovered record; saving may begin. */
  resumeAfterRestore() {
    if (this.phase === "restoring") this.phase = "live";
    else if (this.phase === "suspended" && this.resumePhase === "restoring") this.resumePhase = "live";
  }

  /**
   * Starts a page transaction: scheduled saves are dropped and nothing is written until `resume()`
   * or `replaceWorkspace()`. The saved record is not touched, so a failed transaction loses nothing.
   */
  suspend() {
    if (this.phase === "suspended") return;
    this.resumePhase = this.phase;
    this.phase = "suspended";
    this.cancelTimer();
    this.pendingCapture = null;
  }

  /** The transaction failed and was rolled back: continue as before it started. */
  resume() {
    if (this.phase !== "suspended") return;
    this.phase = this.resumePhase ?? "live";
    this.resumePhase = null;
  }

  /**
   * The transaction succeeded: the page now owns a new workspace. Everything scheduled or in flight
   * for the old one (a recovery still loading, stale callbacks, pending saves) is invalidated, but the
   * saved record is not deleted; the next write replaces it in a single put.
   */
  replaceWorkspace() {
    this.epoch += 1;
    this.cancelTimer();
    this.pendingCapture = null;
    this.resumePhase = null;
    this.phase = this.config.store.available ? "live" : "disabled";
    this.lastSaved = null;
    this.setStatus({ saveError: null, resultsOmitted: false });
  }

  /** Stop writing (for example when the editors could not be restored and a save would erase work). */
  disable() {
    this.phase = "disabled";
    this.resumePhase = null;
    this.cancelTimer();
  }

  /**
   * Debounced save. `capture` runs when the timer fires (so it sees the latest state) and may
   * return null for "nothing worth keeping", which removes the record.
   */
  requestSave(capture: () => Capture<I, R> | null) {
    if (this.phase !== "live") return;
    this.pendingCapture = capture;
    this.cancelTimer();
    if (!this.attached) {
      // The page has been left: a late editor read finishing now is the newest state there is, so
      // it is written straight away instead of waiting for a timer nobody will flush.
      this.runPending();
      return;
    }
    const epoch = this.epoch;
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (epoch === this.epoch) this.runPending();
    }, this.debounceMs);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private runPending() {
    const capture = this.pendingCapture;
    this.pendingCapture = null;
    if (!capture || this.phase !== "live") return;
    const epoch = this.epoch;
    let captured: Capture<I, R> | null;
    try {
      captured = capture();
    } catch (error) {
      this.setStatus({ saveError: { code: "unserializable", message: error instanceof Error ? error.message : "Could not capture the workspace." } });
      return;
    }
    void this.enqueue(() => this.write(captured, epoch));
  }

  private async write(captured: Capture<I, R> | null, epoch: number) {
    if (epoch !== this.epoch || this.phase !== "live") return;
    const { store, page } = this.config;
    if (captured === null) {
      if (!this.hasRecord) return;
      const removed = await store.remove(page);
      if (removed.ok) {
        this.hasRecord = false;
        this.lastSaved = null;
        this.createdAt = undefined;
      }
      return;
    }
    const key = canonical(captured);
    if (key === this.lastSaved) return;

    let outcome = await store.save(page, { ...captured, createdAt: this.createdAt });
    let omitted = false;
    if (!outcome.ok && outcome.code === "too-large" && captured.results) {
      // Keep the inputs when only the results are too big, and say so.
      outcome = await store.save(page, { inputs: captured.inputs, results: null, createdAt: this.createdAt });
      omitted = outcome.ok;
    }
    if (epoch !== this.epoch) return;
    if (outcome.ok) {
      this.hasRecord = true;
      this.createdAt ??= new Date().toISOString();
      this.lastSaved = omitted ? canonical({ inputs: captured.inputs, results: null }) : key;
      this.setStatus({ saveError: null, resultsOmitted: omitted });
    } else {
      this.setStatus({ saveError: { code: outcome.code, message: outcome.message } });
    }
  }

  private enqueue<T>(job: () => Promise<T>) {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Runs any scheduled save now and waits for every queued storage operation. */
  async flush() {
    if (this.timer !== null) {
      this.cancelTimer();
      this.runPending();
    }
    await this.queue;
  }

  /**
   * Clear / Reset / "Discard recovered work": invalidates recovery and scheduled saves, deletes
   * the saved record, and returns the page to a live, empty workspace.
   */
  async discard() {
    this.epoch += 1;
    this.cancelTimer();
    this.pendingCapture = null;
    this.phase = this.config.store.available ? "live" : "disabled";
    this.resumePhase = null;
    this.lastSaved = null;
    this.createdAt = undefined;
    this.hasRecord = false;
    this.setStatus({ saveError: null, resultsOmitted: false });
    await this.enqueue(() => this.config.store.remove(this.config.page));
  }
}

function canonical(value: unknown) {
  return JSON.stringify(value);
}
