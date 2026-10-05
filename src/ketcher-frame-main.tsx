import { createRoot } from "react-dom/client";
import "./index.css";
import { KETCHER_FRAME_QUERY_KEY } from "./components/ketcherFrameProtocol";
import KetcherFrameApp from "./components/KetcherFrameApp";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("PocketChem Ketcher frame root element is missing.");
}

const frameId =
  new URLSearchParams(window.location.search).get(KETCHER_FRAME_QUERY_KEY) ??
  "isolated-ketcher";

console.info(`[PocketChem:KetcherFrame:${frameId}] dedicated frame entry loaded`, {
  href: window.location.href,
});

createRoot(rootElement).render(<KetcherFrameApp frameId={frameId} />);
