// Stage 19 helper: open a hash, type a molecule name into the page's name input, press Enter, wait, dump text and screenshot.
//   node scripts/browser/stage19Drive.mjs <hash> <name> <out.png> [width] [scheme] [clickLabel...]
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const [hash, name, out, width = "1440", scheme = "light", ...clicks] = process.argv.slice(2);
const { cdp, url, stop } = await startBrowser({ port: 4362, debugPort: 9522 });
const ev = (e) => cdp.evaluate(e);
try {
  await setViewport(cdp, Number(width), Number(width) < 500 ? 812 : 900, { scheme });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await ev(`(() => { const t = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === ${q(hash)}); if (t) t.click(); return !!t; })()`); await sleep(1500);
  await waitFor(() => ev(`[...document.querySelectorAll('main input')].some((i) => /SMILES/.test(i.placeholder || ''))`), "name input", 90000);
  console.log("after wait", await ev("location.hash")); await sleep(2500); console.log("after sleep", await ev("location.hash"));
  if (name.startsWith("js:")) { await waitFor(() => ev("Object.keys(window).filter((k) => /Ketcher$/.test(k)).length > 0"), "ketcher global", 90000); await sleep(1500); await ev(name.slice(3)); await sleep(2500); }
  else if (name && name !== "-") {
    for (const one of name.split("|")) {
      await ev(`(() => { const el = [...document.querySelectorAll('main input')].find((i) => /SMILES/.test(i.placeholder || '') || /ketcher-molecule-name/.test(i.getAttribute('aria-label') || i.name || i.id || '')); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(one)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await sleep(4000);
      await ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => /^(Add to comparison)$/.test(x.innerText.trim()) && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
      await sleep(3000);
    }
  }
  for (const label of clicks) { await ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`); await sleep(5000); }
  await screenshot(cdp, path.join(root, "node_modules", ".cache", "pc-live19", out));
  console.log(await ev(`JSON.stringify({ hash: location.hash, tab: document.querySelector(".tool-tabs [aria-selected=true]")?.textContent.trim(), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, h: document.body.scrollHeight, headings: [...document.querySelectorAll('main h2, main h3')].filter((h) => h.getClientRects().length).map((h) => h.textContent.trim().slice(0, 50)).slice(0, 40) })`));
} finally { stop(); }
process.exit(0);
