import type { Timers } from "./workspacePersistence";

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A debounced async task whose pending run can be forced. Pages use it to mirror an editor into
 * their saved workspace: edits schedule a short-delay read, and leaving the page (or the tab being
 * hidden) calls `flushNow()` so an edit made a moment earlier is not lost with the timer.
 */
export class DebouncedTask {
  private timer: unknown = null;
  private running: Promise<void> | null = null;
  private task: () => Promise<void>;
  private readonly delayMs: number;
  private readonly timers: Timers;

  constructor(task: () => Promise<void>, delayMs = 150, timers: Timers = realTimers) {
    this.task = task;
    this.delayMs = delayMs;
    this.timers = timers;
  }

  /** Replaces the work to run (a page keeps this pointing at its latest closure). */
  setTask(task: () => Promise<void>) {
    this.task = task;
  }

  get pending() {
    return this.timer !== null || this.running !== null;
  }

  schedule() {
    this.cancel();
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.start();
    }, this.delayMs);
  }

  cancel() {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private start(): Promise<void> {
    const run: Promise<void> = this.task()
      .catch(() => undefined)
      .finally(() => {
        if (this.running === run) this.running = null;
      });
    this.running = run;
    return run;
  }

  /** Runs a scheduled task immediately (or waits for the one already running). */
  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      this.cancel();
      await this.start();
      return;
    }
    if (this.running) await this.running;
  }
}
