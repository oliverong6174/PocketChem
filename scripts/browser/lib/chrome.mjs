// Shared headless-Chrome (CDP) helpers for the Stage 10 browser checks.
// Starts `vite preview` on the production build and a headless Chrome/Edge, and exposes a tiny CDP client.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const q = (value) => JSON.stringify(value);

export async function waitFor(predicate, description, timeoutMs = 60000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ""}`);
}

export class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", reject);
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(message.params.exceptionDetails?.exception?.description ?? "exception");
      }
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
}

/** Starts preview + Chrome. Returns { cdp, url, stop }. Ports are fixed per caller to avoid clashes. */
export async function startBrowser({ port, debugPort }) {
  const chromePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && fs.existsSync(p));
  if (!chromePath) throw new Error("No Chrome/Edge found (set CHROME_PATH).");
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("dist/ missing; run `npm run build`.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pocketchem-chrome-"));
  const log = fs.openSync(path.join(os.tmpdir(), `pc-preview-${port}.log`), "w");
  // stdin stays a pipe: `vite preview` exits when stdin closes on Windows.
  const preview = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: ["pipe", log, log] });
  const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}/`;
  await waitFor(async () => (await fetch(url)).ok, "vite preview");
  const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === "page"), "Chrome");
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const stop = () => {
    try { chrome.kill(); } catch { /* already closed */ }
    try { preview.kill(); } catch { /* already closed */ }
  };
  return { cdp, url, stop };
}

export async function setViewport(cdp, width, height, { mobile = width < 500, scheme = "dark", reducedMotion = false } = {}) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" },
    ],
  });
  if (mobile) await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  else await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
}

export async function screenshot(cdp, file, { fullPage = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
}
