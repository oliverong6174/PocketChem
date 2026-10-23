// Phase 4 / Stage 8A-4.2: interface polish. These checks read source and CSS; behavior that needs
// a real browser (focus, drag-resizing, the system clipboard) is listed in the stage report.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const css = read("src", "App.css");
const page = read("src", "components", "SynthesisPage.tsx");
const drawer = read("src", "components", "MoleculeDrawer.tsx");
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} rule exists`);
  return css.slice(start, css.indexOf("}", start));
};

describe("name/SMILES input label layout", () => {
  test("the label does not wrap on wide screens and the hint drops below instead of squeezing it", () => {
    assert.match(rule(".molecule-name-input-copy label"), /white-space:\s*nowrap/);
    assert.match(rule(".molecule-name-input-copy"), /flex-wrap:\s*wrap/);
    assert.match(rule(".molecule-name-input-copy span"), /min-width:\s*0/);
  });

  test("narrow screens stack the copy block and let the label wrap; input row still wraps", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 640px) {\n  .molecule-name-input-copy"));
    assert.match(narrow, /\.molecule-name-input-copy label \{\s*white-space:\s*normal/);
    assert.match(narrow, /\.molecule-name-input-row \{\s*flex-wrap:\s*wrap/);
    assert.match(rule(".molecule-name-input-row"), /align-items:\s*stretch/);
  });

  test("one shared drawer renders the label, so every molecular editor gets the same layout", () => {
    assert.match(drawer, /className="molecule-name-input-copy"/);
  });
});

describe("editor vertical resizing", () => {
  test("the synthesis editor box is user-resizable with no upper cap, in both layouts", () => {
    assert.match(css, /\.synthesis-ketcher-box \{\s*max-height:\s*none;/);
    const narrow = css.slice(css.indexOf("@media (max-width: 700px)", css.indexOf("Ketcher usability")));
    assert.match(narrow.slice(0, 500), /\.synthesis-ketcher-box \{\s*max-height:\s*none;/);
    assert.match(css, /\.synthesis-ketcher-box \{\n  resize: vertical;\n  min-height: 300px;/, "minimum height kept");
    assert.match(rule(".synthesis-ketcher-box"), /overflow:\s*hidden/, "overflow hidden is what makes resize available");
  });

  test("the box height reaches the real canvas: stack, shell and iframe all fill their parent", () => {
    assert.match(rule(".molecule-drawer-stack"), /height:\s*100%/);
    assert.match(rule(".molecule-drawer-stack"), /grid-template-rows:\s*minmax\(0, 1fr\) auto/);
    assert.match(rule(".molecule-drawer-stack > .ketcher-shell"), /height:\s*100%/);
    assert.match(rule(".ketcher-isolated-frame"), /height:\s*100%/);
  });

  test("each editor is its own box with its own frame id, and no JavaScript resize machinery was added", () => {
    assert.equal((page.match(/synthesis-ketcher-box/g) ?? []).length, 2);
    assert.match(page, /globalKey="synthesisReactantKetcher"/);
    assert.match(page, /globalKey="synthesisProductKetcher"/);
    for (const file of ["SynthesisPage.tsx", "MoleculeDrawer.tsx", "IsolatedKetcherEditor.tsx", "KetcherFrameApp.tsx"]) {
      assert.doesNotMatch(read("src", "components", file), /ResizeObserver|mousemove|pointermove/, file);
    }
  });
});

describe("clipboard shortcuts", () => {
  const frame = read("src", "components", "IsolatedKetcherEditor.tsx");
  const frameApp = read("src", "components", "KetcherFrameApp.tsx");

  test("Ketcher's own handlers provide every required shortcut (verified in the installed package)", () => {
    const dist = fs.readFileSync(path.join(root, "node_modules", "ketcher-react", "dist", "index.js"), "utf8");
    for (const shortcut of [
      "shortcut: 'Mod+c'", "shortcut: 'Mod+x'", "shortcut: 'Mod+v'", "shortcut: 'Mod+a'", "shortcut: 'Mod+z'",
      "shortcut: ['Mod+Shift+z', 'Mod+y']",
    ]) assert.ok(dist.includes(shortcut), shortcut);
  });

  test("PocketChem adds no clipboard or shortcut handlers of its own (no duplicates)", () => {
    for (const [name, text] of [["IsolatedKetcherEditor", frame], ["KetcherFrameApp", frameApp], ["MoleculeDrawer", drawer]]) {
      assert.doesNotMatch(text, /["'](copy|cut|paste|keydown|keyup)["']/, name);
      assert.doesNotMatch(text, /onCopy|onCut|onPaste|onKeyDown|execCommand|navigator\.clipboard/, name);
    }
  });

  test("the same-origin editor frame is explicitly allowed to use the async clipboard", () => {
    assert.match(frame, /allow="clipboard-read; clipboard-write"/);
  });

  test("the name/SMILES field is an ordinary input in the parent document, outside the frame", () => {
    assert.match(drawer, /<input\s+id=\{`\$\{globalKey\}-molecule-name`\}/);
  });
});

describe("synthesis page: diagnostics and copies text", () => {
  test("the frontier diagnostics panel is gone from the UI but the engine still reports frontier data", () => {
    assert.doesNotMatch(page, /Search frontier diagnostics|searchDiagnostics|frontierRuleSummary|frontierSample/);
    const engine = read("src", "utils", "reactions", "engine", "multistepSynthesis.ts");
    assert.match(engine, /frontierSample/);
    assert.match(engine, /frontierRuleSummary/);
  });

  test("progress, cancel, verified routes and the time limit remain", () => {
    assert.match(page, /role="progressbar"/);
    assert.match(page, /isSearching \? "Cancel" : "Clear"/);
    assert.match(page, /UNIFIED_SEARCH_TOTAL_MS/);
    assert.match(page, /verification/i);
  });

  test("the copies selector is kept (one default, two) with the concise explanation", () => {
    assert.match(page, /<option value=\{1\}>One copy \(default\)<\/option>/);
    assert.match(page, /<option value=\{2\}>Two copies<\/option>/);
    assert.match(page, /Controls how many times each supplied starting material can be used\. Copies do not\s+represent quantity or reaction yield\./);
    assert.doesNotMatch(page, /Twos+copies never add a new compound|not finding as+route does not mean/);
  });

  test("Add/Replace stays on the starting-material editor only", () => {
    const start = page.slice(page.indexOf('globalKey="synthesisReactantKetcher"'), page.indexOf('globalKey="synthesisProductKetcher"'));
    assert.match(start, /nameInputMode="add-or-replace"/);
    assert.match(page.slice(page.indexOf('globalKey="synthesisProductKetcher"'), page.indexOf('globalKey="synthesisProductKetcher"') + 400), /maxComponents=\{1\}/);
  });
});
