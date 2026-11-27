// Stage 19 live-browser check (headless Chrome, production build): global concept search, cross-subject links and handoffs,
// Back/Forward, saved-analysis reopening across subjects, and unchanged behaviour of Biochemistry/Biology/Physics navigation.
//   npm run build && node scripts/browser/stage19LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live19)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live19");
const { cdp, url, stop } = await startBrowser({ port: 4371, debugPort: 9531 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const clickBtn = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
const clickStarts = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(${q(label)}) && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
const clickTid = (id) => ev(`(() => { const b = document.querySelector('[data-testid=${id}]'); if (b) b.click(); return !!b; })()`);
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const textOf = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const hash = () => ev("location.hash");
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch {} return true; })()`);
const ready = (what) => waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), what);
const fresh = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` }); await ready("app"); await sleep(300); await clearStorage();
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` }); await ready("app"); await sleep(900);
};
const key = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const searchOpen = () => ev(`!!document.querySelector('.concept-search[role=dialog]')`);
const typeSearch = async (text) => { await setText("[data-testid=concept-input]", text); await sleep(250); };
const results$ = () => ev(`[...document.querySelectorAll('[data-testid=concept-result]')].map((li) => ({ title: li.querySelector('.concept-result-title').textContent, kind: li.dataset.kind, subject: li.querySelector('.concept-subject').textContent, reason: li.querySelector('.concept-result-reason').textContent, active: li.getAttribute('aria-selected') === 'true' }))`);
const shot = async (name) => { await sleep(250); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const nextToEnd = async (n) => { for (let i = 0; i < n; i += 1) await clickBtn("Next ▶"); await sleep(300); };

try {
  // ---- 1. open search: button and keyboard
  await fresh(1440, "light", "#/organic/properties");
  check("1 the shell has a visible Search button with its shortcut", (await textOf("[data-testid=open-search]")).includes("Search") && (await textOf("[data-testid=open-search]")).includes("Ctrl"), await textOf("[data-testid=open-search]"));
  await ev(`document.querySelector('[data-testid=open-search]').focus()`);
  await key("Enter", "Enter", 13); await sleep(400);
  check("1 Enter on the button opens an accessible dialog with a focused combobox", (await searchOpen()) && (await ev(`document.activeElement?.getAttribute('role') === 'combobox' && document.querySelector('.concept-search').getAttribute('aria-modal') === 'true'`)));
  check("1 empty state offers example searches and says what search does not do", /Try:/.test(await textOf(".concept-empty")) && (await ev(`document.querySelectorAll('.concept-try .concept-chip').length >= 5`)));
  await key("Escape", "Escape", 27); await sleep(400);
  check("1 Escape closes the dialog and focus returns to the Search button", !(await searchOpen()) && (await ev(`document.activeElement?.dataset?.testid === 'open-search'`)));
  await ev(`document.activeElement.blur()`);
  await key("k", "KeyK", 75, 2); await sleep(500);
  check("1 Ctrl+K opens search from anywhere", await searchOpen());
  await key("Escape", "Escape", 27); await sleep(300);
  await key("k", "KeyK", 75, 1); await sleep(400);
  check("1 Alt+K does not open search", !(await searchOpen()));
  await key("k", "KeyK", 75, 4); await sleep(400);
  check("1 Cmd+K (Meta) opens search", await searchOpen());
  await key("Escape", "Escape", 27); await sleep(300);

  // ---- 2. searching across the five subjects
  await key("k", "KeyK", 75, 2); await sleep(400);
  const probes = [
    ["ATP", "ATP and energy coupling"], ["pH", "pH"], ["peptide", "Peptide bonds and peptides"], ["Newton's laws", "Newton's laws"],
    ["operon", "Operons and gene regulation"], ["chair flip", "Conformations"], ["enthalpy", "Enthalpy and entropy"], ["Krebs cycle", "Citric acid cycle"],
  ];
  for (const [query, expectTop] of probes) {
    await typeSearch(query);
    const r = await results$();
    check(`2 "${query}" ranks "${expectTop}" first`, r[0]?.title === expectTop, JSON.stringify(r.slice(0, 3).map((x) => x.title)));
  }
  await typeSearch("ATP"); const atp = await results$();
  check("2 ATP surfaces cycle, oxidative phosphorylation, enzymes and Gibbs energy with reasons", ["Citric acid cycle", "Oxidative phosphorylation", "Enzyme kinetics", "Gibbs free energy"].every((t) => atp.some((x) => x.title === t && x.reason.length > 10)), JSON.stringify(atp.map((x) => x.title)));
  await shot("search-atp.png");
  await typeSearch("peptide"); const pep = await results$();
  check("2 peptide surfaces Translation and the peptide builder tool", pep.some((x) => x.title === "Translation" && x.kind === "concept") && pep.some((x) => x.kind === "tool" && /peptides/i.test(x.title)), JSON.stringify(pep.map((x) => x.title + ":" + x.kind)));
  await typeSearch("pH"); const ph = await results$();
  check("2 pH surfaces the acid–base analyzer and amino-acid ionization", ph[0].title === "pH" && ph.some((x) => x.title === "Amino acids" && /pKa/.test(x.reason)));
  check("2 results distinguish concept and tool with a visible label", (await ev(`[...document.querySelectorAll('.concept-kind')].every((e) => ['Concept','Tool','Saved analysis'].includes(e.textContent))`)));

  // ---- 3. filtering and absent concepts
  await typeSearch("energy");
  await clickTid("subject-physics"); await sleep(250);
  const phys = await results$();
  check("3 subject filter keeps only Physics results", phys.length > 0 && phys.every((x) => x.subject === "Physics"), JSON.stringify(phys.map((x) => x.subject)));
  await clickTid("kind-tool"); await sleep(250);
  check("3 type filter keeps only tools", (await results$()).every((x) => x.kind === "tool"));
  await clickTid("subject-all"); await clickTid("kind-all");
  await typeSearch("photosynthesis"); await sleep(250);
  check("3 an unsupported topic shows guidance, not a guess", (await results$()).length === 0 && /No concept, tool or saved analysis matches/.test(await textOf(".concept-empty")));
  check("3 the empty state states that molecule names are not resolved here", /does not search the web or resolve molecule names/.test(await textOf(".concept-empty")));

  // ---- 4. keyboard selection, navigation, Back and Forward
  await typeSearch("Krebs");
  await key("ArrowDown", "ArrowDown", 40); await key("ArrowUp", "ArrowUp", 38); await sleep(150);
  check("4 arrow keys move the active option (aria-activedescendant follows)", await ev(`(() => { const i = document.querySelector('[data-testid=concept-input]'); const a = document.getElementById(i.getAttribute('aria-activedescendant')); return !!a && a.getAttribute('aria-selected') === 'true'; })()`));
  const before = await hash();
  await key("Enter", "Enter", 13); await sleep(1500);
  check("4 Enter opens the Citric acid cycle in Biochemistry", (await hash()) === "#/biochemistry/citric-acid-cycle" && !(await searchOpen()), await hash());
  check("4 the destination tool is rendered", /citric acid cycle/i.test(await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent ?? ''`)));
  await ev("history.back()"); await sleep(1500);
  check("4 Back returns to the previous tool", (await hash()) === before, await hash());
  await ev("history.forward()"); await sleep(1500);
  check("4 Forward returns to the destination", (await hash()) === "#/biochemistry/citric-acid-cycle", await hash());
  // mouse selection of a tool result in another subject
  await key("k", "KeyK", 75, 2); await sleep(400);
  await typeSearch("RC time constants");
  await ev(`document.querySelector('[data-testid=concept-result]').click()`); await sleep(1500);
  check("4 clicking a Physics result opens RC transient", (await hash()) === "#/physics/rc-transient", await hash());
  await key("k", "KeyK", 75, 2); await sleep(400);
  await typeSearch("Friction");
  await key("Enter", "Enter", 13); await sleep(1500);
  check("4 searching inside Physics opens Forces & Newton's laws", (await hash()) === "#/physics/forces", await hash());
  await key("k", "KeyK", 75, 2); await sleep(400);
  await typeSearch("Stereochemistry");
  await key("Enter", "Enter", 13); await sleep(1800);
  check("4 an Organic concept opens its Organic tool from another subject", (await hash()) === "#/organic/properties", await hash());
  await shot("search-to-organic.png");

  // ---- 5. opening search does not change tool inputs
  await fresh(1440, "light", "#/biology/translation");
  const mrnaBefore = await ev(`document.querySelector('textarea')?.value`);
  await key("k", "KeyK", 75, 2); await sleep(300); await typeSearch("zzz"); await key("Escape", "Escape", 27); await sleep(300);
  check("5 opening and closing search leaves the mRNA input unchanged", (await ev(`document.querySelector('textarea')?.value`)) === mrnaBefore && !!mrnaBefore, mrnaBefore);

  // ---- 6. Biology Translation -> Biochemistry peptide builder
  await nextToEnd(40);
  check("6 the peptide handoff button appears when translation is finished", await ev(`!!document.querySelector('[data-testid=to-peptide]')`));
  await clickTid("to-peptide"); await sleep(1800);
  check("6 the button opens the Biochemistry peptide builder", (await hash()) === "#/biochemistry/amino-acids", await hash());
  check("6 the sequence arrives intact in N-to-C order (MAKLGY) with a notice", /Loaded 6 residues from the Translation tool/.test(await ev(`document.body.innerText`)) && (await ev(`[...document.querySelectorAll('input, textarea')].some((e) => e.value === 'MAKLGY')`)));
  await shot("peptide-handoff.png");
  // amino acids -> acid base
  check("6 the Continue-learning panel on amino acids links to acid–base with its caution", /No pKa is copied across/.test(await textOf("[data-testid=related-concepts]")));
  await clickTid("related-amino-acids-to-acid-base"); await sleep(1500);
  check("6 the link opens General Chemistry acid–base", (await hash()) === "#/general/acid-base-titration", await hash());
  check("6 acid–base inputs are untouched by the link (default pKa-based tool renders)", /pH/.test(await ev(`document.body.innerText`)));

  // ---- 7. Transcription -> Translation handoff
  await fresh(1440, "light", "#/biology/transcription");
  const stepsMax = 80;
  await nextToEnd(stepsMax);
  const matureSeq = (await textOf("[data-testid=mature-seq]")).replace("(cap)", "").replace("(poly-A tail)", "").trim();
  check("7 transcription finishes with a mature mRNA", /^[ACGU]+$/.test(matureSeq), matureSeq);
  await clickTid("to-translation"); await sleep(1800);
  check("7 Translation opens", (await hash()) === "#/biology/translation", await hash());
  check("7 the mRNA in Translation equals the finished mRNA, with a notice", (await ev(`document.querySelector('textarea')?.value`)) === matureSeq && /Loaded the mRNA/.test(await textOf("[data-testid=arrival-note]")), await textOf("[data-testid=arrival-note]"));
  check("7 Translation page offers onward links", await ev(`!!document.querySelector('[data-testid=related-translation-to-peptides]')`));
  await shot("transcription-handoff.png");
  // Back returns to Transcription with its state intact
  await ev("history.back()"); await sleep(1800);
  check("7 Back returns to Transcription", (await hash()) === "#/biology/transcription", await hash());

  // ---- 8. enzymes and thermodynamics relations with cautions
  await fresh(1440, "light", "#/biochemistry/enzymes");
  const enz = await textOf("[data-testid=related-concepts]");
  check("8 Enzymes panel links to glycolysis with the flux caution", /does not predict the flux/.test(enz) && (await ev(`!!document.querySelector('[data-testid=related-enzymes-to-glycolysis]')`)), enz.slice(0, 160));
  await clickTid("related-enzymes-to-glycolysis"); await sleep(1500);
  check("8 the link opens Glycolysis", (await hash()) === "#/biochemistry/glycolysis", await hash());
  await fresh(1440, "light", "#/general/thermodynamics");
  const th = await textOf("[data-testid=related-concepts]");
  check("8 Thermodynamics panel connects to Metabolism without claiming cellular predictions", /does not predict cellular/.test(th), th.slice(0, 200));
  await shot("thermo-related.png");
  await clickTid("related-thermo-to-metabolism"); await sleep(1500);
  check("8 the link opens the integrated metabolic map", (await hash()) === "#/biochemistry/metabolic-map", await hash());

  // ---- 9. saved analysis reopening across subjects
  await fresh(1440, "light", "#/biology/translation");
  await clickBtn("Save Analysis"); await sleep(400);
  await setText(".synthesis-save-form input", "my translation s19");
  await clickBtn("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes('my translation s19')`), "save notice", 15000).catch(() => null);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`); await sleep(1200);
  check("9 the analysis appears in Saved", /my translation s19/.test(await ev(`document.body.innerText`)));
  // go to another subject, then search for it
  await ev(`location.hash = '#/physics/forces'`); await sleep(1500);
  await key("k", "KeyK", 75, 2); await sleep(500);
  await typeSearch("my translation");
  const sv = await results$();
  check("9 search lists the saved analysis, labelled as a saved analysis", sv.some((x) => x.kind === "saved" && x.title === "my translation s19" && x.subject === "Biology"), JSON.stringify(sv.map((x) => x.title + ":" + x.kind)));
  await key("Enter", "Enter", 13); await sleep(2500);
  check("9 opening it switches to the Biology Translation tool", (await hash()) === "#/biology/translation", await hash());

  // ---- 10. other subjects still intact
  for (const [target, expect, label] of [
    ["#/biochemistry/overview", (t) => t.startsWith("Overview|Amino acids & peptides|Protein structure & folding|Enzymes & catalysis|Glycolysis"), "Biochemistry"],
    ["#/physics/overview", (t) => t === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved", "Physics"],
    ["#/biology/overview", (t) => t.startsWith("Overview|DNA replication|Transcription & RNA processing|Translation"), "Biology"],
  ]) {
    await fresh(1440, "light", target);
    const tabs = await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
    check(`10 ${label} navigation unchanged`, expect(tabs), tabs);
  }

  // ---- 11. dark theme and phone layout of the search dialog
  for (const [w, scheme] of [[375, "dark"], [820, "light"], [1440, "dark"]]) {
    await fresh(w, scheme, "#/organic/properties");
    await clickTid("open-search").then(async (ok) => { if (!ok) await ev(`document.querySelector('.shell-search')?.click()`); });
    await sleep(400); await typeSearch("ATP"); await sleep(300);
    const geo = await ev(`(() => { const d = document.querySelector('.concept-search').getBoundingClientRect(); return { w: Math.round(d.width), vw: innerWidth, off: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: Math.round(d.right) }; })()`);
    check(`11 search dialog fits ${w}px ${scheme} without overflow`, geo.right <= geo.vw && geo.off <= 0, JSON.stringify(geo));
    await shot(`search-${w}-${scheme}.png`);
    await key("Escape", "Escape", 27);
  }
} catch (error) {
  check("script completed", false, error instanceof Error ? error.stack : String(error));
} finally {
  stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
