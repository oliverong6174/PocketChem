import { useId, useMemo } from "react";
import { fmt } from "../../utils/physics/format";
import {
  antinodePositions, classifySuperposition, densityRatio, displacement, dopplerGeometry, harmonicFrequency, harmonicWavelength, longitudinalPosition, modeShape, nodePositions,
  particleVelocity, standingDisplacement, sumDisplacement, superpositionWindow, TWO_PI, wavefrontsReceived, waveQuantities, solveDoppler,
  type DopplerInput, type ResonatorInput, type SuperpositionInput, type WaveInput,
} from "../../utils/physics/waves";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

const TEAL = "#0b6a72";
const AMBER = "#b45309";
const INK = "#0f172a";
const RED = "#be123c";
const GREY = "#94a3b8";

const path = (pts: Array<[number, number]>) => pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/** A single traveling wave, drawn as a transverse curve with particles or as a longitudinal band of particles with a density curve. */
export function TravelDiagram({ wave, longitudinal, t }: { wave: WaveInput; longitudinal: boolean; t: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const uid = useId().replace(/:/g, "");
  const q = waveQuantities(wave);
  const W = Math.max(300, Math.min(avail, 900));
  const left = 30;
  const X = 2.5 * q.lambda;
  const px = (x: number) => left + (x / X) * (W - 2 * left);
  const compact = W < 520;
  // The tracked particle sits at x0 = 0.25 lambda so it is visible in both views.
  const x0 = 0.25 * q.lambda;
  if (!longitudinal) {
    const H = compact ? 250 : 280;
    const mid = H / 2 - 10;
    const amp = 70;
    const py = (y: number) => mid - (y / wave.A) * amp;
    const curve = Array.from({ length: 241 }, (_, k) => { const x = (k / 240) * X; return [px(x), py(displacement(wave, x, t))] as [number, number]; });
    const dots = Array.from({ length: 26 }, (_, k) => (k / 25) * X);
    const vy = particleVelocity(wave, x0, t);
    const vmax = q.omega * wave.A;
    return (
      <div className="ph-diagram" ref={wrapRef}>
        <svg aria-label={`Transverse wave at t = ${fmt(t)} s: wavelength ${fmt(q.lambda)} m, traveling ${wave.dir === 1 ? "right" : "left"} at ${fmt(wave.v)} m/s; the marked particle at x = ${fmt(x0)} m has displacement ${fmt(displacement(wave, x0, t))} m and velocity ${fmt(vy)} m/s`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
          <ArrowDefs prefix={uid} />
          <rect className="ph-paper" height={H} width={W} x={0} y={0} />
          <line className="ph-grid" x1={left} x2={W - left} y1={mid} y2={mid} />
          <path d={path(curve)} fill="none" stroke={TEAL} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
          {dots.map((x) => <circle cx={px(x)} cy={py(displacement(wave, x, t))} fill={TEAL} fillOpacity={0.55} key={x} r={3.2} />)}
          <line stroke={GREY} strokeDasharray="4 4" x1={px(x0)} x2={px(x0)} y1={mid - amp - 8} y2={mid + amp + 8} />
          <circle cx={px(x0)} cy={py(displacement(wave, x0, t))} fill={RED} r={6} stroke="#fff" strokeWidth={2}><title>one particle of the medium</title></circle>
          <Arrow kind="a" prefix={uid} title={`velocity of this particle: ${fmt(vy)} m/s`} width={3.2} x1={px(x0) + 16} x2={px(x0) + 16} y1={py(displacement(wave, x0, t))} y2={py(displacement(wave, x0, t)) - (vy / vmax) * 46} />
          <text className="ph-note-text" x={px(x0) + 24} y={py(displacement(wave, x0, t)) - 6}>particle velocity {fmt(vy)} m/s (up to {fmt(vmax)})</text>
          <Arrow kind="v" prefix={uid} title={`wave velocity ${fmt(wave.v)} m/s`} width={3.4} x1={wave.dir === 1 ? W - 150 : W - 60} x2={wave.dir === 1 ? W - 60 : W - 150} y1={22} y2={22} />
          <text className="ph-val strong" textAnchor="middle" x={W - 105} y={14}>wave {fmt(wave.v)} m/s</text>
          <g>
            <line stroke={INK} strokeWidth={1.4} x1={px(0.5 * q.lambda)} x2={px(1.5 * q.lambda)} y1={H - 36} y2={H - 36} />
            <line stroke={INK} x1={px(0.5 * q.lambda)} x2={px(0.5 * q.lambda)} y1={H - 41} y2={H - 31} />
            <line stroke={INK} x1={px(1.5 * q.lambda)} x2={px(1.5 * q.lambda)} y1={H - 41} y2={H - 31} />
            <text className="ph-axis-label" textAnchor="middle" x={px(q.lambda)} y={H - 18}>λ = {fmt(q.lambda)} m</text>
          </g>
          <text className="ph-note-text" x={8} y={16}>amplitude A = {fmt(wave.A)} m (vertical scale exaggerated)</text>
        </svg>
      </div>
    );
  }
  // longitudinal
  const H = compact ? 290 : 330;
  const bandTop = 40;
  const bandH = 70;
  const N = 90;
  const eq = Array.from({ length: N + 1 }, (_, k) => (k / N) * X);
  const posOf = (xe: number) => longitudinalPosition(wave, xe, t);
  const dens = Array.from({ length: 241 }, (_, k) => { const x = (k / 240) * X; return [x, densityRatio(wave, x, t)] as [number, number]; });
  const dMax = Math.max(1.05, ...dens.map((d) => d[1]));
  const dMin = Math.min(0.95, ...dens.map((d) => d[1]));
  const dTop = bandTop + bandH + 56;
  const dH = H - dTop - 36;
  const dy = (r: number) => dTop + dH - ((r - dMin) / (dMax - dMin)) * dH;
  const here = posOf(x0);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Longitudinal wave at t = ${fmt(t)} s: particles are bunched where the density ratio exceeds 1. The marked particle oscillates about x = ${fmt(x0)} m, now at ${fmt(here)} m`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <text className="ph-note-text" x={8} y={16}>each line is one particle of the medium (positions are to scale)</text>
        {eq.map((xe, k) => <line key={k} stroke={k % 9 === 0 ? RED : TEAL} strokeOpacity={k % 9 === 0 ? 0.9 : 0.5} strokeWidth={k % 9 === 0 ? 2.2 : 1.4} x1={px(posOf(xe))} x2={px(posOf(xe))} y1={bandTop} y2={bandTop + bandH} />)}
        <line className="ph-grid" x1={left} x2={W - left} y1={bandTop + bandH + 6} y2={bandTop + bandH + 6} />
        <circle cx={px(x0)} cy={bandTop + bandH + 6} fill="none" r={3} stroke={GREY} />
        <circle cx={px(here)} cy={bandTop + bandH + 6} fill={RED} r={5}><title>marked particle (equilibrium position shown as a ring)</title></circle>
        <text className="ph-note-text" textAnchor="middle" x={px(x0)} y={bandTop + bandH + 26}>marked particle oscillates about its ring</text>
        <line className="ph-grid" x1={left} x2={W - left} y1={dy(1)} y2={dy(1)} />
        <path d={path(dens.map(([x, r]) => [px(posOf(x)), dy(r)] as [number, number]))} fill="none" stroke={AMBER} strokeWidth={2.8} />
        <text className="ph-axis-label" x={8} y={dTop - 8}>density ρ/ρ₀ (above 1: compression, below 1: rarefaction)</text>
        <text className="ph-tick" x={left - 4} y={dy(1) - 4}>1</text>
        <text className="ph-note-text" x={8} y={H - 10}>x from 0 to {fmt(X)} m; wavelength {fmt(q.lambda)} m</text>
      </svg>
    </div>
  );
}

/** The two waves and their sum, each on its own baseline, with the nodes marked when the sum is a true standing wave. */
export function SuperpositionDiagram({ sup, t }: { sup: SuperpositionInput; t: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(300, Math.min(avail, 900));
  const left = 30;
  const X = superpositionWindow(sup);
  const px = (x: number) => left + (x / X) * (W - 2 * left);
  const compact = W < 520;
  const rowH = compact ? 78 : 92;
  const H = rowH * 3 + 36;
  const amax = sup.w1.A + sup.w2.A;
  const amp = rowH * 0.42;
  const rowMid = (r: number) => 22 + rowH * r + rowH / 2;
  const sample = (fn: (x: number) => number, r: number) => path(Array.from({ length: 301 }, (_, k) => { const x = (k / 300) * X; return [px(x), rowMid(r) - (fn(x) / amax) * amp] as [number, number]; }));
  const c = classifySuperposition(sup);
  const k = TWO_PI / (sup.v / sup.w1.f);
  const phibar = ((sup.w1.phiDeg + sup.w2.phiDeg) / 2) * (Math.PI / 180);
  const nodes: number[] = [];
  if (c.kind === "standing") for (let n = -4; n <= 400; n++) { const x = (n * Math.PI - phibar) / k; if (x >= 0 && x <= X) nodes.push(x); }
  const labels = ["Wave 1", "Wave 2", `Sum: ${c.kind === "standing" ? "standing wave" : c.kind === "beats" ? "beats" : "superposition"}`];
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Wave 1, wave 2 and their sum at t = ${fmt(t)} s. ${c.title}`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {[0, 1, 2].map((r) => (
          <g key={r}>
            <line className="ph-grid" x1={left} x2={W - left} y1={rowMid(r)} y2={rowMid(r)} />
            <text className="ph-note-text" x={left + 4} y={rowMid(r) - amp - 4}>{labels[r]}</text>
          </g>
        ))}
        <path d={sample((x) => displacement(sup.w1, x, t), 0)} fill="none" stroke={TEAL} strokeWidth={2.6} />
        <path d={sample((x) => displacement(sup.w2, x, t), 1)} fill="none" stroke={AMBER} strokeDasharray="7 4" strokeWidth={2.6} />
        <path d={sample((x) => sumDisplacement(sup, x, t), 2)} fill="none" stroke={INK} strokeWidth={3} />
        {nodes.map((x) => <circle cx={px(x)} cy={rowMid(2)} fill={RED} key={x} r={4.5} stroke="#fff" strokeWidth={1.5}><title>node: never moves</title></circle>)}
        {nodes.length ? <text className="ph-note-text" textAnchor="end" x={W - left} y={rowMid(2) - amp - 4}>red dots: nodes</text> : null}
        <text className="ph-note-text" x={left} y={H - 8}>x from 0 to {fmt(X)} m; the three rows share one amplitude scale (full height = {fmt(amax)} m)</text>
      </svg>
    </div>
  );
}

/** A string or pipe vibrating in one harmonic: the displacement shape, its envelope, and labelled nodes and antinodes. */
export function ResonatorDiagram({ res, t }: { res: ResonatorInput; t: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(300, Math.min(avail, 900));
  const compact = W < 520;
  const H = compact ? 220 : 250;
  const left = 40;
  const right = W - 40;
  const px = (x: number) => left + (x / res.L) * (right - left);
  const mid = 110;
  const amp = 55;
  const f = harmonicFrequency(res.kind, res.L, res.v, res.n);
  const shapeAt = (x: number) => modeShape(res.kind, res.L, res.n, x);
  const yAt = (x: number) => mid - (standingDisplacement(res, x, t) / res.A) * amp;
  const curve = path(Array.from({ length: 301 }, (_, k) => { const x = (k / 300) * res.L; return [px(x), yAt(x)] as [number, number]; }));
  const env = (sign: number) => path(Array.from({ length: 301 }, (_, k) => { const x = (k / 300) * res.L; return [px(x), mid - sign * Math.abs(shapeAt(x)) * amp] as [number, number]; }));
  const nodes = nodePositions(res.kind, res.L, res.n);
  const anti = antinodePositions(res.kind, res.L, res.n);
  const pipe = res.kind !== "string";
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`${res.kind === "string" ? "String fixed at both ends" : res.kind === "open" ? "Pipe open at both ends" : "Pipe closed at the left end"} in harmonic ${res.n} at ${fmt(f)} Hz, wavelength ${fmt(harmonicWavelength(res.kind, res.L, res.n))} m, with ${nodes.length} nodes and ${anti.length} antinodes`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {pipe ? (
          <g>
            <line stroke={INK} strokeWidth={4} x1={left} x2={right} y1={mid - amp - 14} y2={mid - amp - 14} />
            <line stroke={INK} strokeWidth={4} x1={left} x2={right} y1={mid + amp + 14} y2={mid + amp + 14} />
            {res.kind === "closed" ? <line stroke={INK} strokeWidth={7} x1={left} x2={left} y1={mid - amp - 16} y2={mid + amp + 16} /> : null}
          </g>
        ) : (
          <g>
            <line stroke={INK} strokeWidth={6} x1={left} x2={left} y1={mid - 22} y2={mid + 22} />
            <line stroke={INK} strokeWidth={6} x1={right} x2={right} y1={mid - 22} y2={mid + 22} />
          </g>
        )}
        <line className="ph-grid" x1={left} x2={right} y1={mid} y2={mid} />
        <path d={env(1)} fill="none" stroke={GREY} strokeDasharray="5 4" strokeWidth={1.6} />
        <path d={env(-1)} fill="none" stroke={GREY} strokeDasharray="5 4" strokeWidth={1.6} />
        <path d={curve} fill="none" stroke={TEAL} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} />
        {nodes.map((x) => <circle cx={px(x)} cy={mid} fill={RED} key={`n${x}`} r={5} stroke="#fff" strokeWidth={1.5}><title>node at {fmt(x)} m</title></circle>)}
        {anti.map((x) => <circle cx={px(x)} cy={mid - Math.abs(shapeAt(x)) * amp} fill="none" key={`a${x}`} r={5} stroke={AMBER} strokeWidth={2}><title>antinode at {fmt(x)} m</title></circle>)}
        <text className="ph-note-text" x={left} y={H - 36}>● node (never moves)   ○ antinode (largest motion)   dashed: envelope</text>
        <text className="ph-axis-label" textAnchor="middle" x={(left + right) / 2} y={H - 14}>L = {fmt(res.L)} m: harmonic {res.n}, λ = {fmt(harmonicWavelength(res.kind, res.L, res.n))} m, f = {fmt(f)} Hz</text>
        <text className="ph-note-text" x={left} y={18}>displacement shown (amplitude exaggerated){res.kind === "closed" ? "; closed end at the left" : ""}</text>
      </svg>
    </div>
  );
}

/** Dimensionless Doppler picture: lengths in rest wavelengths, time in source periods, c = 1. */
export function DopplerDiagram({ dop, t }: { dop: DopplerInput; t: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const uid = useId().replace(/:/g, "");
  const g = useMemo(() => dopplerGeometry(dop), [dop]);
  const r = solveDoppler(dop);
  const W = Math.max(300, Math.min(avail, 900));
  const H = W < 520 ? 250 : 300;
  const lo = -2;
  const hi = g.D + 3;
  const s = (W - 40) / (hi - lo);
  const px = (x: number) => 20 + (x - lo) * s;
  const cy = H / 2 - 6;
  const circles = useMemo(() => Array.from({ length: Math.min(60, Math.floor(t) + 1) }, (_, k) => k).filter((k) => k <= t), [t]);
  const xs = g.sourceX(t);
  const xo = g.observerX(t);
  const got = wavefrontsReceived(dop, t);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Doppler picture at ${fmt(t)} source periods: the source moves ${dop.vs >= 0 ? "toward" : "away from"} the observer at ${fmt(dop.vs)} m/s and the observer ${dop.vo >= 0 ? "toward" : "away from"} the source at ${fmt(dop.vo)} m/s; ${got} wavefronts have reached the observer; observed frequency ${fmt(r.fObserved)} Hz`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <clipPath id={`${uid}-clip`}><rect height={H} width={W} x={0} y={0} /></clipPath>
        <g clipPath={`url(#${uid}-clip)`}>
          {circles.map((k) => {
            const rad = (t - k) * 1;
            return rad > 0.02 ? <circle cx={px(g.Ms * k)} cy={cy} fill="none" key={k} r={rad * s} stroke={TEAL} strokeOpacity={0.75} strokeWidth={1.6} /> : null;
          })}
        </g>
        <line className="ph-grid" x1={20} x2={W - 20} y1={cy} y2={cy} />
        <circle cx={px(xs)} cy={cy} fill={RED} r={8} stroke="#fff" strokeWidth={2}><title>source</title></circle>
        <text className="ph-axis-label" textAnchor="middle" x={px(xs)} y={cy + 28}>source</text>
        <Arrow kind="a" prefix={uid} title={`source velocity ${fmt(dop.vs)} m/s`} width={3.4} x1={px(xs)} x2={px(xs) + (dop.vs / Math.max(dop.c, 1)) * 140} y1={cy - 18} y2={cy - 18} />
        <rect fill={INK} height={18} rx={3} width={18} x={px(xo) - 9} y={cy - 9}><title>observer</title></rect>
        <text className="ph-axis-label" textAnchor="middle" x={px(xo)} y={cy + 28}>observer</text>
        <Arrow kind="v" prefix={uid} title={`observer velocity ${fmt(dop.vo)} m/s`} width={3.4} x1={px(xo)} x2={px(xo) - (dop.vo / Math.max(dop.c, 1)) * 140} y1={cy - 18} y2={cy - 18} />
        <text className="ph-note-text" x={10} y={16}>Wavefronts emitted one per source period (c = 1; lengths in rest wavelengths). Wavefronts received by the observer: {got}</text>
        <text className="ph-note-text" x={10} y={H - 10}>Frequency heard {fmt(r.fObserved)} Hz vs {fmt(dop.fs)} Hz emitted ({r.trend === "same" ? "unchanged" : r.trend})</text>
      </svg>
    </div>
  );
}
