// Measures the Spectroscopy input card at a real 1440x900 viewport (is the name field covered by the action row?).
import { setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const { cdp, url, stop } = await startBrowser({ port: 4363, debugPort: 9523 });
const ev = (e) => cdp.evaluate(e);
try {
  await setViewport(cdp, 1440, 900, { scheme: "light" });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === 'Spectroscopy').click()`);
  await waitFor(() => ev(`[...document.querySelectorAll('main input')].some((i) => /SMILES/.test(i.placeholder || ''))`), "input", 90000);
  await sleep(2500);
  console.log(await ev(`(() => { const card = document.querySelector('.spectroscopy-input-card'); const cs = getComputedStyle(card); const input = [...document.querySelectorAll('main input')].find((i) => /SMILES/.test(i.placeholder || '')); const row = card.querySelector(':scope > .button-row'); const a = input.getBoundingClientRect(), b = row.getBoundingClientRect(); return JSON.stringify({ vh: innerHeight, pos: cs.position, maxH: cs.maxHeight, rowPos: getComputedStyle(row).position, inputTop: Math.round(a.top), inputBottom: Math.round(a.bottom), rowTop: Math.round(b.top), rowBottom: Math.round(b.bottom), overlap: a.bottom > b.top && a.top < b.bottom }); })()`));
} finally { stop(); }
process.exit(0);
