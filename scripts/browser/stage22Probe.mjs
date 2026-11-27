// Debug helper for Stage 22 layout work: lists the elements that stick out past the viewport on one route.
//   node scripts/browser/stage22Probe.mjs "#/general/gas-laws" 375
import { q, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const target = process.argv[2] ?? "#/general/gas-laws";
const width = Number(process.argv[3] ?? 375);
const { cdp, url, stop } = await startBrowser({ port: 4303, debugPort: 9463 });
try {
  await setViewport(cdp, width, 812, { scheme: "dark" });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => cdp.evaluate(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(Number(process.argv[4] ?? 1500));
  const out = await cdp.evaluate(`(() => {
    const vw = document.documentElement.clientWidth;
    return JSON.stringify([...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; }).slice(0, 14).map((e) => ({ tag: e.tagName, cls: String(e.className?.baseVal ?? e.className).slice(0, 60), right: Math.round(e.getBoundingClientRect().right), w: Math.round(e.getBoundingClientRect().width) })));
  })()`);
  console.log(`viewport ${width}`, out);
  console.log("overflow", await cdp.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`));
} finally {
  stop();
}
void q;
