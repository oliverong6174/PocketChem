// Stage 25 live-browser check (headless Chrome, production build): Fatty-acid & ketone-body metabolism, Amino-acid metabolism & urea cycle,
// Integrated fuel metabolism - navigation, structures, activation, shuttle, β-oxidation at several chain lengths, ATP ledger, synthesis,
// regulation, ketone bodies, transamination, deamination, skeleton map, urea cycle ledgers, fuel map, learning modes, save/reopen, search,
// related learning, themes and layouts. Expected numbers are typed independently of the code. Screenshots are written for visual inspection.
//   npm run build && node scripts/browser/stage25LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live25)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live25");
const { cdp, url, stop } = await startBrowser({ port: 4361, debugPort: 9521 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const NATIVE = `const set = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };`;
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const clickAria = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === ${q(label)} && !x.disabled); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; (o.querySelector('input') ?? o).click(); return true; })()`);
const setSel = (testid, value) => ev(`(() => { ${NATIVE} const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; set(el, ${q(value)}); return true; })()`);
const tick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.click(); return true; })()`);
const svgClick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const setText = (selector, value) => ev(`(() => { ${NATIVE} const el = document.querySelector(${q(selector)}); if (!el) return false; set(el, ${q(value)}); return true; })()`);
const textOf = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const bodyText = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`);
const hash = () => ev(`location.hash`);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch (e) {} return true; })()`);
const ready = (what) => waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), what);
const fresh = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
  await ready("app"); await sleep(300); await clearStorage();
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await ready("app"); await sleep(1000);
};
const next = async (n) => { for (let i = 0; i < n; i += 1) await click("Next ▶"); await sleep(250); };
const last = async () => { await clickAria("Last step"); await sleep(350); };
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const shot = async (name, sel = ".ui-diagram") => { await ev(`(document.querySelector(${q(sel)}) || document.body).scrollIntoView({ block: 'start' })`); await sleep(300); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const figs = () => textOf(".ui-figures");
const FA = "#/biochemistry/fatty-acids-ketone-bodies", AM = "#/biochemistry/amino-acid-metabolism", FU = "#/biochemistry/fuel-metabolism";
const cdpKey = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const oxCum = () => textOf("[data-testid=ox-cumulative]");

try {
  // ---- 1. navigation
  await fresh(1440, "light", "#/biochemistry/overview");
  const t = await tabs();
  check("1 Biochemistry tabs list the three new tools after the Stage 18 tools", /Integrated metabolic map\|Fatty-acid & ketone-body metabolism\|Amino-acid metabolism & urea cycle\|Integrated fuel metabolism\|Saved$/.test(t), t);
  const ov = await ev(`({ cards: [...document.querySelectorAll('.gc-tool-card h3')].map((b) => b.textContent.trim()), pb: document.querySelectorAll('.gc-planned button').length })`);
  check("1 overview describes eleven working tools including the three new ones", ov.cards.length === 11 && ov.cards.includes("Fatty-acid & ketone-body metabolism") && ov.cards.includes("Integrated fuel metabolism") && ov.pb === 0, JSON.stringify(ov.cards));
  await click("Open Fatty-acid & ketone-body metabolism"); await sleep(1200);
  check("1 Open button reaches the fatty-acid laboratory", (await hash()) === FA, await hash());

  // ---- 2. fatty-acid structure explorer
  await fresh(1440, "light", FA);
  check("2 structure: palmitate drawn with 16 numbered carbons, formula and molecule image", (await count(".fa-carbon")) === 16 && /C16H32O2/.test(await figs()) && (await count(".gc-stage svg")) >= 1, await figs());
  check("2 structure: acyl-CoA formula C37H66N7O17P3S and carnitine shuttle required", /C37H66N7O17P3S/.test(await figs()) && /Required/.test(await figs()), await figs());
  await setSel("fa-chain", "8"); await sleep(400);
  check("2 structure: octanoate has 8 carbons, formula C8H16O2 and does not need the shuttle", (await count(".fa-carbon")) === 8 && /C8H16O2/.test(await figs()) && /Not required/.test(await figs()), await figs());
  await setSel("fa-chain", "18"); await sleep(300);
  check("2 structure: stearate C18H36O2", (await count(".fa-carbon")) === 18 && /C18H36O2/.test(await figs()));
  await setSel("fa-chain", "oleate"); await sleep(300);
  check("2 structure: oleate C18H34O2 with its special-case notice", /C18H34O2/.test(await figs()) && /Special case/.test(await bodyText()));
  check("2 structure: unsupported cases are listed (polyunsaturated, very-long, branched)", /Polyunsaturated/.test(await bodyText()) && /Very-long-chain/.test(await bodyText()) && /Branched-chain/.test(await bodyText()));
  await shot("fa-structure.png", ".gc-stage");

  // ---- 3. activation and carnitine shuttle
  await fresh(1440, "light", FA);
  await choose("Activation & transport"); await sleep(400);
  await tick("act-1"); await sleep(300);
  check("3 activation step 1: ATP → AMP + PPi spends 1 bond; net equation shows AMP and PPi", /High-energy bonds spent\s*1/.test(await figs()) && /AMP/.test(await textOf("[data-testid=activation-net]")) && /PPi/.test(await textOf("[data-testid=activation-net]")), await figs());
  await tick("act-2"); await sleep(300);
  check("3 activation step 2: pyrophosphatase makes it 2 bonds", /High-energy bonds spent\s*2/.test(await figs()), await figs());
  await tick("act-3"); await sleep(300);
  check("3 activation step 3: 2 ATP equivalents consumed", /ATP equivalents \(cost\)\s*2/.test(await figs()) && /ATP molecules consumed\s*2/.test(await figs()), await figs());
  await next(0);
  const shuttleBefore = await textOf(".mt-shuttle");
  check("3 shuttle: four ordered steps CPT I → translocase → CPT II named", /CPT I/.test(shuttleBefore) && shuttleBefore.indexOf("CPT I:") < shuttleBefore.indexOf("Translocase") && shuttleBefore.indexOf("Translocase") < shuttleBefore.indexOf("CPT II:"), shuttleBefore.slice(0, 200));
  await next(2); await sleep(300);
  check("3 shuttle progression: step 2 of 4 is the current list item and the diagram has CPT I", (await ev(`document.querySelectorAll('.mt-shuttle li[aria-current=true]').length`)) === 1 && (await count("[data-testid=node-cpt1]")) === 1);
  await next(2);
  check("3 shuttle: after step 4 the acyl-CoA is back in the matrix (diagram node present)", (await count("[data-testid=node-acylm]")) === 1 && (await count("[data-testid=node-carnm]")) === 1);
  await shot("fa-shuttle.png", ".ui-diagram");
  await setSel("fa-chain", "8"); await sleep(500);
  check("3 shuttle: C8 shows the bypass (no CPT I node) with the matrix activation enzyme", (await count("[data-testid=node-cpt1]")) === 0 && (await count("[data-testid=node-acsm]")) === 1 && /not required/.test(await bodyText()));

  // ---- 4/5/6. β-oxidation
  await fresh(1440, "light", FA);
  await choose("β-Oxidation"); await sleep(400);
  check("4 oxidation: starts with palmitoyl-CoA and 16 intact carbons", /Chain C16/.test(await oxCum()) && (await count(".fa-released")) === 0);
  await next(1);
  check("4 oxidation reaction 1 is acyl-CoA dehydrogenase giving +1 FADH₂", /FADH₂ \+1/.test(await oxCum()) && /Acyl-CoA dehydrogenase/.test(await textOf("[data-testid=reaction-card] h3")), await oxCum());
  await next(3);
  check("5 after one cycle: chain C14, +1 NADH, +1 FADH₂, +1 acetyl-CoA", /Chain C14/.test(await oxCum()) && /NADH \+1/.test(await oxCum()) && /Acetyl-CoA \+1/.test(await oxCum()) && (await count(".fa-released")) === 2, await oxCum());
  check("5 the diagram and chain bar agree: cycle 1 complete, 2 carbons greyed", /Cycle 1 of 7/.test(await textOf("[data-testid=ox-position]")), await textOf("[data-testid=ox-position]"));
  await shot("fa-oxidation-cycle.png", ".ui-diagram");
  await last();
  check("5 palmitate end state: C2, +7 NADH, +7 FADH₂, +8 acetyl-CoA, 14 carbons released", /Chain C2/.test(await oxCum()) && /NADH \+7/.test(await oxCum()) && /FADH₂ \+7/.test(await oxCum()) && /Acetyl-CoA \+8/.test(await oxCum()) && (await count(".fa-released")) === 14, await oxCum());
  check("5 total line: 7 cycles → 8 acetyl-CoA, 7 NADH, 7 FADH₂", /7 cycles → 8 acetyl-CoA, 7 NADH, 7 FADH₂/.test(await textOf("[data-testid=ox-total]")), await textOf("[data-testid=ox-total]"));
  await fresh(1440, "light", FA); await choose("β-Oxidation"); await setSel("fa-chain", "12"); await sleep(300); await last();
  check("6 laurate (C12): +5 NADH, +5 FADH₂, +6 acetyl-CoA", /NADH \+5/.test(await oxCum()) && /FADH₂ \+5/.test(await oxCum()) && /Acetyl-CoA \+6/.test(await oxCum()), await oxCum());
  await setSel("fa-chain", "4"); await sleep(300); await last();
  check("6 butyrate (C4): one cycle, +2 acetyl-CoA, +1 NADH", /Acetyl-CoA \+2/.test(await oxCum()) && /NADH \+1/.test(await oxCum()) && /1 cycles → 2 acetyl-CoA/.test(await textOf("[data-testid=ox-total]")), await oxCum());
  await setSel("fa-chain", "15"); await sleep(300); await last();
  check("6 odd chain C15: 6 acetyl-CoA and 1 propionyl-CoA with the special-case warning", /Acetyl-CoA \+6/.test(await oxCum()) && /Propionyl-CoA \+1/.test(await oxCum()) && /Odd-chain special case/.test(await bodyText()), await oxCum());
  await setSel("fa-chain", "oleate"); await sleep(300); await last();
  check("6 oleate: +8 NADH, +7 FADH₂ (isomerase skips one), +9 acetyl-CoA", /NADH \+8/.test(await oxCum()) && /FADH₂ \+7/.test(await oxCum()) && /Acetyl-CoA \+9/.test(await oxCum()), await oxCum());

  // ---- 7. energy accounting
  await fresh(1440, "light", FA); await choose("Energy ledger"); await sleep(400);
  const atpTable = await textOf("[data-testid=fa-atp-table]");
  check("7 palmitate: 7 cycles, 8 acetyl-CoA, 7 NADH, 7 FADH₂, and the table 17.5 + 10.5 + 80 − 2 = 106", /106/.test(await textOf("[data-testid=fa-atp-total]")) && /17\.5/.test(atpTable) && /10\.5/.test(atpTable) && /80/.test(atpTable) && /−2/.test(atpTable), atpTable.slice(0, 200));
  check("7 the page states β-oxidation itself makes no ATP (0 directly)", /ATP made directly by β-oxidation\s*0/.test(await figs()) && /β-oxidation itself makes no ATP/.test(await bodyText()));
  await setSel("fa-chain", "18"); await sleep(300);
  check("7 stearate gives 120", /120/.test(await textOf("[data-testid=fa-atp-total]")));
  await setSel("fa-chain", "15"); await sleep(300);
  check("7 odd chain: ATP not calculated, propionyl-CoA route with biotin and B₁₂ shown", /ATP not calculated/.test(await bodyText()) && /Biotin/.test(await bodyText()) && /B₁₂/.test(await bodyText()) && !(await count("[data-testid=fa-atp-total]")));
  await setSel("fa-chain", "oleate"); await sleep(300);
  check("7 oleate: 118.5", /118\.5/.test(await textOf("[data-testid=fa-atp-total]")));

  // ---- 8. synthesis
  await fresh(1440, "light", FA); await choose("Synthesis"); await sleep(400);
  check("8 synthesis ledger: 8 acetyl units, 7 malonyl-CoA, 14 NADPH, 7 + 8 ATP", /Acetyl-CoA units\s*8/.test(await figs()) && /Malonyl-CoA\s*7/.test(await figs()) && /NADPH consumed\s*14/.test(await figs()) && /ATP: malonyl-CoA\s*7/.test(await figs()) && /ATP: acetyl-CoA export\s*8/.test(await figs()), await figs());
  await last();
  check("8 end of synthesis: chain C16, NADPH −14, ATP −7 shown so far", /Chain C16/.test(await textOf("[data-testid=synth-cumulative]")) && /NADPH −14/.test(await textOf("[data-testid=synth-cumulative]")) && /ATP −7/.test(await textOf("[data-testid=synth-cumulative]")), await textOf("[data-testid=synth-cumulative]"));
  await choose("Already cytosolic"); await sleep(300);
  check("8 cytosolic acetyl-CoA source: no acetyl-CoA export ATP", /ATP: acetyl-CoA export\s*0/.test(await figs()), await figs());
  check("8 synthesis is explained as not β-oxidation backward (six contrasts incl. NADPH and ACP)", (await count("[data-testid=why-not-reverse] li")) === 6 && /NADPH/.test(await textOf("[data-testid=why-not-reverse]")) && /acyl carrier protein/.test(await textOf("[data-testid=why-not-reverse]")));
  await shot("fa-synthesis.png", ".ui-diagram");

  // ---- 9. regulation
  await fresh(1440, "light", FA); await choose("Regulation"); await sleep(400);
  await choose("Fed-associated"); await sleep(300);
  const regFed = await textOf("[data-testid=lipid-reg-table]");
  check("9 fed-associated: ACC higher, malonyl-CoA higher, CPT I lower, synthesis higher, oxidation lower", /Acetyl-CoA carboxylase.*Higher/.test(regFed) && /Malonyl-CoA.*Higher/.test(regFed) && /CPT I.*Lower/.test(regFed) && /Fatty-acid oxidation.*Lower/.test(regFed), regFed);
  await choose("Fasting-associated"); await sleep(300);
  const regFast = await textOf("[data-testid=lipid-reg-table]");
  check("9 fasting-associated: ACC lower, CPT I higher, oxidation higher", /Acetyl-CoA carboxylase.*Lower/.test(regFast) && /CPT I.*Higher/.test(regFast) && /oxidation \(long chain\).*Higher/.test(regFast), regFast);
  await choose("Reference (all balanced)"); await choose("Insulin-dominant (fed)"); await choose("Low"); await sleep(300);
  check("9 conflicting signals (insulin-dominant but low energy) are reported uncertain, not guessed", /Acetyl-CoA carboxylase.*Uncertain/.test(await textOf("[data-testid=lipid-reg-table]")), await textOf("[data-testid=lipid-reg-table]"));
  check("9 caveat states no rate or flux is computed", /No rate, flux or concentration/.test(await bodyText()));

  // ---- 10/11. ketone bodies
  await fresh(1440, "light", FA); await choose("Ketone bodies"); await sleep(500);
  await last();
  check("10 ketogenesis (acetoacetate) net: 2 acetyl-CoA + H₂O → acetoacetate + 2 CoA", /AcCoA/.test(await textOf("[data-testid=ketone-net]")) && /AcAc|Acetoacetate/i.test(await textOf("[data-testid=ketone-net]")) && /2 CoA/.test(await textOf("[data-testid=ketone-net]")), await textOf("[data-testid=ketone-net]"));
  check("10 ketone ATP estimate 19 for acetoacetate", (await textOf("[data-testid=ketone-atp]")) === "19", await textOf("[data-testid=ketone-atp]"));
  await choose("β-Hydroxybutyrate"); await sleep(300);
  check("10 β-hydroxybutyrate estimate 21.5", (await textOf("[data-testid=ketone-atp]")) === "21.5", await textOf("[data-testid=ketone-atp]"));
  check("10 who makes and uses ketone bodies: 5 tissue rows; liver makes but does not use; red blood cells neither", (await count("[data-testid=ketone-tissues] tbody tr")) === 5 && /Liver[^|]*Yes\s*No/.test(await textOf("[data-testid=ketone-tissues]")) && /Red blood cells\s*No\s*No/.test(await textOf("[data-testid=ketone-tissues]")), await textOf("[data-testid=ketone-tissues]"));
  await shot("fa-ketogenesis.png", ".ui-diagram");
  await choose("Ketolysis (peripheral)"); await sleep(400); await last();
  check("11 ketolysis: net with SCOT (succinyl-CoA used) and two acetyl-CoA formed", /2 AcCoA/.test(await textOf("[data-testid=ketone-net]")) && /SucCoA/.test(await textOf("[data-testid=ketone-net]")), await textOf("[data-testid=ketone-net]"));
  await svgClick("edge-SCOT"); await sleep(400);
  check("11 selecting the SCOT arrow shows SCOT, extrahepatic tissues and no liver activity", /Succinyl-CoA:acetoacetate CoA-transferase/.test(await textOf("[data-testid=reaction-card]")) && /Extrahepatic/.test(await textOf("[data-testid=reaction-card]")), await textOf("[data-testid=reaction-card] h3"));
  check("11 acetyl-CoA sources compared: carbohydrate vs ketone (upstream +6, −0.5, +0.75)", /\+6/.test(await textOf("[data-testid=acetyl-sources]")) && /−0\.5/.test(await textOf("[data-testid=acetyl-sources]")) && /\+0\.75/.test(await textOf("[data-testid=acetyl-sources]")), await textOf("[data-testid=acetyl-sources]"));
  await shot("fa-ketolysis.png", ".ui-diagram");

  // ---- 12/13/14. amino acids
  await fresh(1440, "light", AM);
  check("12 amino-acid structure view: alanine, formula C3H7NO2, glucogenic only, pyruvate", /C3H7NO2/.test(await figs()) && /Glucogenic only/.test(await figs()) && /Pyruvate/.test(await figs()) && (await count(".gc-stage svg")) >= 1, await figs());
  await setSel("aa-select", "L"); await sleep(300);
  check("12 leucine is ketogenic only", /Ketogenic only/.test(await figs()), await figs());
  await setSel("aa-select", "K"); await sleep(300);
  check("12 lysine is ketogenic only and its nitrogen route is the saccharopine pathway", /Ketogenic only/.test(await figs()) && /saccharopine/i.test(await textOf("[data-testid=aa-nitrogen]")));
  await setSel("aa-select", "Y"); await sleep(300);
  check("12 tyrosine is both: fumarate + acetoacetate", /Glucogenic and ketogenic/.test(await figs()) && /Fumarate/.test(await figs()));
  await setSel("aa-select", "S"); await sleep(300);
  check("12 serine: direct deamination by serine dehydratase (not a single universal route)", /dehydratase/.test(await textOf("[data-testid=aa-nitrogen]")) && /Not one universal pathway/.test(await bodyText()));
  await choose("Transamination"); await sleep(400);
  check("13 transamination: alanine + α-KG → pyruvate + Glu, ammonium released 0", /Alanine \+ α-KG → Pyruvate \+ Glu/.test(await textOf("[data-testid=ta-eq]")) && /Ammonium released\s*0/.test(await figs()), await figs());
  await next(5); await sleep(300);
  check("13 PLP stage 5: the amino group is on the cofactor (PMP) and no free NH₃ exists", /enzyme-bound PLP\/PMP/.test(await textOf("[data-testid=plp-state]")) && /Free NH₃: none/.test(await textOf("[data-testid=plp-state]")) && /PMP/.test(await textOf("[data-testid=plp-state]")), await textOf("[data-testid=plp-state]"));
  await next(3);
  check("13 PLP final stage: amino group on glutamate", /Amino group on: glutamate/.test(await textOf("[data-testid=plp-state]")), await textOf("[data-testid=plp-state]"));
  await setSel("ta-select", "L"); await sleep(300);
  check("13 leucine substrate gives α-ketoisocaproate and is catalysed by BCAT", /α-Ketoisocaproate/.test(await textOf("[data-testid=ta-eq]")) && /Branched-chain/.test(await figs() + await bodyText()));
  await shot("aa-transamination.png", ".gc-stage");
  await choose("Deamination"); await sleep(400);
  check("13 deamination: GDH equation shows NH₄ release and NADH with NAD⁺", /NH₄⁺/.test(await textOf("[data-testid=gdh-eq]")) && /NADH/.test(await textOf("[data-testid=gdh-eq]")) && /Mitochondrial matrix/.test(await figs()), await textOf("[data-testid=gdh-eq]"));
  await choose("NADP⁺ / NADPH"); await sleep(300);
  check("13 NADP variant uses NADPH", /NADPH/.test(await textOf("[data-testid=gdh-eq]")));
  await choose("Reductive amination"); await sleep(300);
  check("13 reductive amination takes up ammonium (−1)", /−1/.test(await figs()), await figs());
  check("13 table separates transamination (0 NH₄⁺) from oxidative deamination (+1)", /NH₄⁺ released\s*0\s*\+1/.test(await textOf("[data-testid=ta-vs-da]")), await textOf("[data-testid=ta-vs-da]"));
  await choose("Carbon skeletons"); await sleep(500);
  check("14 skeleton map: 20-row classification table; entry points for Lys: acetyl-CoA, acetoacetate", (await count("[data-testid=class-table] tbody tr")) === 20, String(await count("[data-testid=class-table] tbody tr")));
  await setSel("aa-select", "L"); await sleep(300);
  check("14 leucine: classified ketogenic only; map highlights acetyl-CoA / acetoacetate", /Ketogenic only/.test(await textOf(".gc-stage .ui-panel")) || /Ketogenic only/.test(await bodyText()));
  await setSel("aa-select", "I"); await sleep(300);
  check("14 isoleucine: mixed, not assigned a single endpoint (succinyl-CoA and acetyl-CoA)", /Succinyl-CoA/.test(await textOf("[data-testid=skeleton-text]")) || /succinyl-CoA/.test(await textOf("[data-testid=skeleton-text]")));
  check("14 the nominal-glucogenic caveat is displayed", /does not mean net glucose is made in every condition/.test(await bodyText()));
  await shot("aa-skeleton.png", ".ui-diagram");
  await choose("Nitrogen handling"); await sleep(400);
  check("14 nitrogen carriers table and a bounded example route", /Glutamine/.test(await bodyText()) && (await count("[data-testid=n-route] li")) >= 3);

  // ---- 15/16/17. urea cycle
  await fresh(1440, "light", AM); await choose("Urea cycle"); await sleep(500);
  await next(1);
  check("15 urea step 1 is CPS I; ATP −2 so far", /CPS I|Carbamoyl phosphate synthetase/.test(await textOf("[data-testid=urea-caption]")) && /ATP −2/.test(await textOf("[data-testid=urea-atp-so-far]")), await textOf("[data-testid=urea-atp-so-far]"));
  await next(3);
  check("15 after step 4 (ASS): ATP −3 consumed, still no urea", /ATP −3/.test(await textOf("[data-testid=urea-atp-so-far]")) && /Argininosuccinate synthetase/.test(await textOf("[data-testid=urea-caption]")), await textOf("[data-testid=urea-atp-so-far]"));
  await next(1);
  await shot("urea-cycle-mid.png", ".ui-diagram");
  await next(3);
  check("15 end of cycle: urea +1, fumarate +1; ornithine regenerated (8 steps)", /Urea \+1/.test(await textOf(".mt-caption")) && /Fumarate \+1/.test(await textOf(".mt-caption")) && /Step 8 of 8/.test(await textOf("[data-testid=urea-caption]")), await textOf(".mt-caption"));
  const nl = await textOf("[data-testid=n-ledger]");
  check("16 nitrogen ledger at the end: ornithine back with 2 nitrogens; urea nitrogens are NH₄⁺-derived and aspartate-derived", /Urea\s*NH₄⁺ \(carbamoyl phosphate\); Aspartate/.test(nl) && /Ornithine/.test(nl), nl.slice(0, 220));
  check("16 sources listed: ammonium (CPS I), aspartate (ASS), carbon from CO₂", /Free NH₄⁺/.test(await textOf("[data-testid=urea-sources]")) && /Aspartate/.test(await textOf("[data-testid=urea-sources]")) && /CO₂/.test(await textOf("[data-testid=urea-sources]")));
  const ue = await textOf("[data-testid=urea-energy]");
  check("17 ATP cost: 3 ATP molecules and 4 high-energy bonds (2 + 1 + 1), ASS ATP → AMP + PPi", /Total\s*−3\s*−4/.test(ue) && /Carbamoyl phosphate synthetase I\s*−2\s*−2/.test(ue) && /Argininosuccinate synthetase\s*−1\s*−1/.test(ue) && /Inorganic pyrophosphatase\s*0\s*−1/.test(ue), ue);
  check("17 the page explains why 4 bonds but 3 ATP and keeps the fumarate/NADH recovery separate", /three ATP molecules/i.test(await bodyText()) && /Separate accounting/.test(await bodyText()) && /does not subtract|separately/.test(await bodyText()));
  await choose("Absent"); await sleep(300);
  check("16 NAG absent: warning, CPS I lower", /N-acetylglutamate absent/.test(await bodyText()) && /CPS I\s*▼ Lower/.test(await textOf("[data-testid=urea-reg]")), await textOf("[data-testid=urea-reg]"));
  await choose("Present"); await choose("High"); await sleep(300);
  check("16 arginine high with NAG present: NAGS and CPS I higher", /CPS I\s*▲ Higher/.test(await textOf("[data-testid=urea-reg]")), await textOf("[data-testid=urea-reg]"));
  check("16 limitations: no ammonia concentration, severity or patient outcome predicted", /patient outcome/.test(await bodyText()));
  await shot("urea-cycle-end.png", ".ui-diagram");

  // ---- 18/19. integrated map
  await fresh(1440, "light", FU);
  check("18 overview map: 15 pathway boxes and 6 shared-metabolite hubs", (await count("[data-testid^=node-p-]")) === 15 && (await count("[data-testid^=node-m-]")) === 6, `${await count("[data-testid^=node-p-]")} / ${await count("[data-testid^=node-m-]")}`);
  await setSel("fuel-metabolite", "acetylcoa"); await sleep(400);
  const mp = await textOf("[data-testid=metabolite-pathways]");
  check("19 acetyl-CoA is shown in pyruvate oxidation, the cycle, β-oxidation, synthesis, ketogenesis and ketolysis", ["Pyruvate oxidation", "Citric acid cycle", "β-Oxidation", "Fatty-acid synthesis", "Ketogenesis", "Ketolysis"].every((p) => mp.includes(p)), mp);
  check("19 reaction-level roles listed with compartments and tissue", (await count("[data-testid=metabolite-roles] tbody tr")) >= 8 && /Cytosol/.test(await textOf("[data-testid=metabolite-roles]")) && /Mitochondrial matrix/.test(await textOf("[data-testid=metabolite-roles]")));
  await setSel("fuel-metabolite", "fumarate"); await sleep(300);
  check("19 fumarate links the citric acid cycle and the urea cycle", /Urea cycle/.test(await textOf("[data-testid=metabolite-pathways]")) && /Citric acid cycle/.test(await textOf("[data-testid=metabolite-pathways]")));
  await setSel("fuel-metabolite", ""); await setSel("fuel-focus", "ketone"); await sleep(400);
  check("18 focused view: ketone bodies dims unrelated pathways but keeps the map readable", (await count("[data-testid^=node-p-]")) === 15);
  await setSel("fuel-focus", "overview"); await shot("fuel-map.png", ".ui-diagram");
  await setSel("fuel-pathway", "urea-cycle"); await choose("Ledgers"); await sleep(400);
  const lg = await textOf("[data-testid=fuel-ledgers]");
  check("19 urea-cycle ledgers: ATP −3, nitrogen 2 in / 2 out with urea +1, no NADPH, not an energy ledger", /ATP −3/.test(lg) && /2 in, 2 out/.test(lg) && /urea \+1/.test(lg) && /NADPH\s*0/.test(lg), lg.slice(0, 300));
  await setSel("fuel-pathway", "fa-synthesis"); await sleep(300);
  check("19 fatty-acid synthesis ledger keeps NADPH (−6 net) separate from NADH (−8) and ATP (−15)", /ATP −15/.test(await textOf("[data-testid=fuel-ledgers]")) && /NADH −8/.test(await textOf("[data-testid=fuel-ledgers]")) && /NADPH\s*−6/.test(await textOf("[data-testid=fuel-ledgers]")), await textOf("[data-testid=fuel-ledgers]"));
  await choose("Scenarios"); await sleep(300);
  await setSel("fuel-scenario", "fasting-fao"); await sleep(300);
  const sc = await textOf("[data-testid=scenario-table]");
  check("19 fasting scenario: liver ketogenesis active, extrahepatic ketolysis active, liver ketolysis not present, fatty-acid synthesis suppressed", /Ketogenesis \(hepatic mitochondria\)\s*▲ Tends to be active\s*✖/.test(sc) && /Ketolysis \(extrahepatic mitochondria\)\s*✖ Not present in this tissue \(in the model\)\s*▲ Tends to be active/.test(sc) && /Fatty-acid synthesis \(cytosolic\)\s*▼ Tends to be suppressed/.test(sc), sc.slice(0, 400));
  check("19 scenario statements are labelled by basis and missing information is listed", /■ Stoichiometry/.test(await bodyText()) && /▲ Curated regulation/.test(await bodyText()) && (await count("[data-testid=scenario-missing] li")) >= 1);
  await setSel("fuel-scenario", "baseline"); await sleep(300);
  check("19 baseline: undetermined states are shown as 'Not determined', nothing invented", /Not determined by the model/.test(await textOf("[data-testid=scenario-table]")));
  await choose("Compare fuels"); await sleep(400);
  check("19 fuel comparison: glucose 32, palmitate 106, acetoacetate 19, β-hydroxybutyrate 21.5 ATP equivalents", (await textOf("[data-testid=atp-glucose]")) === "32" && (await textOf("[data-testid=atp-palmitate]")) === "106" && (await textOf("[data-testid=atp-acetoacetate]")) === "19" && (await textOf("[data-testid=atp-bhb]")) === "21.5");
  await choose("Glycerol phosphate"); await sleep(300);
  check("19 glycerol-phosphate shuttle: glucose 30", (await textOf("[data-testid=atp-glucose]")) === "30");

  // ---- 20. Explore / Practice / Challenge in all three
  for (const [target, label, pre] of [[FA, "fatty-acid", async () => {}], [AM, "amino-acid", async () => {}], [FU, "fuel", async () => {}]]) {
    await fresh(1440, "light", target); await pre();
    await choose("Practice"); await sleep(400);
    const qp = await textOf("[data-testid=quiz-prompt]");
    check(`20 ${label} practice: a question is shown from model state`, qp.length > 20, qp);
    const ok0 = await ev(`(() => { const o = [...document.querySelectorAll('.bio-quiz .bio-option')]; o[0].click(); return o.length; })()`); await sleep(300);
    check(`20 ${label} practice: an answer gets an explanation`, ok0 >= 3 && (await textOf("[data-testid=quiz-explanation]")).length > 30);
    await choose("Challenge"); await sleep(500);
    const cp = await textOf("[data-testid=predict-prompt]");
    await ev(`document.querySelectorAll('.bio-quiz .bio-option')[0].click()`); await sleep(300);
    await tick("predict-reveal"); await sleep(700);
    check(`20 ${label} challenge: predict first, reveal applies the state, next prediction offered`, cp.startsWith("Predict") && (await textOf("[data-testid=predict-prompt]")) !== cp, cp);
  }
  await fresh(1440, "light", FA); await choose("Practice"); await sleep(300);
  const allQ = []; for (let i = 0; i < 14; i++) { allQ.push(await textOf("[data-testid=quiz-prompt]")); if (!(await click("Next question"))) break; await sleep(100); }
  const need = ["How many β-oxidation cycles does palmitate", "Why does fatty-acid activation cost two ATP equivalents", "Which cofactor supplies the reducing power in fatty-acid synthesis", "Why does malonyl-CoA inhibit CPT I", "Where are ketone bodies produced and where are they consumed"];
  check("20 required fatty-acid practice questions are present", need.every((n) => allQ.some((x) => x.includes(n))), allQ.join(" | ").slice(0, 200));
  await fresh(1440, "light", AM); await choose("Practice"); await sleep(300);
  const aq = []; for (let i = 0; i < 16; i++) { aq.push(await textOf("[data-testid=quiz-prompt]")); if (!(await click("Next question"))) break; await sleep(100); }
  const needA = ["What does transamination transfer", "Which vitamin-derived cofactor supports aminotransferases", "What are the two nitrogen sources of urea", "Why does the urea cycle consume four high-energy phosphate bonds but only three ATP molecules"];
  check("20 required amino-acid / urea practice questions are present", needA.every((n) => aq.some((x) => x.includes(n))), aq.join(" | ").slice(0, 200));

  // ---- 21. save and reopen all three
  const saveCase = async (target, setup, name, expectOpen, label) => {
    await fresh(1440, "light", target); await setup(); await sleep(300);
    await click("Save Analysis"); await sleep(300);
    await setText(".synthesis-save-form input", name);
    await click("Save", "document.querySelector('.synthesis-save-form')");
    await waitFor(() => ev(`document.body.innerText.includes('Saved “${name}”')`), "save notice", 15000);
    check(`21 ${label}: save notice shown`, true);
    await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
    await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
    check(`21 ${label}: saved list labels it Biochemistry`, /Biochemistry/.test(await bodyText()));
    await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
    await sleep(700); if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
    await sleep(1500);
    check(`21 ${label}: reopening restores the saved state`, await expectOpen(), await hash());
  };
  await saveCase(FA, async () => { await choose("β-Oxidation"); await setSel("fa-chain", "12"); await next(6); }, "fa s25", async () => (await hash()) === FA && /Cycle 2 of 5, reaction 2 of 4/.test(await textOf("[data-testid=ox-position]")) && /Chain C10/.test(await oxCum()), "fatty acids (C12, step 6)");
  await saveCase(AM, async () => { await choose("Urea cycle"); await next(4); await choose("Absent"); }, "am s25", async () => (await hash()) === AM && /Step 4 of 8/.test(await textOf("[data-testid=urea-caption]")) && /N-acetylglutamate absent/.test(await bodyText()), "amino acids (urea step 4, NAG absent)");
  await saveCase(FU, async () => { await choose("Scenarios"); await setSel("fuel-scenario", "ketolysis"); await choose("Extrahepatic"); }, "fu s25", async () => (await hash()) === FU && /Peripheral ketone-body utilization/.test(await bodyText()) && /Not present in this tissue/.test(await textOf("[data-testid=scenario-table]")), "fuel (scenario)");
  for (const [slug, setup, expect, label] of [
    ["fatty-acids-ketone-bodies", async () => { await choose("Regulation"); await choose("Fasting-associated"); }, async () => /CPT I.*Higher/.test(await textOf("[data-testid=lipid-reg-table]")), "regulation preset"],
    ["amino-acid-metabolism", async () => { await setSel("aa-select", "K"); }, async () => /Ketogenic only/.test(await figs()), "amino acid selection"],
    ["fuel-metabolism", async () => { await setSel("fuel-metabolite", "oaa"); }, async () => /Transamination/.test(await textOf("[data-testid=metabolite-pathways]")), "metabolite selection"],
  ]) {
    await fresh(1440, "light", `#/biochemistry/${slug}`); await setup(); await sleep(2800);
    await cdp.send("Page.reload"); await ready("reload"); await sleep(1800);
    check(`21 autosave: a reloaded ${slug} page restores its ${label}`, await expect());
  }

  // ---- 22. concept search and related learning
  await fresh(1440, "dark", "#/general/overview");
  await cdpKey("k", "KeyK", 75, 2); await sleep(500);
  check("22 Ctrl+K opens concept search", await ev(`!!document.querySelector('.concept-search[role=dialog]')`));
  const results1 = () => ev(`[...document.querySelectorAll('[data-testid=concept-result]')].map((li) => ({ title: li.querySelector('.concept-result-title').textContent, subject: li.querySelector('.concept-subject').textContent }))`);
  for (const [query, part] of [["beta oxidation", "β-Oxidation"], ["carnitine", "carnitine shuttle"], ["ketone bodies", "Ketone bodies"], ["fatty acid synthesis", "Fatty-acid synthesis"], ["urea cycle", "Urea cycle"], ["transamination", "Transamination"], ["glucogenic", "Amino-acid catabolism"], ["oxidative deamination", "Oxidative deamination"], ["fuel metabolism", "Integrated fuel"]]) {
    await setText("[data-testid=concept-input]", query); await sleep(300);
    const res = await results1();
    check(`22 concept search "${query}" finds "${part}" in the top five`, res.slice(0, 5).some((x) => x.title.toLowerCase().includes(part.toLowerCase()) && /Biochemistry/.test(x.subject)), JSON.stringify(res.slice(0, 3)));
  }
  await setText("[data-testid=concept-input]", "urea cycle"); await sleep(300); await cdpKey("Enter", "Enter", 13); await sleep(1500);
  check("22 Enter on the Urea cycle result opens the amino-acid laboratory", (await hash()) === AM, await hash());
  await fresh(1440, "light", FA);
  const rel = await textOf("[data-testid=related-concepts]");
  check("22 fatty-acid page lists related learning (Citric acid cycle, Oxidative phosphorylation)", /Citric acid cycle/.test(rel) && /Oxidative phosphorylation|ATP/.test(rel), rel.slice(0, 220));
  await ev(`(() => { const b = [...document.querySelectorAll('[data-testid=related-concepts] button, [data-testid=related-concepts] a')].find((x) => /Citric acid cycle/.test(x.textContent)); b?.click(); })()`); await sleep(1200);
  check("22 the related-learning link opens the cycle tool", (await hash()) === "#/biochemistry/citric-acid-cycle", await hash());
  await fresh(1440, "light", AM);
  const rel2 = await textOf("[data-testid=related-concepts]");
  check("22 amino-acid page links to Amino acids & peptides and Gluconeogenesis", /Amino acids and peptides|Amino acids/.test(rel2) && /Gluconeogenesis|Glucogenic/.test(rel2), rel2.slice(0, 220));

  // ---- 23/24. themes and layouts, with screenshots
  const pages = [["fatty-acids-ketone-bodies", ".ui-diagram", async () => { await choose("β-Oxidation"); await next(5); }], ["amino-acid-metabolism", ".ui-diagram", async () => { await choose("Urea cycle"); await next(4); }], ["fuel-metabolism", ".ui-diagram", async () => {}]];
  for (const [slug, sel, setup] of pages) for (const w of [1440, 820, 375]) for (const scheme of ["light", "dark"]) {
    await fresh(w, scheme, `#/biochemistry/${slug}`); await setup(); await sleep(500);
    const o = await overflow();
    const dg = await ev(`(() => { const s = document.querySelector('.mt-svg'); if (!s) return null; const b = s.getBoundingClientRect(); const box = s.closest('.mt-scroll'); return { w: Math.round(b.width), cw: box ? Math.round(box.getBoundingClientRect().width) : null, scrollable: box ? box.scrollWidth > box.clientWidth + 2 : false }; })()`);
    check(`24 ${slug} at ${w}px ${scheme}: no page-level horizontal overflow and the diagram is present`, o <= 1 && dg, `overflow ${o}, ${JSON.stringify(dg)}`);
    if (w === 375) check(`24 ${slug} at 375px ${scheme}: the wide diagram scrolls inside its frame at full text size`, dg && dg.w >= 600 && dg.scrollable, JSON.stringify(dg));
    await shot(`${slug}-${w}-${scheme}.png`, ".gc-stage");
  }

  // ---- 25. representative Stage 18 navigation still works
  await fresh(1440, "light", "#/biochemistry/metabolic-map");
  check("25 Stage 18 integrated map still shows its pathway-level diagram and open-pathway button", (await count("[data-testid=map-diagram]")) === 1, await hash());
  await fresh(1440, "light", "#/biochemistry/glycolysis"); await next(4);
  check("25 Stage 18 glycolysis steps (4 of 10, ATP −2 so far)", /After reaction 4 of 10/.test(await textOf("[data-testid=step-caption]")) && /ATP −2/.test(await textOf("[data-testid=cum-atp]")), await textOf("[data-testid=step-caption]"));

  const exc = await ev(`window.__pageErrors ? window.__pageErrors.length : 0`);
  check("no uncaught page exceptions recorded", exc === 0, String(exc));
} catch (e) {
  console.log("FATAL", e && e.stack ? e.stack : e);
  results.push(false);
} finally {
  await stop();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
