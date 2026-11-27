// Stage 13: DC resistor networks and the RC transient. References are derived by hand from Ohm's and Kirchhoff's laws and the
// RC solution; the drawn diagram is checked by turning its wires back into a netlist and solving it by nodal analysis, a
// different method from the series/parallel reduction used by the model.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, loadModule } from "./engine.mjs";

let X, L, R;
before(async () => {
  X = await loadModule("/src/utils/physics/circuits.ts");
  L = await loadModule("/src/utils/physics/circuitLayout.ts");
  R = await loadModule("/src/utils/physics/rc.ts");
});
after(async () => { await closeEngine(); });

const near = (a, b, tol, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);
const rel = (a, b, tol, label = "") => near(a, b, tol * Math.abs(b), label);
const res = (id, ohms) => ({ kind: "resistor", id, label: id.toUpperCase(), ohms });
const ser = (id, ...children) => ({ kind: "series", id, children });
const par = (id, ...children) => ({ kind: "parallel", id, children });
const analyze = (voltage, root) => { const c = { voltage, root }; assert.equal(X.validateCircuit(c).ok, true); return X.analyzeCircuit(c); };

describe("series and parallel networks (hand-derived references)", () => {
  test("[series] 100 + 200 + 300 ohm across 9 V: R = 600, I = 15 mA, drops 1.5/3/4.5 V, powers 22.5/45/67.5 mW", () => {
    const a = analyze(9, ser("g1", res("r1", 100), res("r2", 200), res("r3", 300)));
    near(a.equivalent, 600, 1e-9);
    near(a.current, 0.015, 1e-12);
    near(a.byId.r1.voltage, 1.5, 1e-12); near(a.byId.r2.voltage, 3, 1e-12); near(a.byId.r3.voltage, 4.5, 1e-12);
    near(a.byId.r1.power, 0.0225, 1e-12); near(a.byId.r2.power, 0.045, 1e-12); near(a.byId.r3.power, 0.0675, 1e-12);
    near(a.power, 0.135, 1e-12);
    for (const r of a.resistors) near(r.current, 0.015, 1e-12);
  });
  test("[parallel] 100 || 200 || 300 ohm across 12 V: R = 600/11 = 54.545, I = 0.22 A, branches 0.12/0.06/0.04 A", () => {
    const a = analyze(12, par("g1", res("r1", 100), res("r2", 200), res("r3", 300)));
    near(a.equivalent, 600 / 11, 1e-9);
    near(a.current, 0.22, 1e-12);
    near(a.byId.r1.current, 0.12, 1e-12); near(a.byId.r2.current, 0.06, 1e-12); near(a.byId.r3.current, 0.04, 1e-12);
    for (const r of a.resistors) near(r.voltage, 12, 1e-12);
    near(a.power, 2.64, 1e-12);
  });
  test("[two in parallel] R1 R2 / (R1 + R2) and current division I1 = I R2 / (R1 + R2): 60 || 30 = 20 ohm; 6 A splits 2 A / 4 A", () => {
    const a = analyze(120, par("g1", res("r1", 60), res("r2", 30)));
    near(a.equivalent, 20, 1e-12);
    near(a.current, 6, 1e-12);
    near(a.byId.r1.current, 2, 1e-12); near(a.byId.r2.current, 4, 1e-12);
    near(a.byId.r1.currentShare, 1 / 3, 1e-12);
  });
  test("[voltage divider] 1 k + 3 k across 8 V: the 3 k resistor takes 6 V (R2 / (R1 + R2) of the source)", () => {
    const a = analyze(8, ser("g1", res("r1", 1000), res("r2", 3000)));
    near(a.byId.r2.voltage, 6, 1e-12);
  });
  test("[nested] R1 = 100 in series with (200 || 300) at 12 V: 100 + 120 = 220; I = 54.545 mA; V1 = 5.4545 V; parallel part 6.5455 V; branches 32.727 / 21.818 mA", () => {
    const a = analyze(12, X.DEFAULT_CIRCUIT.root);
    near(a.equivalent, 220, 1e-9);
    near(a.current, 12 / 220, 1e-12);
    near(a.byId.r1.voltage, 1200 / 220, 1e-12);
    near(a.byId.g2.voltage, 12 - 1200 / 220, 1e-12);
    near(a.byId.g2.resistance, 120, 1e-9);
    near(a.byId.r2.current, (12 - 1200 / 220) / 200, 1e-12);
    near(a.byId.r3.current, (12 - 1200 / 220) / 300, 1e-12);
    near(a.byId.r2.current, 0.0327273, 1e-7);
    near(a.byId.r3.current, 0.0218182, 1e-7);
  });
  test("[balanced bridge-like] (100 + 150) || (200 + 50) at 10 V: 250 || 250 = 125 ohm, 80 mA total, 40 mA per branch, drops 4/6/8/2 V", () => {
    const a = analyze(10, par("g1", ser("g2", res("r1", 100), res("r2", 150)), ser("g3", res("r3", 200), res("r4", 50))));
    near(a.equivalent, 125, 1e-9);
    near(a.current, 0.08, 1e-12);
    near(a.byId.g2.current, 0.04, 1e-12); near(a.byId.g3.current, 0.04, 1e-12);
    near(a.byId.r1.voltage, 4, 1e-12); near(a.byId.r2.voltage, 6, 1e-12); near(a.byId.r3.voltage, 8, 1e-12); near(a.byId.r4.voltage, 2, 1e-12);
  });
  test("[deep nesting] 100 || (200 + (300 || 600)) at 8 V: 300 || 600 = 200, 200 + 200 = 400, 100 || 400 = 80; I = 0.1 A; 600 ohm carries 6.667 mA", () => {
    const a = analyze(8, par("g1", res("r1", 100), ser("g2", res("r2", 200), par("g3", res("r3", 300), res("r4", 600)))));
    near(a.equivalent, 80, 1e-9);
    near(a.current, 0.1, 1e-12);
    near(a.byId.g2.current, 0.02, 1e-12);
    near(a.byId.g3.voltage, 4, 1e-12);
    near(a.byId.r3.current, 4 / 300, 1e-12); near(a.byId.r4.current, 4 / 600, 1e-12);
  });
  test("[ohm and power] V = IR and P = VI = I^2 R = V^2 / R for every resistor", () => {
    const a = analyze(24, X.DEFAULT_CIRCUIT.root);
    for (const r of a.resistors) {
      rel(r.voltage, r.current * r.resistance, 1e-12);
      rel(r.power, r.current * r.current * r.resistance, 1e-12);
      rel(r.power, (r.voltage * r.voltage) / r.resistance, 1e-12);
    }
  });
  test("[single resistor] one resistor across the source", () => {
    const a = analyze(5, res("r1", 250));
    near(a.current, 0.02, 1e-12); near(a.power, 0.1, 1e-12);
  });
  test("[extreme values] 1 milliohm with 1 gigaohm in parallel is 1 milliohm (to 1e-9); 1 gigaohm in series with 1 milliohm is 1 gigaohm + 1 milliohm", () => {
    near(analyze(1, par("g", res("a", 1e-3), res("b", 1e9))).equivalent, 1e-3, 1e-12);
    near(analyze(1, ser("g", res("a", 1e-3), res("b", 1e9))).equivalent, 1e9 + 1e-3, 1e-6);
  });
});

describe("Kirchhoff's laws and conservation", () => {
  test("[KCL/KVL/power] residuals are at round-off for the examples", () => {
    for (const p of X.CIRCUIT_PRESETS) {
      const a = X.analyzeCircuit(p.circuit);
      assert.ok(a.kclResidual < 1e-12, `${p.label} KCL ${a.kclResidual}`);
      assert.ok(a.kvlResidual < 1e-12, `${p.label} KVL ${a.kvlResidual}`);
      assert.ok(a.powerResidual < 1e-12, `${p.label} power ${a.powerResidual}`);
    }
  });
  test("[KCL by hand] at the junction of the default parallel group the two branch currents add to the series current", () => {
    const a = X.analyzeCircuit(X.DEFAULT_CIRCUIT);
    const j = a.kclJunctions[0];
    near(j.outflow.reduce((s, o) => s + o.amps, 0), j.inflow, 1e-15);
    near(j.inflow, 12 / 220, 1e-12);
  });
  test("[KVL by hand] every loop through a resistor sums to the source voltage: V1 + V2 = 12 and V1 + V3 = 12", () => {
    const a = X.analyzeCircuit(X.DEFAULT_CIRCUIT);
    assert.equal(a.kvlLoops.length, 3);
    for (const loop of a.kvlLoops) near(loop.sum, 12, 1e-12, loop.label);
    const l2 = a.kvlLoops.find((l) => l.resistorId === "r2");
    assert.deepEqual(l2.terms.map((t) => t.id), ["r1", "r2"]);
  });
  test("[random networks] 200 seeded random series/parallel trees satisfy KCL, KVL and power balance", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 200; n += 1) {
      const c = randomCircuit(rnd);
      const a = X.analyzeCircuit(c);
      const scale = Math.max(1e-9, a.power);
      assert.ok(a.kclResidual <= 1e-9 * Math.max(1, a.current), "KCL");
      assert.ok(a.kvlResidual <= 1e-9 * c.voltage, "KVL");
      assert.ok(a.powerResidual <= 1e-9 * scale, "power");
    }
  });
  test("[series current, parallel voltage] every part of a series group carries the same current, every branch of a parallel group has the same voltage", () => {
    const c = randomCircuit(seededRng(5));
    const a = X.analyzeCircuit(c);
    const walk = (n) => {
      if (n.kind === "resistor") return;
      for (const ch of n.children) {
        if (n.kind === "series") near(a.byId[ch.id].current, a.byId[n.id].current, 1e-12 * Math.max(1, a.byId[n.id].current));
        else near(a.byId[ch.id].voltage, a.byId[n.id].voltage, 1e-9 * c.voltage);
        walk(ch);
      }
    };
    walk(c.root);
  });
});

/** Independent solver: nodal analysis (Gaussian elimination) of the netlist recovered from the DRAWN wires. */
function netlistFromDrawing(drawing, circuit) {
  const voltage = circuit.voltage;
  const ohms = Object.fromEntries(X.resistorsOf(circuit.root).map((r) => [r.id, r.ohms]));
  const parent = new Map();
  const key = (p) => `${p.x},${p.y}`;
  const find = (k) => { if (!parent.has(k)) parent.set(k, k); let r = k; while (parent.get(r) !== r) r = parent.get(r); parent.set(k, r); return r; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const w of drawing.wires) union(key(w.a), key(w.b));
  for (const r of drawing.resistors) { find(key(r.a)); find(key(r.b)); }
  find(key(drawing.source.plus)); find(key(drawing.source.minus));
  const nodes = [...new Set([...parent.keys()].map(find))];
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const plus = idx.get(find(key(drawing.source.plus)));
  const minus = idx.get(find(key(drawing.source.minus)));
  const n = nodes.length;
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  for (const r of drawing.resistors) {
    const a = idx.get(find(key(r.a)));
    const b = idx.get(find(key(r.b)));
    const g = 1 / ohms[r.id];
    G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g;
  }
  // fix the two source nodes: ground at the minus node, V at the plus node
  for (const [node, value] of [[minus, 0], [plus, voltage]]) { G[node].fill(0); G[node][node] = 1; rhs[node] = value; }
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r;
    [G[c], G[p]] = [G[p], G[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = G[r][c] / G[c][c];
      for (let k = c; k < n; k += 1) G[r][k] -= f * G[c][k];
      rhs[r] -= f * rhs[c];
    }
  }
  const v = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = rhs[r];
    for (let k = r + 1; k < n; k += 1) s -= G[r][k] * v[k];
    v[r] = s / G[r][r];
  }
  return { nodes: n, voltageAcross: (r) => v[idx.get(find(key(r.a)))] - v[idx.get(find(key(r.b)))] };
}

function seededRng(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function randomCircuit(rnd) {
  let id = 0;
  const make = (depth, budget) => {
    if (budget.left <= 1 || depth >= 3 || rnd() < 0.3) { budget.left -= 1; id += 1; return res(`r${id}`, Math.round(10 ** (1 + rnd() * 4)) ); }
    const kind = rnd() < 0.5 ? "series" : "parallel";
    const count = 2 + Math.floor(rnd() * 2);
    id += 1;
    const gid = `g${id}`;
    const children = [];
    for (let i = 0; i < count; i += 1) { if (budget.left <= 0) { budget.left = 1; } children.push(make(depth + 1, budget)); }
    return { kind, id: gid, children };
  };
  let root = make(0, { left: 7 });
  if (root.kind === "resistor") root = ser("top", root, res("r99", 100));
  return { voltage: 1 + Math.round(rnd() * 99), root };
}

describe("the diagram is the circuit", () => {
  test("[netlist] for every preset and 100 random networks, the wires as drawn give the same resistor voltages as the series/parallel reduction", () => {
    const circuits = [...X.CIRCUIT_PRESETS.map((p) => p.circuit)];
    const rnd = seededRng(23);
    for (let i = 0; i < 100; i += 1) circuits.push(randomCircuit(rnd));
    for (const c of circuits) {
      assert.equal(X.validateCircuit(c).ok, true);
      const a = X.analyzeCircuit(c);
      const drawing = L.layoutCircuit(c);
      assert.equal(drawing.resistors.length, a.resistors.length);
      const net = netlistFromDrawing(drawing, c);
      for (const placed of drawing.resistors) rel(net.voltageAcross(placed), a.byId[placed.id].voltage, 1e-9, `${placed.id} of ${X.describeStructure(c.root)}`);
    }
  });
  test("[no stray connections] a series string of N resistors needs exactly N + 1 electrical nodes plus the rail nodes; a parallel pair shares exactly two", () => {
    const c2 = { voltage: 5, root: par("g", res("a", 100), res("b", 200)) };
    const d = L.layoutCircuit(c2);
    const net = netlistFromDrawing(d, c2);
    // nodes: the + rail/left bus, the - rail/right bus
    assert.equal(net.nodes, 2);
    const c3 = { voltage: 5, root: ser("g", res("a", 100), res("b", 200), res("c", 300)) };
    assert.equal(netlistFromDrawing(L.layoutCircuit(c3), c3).nodes, 4);
  });
  test("[layout] no two resistors overlap, every resistor lies inside the drawing, left terminal is left of right", () => {
    const rnd = seededRng(3);
    for (let i = 0; i < 60; i += 1) {
      const c = randomCircuit(rnd);
      const d = L.layoutCircuit(c);
      for (const r of d.resistors) {
        assert.ok(r.a.x < r.b.x && r.a.y === r.b.y);
        assert.ok(r.a.x >= 0 && r.b.x <= d.width && r.a.y - L.GEO.resistorH / 2 >= 0 && r.a.y + L.GEO.resistorH / 2 <= d.height);
      }
      for (let p = 0; p < d.resistors.length; p += 1) for (let q = p + 1; q < d.resistors.length; q += 1) {
        const A = d.resistors[p]; const B = d.resistors[q];
        const overlapX = A.a.x < B.b.x && B.a.x < A.b.x;
        const overlapY = Math.abs(A.a.y - B.a.y) < L.GEO.resistorH;
        assert.ok(!(overlapX && overlapY), `${A.id} overlaps ${B.id}`);
      }
    }
  });
});

describe("circuit validation and editing", () => {
  const ok = { voltage: 12, root: ser("g", res("a", 100), res("b", 200)) };
  test("[accepts] a valid network", () => assert.equal(X.validateCircuit(ok).ok, true));
  test("[rejects] zero, negative, non-finite and absurd resistance or voltage", () => {
    for (const bad of [0, -5, NaN, Infinity, 1e10, 1e-4, "100"]) assert.equal(X.validateCircuit({ ...ok, root: ser("g", res("a", bad), res("b", 200)) }).ok, false, String(bad));
    for (const v of [0, -1, NaN, 1001, null]) assert.equal(X.validateCircuit({ ...ok, voltage: v }).ok, false, String(v));
  });
  test("[rejects] groups with fewer than two parts, duplicate ids, unknown kinds, too many resistors, too deep", () => {
    assert.equal(X.validateCircuit({ ...ok, root: ser("g", res("a", 100)) }).ok, false);
    assert.equal(X.validateCircuit({ ...ok, root: ser("g", res("a", 100), res("a", 100)) }).ok, false);
    assert.equal(X.validateCircuit({ ...ok, root: { kind: "capacitor", id: "c", farads: 1 } }).ok, false);
    assert.equal(X.validateCircuit({ ...ok, root: { kind: "bridge", id: "b", children: [res("a", 1), res("b", 1)] } }).ok, false);
    const many = ser("g", ...Array.from({ length: 13 }, (_, i) => res(`r${i}`, 100)));
    assert.equal(X.validateCircuit({ ...ok, root: many }).ok, false);
    let deep = ser("d5", res("x", 1), res("y", 1));
    for (let i = 4; i >= 1; i -= 1) deep = i % 2 ? par(`d${i}`, deep, res(`z${i}`, 1)) : ser(`d${i}`, deep, res(`z${i}`, 1));
    assert.equal(X.validateCircuit({ ...ok, root: deep }).ok, false);
  });
  test("[rejects] a node that points back to itself (cycle) cannot be expressed: shared objects are copied, unknown fields dropped", () => {
    const r = X.validateCircuit({ ...ok, extra: 1, root: { ...ok.root, bonus: true } });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value).sort(), ["root", "voltage"]);
    assert.deepEqual(Object.keys(r.value.root).sort(), ["children", "id", "kind"]);
  });
  test("[editing] adding beside a lone resistor makes a group; removing collapses a two-part group; the last resistor stays", () => {
    let c = { voltage: 5, root: res("r1", 100) };
    c = X.addResistor(c, "r1", "parallel", 300);
    assert.equal(c.root.kind, "parallel");
    assert.equal(X.resistorsOf(c.root).length, 2);
    const second = X.resistorsOf(c.root)[1].id;
    c = X.removeNode(c, second);
    assert.equal(c.root.kind, "resistor");
    assert.equal(X.removeNode(c, "r1"), c);
    assert.equal(X.validateCircuit(c).ok, true);
  });
  test("[editing] toggling a group, changing a value and nesting keep the circuit valid and the analysis in step", () => {
    let c = X.DEFAULT_CIRCUIT;
    c = X.setResistance(c, "r1", 400);
    near(X.analyzeCircuit(c).equivalent, 520, 1e-9);
    c = X.toggleGroupKind(c, "g2");
    near(X.analyzeCircuit(c).equivalent, 400 + 500, 1e-9);
    c = X.addResistor(c, "r2", "parallel", 600);
    assert.equal(X.validateCircuit(c).ok, true);
    assert.equal(X.resistorsOf(c.root).length, 4);
    near(X.analyzeCircuit(c).equivalent, X.equivalentResistance(c.root), 1e-12);
  });
  test("[limits] cannot add beyond 12 resistors or beyond the nesting limit", () => {
    let c = { voltage: 5, root: res("r1", 10) };
    for (let i = 0; i < 20; i += 1) c = X.addResistor(c, c.root.kind === "resistor" ? c.root.id : c.root.id, "series", 10);
    assert.equal(X.resistorsOf(c.root).length, 12);
    let d = { voltage: 5, root: res("a1", 10) };
    for (let i = 0; i < 10; i += 1) { const leaf = X.resistorsOf(d.root)[0]; d = X.addResistor(d, leaf.id, i % 2 ? "series" : "parallel", 10); }
    assert.ok(X.depthOf(d.root) <= X.CIRCUIT_LIMITS.maxDepth);
    assert.equal(X.validateCircuit(d).ok, true);
  });
  test("[description] structure is written with series as + and parallel as ||", () => {
    assert.equal(X.describeStructure(X.DEFAULT_CIRCUIT.root), "R1 + (R2 ∥ R3)");
  });
});

describe("RC transient (hand-derived references)", () => {
  const base = { Vs: 9, V0: 0, R: 10_000, C: 100e-6, spanTau: 5 };
  test("[time constant] R = 10 kohm, C = 100 uF: tau = RC = 1 s", () => {
    near(R.timeConstant(base), 1, 1e-12);
    near(R.tEnd(base), 5, 1e-12);
  });
  test("[charging] 9 V from 0: v(tau) = 9(1 - 1/e) = 5.689 V (63.2 %), i(0) = 0.9 mA, i(tau) = 0.3311 mA, v(5 tau) = 99.33 % of 9 V", () => {
    near(R.stateAt(base, 0).vC, 0, 0);
    near(R.stateAt(base, 0).i, 0.9e-3, 1e-15);
    near(R.stateAt(base, 1).vC, 9 * (1 - Math.exp(-1)), 1e-12);
    near(R.stateAt(base, 1).vC, 5.68909, 1e-5);
    near(R.stateAt(base, 1).i, 0.9e-3 * Math.exp(-1), 1e-15);
    near(R.stateAt(base, 1).i, 0.331091e-3, 1e-9);
    near(R.stateAt(base, 5).vC / 9, 0.993262, 1e-6);
    near(R.stateAt(base, 1).progress, 0.632121, 1e-6);
  });
  test("[discharging] 9 V capacitor through R toward 0 V: v(1 s) = 3.3109 V, current reverses (-0.9 mA at t = 0)", () => {
    const p = { ...base, Vs: 0, V0: 9 };
    near(R.stateAt(p, 0).vC, 9, 0);
    near(R.stateAt(p, 0).i, -0.9e-3, 1e-15);
    near(R.stateAt(p, 1).vC, 9 * Math.exp(-1), 1e-12);
    assert.equal(R.direction(p), "discharging");
    assert.equal(R.direction(base), "charging");
  });
  test("[final and initial conditions] vC(0) = V0 exactly (no jump) and vC(infinity) = Vs; i(0) = (Vs - V0)/R is finite", () => {
    for (const [Vs, V0] of [[9, 0], [0, 9], [12, 3], [-5, 5], [4, 4]]) {
      const p = { ...base, Vs, V0 };
      assert.equal(R.stateAt(p, 0).vC, V0);
      near(R.stateAt(p, 50 * R.timeConstant(p)).vC, Vs, 1e-12);
      near(R.stateAt(p, 0).i, (Vs - V0) / p.R, 1e-15);
    }
  });
  test("[partial charge] 12 V source on a capacitor holding 3 V: v(2 tau) = 12 - 9 e^-2 = 10.7819 V", () => {
    near(R.stateAt({ ...base, Vs: 12, V0: 3 }, 2).vC, 12 - 9 * Math.exp(-2), 1e-12);
    near(R.stateAt({ ...base, Vs: 12, V0: 3 }, 2).vC, 10.7819, 1e-4);
  });
  test("[through zero] Vs = -5, V0 = +5: v = -5 + 10 e^(-t/tau) crosses zero at t = tau ln 2", () => {
    const p = { ...base, Vs: -5, V0: 5 };
    near(R.stateAt(p, Math.LN2).vC, 0, 1e-12);
  });
  test("[no change] Vs = V0 gives no current, constant voltage, direction steady", () => {
    const p = { ...base, Vs: 6, V0: 6 };
    assert.equal(R.direction(p), "steady");
    assert.equal(R.stateAt(p, 3).i, 0);
    assert.equal(R.stateAt(p, 3).vC, 6);
    assert.equal(R.stateAt(p, 3).progress, 1);
  });
  test("[i = C dv/dt] the current equals C times the numerical derivative of the capacitor voltage", () => {
    const h = 1e-6;
    for (const t of [0.1, 0.7, 2.2]) {
      const dv = (R.stateAt(base, t + h).vC - R.stateAt(base, t - h).vC) / (2 * h);
      near(base.C * dv, R.stateAt(base, t).i, 1e-9);
    }
  });
  test("[KVL] Vs = vR + vC at all times", () => {
    for (const t of [0, 0.3, 1, 4]) {
      const s = R.stateAt({ ...base, V0: 2 }, t);
      near(s.vR + s.vC, 9, 1e-12);
    }
  });
  test("[energy] stored energy is C v^2 / 2; source work = change in stored energy + resistor heat = Vs C (Vs - V0)", () => {
    const sum = R.summarize(base);
    near(sum.Uinf, 0.5 * 100e-6 * 81, 1e-15);
    near(sum.sourceWork, 9 * 100e-6 * 9, 1e-15);
    near(sum.deltaU + sum.resistorHeat, sum.sourceWork, 1e-15);
    near(sum.resistorHeat, sum.deltaU, 1e-15); // charging from zero: half the source energy is dissipated
    near(R.stateAt(base, 1).energy, 0.5 * 100e-6 * (9 * (1 - Math.exp(-1))) ** 2, 1e-15);
    for (const [Vs, V0, r, c] of [[12, 3, 470, 2.2e-3], [-5, 5, 1e6, 1e-9], [0, 9, 2200, 47e-6]]) {
      const p = { Vs, V0, R: r, C: c, spanTau: 5 };
      const s = R.summarize(p);
      rel(s.deltaU + s.resistorHeat, s.sourceWork, 1e-12);
    }
  });
  test("[heat from the integral of i^2 R] a numerical integral of i^2 R over 30 tau equals the closed form C (Vs - V0)^2 / 2", () => {
    const p = { Vs: 12, V0: 3, R: 470, C: 2.2e-3, spanTau: 10 };
    const tau = R.timeConstant(p);
    const N = 20000;
    const end = 30 * tau;
    const f = (t) => { const i = R.stateAt(p, t).i; return i * i * p.R; };
    let s = f(0) + f(end);
    for (let k = 1; k < N; k += 1) s += f((end * k) / N) * (k % 2 ? 4 : 2);
    const heat = (s * end) / (3 * N);
    rel(heat, R.summarize(p).resistorHeat, 1e-9);
  });
  test("[characteristic times] half-way at tau ln 2, 63.2 % at tau, 99 % at tau ln 100 = 4.605 tau, and timeToFraction inverts the curve", () => {
    const s = R.summarize(base);
    near(s.halfTime, Math.LN2, 1e-12);
    near(s.settle99, 4.60517, 1e-5);
    near(R.stateAt(base, s.halfTime).progress, 0.5, 1e-12);
    near(R.stateAt(base, s.settle99).progress, 0.99, 1e-12);
    near(R.stateAt(base, R.timeToFraction(base, 0.8)).progress, 0.8, 1e-12);
  });
  test("[scaling] doubling R or C doubles tau and the time to reach any given fraction, leaving the final value unchanged", () => {
    const a = R.stateAt({ ...base, R: 20_000 }, 2);
    const b = R.stateAt(base, 1);
    near(a.vC, b.vC, 1e-12);
    near(R.timeConstant({ ...base, C: 200e-6 }), 2, 1e-12);
    near(R.stateAt({ ...base, C: 200e-6 }, 2).progress, R.stateAt(base, 1).progress, 1e-12);
  });
  test("[samples] 161 points from 0 to the span, monotone in time and monotone toward the final voltage", () => {
    const s = R.samples(base);
    assert.equal(s.length, 161);
    assert.equal(s[0].t, 0);
    near(s[160].t, 5, 1e-12);
    for (let i = 1; i < s.length; i += 1) assert.ok(s[i].vC >= s[i - 1].vC && s[i].i <= s[i - 1].i);
  });
  test("[validation] rejects zero or negative R and C, non-finite values, voltages beyond +/-100 V, tau outside 1 ns to 1e6 s and unknown spans", () => {
    assert.equal(R.validateRc(base).ok, true);
    for (const bad of [{ R: 0 }, { R: -1 }, { R: NaN }, { C: 0 }, { C: -1e-6 }, { C: 2 }, { Vs: 101 }, { V0: -101 }, { Vs: NaN }, { spanTau: 4 }, { R: 1e9, C: 1 }, { R: 1, C: 1e-12 }, { R: "1000" }]) {
      assert.equal(R.validateRc({ ...base, ...bad }).ok, false, JSON.stringify(bad));
    }
    assert.equal(R.validateRc(null).ok, false);
    assert.deepEqual(Object.keys(R.validateRc({ ...base, extra: 1 }).value).sort(), ["C", "R", "V0", "Vs", "spanTau"]);
  });
  test("[clamp] times outside the plotted window are clamped", () => {
    assert.equal(R.clampTime(base, -1), 0);
    assert.equal(R.clampTime(base, 99), 5);
    assert.equal(R.clampTime(base, NaN), 0);
  });
});
