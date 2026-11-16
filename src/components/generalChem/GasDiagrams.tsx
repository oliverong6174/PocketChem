import { useEffect, useMemo, useRef } from "react";
import { prettyFormula } from "../../utils/generalChem/formula";
import { formatSig } from "../../utils/generalChem/format";
import type { GasState, MixtureRow } from "../../utils/generalChem/gas";
import { useContainerWidth, usePrefersReducedMotion } from "../physics/simHooks";

const INK = "#0f172a";
const SLATE = "#475569";
const g = (v: number, s = 3) => formatSig(v, s);

/** A small deterministic generator so the particle layout is the same on every render and in screenshots. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Cool-to-warm colour from the temperature in kelvin (display aid only; the speed of the dots carries the same information). */
const tempColor = (T: number) => { const f = Math.max(0, Math.min(1, (T - 200) / 800)); return `hsl(${Math.round(215 - 215 * f)} 75% ${Math.round(42 + 4 * f)}%)`; };

const BASE_SPEED = 70; // px/s at 298.15 K; speed scales as sqrt(T): qualitative, not a simulation

/**
 * The container: gas volume sets the width of the gas region (a piston on the right), the amount sets the number of dots, the temperature sets
 * their speed and colour, and the pressure is shown by the gauge. A few animated dots are a schematic of collisions, not a statistical simulation.
 */
export function GasContainerDiagram({ state, initial, maxV, maxP, playing, caption }: { state: GasState; initial: GasState; maxV: number; maxP: number; playing: boolean; caption: string }) {
  const [wrapRef, avail] = useContainerWidth();
  const reduced = usePrefersReducedMotion();
  const W = Math.max(270, Math.min(avail, 760));
  const narrow = W < 520;
  const H = 290;
  const x0 = 16; const gaugeW = narrow ? 84 : 150;
  const fullW = Math.max(110, W - x0 - gaugeW - (narrow ? 26 : 40));
  const boxH = 170; const y0 = 38;
  const boxW = Math.max(36, fullW * Math.min(1, state.V / maxV));
  const ghostW = Math.max(36, fullW * Math.min(1, initial.V / maxV));
  const nRef = Math.max(state.n, initial.n);
  const count = Math.max(3, Math.min(40, Math.round((state.n / nRef) * 30)));
  const seeds = useMemo(() => { const r = mulberry32(2203); return Array.from({ length: 44 }, () => ({ u: r(), v: r(), a: r() * Math.PI * 2, s: 0.7 + 0.6 * r() })); }, []);
  const circles = useRef<Array<SVGCircleElement | null>>([]);
  const sim = useRef<{ x: number[]; y: number[]; vx: number[]; vy: number[] }>({ x: [], y: [], vx: [], vy: [] });
  const geom = useRef({ boxW, boxH });
  const speedRef = useRef(BASE_SPEED * Math.sqrt(state.T / 298.15));
  const speedPx = BASE_SPEED * Math.sqrt(state.T / 298.15);
  useEffect(() => { geom.current = { boxW, boxH }; speedRef.current = speedPx; });

  // (re)build the particle state when the number of dots changes; positions are clamped inside the current box
  useEffect(() => {
    const s = sim.current;
    for (let i = 0; i < 44; i += 1) {
      const sd = seeds[i];
      if (s.x[i] === undefined) { s.x[i] = 6 + sd.u * (boxW - 12); s.y[i] = 6 + sd.v * (boxH - 12); s.vx[i] = Math.cos(sd.a) * sd.s; s.vy[i] = Math.sin(sd.a) * sd.s; }
    }
  }, [seeds, boxW, boxH]);

  useEffect(() => {
    const place = () => {
      const s = sim.current; const { boxW: bw, boxH: bh } = geom.current;
      for (let i = 0; i < 44; i += 1) {
        const el = circles.current[i]; if (!el || s.x[i] === undefined) continue;
        s.x[i] = Math.min(bw - 5, Math.max(5, s.x[i])); s.y[i] = Math.min(bh - 5, Math.max(5, s.y[i]));
        el.setAttribute("cx", String(x0 + s.x[i])); el.setAttribute("cy", String(y0 + s.y[i]));
      }
    };
    place();
    if (reduced || !playing) return undefined;
    let raf = 0; let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = sim.current; const { boxW: bw, boxH: bh } = geom.current; const sp = speedRef.current;
      for (let i = 0; i < 44; i += 1) {
        if (s.x[i] === undefined) continue;
        s.x[i] += s.vx[i] * sp * dt; s.y[i] += s.vy[i] * sp * dt;
        if (s.x[i] < 5) { s.x[i] = 5; s.vx[i] = Math.abs(s.vx[i]); } else if (s.x[i] > bw - 5) { s.x[i] = bw - 5; s.vx[i] = -Math.abs(s.vx[i]); }
        if (s.y[i] < 5) { s.y[i] = 5; s.vy[i] = Math.abs(s.vy[i]); } else if (s.y[i] > bh - 5) { s.y[i] = bh - 5; s.vy[i] = -Math.abs(s.vy[i]); }
      }
      place();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, playing, boxW, boxH, count]);

  const gx = x0 + fullW + (narrow ? 34 : 56);
  const pFrac = Math.max(0.02, Math.min(1, state.P / maxP));
  const color = tempColor(state.T);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`${caption}. Gas container: volume ${g(state.V * 1000)} L, ${g(state.n)} mol, ${g(state.T)} K, pressure ${g(state.P / 1000)} kPa. ${count} dots stand for the gas; they are a schematic.`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <rect fill="none" height={boxH} stroke={SLATE} strokeDasharray="5 4" strokeWidth={1.2} width={ghostW} x={x0} y={y0} />
        <rect fill={color} fillOpacity={0.1} height={boxH} width={boxW} x={x0} y={y0} />
        <path d={`M${x0} ${y0} H${x0 + boxW} M${x0} ${y0 + boxH} H${x0 + boxW} M${x0} ${y0} V${y0 + boxH}`} fill="none" stroke={INK} strokeWidth={3} />
        <rect fill={INK} height={boxH + 8} width={7} x={x0 + boxW} y={y0 - 4} />
        <line stroke={INK} strokeWidth={3} x1={x0 + boxW + 7} x2={Math.min(x0 + fullW + 20, x0 + boxW + 36)} y1={y0 + boxH / 2} y2={y0 + boxH / 2} />
        {Array.from({ length: 44 }, (_, i) => (i < count ? <circle fill={color} key={i} r={4.5} ref={(el) => { circles.current[i] = el; }} stroke="#fff" strokeWidth={0.8} /> : <circle key={i} r={0} ref={(el) => { circles.current[i] = el; }} />))}
        <text className="ph-axis-label" x={x0} y={22}>{narrow ? `gas: ${count} dots (schematic)` : `gas (${count} dots stand for ${g(state.n)} mol; schematic)`}</text>
        <text className="ph-note-text" x={x0} y={y0 + boxH + 20}>V = {g(state.V * 1000)} L · T = {g(state.T)} K ({g(state.T - 273.15)} °C)</text>
        <text className="ph-note-text" x={x0} y={y0 + boxH + 38}>dashed outline: the starting volume</text>
        <text className="ph-note-text" x={x0} y={y0 + boxH + 56}>{narrow ? "dot speed rises with √T" : "dot speed rises with √T, so hotter gas looks faster"}</text>
        <text className="ph-axis-label" x={gx - 8} y={22}>pressure</text>
        <rect fill="none" height={boxH} stroke={INK} strokeWidth={1.5} width={26} x={gx} y={y0} />
        <rect fill={color} height={boxH * pFrac} width={26} x={gx} y={y0 + boxH * (1 - pFrac)} />
        {narrow ? null : <text className="ph-tick" x={gx + 34} y={y0 + 12}>{g(maxP / 1000)} kPa</text>}
        {narrow ? null : <text className="ph-tick" x={gx + 34} y={y0 + boxH}>0</text>}
        <text className="ph-axis-label" x={gx - 8} y={y0 + boxH + 20}>{g(state.P / 1000)} kPa</text>
        <text className="ph-note-text" x={gx - 8} y={y0 + boxH + 38}>{g(state.P / 101325)} atm</text>
      </svg>
    </div>
  );
}

const MIX_COLORS = ["#0b6a72", "#b45309", "#7c3aed", "#be123c", "#1d4ed8"];
/** Total pressure as a stacked bar: each gas's partial pressure is its own segment (Dalton's law), labelled in kPa. */
export function MixtureBar({ rows, totalPa }: { rows: MixtureRow[]; totalPa: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(320, Math.min(avail, 860));
  const left = 16; const right = W - 16; const barY = 40; const barH = 44;
  const starts = rows.map((_, k) => rows.slice(0, k).reduce((a, r) => a + (r.partialPa / totalPa) * (right - left), 0));
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Total pressure ${g(totalPa / 1000)} kPa is the sum of partial pressures: ${rows.map((r) => `${r.formula} ${g(r.partialPa / 1000)} kPa`).join(", ")}`} className="ph-svg" height={150 + rows.length * 0} role="img" viewBox={`0 0 ${W} 150`} width={W}>
        <rect className="ph-paper" height={150} width={W} x={0} y={0} />
        <text className="ph-axis-label" x={left} y={22}>total pressure {g(totalPa / 1000)} kPa = sum of the partial pressures</text>
        {rows.map((r, k) => {
          const w = (r.partialPa / totalPa) * (right - left); const x = left + starts[k];
          return (
            <g key={r.formula}>
              <rect fill={MIX_COLORS[k % MIX_COLORS.length]} height={barH} stroke="#fff" strokeWidth={1.5} width={Math.max(0, w)} x={x} y={barY} />
              {w > 54 ? <text className="ph-note-text" fill="#ffffff" textAnchor="middle" x={x + w / 2} y={barY + barH / 2 + 4}>{prettyFormula(r.formula)}</text> : null}
            </g>
          );
        })}
        {rows.map((r, k) => (
          <g key={`l-${r.formula}`}>
            <rect fill={MIX_COLORS[k % MIX_COLORS.length]} height={10} width={10} x={left + (k % 3) * ((right - left) / 3)} y={102 + Math.floor(k / 3) * 22} />
            <text className="ph-note-text" x={left + (k % 3) * ((right - left) / 3) + 16} y={111 + Math.floor(k / 3) * 22}>{prettyFormula(r.formula)} {g(r.partialPa / 1000)} kPa (x = {g(r.x)})</text>
          </g>
        ))}
        <line stroke={INK} x1={left} x2={left} y1={barY - 6} y2={barY + barH + 6} />
        <line stroke={INK} x1={right} x2={right} y1={barY - 6} y2={barY + barH + 6} />
      </svg>
    </div>
  );
}
