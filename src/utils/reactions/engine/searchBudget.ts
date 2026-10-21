/**
 * Shared deadline for the adaptive synthesis search (Stage 8A-1).
 *
 * One SearchBudget owns the overall deadline. Every lane receives a *slice*: a child
 * AbortSignal that fires at the earlier of the slice's own limit and the overall
 * deadline, or when the caller cancels. A lane therefore can never start with a fresh
 * full budget, and a sequence of lanes cannot add up to more than the total.
 *
 * Cancellation is cooperative. Aborting a signal only takes effect when the running
 * engine next checks it (between awaits); a synchronous RDKit call cannot be
 * interrupted. A lane that overruns its slice is therefore reported (`overrunMs`),
 * never silently assumed to have stopped on time.
 */

export type SearchClock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const systemClock: SearchClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type SliceEnd = "open" | "slice-limit" | "overall-deadline" | "cancelled";

export type BudgetSlice = {
  signal: AbortSignal;
  /** Absolute clock time (same clock as the budget) at which this slice ends. */
  deadlineAt: number;
  /** Milliseconds allotted when the slice was created. */
  allottedMs: number;
  /** Why the slice ended; "open" while it is still running. */
  endedBy(): SliceEnd;
  /** Milliseconds elapsed since the slice started. */
  elapsedMs(): number;
  /** Stop the timer and detach from the parent signal. Idempotent. */
  release(): void;
};

export class SearchBudget {
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly totalMs: number;
  private readonly parent: AbortSignal | undefined;
  private readonly clock: SearchClock;

  constructor(totalMs: number, parent?: AbortSignal, clock: SearchClock = systemClock) {
    if (!Number.isFinite(totalMs) || totalMs <= 0) throw new Error("SearchBudget needs a positive totalMs");
    this.totalMs = totalMs;
    this.parent = parent;
    this.clock = clock;
    this.startedAt = clock.now();
    this.deadlineAt = this.startedAt + totalMs;
  }

  elapsedMs(): number {
    return this.clock.now() - this.startedAt;
  }

  /** Milliseconds left before the overall deadline (never negative). */
  remainingMs(): number {
    return Math.max(0, this.deadlineAt - this.clock.now());
  }

  /** True when the caller cancelled (as opposed to the deadline passing). */
  cancelled(): boolean {
    return this.parent?.aborted === true;
  }

  expired(): boolean {
    return this.remainingMs() <= 0;
  }

  /**
   * Opens a slice of at most `ms`, clamped to the time that is left. The slice
   * also ends when the caller cancels.
   */
  slice(ms: number): BudgetSlice {
    const allottedMs = Math.max(0, Math.min(ms, this.remainingMs()));
    const startedAt = this.clock.now();
    const deadlineAt = startedAt + allottedMs;
    const controller = new AbortController();
    let ended: SliceEnd = "open";
    let released = false;
    const end = (reason: SliceEnd) => {
      if (ended === "open") ended = reason;
      if (!controller.signal.aborted) controller.abort();
    };
    const onParentAbort = () => end("cancelled");
    if (this.parent?.aborted) {
      end("cancelled");
    } else if (allottedMs <= 0) {
      end("overall-deadline");
    }
    this.parent?.addEventListener("abort", onParentAbort);
    const handle = controller.signal.aborted
      ? undefined
      : this.clock.setTimeout(
          () => end(deadlineAt >= this.deadlineAt ? "overall-deadline" : "slice-limit"),
          allottedMs,
        );
    return {
      signal: controller.signal,
      deadlineAt,
      allottedMs,
      endedBy: () => ended,
      elapsedMs: () => this.clock.now() - startedAt,
      release: () => {
        if (released) return;
        released = true;
        if (handle !== undefined) this.clock.clearTimeout(handle);
        this.parent?.removeEventListener("abort", onParentAbort);
      },
    };
  }
}
