// Live-browser check of stereochemical mixture display on the Reactions page (Stage 9D).
// Real headless Chrome + live Ketcher + the production build (see multicatalyticLiveCheck.mjs).
//   npm run build && node scripts/browser/reactionsStereoLiveCheck.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 4181;
const DEBUG_PORT = 9341;
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && fs.existsSync(p));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, description, timeoutMs = 60000) {
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

class Cdp {
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

const BS = String.fromCharCode(92);
const CARD = `(marker) => {
  const c = [...document.querySelectorAll('.reaction-pathway-card')].find((x) => x.innerText.split('\\n')[0].trim() === marker);
  return c ? { text: c.innerText, variants: c.querySelectorAll('.reaction-product-variant').length, labels: [...c.querySelectorAll('.reaction-product-or')].map((e) => e.innerText) } : null;
}`;

async function main() {
  if (!CHROME) throw new Error("No Chrome/Edge found (set CHROME_PATH).");
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("dist/ missing; run `npm run build`.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pocketchem-chrome-"));
  const preview = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--window-size=1500,2200", "about:blank"], { stdio: "ignore" });
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, "vite preview");
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"), "Chrome");
    const cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await waitFor(() => cdp.evaluate(`document.readyState === 'complete' && document.body.innerText.includes('Reactions')`), "app shell");
    await cdp.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Reactions').click()`);
    await waitFor(() => cdp.evaluate(`Boolean(window.reactionKetcher)`), "Reactions Ketcher editor", 90000);

    const predict = async (smiles) => {
      await cdp.evaluate(`window.reactionKetcher.setMolecule(${JSON.stringify(smiles)})`);
      await sleep(500);
      await cdp.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Predict Products').click()`);
      await waitFor(
        async () =>
          (await cdp.evaluate(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Predict Products' && !b.disabled)`)) &&
          (await cdp.evaluate(`document.querySelectorAll('.reaction-pathway-card').length > 0`)),
        `predictions for ${smiles}`,
        90000,
      );
      // The page shows 12 results at a time; expand until every result is visible.
      for (let round = 0; round < 12; round += 1) {
        const clicked = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Show\\s/.test(x.innerText.trim()) && !x.disabled); if (!b) return false; b.click(); return true; })()`);
        if (!clicked) break;
        await sleep(800);
      }
      await sleep(2500); // product drawings are rendered asynchronously
    };
    const card = (marker) => cdp.evaluate(`(${CARD})(${JSON.stringify(marker)})`);
    const EPOX = "Epoxidation";
    const BROM = "Halogenation";

    await predict("C=CCC");
    if (process.env.DEBUG_CARDS) console.log(await cdp.evaluate(`[...document.querySelectorAll('.reaction-pathway-card')].map((c) => c.innerText.split('\\n').slice(0, 3).join(' | ')).join('\\n')`));
    let epox = await card(EPOX);
    check("1-butene epoxide is shown as a racemate (not one arbitrary enantiomer)", Boolean(epox) && epox.text.includes("Racemic mixture"), epox ? (epox.text.match(/Product mixture:[^\n]*/) ?? [""])[0] : "no card");
    check("the racemate card says one enantiomer is drawn and names the mirror-image enantiomer", Boolean(epox) && /one enantiomer shown; \+ mirror-image enantiomer/.test(epox.text));

    await predict("C/C=C/C");
    epox = await card(EPOX);
    check("(E)-2-butene gives the trans epoxide as a racemate", Boolean(epox) && epox.text.includes("Racemic mixture"));
    let brom = await card(BROM);
    check("(E)-2-butene bromination gives the meso dibromide (no mixture line)", Boolean(brom) && !brom.text.includes("Product mixture"));

    await predict(`C/C=C${BS}C`);
    epox = await card(EPOX);
    check("(Z)-2-butene gives the cis (meso) epoxide: no mixture line", Boolean(epox) && !epox.text.includes("Product mixture"));
    brom = await card(BROM);
    check("(Z)-2-butene bromination gives a racemate", Boolean(brom) && brom.text.includes("Racemic mixture"));

    await predict("CC=CC");
    epox = await card(EPOX);
    brom = await card(BROM);
    if (process.env.DEBUG_CARDS) console.log("EPOX:", epox?.text.slice(0, 600), "| BROM:", brom?.text.slice(0, 900));
    // Ketcher lays "CC=CC" out as a trans alkene and reports it as E, so an undefined-geometry alkene cannot be
    // produced through the editor; the engine-level behavior is covered in stereo9d.test.mjs. What the UI does:
    check(
      "a double bond typed without geometry is reported by Ketcher as E, and the page treats it consistently (trans epoxide racemate, meso dibromide)",
      Boolean(epox) && /\(E\)-but-2-ene/.test(epox.text) && epox.text.includes("Racemic mixture") && Boolean(brom) && !brom.text.includes("Product mixture"),
    );

    await predict("C1CCC=CC1");
    brom = await card(BROM);
    check("cyclohexene + Br2 gives trans-1,2-dibromocyclohexane as a racemate", Boolean(brom) && brom.text.includes("Racemic mixture"));
    check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
  } finally {
    try {
      chrome.kill();
    } catch {
      /* already closed */
    }
    try {
      preview.kill();
    } catch {
      /* already closed */
    }
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500);
  }
}

try {
  await main();
} catch (error) {
  check(`harness error: ${error instanceof Error ? error.message : String(error)}`, false);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
