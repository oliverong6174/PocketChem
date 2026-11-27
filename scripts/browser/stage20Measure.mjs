// Stage 20: measures the Reactions results page for one real engine run (2-butene): page height, DOM size, groups/rows, then interacts.
//   npm run build && node scripts/browser/stage20Measure.mjs [width] [scheme]        (screenshots: node_modules/.cache/pc-live20)
import fs from "node:fs";
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const width = Number(process.argv[2] ?? 820);
const scheme = process.argv[3] ?? "light";
const outDir = path.join(root, "node_modules", ".cache", "pc-live20");
fs.mkdirSync(outDir, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4391, debugPort: 9551 });
const ev = (e) => cdp.evaluate(e);
const stats = () => ev(`JSON.stringify({ height: document.documentElement.scrollHeight, nodes: document.getElementsByTagName('*').length, svgs: document.querySelectorAll('main svg').length, groups: document.querySelectorAll('[data-testid=rxe-group]').length, rows: document.querySelectorAll('[data-testid=rxe-row]').length, openBodies: document.querySelectorAll('.rxe-body').length, outcomes: document.querySelector('[data-testid=ov-outcomes]')?.textContent, products: document.querySelector('[data-testid=ov-products]')?.textContent, families: document.querySelector('[data-testid=ov-families]')?.textContent, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
try {
  await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await ev(`(() => { const direct = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === 'Reactions' && x.getClientRects().length); if (direct) direct.click(); else { document.querySelector('.shell-menu')?.click(); } })()`);
  await sleep(800);
  await ev(`(() => { const t = [...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === 'Reactions'); if (t) t.click(); })()`);
  await waitFor(() => ev(`Boolean(window.reactionKetcher)`), "Reactions Ketcher", 90000);
  await sleep(1500);
  await ev(`window.reactionKetcher.setMolecule('CC=CC')`);
  await sleep(1200);
  await ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === 'Predict Products' && !x.disabled); b?.click(); })()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid=reaction-explorer]')`), "explorer", 120000);
  await sleep(1500);
  const t0 = JSON.parse(await stats());
  console.log("initial", JSON.stringify(t0));
  await screenshot(cdp, path.join(outDir, `rx-initial-${width}-${scheme}.png`));
  const firstRow = await ev(`(() => { const b = document.querySelector('.rxe-row-toggle'); b?.click(); return b?.getAttribute('aria-expanded'); })()`);
  await sleep(1500);
  const t1 = JSON.parse(await stats());
  console.log("after opening one row", JSON.stringify(t1), "aria-expanded was", firstRow);
  await screenshot(cdp, path.join(outDir, `rx-row-open-${width}-${scheme}.png`));
  await ev(`document.querySelector('[data-testid=rxe-expand-all]').click()`);
  await sleep(6000);
  const t2 = JSON.parse(await stats());
  console.log("after expand all (worst case)", JSON.stringify(t2));
} finally { stop(); }
process.exit(0);
