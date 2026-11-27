/**
 * Lets a page finish saving before the app unmounts it. The app awaits `runLeaveHooks()` before it
 * switches pages, so a pending editor read and a pending debounced save complete while the page's
 * editor still exists. Hooks are bounded by a timeout so navigation can never hang.
 */
type LeaveHook = () => Promise<void> | void;

const hooks = new Set<LeaveHook>();

export function registerLeaveHook(hook: LeaveHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

export async function runLeaveHooks(timeoutMs = 1500): Promise<void> {
  if (hooks.size === 0) return;
  const all = Promise.all(
    [...hooks].map(async (hook) => {
      try {
        await hook();
      } catch {
        // A failing page must not block navigation.
      }
    }),
  ).then(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([all, limit]);
  if (timer !== undefined) clearTimeout(timer);
}
