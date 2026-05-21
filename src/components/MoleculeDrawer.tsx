import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import "ketcher-react/dist/index.css";

const structServiceProvider = new StandaloneStructServiceProvider();

function MoleculeDrawer() {
  const handleError = (error: unknown) => {
    console.error("Ketcher error:", error);
  };

  return (
    <Editor
      staticResourcesUrl=""
      structServiceProvider={structServiceProvider}
      errorHandler={handleError}
    />
  );
}

export default MoleculeDrawer;