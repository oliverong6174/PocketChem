// Stage 19 helper: lists the visible buttons/selects of one page so a populated state can be scripted.  node scripts/browser/stage19Probe.mjs <hash>
import { q, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const hash = process.argv[2] ?? "#/organic/ranking";
const { cdp, url, stop } = await startBrowser({ port: 4361, debugPort: 9521 });
const ev = (e) => cdp.evaluate(e);
try {
  await setViewport(cdp, 1440, 900, { scheme: "light" });
  await cdp.send("Page.navigate", { url: `${url}${hash}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(2000); await waitFor(() => ev(`Object.keys(window).some((k) => /Ketcher$/.test(k))`), "ketcher", 90000).catch(() => null); await sleep(1500);
  console.log(await ev(`JSON.stringify({ keys: Object.keys(window).filter((k) => /Ketcher/.test(k)), buttons: [...document.querySelectorAll('main button')].filter((b) => b.getClientRects().length && !b.closest('.tool-tabs') && !b.closest('.shell') && !b.closest('[class*=ketcher], [class*=drawer]')).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40) + (b.disabled ? ' [off]' : '')).slice(0, 60), inputs: [...document.querySelectorAll('main input, main textarea, main select')].filter((e) => e.getClientRects().length).map((e) => e.tagName + ':' + (e.getAttribute('aria-label') || e.name || e.id || e.placeholder || '').slice(0, 40)).slice(0, 20) })`));
} finally { stop(); }
process.exit(0);
