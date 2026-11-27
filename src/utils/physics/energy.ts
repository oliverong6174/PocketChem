/**
 * Work and mechanical energy (pure; no React).
 *
 * Four bounded, analytic scenarios, each a function of time so the animation, graphs and energy bars read one state:
 *  - "incline": a block on a rough incline of length L (reference height for gravitational energy: the bottom of the incline);
 *  - "flat": a block on a rough horizontal surface with an optional constant horizontal applied force;
 *  - "spring": a block released from a compressed ideal (Hookean) spring on a rough horizontal surface, then sliding free;
 *  - "height": a body thrown vertically near Earth's surface (reference height chosen by the user), no air resistance.
 * Energy ledger at every instant:  KE + PE_gravity + PE_spring + Q  =  E(0) + W_applied
 * where Q is the heat produced by kinetic friction (the energy leaving the mechanical store, still conserved in total) and
 * W_applied is the work done by the external applied force. Work–energy theorem: ΔKE = W_gravity + W_spring + W_friction + W_applied.
 * Constants: g near Earth's surface, ideal massless spring, kinetic friction μₖN opposing the sliding velocity, static friction
 * only decides whether a body at rest starts to move.
 */
import { buildSlide, firstReach, slideAt, type SlidePhase } from "./forces";

export const ENERGY_LIMITS = {
  minMass: 0.01, maxMass: 1000, minG: 0.1, maxG: 30, maxAngle: 80, minAngle: 1, maxL: 100, maxV: 100, maxF: 500,
  minK: 1, maxK: 1e5, maxX0: 5, maxH: 1000, maxMu: 3, minDuration: 0.1, maxDuration: 200,
} as const;

export type EnergyScenario = "incline" | "flat" | "spring" | "height";
export const ENERGY_SCENARIOS: readonly EnergyScenario[] = ["incline", "flat", "spring", "height"];

export interface EnergyInput {
  scenario: EnergyScenario;
  m: number;
  g: number;
  /** Initial velocity (m/s) along the track's positive direction: up the incline, right on the flat, upward for the height scenario. */
  v0: number;
  /** Incline: angle (°), length (m) and start distance from the bottom (m). */
  theta: number;
  L: number;
  u0: number;
  /** Flat: horizontal applied force (N, + to the right). */
  F: number;
  /** Spring: constant (N/m) and compression at release (m). */
  k: number;
  x0: number;
  /** Height scenario: starting height above the ground (m) and the height taken as zero potential energy (m). */
  h0: number;
  href: number;
  mus: number;
  muk: number;
  /** Longest time (s) a motion that never ends by itself is followed. */
  duration: number;
}

export const DEFAULT_ENERGY_INPUT: EnergyInput = {
  scenario: "incline", m: 2, g: 9.81, v0: 0, theta: 30, L: 5, u0: 5, F: 0, k: 200, x0: 0.5, h0: 10, href: 0, mus: 0.3, muk: 0.2, duration: 6,
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateEnergyInput(raw: unknown): Validated<EnergyInput> {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["The energy settings are missing."] };
  const L = ENERGY_LIMITS;
  const num = (v: unknown, label: string, lo: number, hi: number, unit: string) => { if (!finite(v) || v < lo || v > hi) errors.push(`${label} must be a number between ${lo} and ${hi} ${unit}.`.replace("  .", ".")); };
  if (typeof raw.scenario !== "string" || !ENERGY_SCENARIOS.includes(raw.scenario as EnergyScenario)) errors.push("The scenario must be incline, flat, spring or height.");
  num(raw.m, "Mass", L.minMass, L.maxMass, "kg");
  num(raw.g, "Gravity", L.minG, L.maxG, "m/s²");
  num(raw.v0, "Initial velocity", -L.maxV, L.maxV, "m/s");
  num(raw.theta, "Incline angle", L.minAngle, L.maxAngle, "°");
  num(raw.L, "Incline length", 0.1, L.maxL, "m");
  num(raw.u0, "Start distance from the bottom", 0, L.maxL, "m");
  num(raw.F, "Applied force", -L.maxF, L.maxF, "N");
  num(raw.k, "Spring constant", L.minK, L.maxK, "N/m");
  num(raw.x0, "Spring compression", 0.001, L.maxX0, "m");
  num(raw.h0, "Starting height", 0, L.maxH, "m");
  num(raw.href, "Reference height", -L.maxH, L.maxH, "m");
  num(raw.mus, "Static friction coefficient", 0, L.maxMu, "");
  num(raw.muk, "Kinetic friction coefficient", 0, L.maxMu, "");
  num(raw.duration, "Observation time", L.minDuration, L.maxDuration, "s");
  if (finite(raw.mus) && finite(raw.muk) && raw.muk > raw.mus) errors.push("The kinetic friction coefficient cannot exceed the static one in this model.");
  if (finite(raw.u0) && finite(raw.L) && raw.u0 > raw.L) errors.push("The block must start on the incline: the start distance cannot exceed its length.");
  if (errors.length) return { ok: false, errors };
  const r = raw as Record<string, number | string>;
  return {
    ok: true,
    value: {
      scenario: r.scenario as EnergyScenario, m: r.m as number, g: r.g as number, v0: r.v0 as number, theta: r.theta as number, L: r.L as number, u0: r.u0 as number,
      F: r.F as number, k: r.k as number, x0: r.x0 as number, h0: r.h0 as number, href: r.href as number, mus: r.mus as number, muk: r.muk as number, duration: r.duration as number,
    },
  };
}

export interface EnergyState {
  t: number;
  /** Coordinate along the track (m): distance up the incline from the bottom / position on the flat / position from the spring's natural length / height. */
  pos: number;
  v: number;
  /** Height of the body above the ground (m), spring compression (m, 0 when free), distance slid so far (m). */
  height: number;
  compression: number;
  path: number;
  KE: number;
  PEg: number;
  PEs: number;
  /** Heat produced by kinetic friction so far (J). */
  Q: number;
  /** Work by the applied force so far (J). */
  Wapplied: number;
  /** Mechanical energy KE + PEg + PEs, and the full ledger KE + PEg + PEs + Q (= E(0) + W_applied). */
  Emech: number;
  Etotal: number;
  /** Work by each force from the start up to t: gravity, spring, friction (J). Their sum plus Wapplied equals ΔKE. */
  Wgravity: number;
  Wspring: number;
  Wfriction: number;
  phase: string;
}

export interface EnergyAnalysis {
  input: EnergyInput;
  tEnd: number;
  /** The coordinate range covered between t = 0 and tEnd. */
  posMin: number;
  posMax: number;
  /** Why the motion ends, in words. */
  ending: string;
  stays: boolean;
  at: (t: number) => EnergyState;
  /** The track bounds for display (incline: [0, L]). */
  initial: EnergyState;
  final: EnergyState;
}

const clamp = (t: number, end: number) => (Number.isFinite(t) ? Math.min(Math.max(t, 0), end) : 0);

interface Raw { pos: number; v: number; height: number; compression: number; path: number; PEs: number; phase: string }

export function analyzeEnergy(input: EnergyInput): EnergyAnalysis {
  const { m, g, muk, mus } = input;
  let tEnd = 0;
  let ending = "";
  let stays = false;
  let raw: (t: number) => Raw;
  let Wapplied: (s: Raw) => number = () => 0;
  let PEg: (s: Raw) => number;

  if (input.scenario === "incline") {
    const th = (input.theta * Math.PI) / 180;
    const N = m * g * Math.cos(th);
    const phases = buildSlide({ P: -m * g * Math.sin(th), M: m, N, mus, muk, v0: input.v0 });
    const down = firstReach(phases, -input.u0, true);
    const up = firstReach(phases, input.L - input.u0, true);
    const last = phases[phases.length - 1];
    const cands = [down, up].filter((x): x is number => x !== null);
    // initial direction of motion along the slope (+ up): a block pressed against an end of the track cannot leave it
    const first = phases[0];
    const dir0 = first.kind === "static" ? 0 : first.v0 !== 0 ? Math.sign(first.v0) : Math.sign(first.a);
    if ((input.u0 === 0 && dir0 < 0) || (input.u0 === input.L && dir0 > 0)) {
      tEnd = 0;
      stays = true;
      ending = input.u0 === 0 ? "is already at the bottom of the incline and cannot go lower" : "is already at the top end of the incline and would leave it";
    } else if (cands.length) {
      tEnd = Math.min(...cands);
      ending = down !== null && (up === null || down <= up) ? "reaches the bottom of the incline" : "reaches the top end of the incline";
    } else if (last.kind === "static") {
      tEnd = last.t0;
      ending = last.t0 === 0 ? "does not move: static friction holds it" : "comes to rest and stays at rest";
      stays = last.t0 === 0;
    }
    raw = (t) => { const s = slideAt(phases, t); const u = input.u0 + s.x; return { pos: u, v: s.v, height: u * Math.sin(th), compression: 0, path: s.path, PEs: 0, phase: s.kind === "static" ? "at rest" : "sliding" }; };
    PEg = (s) => m * g * s.height;
  } else if (input.scenario === "flat") {
    const phases = buildSlide({ P: input.F, M: m, N: m * g, mus, muk, v0: input.v0 });
    const last = phases[phases.length - 1];
    if (last.kind === "static") {
      tEnd = last.t0;
      ending = last.t0 === 0 ? "does not move: the applied force is within static friction" : "comes to rest and stays at rest";
      stays = last.t0 === 0;
    } else {
      tEnd = Math.min(input.duration, last.t0 + 1e9);
      ending = "followed for the observation time";
    }
    raw = (t) => { const s = slideAt(phases, t); return { pos: s.x, v: s.v, height: 0, compression: 0, path: s.path, PEs: 0, phase: s.kind === "static" ? "at rest" : "sliding" }; };
    PEg = () => 0;
    Wapplied = (s) => input.F * s.pos;
  } else if (input.scenario === "spring") {
    const { k, x0 } = input;
    if (k * x0 <= mus * m * g) {
      tEnd = 0; stays = true; ending = "does not move: static friction holds the compressed spring";
      raw = () => ({ pos: -x0, v: 0, height: 0, compression: x0, path: 0, PEs: 0.5 * k * x0 * x0, phase: "held" });
    } else {
      const w = Math.sqrt(k / m);
      const ue = (muk * m * g) / k;
      const A = x0 - ue;
      const leaves = x0 > 2 * ue;
      const t1 = leaves ? Math.acos(-ue / A) / w : Math.PI / w;
      const v1 = leaves ? w * A * Math.sin(w * t1) : 0;
      const free: SlidePhase[] | null = leaves ? buildSlide({ P: 0, M: m, N: m * g, mus, muk, v0: v1 }) : null;
      if (leaves) {
        const stop = free![0].kind === "kinetic" && Number.isFinite(free![0].dur) ? free![0].dur : Infinity;
        const after = Math.min(stop, input.duration);
        tEnd = t1 + after;
        ending = Number.isFinite(stop) && stop <= input.duration ? "leaves the spring, slides, and comes to rest" : "leaves the spring and is followed for the observation time";
      } else {
        tEnd = t1;
        ending = "stops while still compressed (friction takes all the stored energy) and stays at rest";
      }
      raw = (t) => {
        if (t <= t1) {
          const u = ue + A * Math.cos(w * t);
          const v = w * A * Math.sin(w * t);
          return { pos: -u, v, height: 0, compression: u, path: x0 - u, PEs: 0.5 * k * u * u, phase: "pushed by the spring" };
        }
        const s = slideAt(free ?? [], t - t1);
        return { pos: s.x, v: s.v, height: 0, compression: 0, path: x0 + s.path, PEs: 0, phase: s.kind === "static" ? "at rest" : "sliding free" };
      };
    }
    PEg = () => 0;
  } else {
    const { h0, v0 } = input;
    const T = h0 === 0 && v0 <= 0 ? 0 : (v0 + Math.sqrt(v0 * v0 + 2 * g * h0)) / g;
    tEnd = T;
    stays = T === 0;
    ending = T === 0 ? "starts on the ground and is not moving up" : "reaches the ground (the model stops there)";
    raw = (t) => { const h = h0 + v0 * t - 0.5 * g * t * t; const v = v0 - g * t; return { pos: Math.max(h, 0), v, height: Math.max(h, 0), compression: 0, path: 0, PEs: 0, phase: "in flight" }; };
    PEg = (s) => m * g * (s.height - input.href);
  }

  const window = tEnd > 0 ? tEnd : 0.5;
  // round-off dust (a 1e-15 J "potential energy" at the bottom) is shown as exactly zero
  const scale = 0.5 * m * input.v0 * input.v0 + m * g * (input.L + input.h0 + Math.abs(input.href) + 1) + 0.5 * input.k * input.x0 * input.x0 + Math.abs(input.F) * (input.L + 1) + 1e-9;
  const dust = (v: number) => (Math.abs(v) < 1e-12 * scale ? 0 : v);
  const build = (tIn: number): EnergyState => {
    const t = clamp(tIn, window);
    const r = raw(Math.min(t, tEnd));
    const N = input.scenario === "incline" ? m * g * Math.cos((input.theta * Math.PI) / 180) : m * g;
    const Q = input.scenario === "height" ? 0 : dust(muk * N * r.path);
    const KE = dust(0.5 * m * r.v * r.v);
    const pg = dust(PEg(r));
    const Wa = Wapplied(r);
    const Emech = KE + pg + dust(r.PEs);
    return {
      t, pos: dust(r.pos), v: dust(r.v), height: dust(r.height), compression: dust(r.compression), path: r.path, KE, PEg: pg, PEs: dust(r.PEs), Q, Wapplied: dust(Wa),
      Emech, Etotal: Emech + Q, Wgravity: 0, Wspring: 0, Wfriction: -Q, phase: r.phase,
    };
  };
  const initial = build(0);
  const at = (tIn: number): EnergyState => {
    const s = build(tIn);
    // gravity and spring work follow from the potential energies; their sum with friction and applied work is ΔKE
    return { ...s, Wgravity: initial.PEg - s.PEg, Wspring: initial.PEs - s.PEs };
  };
  const init = at(0);
  const fin = at(window);
  const samples = Array.from({ length: 201 }, (_, i) => at((window * i) / 200).pos);
  return { input, tEnd: window, posMin: Math.min(...samples), posMax: Math.max(...samples), ending, stays, at, initial: init, final: fin };
}

export interface ReachResult {
  reached: boolean;
  t: number | null;
  state: EnergyState | null;
  /** The extreme coordinates actually covered, for the "never gets there" explanation. */
  min: number;
  max: number;
}

/** The first time the body is at coordinate `d` (found on a fine time grid, refined by bisection) and its state there. */
export function reachPosition(a: EnergyAnalysis, d: number): ReachResult {
  const N = 4000;
  const f = (t: number) => a.at(t).pos - d;
  let prevT = 0;
  let prev = f(0);
  if (Math.abs(prev) < 1e-12) return { reached: true, t: 0, state: a.at(0), min: a.posMin, max: a.posMax };
  for (let i = 1; i <= N; i += 1) {
    const t = (a.tEnd * i) / N;
    const cur = f(t);
    if (cur === 0 || prev * cur < 0) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 80; k += 1) { const mid = 0.5 * (lo + hi); if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
      const tt = 0.5 * (lo + hi);
      return { reached: true, t: tt, state: a.at(tt), min: a.posMin, max: a.posMax };
    }
    prevT = t; prev = cur;
  }
  return { reached: false, t: null, state: null, min: a.posMin, max: a.posMax };
}

/** Speed from a pure energy balance, independent of the time model: v² = v₀² + 2(W_total)/m (null if the energy is insufficient). */
export function speedFromEnergy(m: number, v0: number, workNet: number): number | null {
  const v2 = v0 * v0 + (2 * workNet) / m;
  return v2 < 0 ? null : Math.sqrt(v2);
}
