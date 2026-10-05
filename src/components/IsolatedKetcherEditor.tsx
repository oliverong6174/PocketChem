import { useCallback, useEffect, useMemo, useRef } from "react";

import type { KetcherApi } from "./MoleculeDrawer";
import {
  KETCHER_FRAME_CHANNEL,
  KETCHER_FRAME_QUERY_KEY,
} from "./ketcherFrameProtocol";

type Props = {
  onError: (error: unknown) => void;
  onReady: (api: KetcherApi) => void;
  onUnavailable?: () => void;
  onChange?: () => void;
  debugLabel?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type FrameMessage = {
  channel?: string;
  frameId?: string;
  type?: "ready" | "change" | "error" | "response";
  requestId?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  capabilities?: { addFragment?: boolean };
};

const COMMAND_TIMEOUT_MS = 12000;
const READY_TIMEOUT_MS = 15000;
let requestSequence = 0;

function nextRequestId(frameId: string): string {
  requestSequence += 1;
  return `${frameId}-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

/**
 * Parent-side proxy for an iframe-hosted Ketcher instance.
 *
 * Two details are important here:
 * 1. The iframe boundary isolates Ketcher's document-level keyboard/selection
 *    handlers so the left and right synthesis editors do not interfere.
 * 2. Calls wait for the *current* iframe to announce readiness instead of
 *    immediately rejecting. This matters during Vite Fast Refresh, iframe
 *    reloads, and the first few milliseconds after the editor mounts.
 */
export default function IsolatedKetcherEditor({
  onError,
  onReady,
  onUnavailable,
  onChange,
  debugLabel = "isolated-ketcher",
}: Props) {
  const frameId = debugLabel;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const readyWaitersRef = useRef(new Set<ReadyWaiter>());
  const readyRef = useRef(false);
  const addFragmentSupportedRef = useRef(true);
  const onReadyRef = useRef(onReady);
  const onUnavailableRef = useRef(onUnavailable);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const frameSrc = useMemo(() => {
    // Use a dedicated HTML entry for each isolated Ketcher document. Do not
    // boot the normal PocketChem SPA in the iframe and then branch in main.tsx:
    // that path was fragile under Vite refresh/history routing and could leave
    // the frame sitting on PocketChem's dark background with "Loading".
    const basePath = import.meta.env.BASE_URL || "/";
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    const url = new URL(`${normalizedBase}ketcher-frame.html`, window.location.origin);
    url.searchParams.set(KETCHER_FRAME_QUERY_KEY, frameId);
    return url.toString();
  }, [frameId]);

  const postProbe = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      {
        channel: KETCHER_FRAME_CHANNEL,
        frameId,
        type: "probe",
      },
      window.location.origin,
    );
  }, [frameId]);

  const resolveReadyWaiters = useCallback(() => {
    for (const waiter of readyWaitersRef.current) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve();
    }
    readyWaitersRef.current.clear();
  }, []);

  const rejectReadyWaiters = useCallback((reason: Error) => {
    for (const waiter of readyWaitersRef.current) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(reason);
    }
    readyWaitersRef.current.clear();
  }, []);

  const waitUntilReady = useCallback((): Promise<void> => {
    if (readyRef.current) return Promise.resolve();

    if (!iframeRef.current?.contentWindow) {
      return Promise.reject(new Error("The molecule editor frame is not mounted."));
    }

    // The initial ready message can be missed if the iframe initializes during
    // a parent Fast Refresh. A probe makes readiness a handshake rather than a
    // one-shot event.
    postProbe();

    return new Promise<void>((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          readyWaitersRef.current.delete(waiter);
          reject(new Error("The molecule editor did not become ready in time."));
        }, READY_TIMEOUT_MS),
      };
      readyWaitersRef.current.add(waiter);
    });
  }, [postProbe]);

  const call = useCallback(
    async <T,>(method: string, args: unknown[] = []): Promise<T> => {
      await waitUntilReady();

      const target = iframeRef.current?.contentWindow;
      if (!target) {
        throw new Error("The molecule editor frame is not available.");
      }

      const requestId = nextRequestId(frameId);
      return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRef.current.delete(requestId);
          reject(new Error(`Ketcher ${method}() timed out.`));
        }, COMMAND_TIMEOUT_MS);

        pendingRef.current.set(requestId, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timeoutId,
        });

        target.postMessage(
          {
            channel: KETCHER_FRAME_CHANNEL,
            frameId,
            type: "command",
            requestId,
            method,
            args,
          },
          window.location.origin,
        );
      });
    },
    [frameId, waitUntilReady],
  );

  const proxy = useMemo<KetcherApi>(() => {
    const api: KetcherApi = {
      getKet: () => call<string>("getKet"),
      getSmiles: () => call<string>("getSmiles"),
      getMolfile: () => call<string>("getMolfile"),
      setMolecule: (structure, options) =>
        call<void>("setMolecule", [structure, options]),
    };

    api.addFragment = async (structure, options) => {
      if (addFragmentSupportedRef.current) {
        await call<void>("addFragment", [structure, options]);
        return;
      }

      const current = (await api.getSmiles()).trim();
      await api.setMolecule(current ? `${current}.${structure}` : structure, options);
    };

    return api;
  }, [call]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<FrameMessage>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }

      const message = event.data;
      if (
        !message ||
        message.channel !== KETCHER_FRAME_CHANNEL ||
        message.frameId !== frameId
      ) {
        return;
      }

      if (message.type === "ready") {
        const wasReady = readyRef.current;
        readyRef.current = true;
        addFragmentSupportedRef.current = message.capabilities?.addFragment !== false;
        resolveReadyWaiters();

        // Avoid needlessly resetting parent state for repeated probe replies,
        // but do publish a new proxy whenever this frame transitions to ready.
        if (!wasReady) onReadyRef.current(proxy);
        return;
      }

      if (message.type === "change") {
        onChangeRef.current?.();
        return;
      }

      if (message.type === "error") {
        onErrorRef.current(new Error(message.error || "Ketcher frame error"));
        return;
      }

      if (message.type === "response" && message.requestId) {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        pendingRef.current.delete(message.requestId);
        clearTimeout(pending.timeoutId);

        if (message.ok) pending.resolve(message.result);
        else pending.reject(new Error(message.error || "Ketcher command failed."));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [frameId, proxy, resolveReadyWaiters]);

  const markUnavailable = useCallback((reason: string) => {
    const wasReady = readyRef.current;
    readyRef.current = false;
    rejectReadyWaiters(new Error(reason));

    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
    pendingRef.current.clear();

    // This clears any stale proxy stored by SynthesisPage. It is especially
    // important during Vite Fast Refresh, which can preserve parent state while
    // remounting this child component.
    if (wasReady) onUnavailableRef.current?.();
  }, [rejectReadyWaiters]);

  useEffect(() => {
    return () => {
      markUnavailable("The molecule editor was closed.");
    };
  }, [markUnavailable]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!readyRef.current) {
        const error = new Error(
          `Ketcher frame "${frameId}" did not initialize within ${READY_TIMEOUT_MS / 1000} seconds.`,
        );
        console.error(`[PocketChem:KetcherFrame:${frameId}] startup timeout`, {
          src: frameSrc,
          error,
        });
        onErrorRef.current(error);
      }
    }, READY_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [frameId, frameSrc]);

  return (
    <iframe
      ref={iframeRef}
      className="ketcher-isolated-frame"
      src={frameSrc}
      title={`${debugLabel} molecule editor`}
      scrolling="no"
      data-pocketchem-ketcher-frame={frameId}
      onLoad={() => {
        // A load means contentWindow may now point at a fresh document. Do not
        // allow the parent to keep treating an API proxy from the old document
        // as ready.
        if (readyRef.current) {
          readyRef.current = false;
          onUnavailableRef.current?.();
        }
        postProbe();
      }}
    />
  );
}
