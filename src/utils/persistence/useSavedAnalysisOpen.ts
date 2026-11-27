import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisLibrary, OpenedAnalysis } from "./analysisLibrary";
import { getAppAnalysisLibrary } from "./analysisLibraryApp";
import type { PersistedPage } from "./workspaceStore";
import type { WorkspaceNoticeItem } from "../../components/WorkspaceNotice";

/** What a page supplies to the shared "open a saved analysis" flow. */
export type OpenFlowPage<I, R> = {
  page: PersistedPage;
  onOpenHandled?: (requestId: string) => void;
  /** A reason the page cannot open anything right now (a calculation or another open is running). */
  busyReason: () => string | null;
  /** The page holds structures or results that are not saved as an analysis. */
  hasUnsavedWork: () => boolean;
  canSaveCurrent: () => boolean;
  saveCurrent: (name: string) => Promise<boolean>;
  defaultName: () => string;
  /** Replaces the page's workspace with the analysis; false when it failed and everything was kept. */
  apply: (opened: OpenedAnalysis<I, R>) => Promise<boolean>;
  notify: (item: WorkspaceNoticeItem) => void;
  /** Defaults to the app's library; tests pass their own. */
  library?: AnalysisLibrary;
};

export type OpenRequest = { id: string; recordId: string };

export type OpenFlowStart<I, R> =
  | { kind: "applied" }
  | { kind: "failed" }
  | { kind: "refused" }
  | { kind: "prompt"; opened: OpenedAnalysis<I, R> };

/**
 * First half of the flow, free of React so it can be tested: load and validate the record, refuse
 * if it is not for this page or the page is busy, ask before replacing unsaved work, otherwise apply.
 * `onOpenHandled` is called exactly once unless the answer is "prompt" (then `resolveOpenFlow` does).
 */
export async function beginOpenFlow<I, R>(page: OpenFlowPage<I, R>, request: OpenRequest): Promise<OpenFlowStart<I, R>> {
  const handled = () => page.onOpenHandled?.(request.id);
  const loaded = await (page.library ?? getAppAnalysisLibrary()).open<I, R>(request.recordId);
  if (!loaded.ok) {
    page.notify({ tone: "warn", text: `The saved analysis could not be opened: ${loaded.error.message}` });
    handled();
    return { kind: "refused" };
  }
  if (loaded.value.record.page !== page.page) {
    page.notify({ tone: "warn", text: "That saved analysis belongs to another page." });
    handled();
    return { kind: "refused" };
  }
  const busy = page.busyReason();
  if (busy) {
    page.notify({ tone: "warn", text: busy });
    handled();
    return { kind: "refused" };
  }
  if (page.hasUnsavedWork()) return { kind: "prompt", opened: loaded.value };
  const applied = await page.apply(loaded.value);
  handled();
  return { kind: applied ? "applied" : "failed" };
}

/** Second half: the user's answer to "replace the current workspace?". */
export async function resolveOpenFlow<I, R>(
  page: OpenFlowPage<I, R>,
  request: OpenRequest,
  opened: OpenedAnalysis<I, R>,
  choice: "replace" | "save-first" | "cancel",
): Promise<"applied" | "failed" | "cancelled" | "not-saved"> {
  if (choice === "cancel") {
    page.onOpenHandled?.(request.id);
    return "cancelled";
  }
  if (choice === "save-first") {
    const name = `${page.defaultName()} (before opening ${opened.record.name})`.slice(0, 120);
    // If the current workspace could not be saved, nothing is replaced.
    if (!(await page.saveCurrent(name))) {
      page.onOpenHandled?.(request.id);
      return "not-saved";
    }
  }
  const applied = await page.apply(opened);
  page.onOpenHandled?.(request.id);
  return applied ? "applied" : "failed";
}

type OpenArgs<I, R> = OpenFlowPage<I, R> & {
  openRequest: OpenRequest | null;
  /** Recovery has finished and the page's editors are ready. */
  ready: boolean;
};

/**
 * The shared "open a saved analysis" hook: waits for recovery and the editors, handles each request
 * once, and shows the replace-or-save prompt. Nothing here knows about chemistry; the page supplies
 * `apply`.
 */
export function useSavedAnalysisOpen<I, R>(args: OpenArgs<I, R>) {
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });
  const handledRef = useRef<string | null>(null);
  const [prompt, setPrompt] = useState<{ request: OpenRequest; opened: OpenedAnalysis<I, R> } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const begin = useCallback(async (request: OpenRequest) => {
    const started = await beginOpenFlow(argsRef.current, request);
    if (started.kind === "prompt") setPrompt({ request, opened: started.opened });
  }, []);

  useEffect(() => {
    if (!args.openRequest || !args.ready) return;
    if (handledRef.current === args.openRequest.id) return;
    handledRef.current = args.openRequest.id;
    void begin(args.openRequest);
  }, [args.openRequest, args.ready, begin]);

  const resolve = useCallback(
    async (choice: "replace" | "save-first" | "cancel") => {
      const pending = prompt;
      if (!pending) return;
      setPrompt(null);
      if (choice === "save-first") setSaveBusy(true);
      try {
        await resolveOpenFlow(argsRef.current, pending.request, pending.opened, choice);
      } finally {
        setSaveBusy(false);
      }
    },
    [prompt],
  );

  return { prompt, resolve, saveBusy };
}
