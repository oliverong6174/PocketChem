import { useEffect, useMemo, useRef } from "react";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";

import type { KetcherApi } from "./MoleculeDrawer";


type Props = {
  onError: (error: unknown) => void;
  onReady: (api: KetcherApi) => void;
  onChange?: () => void;
  debugLabel?: string;
};

export default function KetcherEditor({
  onError,
  onReady,
  onChange,
  debugLabel = "unknown",
}: Props) {
  const onChangeRef = useRef(onChange);
  const changeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    return () => changeCleanupRef.current?.();
  }, []);
  // Each Ketcher instance needs its own standalone service provider. Sharing one
  // provider across the two synthesis editors can leave structure export jobs
  // waiting on the same internal worker/service state.
  const structServiceProvider = useMemo(() => {
    console.info(
      `[PocketChem:Ketcher:${debugLabel}] creating StandaloneStructServiceProvider`,
    );
    return new StandaloneStructServiceProvider();
  }, [debugLabel]);

  return (
    <Editor
      staticResourcesUrl=""
      structServiceProvider={structServiceProvider}
      errorHandler={(error) => {
        console.error(`[PocketChem:Ketcher:${debugLabel}] Editor error`, error);
        onError(error);
      }}
      onInit={(ketcher) => {
        const api = ketcher as KetcherApi;
        console.info(`[PocketChem:Ketcher:${debugLabel}] onInit`, {
          api,
          hasGetMolfile: typeof api.getMolfile === "function",
          hasGetSmiles: typeof api.getSmiles === "function",
          hasSetMolecule: typeof api.setMolecule === "function",
        });

        changeCleanupRef.current?.();
        changeCleanupRef.current = null;
        const editor = api.editor;
        if (editor?.subscribe) {
          const handleEditorChange = () => onChangeRef.current?.();
          const subscription = editor.subscribe("change", handleEditorChange);

          if (typeof subscription === "function") {
            changeCleanupRef.current = subscription as () => void;
          } else if (
            subscription &&
            typeof subscription === "object" &&
            "unsubscribe" in subscription &&
            typeof (subscription as { unsubscribe?: unknown }).unsubscribe === "function"
          ) {
            changeCleanupRef.current = () =>
              (subscription as { unsubscribe: () => void }).unsubscribe();
          } else if (editor.unsubscribe) {
            changeCleanupRef.current = () =>
              editor.unsubscribe?.("change", handleEditorChange);
          }
        }

        onReady(api);
      }}
    />
  );
}
