// Stage 17: independent regression for enzyme inhibition. Expected numbers are hand-derived from
// v = Vmax[S]/(αKm + α′[S]), Vmax,app = Vmax/α′, Km,app = (α/α′)Km — never read back from the engine.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let E;
before(async () => { E = await loadModule("/src/utils/biochem/enzyme.ts"); });
after(async () => { await closeEngine(); });
const near = (a, b, m) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${m} ${a} vs ${b}`);

// Vmax 100, Km 2, [I] 6, Ki 3 (α = 3), Ki′ 2 (α′ = 4)
const base = { conc: 6, ki: 3, kiPrime: 2 };
const CASES = [
  // type, α, α′, Vmax,app, Km,app, v at [S]=2 (hand: 100*2/(α*2+α′*2))
  ["none", 1, 1, 100, 2, 50],
  ["competitive", 3, 1, 100, 6, 25],            // 200/(6+2)
  ["uncompetitive", 1, 4, 25, 0.5, 200 / 10],   // 200/(2+8)
  ["noncompetitive", 3, 3, 100 / 3, 2, 200 / 12], // α = α′ = 3 (single Ki = 3); 200/(6+6)
  ["mixed", 3, 4, 25, 1.5, 200 / 14],           // 200/(6+8)
];

describe("inhibition models", () => {
  for (const [type, a, b, vApp, kApp, v] of CASES) {
    test(`${type}: α=${a}, α′=${b}, Vmax,app=${vApp}, Km,app=${kApp}, v(2)=${v}`, () => {
      const inh = { type, ...base };
      const al = E.alphas(inh);
      near(al.alpha, a, "alpha"); near(al.alphaPrime, b, "alpha'");
      const app = E.apparentParameters(100, 2, inh);
      near(app.vmaxApp, vApp, "Vmax,app"); near(app.kmApp, kApp, "Km,app");
      near(E.inhibitedVelocity(100, 2, 2, inh), v, "v");
      near(E.inhibitedVelocity(100, 2, 2, inh), vApp * 2 / (kApp + 2), "v via apparent parameters");
    });
  }
  test("classification signatures: only competitive keeps Vmax; only uncompetitive lowers Km; noncompetitive keeps Km", () => {
    const get = (t) => E.apparentParameters(100, 2, { type: t, ...base });
    assert.equal(get("competitive").vmaxApp, 100);
    assert.ok(get("competitive").kmApp > 2);
    assert.ok(get("uncompetitive").kmApp < 2 && get("uncompetitive").vmaxApp < 100);
    near(get("noncompetitive").kmApp, 2, "noncompetitive Km");
    assert.ok(get("noncompetitive").vmaxApp < 100);
    assert.ok(get("mixed").vmaxApp < 100 && get("mixed").kmApp !== 2);
  });
  test("noncompetitive ignores Ki′ (pure: α = α′ from the single Ki)", () => {
    const x = E.alphas({ type: "noncompetitive", conc: 6, ki: 3, kiPrime: 999 });
    near(x.alpha, 3, "a"); near(x.alphaPrime, 3, "a'");
  });
});
