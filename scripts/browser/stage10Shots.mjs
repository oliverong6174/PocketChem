// Stage 10 screenshot harness: real headless Chrome + production build, tabs x viewports x themes.
//   npm run build && SHOT_DIR=<dir> node scripts/browser/stage10Shots.mjs [--themes=dark,light] [--tabs=Properties,Reactions] [--widths=375,768,1440]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 4291, DEBUG_PORT = 9451;
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && fs.existsSync(p));
const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1].split(",");
const themes = arg("themes", "dark"), widths = arg("widths", "375,768,1440").map(Number);
const tabs = arg("tabs", "Properties,Ranking,Reactions,Spectroscopy,Multi-Step,Multi-Catalytic,Conformations,Saved");
const outDir = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "pc-shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 60000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) { if (process.env.DBG) console.log("retry:", e.message, e.cause?.code); } await sleep(200); } throw new Error(`Timed out: ${what}`); }
class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); this.errors = [];
    this.ready = new Promise((res, rej) => { this.ws.addEventListener("open", res); this.ws.addEventListener("error", rej); });
    this.ws.addEventListener("message", (e) => { const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
      else if (m.method === "Runtime.exceptionThrown") this.errors.push(m.params.exceptionDetails?.exception?.description ?? "exception"); }); }
  send(method, params = {}) { const id = this.id++; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  async evaluate(expression) { const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
}
async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pocketchem-chrome-"));
  const preview = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: ["pipe", fs.openSync(path.join(os.tmpdir(), "pc-preview.log"), "w"), fs.openSync(path.join(os.tmpdir(), "pc-preview.err"), "w")] });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, "preview");
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"), "chrome");
    const cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.ready;
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    for (const theme of themes) for (const w of widths) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: w < 500 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 500 });
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await waitFor(() => cdp.evaluate(`document.readyState==='complete' && document.body.innerText.length>50`), "app");
      for (const tab of tabs) {
        const clicked = await cdp.evaluate(`(() => { const want = ${JSON.stringify(tab)}; const els = [...document.querySelectorAll('[role=tab],button,a')]; const b = els.find((x) => (x.textContent || '').trim().endsWith(want) && x.getClientRects().length > 0); if (!b) return false; b.click(); return true; })()`);
        if (!clicked) {
          await cdp.evaluate(`document.querySelector('.shell-menu')?.click()`);
          await sleep(350);
          await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === ${JSON.stringify(tab)}); b?.click(); })()`);
        }
        await sleep(1200);
        const overflow = await cdp.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        const file = `${theme}-${w}-${tab.replace(/[^a-z]/gi, "")}.png`;
        fs.writeFileSync(path.join(outDir, file), Buffer.from(data, "base64"));
        console.log(`${file} clicked=${clicked} hOverflow=${overflow}px`);
      }
    }
    if (cdp.errors.length) console.log("PAGE ERRORS:", cdp.errors.slice(0, 3));
  } finally { try { chrome.kill(); } catch { /* */ } try { preview.kill(); } catch { /* */ } }
}
main().catch((e) => { console.error(e); process.exit(1); });
