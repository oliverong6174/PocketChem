import { useEffect, useMemo, useRef } from "react";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";
import "../ketcher-frame.css";

import type { KetcherApi } from "./MoleculeDrawer";
import { KETCHER_FRAME_CHANNEL } from "./ketcherFrameProtocol";

type FrameCommandMethod =
  | "getKet"
  | "getSmiles"
  | "getMolfile"
  | "setMolecule"
  | "addFragment";

type FrameMessage = {
  channel: typeof KETCHER_FRAME_CHANNEL;
  frameId: string;
  type: "command" | "probe";
  requestId?: string;
  method?: FrameCommandMethod;
  args?: unknown[];
};

type SubscriptionLike =
  | (() => void)
  | { unsubscribe?: () => void }
  | null
  | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function KetcherFrameApp({ frameId }: { frameId: string }) {
  console.info(`[PocketChem:KetcherFrame:${frameId}] frame app rendered`, {
    href: window.location.href,
  });

  const apiRef = useRef<KetcherApi | null>(null);
  const changeCleanupRef = useRef<(() => void) | null>(null);
  const commandQueueRef = useRef<Promise<void>>(Promise.resolve());

  const structServiceProvider = useMemo(
    () => new StandaloneStructServiceProvider(),
    [],
  );

  const post = (payload: Record<string, unknown>) => {
    window.parent.postMessage(
      {
        channel: KETCHER_FRAME_CHANNEL,
        frameId,
        ...payload,
      },
      window.location.origin,
    );
  };

  const postReady = () => {
    const api = apiRef.current;
    if (!api) return;
    post({
      type: "ready",
      capabilities: {
        addFragment: typeof api.addFragment === "function",
      },
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent<FrameMessage>) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const message = event.data;
      if (
        !message ||
        message.channel !== KETCHER_FRAME_CHANNEL ||
        message.frameId !== frameId
      ) {
        return;
      }

      // Readiness is a handshake. If the parent's original ready event was lost
      // during iframe load or Fast Refresh, this probe immediately republishes it.
      if (message.type === "probe") {
        postReady();
        return;
      }

      if (
        message.type !== "command" ||
        !message.requestId ||
        !message.method
      ) {
        return;
      }

      commandQueueRef.current = commandQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const api = apiRef.current;
          if (!api) throw new Error("The molecule editor is not ready yet.");

          const args = Array.isArray(message.args) ? message.args : [];
          let result: unknown;

          switch (message.method) {
            case "getKet":
              result = await api.getKet();
              break;
            case "getSmiles":
              result = await api.getSmiles();
              break;
            case "getMolfile":
              result = await api.getMolfile();
              break;
            case "setMolecule":
              await api.setMolecule(
                String(args[0] ?? ""),
                (args[1] ?? undefined) as Parameters<KetcherApi["setMolecule"]>[1],
              );
              result = null;
              break;
            case "addFragment":
              if (!api.addFragment) {
                throw new Error("This Ketcher build does not expose addFragment().");
              }
              await api.addFragment(
                String(args[0] ?? ""),
                (args[1] ?? undefined) as Parameters<NonNullable<KetcherApi["addFragment"]>>[1],
              );
              result = null;
              break;
          }

          post({
            type: "response",
            requestId: message.requestId,
            ok: true,
            result,
          });
        })
        .catch((error) => {
          post({
            type: "response",
            requestId: message.requestId,
            ok: false,
            error: errorMessage(error),
          });
        });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [frameId]);

  useEffect(() => {
    const handleToolbarWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const leftToolbar = target.closest('[data-testid="left-toolbar"]');
      const rightToolbar = target.closest('[data-testid="right-toolbar"]');
      if (!leftToolbar && !rightToolbar) return;

      const scroller =
        leftToolbar?.querySelector('[data-testid="left-toolbar-buttons"]') ??
        rightToolbar?.querySelector(':scope > div:first-child');

      if (!(scroller instanceof HTMLElement)) return;
      if (scroller.scrollHeight <= scroller.clientHeight + 1) return;

      const before = scroller.scrollTop;
      scroller.scrollTop += event.deltaY;

      if (scroller.scrollTop !== before) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("wheel", handleToolbarWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      document.removeEventListener("wheel", handleToolbarWheel, true);
    };
  }, []);

  useEffect(() => {
    return () => changeCleanupRef.current?.();
  }, []);

  return (
    <div className="ketcher-frame-root">
      <Editor
        // Match the configuration used by PocketChem's known-working direct
        // Ketcher editor. Ketcher documents an empty static resource URL as a
        // valid standalone configuration, and it avoids route/query-dependent
        // resource resolution inside this iframe.
        staticResourcesUrl={import.meta.env.BASE_URL || "/"}
        structServiceProvider={structServiceProvider}
        errorHandler={(error) => {
          post({ type: "error", error: errorMessage(error) });
        }}
        onInit={(ketcher) => {
          const api = ketcher as KetcherApi;
          apiRef.current = api;
          window.ketcher = api;
          console.info(`[PocketChem:KetcherFrame:${frameId}] onInit`);

          changeCleanupRef.current?.();
          changeCleanupRef.current = null;

          const editor = api.editor;
          if (editor?.subscribe) {
            const subscription = editor.subscribe("change", () => {
              post({ type: "change" });
            }) as SubscriptionLike;

            if (typeof subscription === "function") {
              changeCleanupRef.current = subscription;
            } else if (subscription?.unsubscribe) {
              changeCleanupRef.current = () => subscription.unsubscribe?.();
            }
          }

          postReady();
        }}
      />
    </div>
  );
}
