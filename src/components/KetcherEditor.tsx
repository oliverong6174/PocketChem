import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";

import type { KetcherApi } from "./MoleculeDrawer";

const structServiceProvider = new StandaloneStructServiceProvider();

type Props = {
  onError: (error: unknown) => void;
  onReady: (api: KetcherApi) => void;
};

export default function KetcherEditor({ onError, onReady }: Props) {
  return (
    <Editor
      staticResourcesUrl=""
      structServiceProvider={structServiceProvider}
      errorHandler={onError}
      onInit={(ketcher) => onReady(ketcher as KetcherApi)}
    />
  );
}
