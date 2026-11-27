import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmt, formatSI, siScale } from "../../utils/physics/format";
import { niceTicks } from "../../utils/chartTicks";
import {
  circulation, currentDirectionWord, loopAxial, motionState, motionTrace, solenoidAxial, solenoidIdeal, wireFieldAt, WIRE_WORLD, norm3,
  type LoopInput, type MotionInput, type SolenoidInput, type Vec3, type Wire,
} from "../../utils/physics/magnetism";
import { wireGrid } from "../../utils/physics/magnetism";
import { directionWords } from "../../utils/physics/directionWords";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * Diagrams for the Magnetic fields laboratory. Convention (the same in every panel): x to the right, y up, positive z OUT of the
 * screen towards the viewer. A dot in a circle (⊙) means "out of the screen" (the tip of an arrow coming at you) and a cross in a
 * circle (⊗) means "into the screen" (the tail feathers of an arrow going away). Every number drawn comes from the magnetism engine.
 */

const INK = "#0f172a";
const POS = "#be123c", NEG = "#1d4ed8";

/** ⊙ (out of the screen, `out`) or ⊗ (into the screen). */
export function OutIn({ cx, cy, r, out, title }: { cx: number; cy: number; r: number; out: boolean; title?: string }) {
  const d = r * 0.62;
  return (
    <g className="mg-mark">
      {title ? <title>{title}</title> : null}
      <circle cx={cx} cy={cy} fill="#ffffff" r={r} stroke={INK} strokeWidth={2} />
      {out ? <circle cx={cx} cy={cy} fill={INK} r={Math.max(2.2, r * 0.3)} /> : <path d={`M${cx - d} ${cy - d} L${cx + d} ${cy + d} M${cx - d} ${cy + d} L${cx + d} ${cy - d}`} fill="none" stroke={INK} strokeLinecap="round" strokeWidth={2.2} />}
    </g>
  );
}

function viewPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }): { x: number; y: number } | null {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

// ---- straight wires ---------------------------------------------------------------------------------------------------------------

const WW = 700, WH = 490, WS = 700; // px per metre
const wx = (x: number) => WW / 2 + WS * x;
const wy = (y: number) => WH / 2 - WS * y;

export type WireDiagramProps = {
  wires: Wire[]; selected: string | null; probe: { x: number; y: number };
  onSelect: (id: string | null) => void; onMoveWire: (id: string, x: number, y: number) => void; onMoveProbe: (x: number, y: number) => void;
};
export function WireDiagram({ wires, selected, probe, onSelect, onMoveWire, onMoveProbe }: WireDiagramProps) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(WW);
  const k = Math.max(1, WW / avail);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ kind: "wire" | "probe"; id: string } | null>(null);
  const grid = useMemo(() => wireGrid(wires), [wires]);
  const logs = grid.map((g) => Math.log10(Math.max(g.magnitude, 1e-30)));
  const lo = logs.length ? Math.min(...logs) : 0, hi = logs.length ? Math.max(...logs) : 1;
  const f = wireFieldAt(wires, probe.x, probe.y);
  const snap = (v: number) => Math.round(v * 200) / 200;
  const cx = (x: number) => Math.min(WIRE_WORLD.xMax - 0.01, Math.max(WIRE_WORLD.xMin + 0.01, x));
  const cy = (y: number) => Math.min(WIRE_WORLD.yMax - 0.01, Math.max(WIRE_WORLD.yMin + 0.01, y));
  const farFromWires = (x: number, y: number, skip?: string) => wires.every((w) => w.id === skip || Math.hypot(w.x - x, w.y - y) >= 0.03);
  const farFromProbe = (x: number, y: number) => Math.hypot(probe.x - x, probe.y - y) >= 0.03;

  const begin = (e: PointerEvent<SVGGElement>, kind: "wire" | "probe", id: string) => { drag.current = { kind, id }; e.currentTarget.setPointerCapture(e.pointerId); if (kind === "wire") onSelect(id); e.preventDefault(); };
  const move = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current; if (!d || !svgRef.current) return;
    const p = viewPoint(svgRef.current, e); if (!p) return;
    const x = snap(cx((p.x - WW / 2) / WS)), y = snap(cy((WH / 2 - p.y) / WS));
    if (d.kind === "wire") { if (farFromWires(x, y, d.id) && farFromProbe(x, y)) onMoveWire(d.id, x, y); } else if (farFromWires(x, y)) onMoveProbe(x, y);
  };
  const end = (e: PointerEvent<SVGGElement>) => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  const keys = (e: KeyboardEvent<SVGGElement>, kind: "wire" | "probe", id: string, x: number, y: number) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === "Enter" || e.key === " ") { if (kind === "wire") onSelect(selected === id ? null : id); e.preventDefault(); return; }
    const m = d[e.key]; if (!m) return;
    e.preventDefault();
    const nx = snap(cx(x + m[0])), ny = snap(cy(y + m[1]));
    if (kind === "wire") { if (farFromWires(nx, ny, id) && farFromProbe(nx, ny)) onMoveWire(id, nx, ny); } else if (farFromWires(nx, ny)) onMoveProbe(nx, ny);
  };

  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Magnetic field of ${wires.length} straight wire${wires.length === 1 ? "" : "s"} along z, seen end-on. ${wires.map((w) => `Wire ${w.id}: ${fmt(Math.abs(w.I))} A ${currentDirectionWord(w.I)}`).join("; ")}. ${f.ok ? `At the probe B = ${formatSI(f.magnitude, "T")}.` : ""}`}
        className="ph-svg"
        height={Math.round(WH * Math.min(1, avail / WW))}
        ref={svgRef}
        role="group"
        viewBox={`0 0 ${WW} ${WH}`}
        width={Math.round(Math.min(WW, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={WH} width={WW} x={0} y={0} />
        {Array.from({ length: 11 }, (_, i) => -0.5 + i * 0.1).map((x) => <line className="ph-grid" key={`gx${x.toFixed(2)}`} x1={wx(x)} x2={wx(x)} y1={0} y2={WH} />)}
        {Array.from({ length: 8 }, (_, i) => -0.35 + i * 0.1).map((y) => <line className="ph-grid" key={`gy${y.toFixed(2)}`} x1={0} x2={WW} y1={wy(y)} y2={wy(y)} />)}
        {[-0.4, -0.2, 0.2, 0.4].map((x) => <text className="ph-tick" style={{ fontSize: 12 * k }} key={`t${x}`} textAnchor="middle" x={wx(x)} y={wy(0) + 15 * k}>{Math.round(x * 100)}</text>)}
        <text className="ph-note-text" style={{ fontSize: 12 * k }} textAnchor="end" x={WW - 6} y={WH - 6}>x, y in centimetres · z out of the screen</text>
        {grid.map((g, i) => {
          const m = Math.hypot(g.B.x, g.B.y) || 1;
          const dx = (g.B.x / m) * 24, dy = (-g.B.y / m) * 24;
          const t = hi > lo ? (Math.log10(Math.max(g.magnitude, 1e-30)) - lo) / (hi - lo) : 1;
          return <g key={i} opacity={0.28 + 0.72 * t}><Arrow kind="c" prefix={uid} width={1.8} x1={wx(g.x) - dx / 2} x2={wx(g.x) + dx / 2} y1={wy(g.y) - dy / 2} y2={wy(g.y) + dy / 2} /></g>;
        })}
        {wires.map((w) => {
          const x = wx(w.x), y = wy(w.y), sel = w.id === selected;
          const ccw = w.I > 0;
          const a = ccw ? 0.9 : -0.9; // arrowhead position on the dashed circle (radians, screen-up positive)
          const hx = x + 34 * Math.cos(a), hy = y - 34 * Math.sin(a);
          const tangent = ((ccw ? Math.PI / 2 : -Math.PI / 2) + a); // direction of travel (math angle)
          return (
            <g
              aria-label={`Wire ${w.id}: ${fmt(Math.abs(w.I))} A ${currentDirectionWord(w.I)}, field circulates ${circulation(w.I)}. At ${fmt(w.x * 100)}, ${fmt(w.y * 100)} cm. Drag or use the arrow keys to move it; Enter selects it.`}
              aria-pressed={sel}
              className={`ph-charge${sel ? " is-selected" : ""}`}
              key={w.id}
              onKeyDown={(e) => keys(e, "wire", w.id, w.x, w.y)}
              onPointerCancel={end}
              onPointerDown={(e) => begin(e, "wire", w.id)}
              onPointerMove={move}
              onPointerUp={end}
              role="button"
              tabIndex={0}
            >
              <circle className="ph-hit-ring" cx={x} cy={y} r={28} />
              {sel ? <circle className="ph-sel-ring" cx={x} cy={y} r={39} /> : null}
              <circle cx={x} cy={y} fill="none" r={34} stroke="#0b6a72" strokeDasharray="5 4" strokeWidth={1.6} />
              <path className="ph-fline-head" d="M-6 -5 L6 0 L-6 5 z" fill="#0b6a72" transform={`translate(${hx} ${hy}) rotate(${(-tangent * 180) / Math.PI})`} />
              <OutIn cx={x} cy={y} out={w.I > 0} r={13} title={`Current ${currentDirectionWord(w.I)}`} />
              <text className="ph-charge-label" style={{ fontSize: 12 * k }} x={x + 20} y={y - 30}>{w.id}: {fmt(Math.abs(w.I))} A {w.I > 0 ? "out ⊙" : "in ⊗"}</text>
            </g>
          );
        })}
        <g
          aria-label={`Probe at ${fmt(probe.x * 100)}, ${fmt(probe.y * 100)} cm. Drag or use the arrow keys to move it.`}
          className="ph-probe"
          onKeyDown={(e) => keys(e, "probe", "probe", probe.x, probe.y)}
          onPointerCancel={end}
          onPointerDown={(e) => begin(e, "probe", "probe")}
          onPointerMove={move}
          onPointerUp={end}
          role="button"
          tabIndex={0}
        >
          <circle className="ph-hit-ring" cx={wx(probe.x)} cy={wy(probe.y)} r={24} />
          <circle className="ph-probe-dot" cx={wx(probe.x)} cy={wy(probe.y)} r={6.5} />
          <text className="ph-probe-label" style={{ fontSize: 13 * k }} x={wx(probe.x) + 10} y={wy(probe.y) + 18}>P</text>
        </g>
        {f.ok && f.magnitude > 0 ? (
          <g pointerEvents="none">
            <Arrow kind="v" prefix={uid} width={3.6} x1={wx(probe.x)} x2={wx(probe.x) + (f.B.x / f.magnitude) * 64} y1={wy(probe.y)} y2={wy(probe.y) - (f.B.y / f.magnitude) * 64} />
            <text className="ph-vec-label v" style={{ fontSize: 14 * k }} x={wx(probe.x) + (f.B.x / f.magnitude) * 72 + 4} y={wy(probe.y) - (f.B.y / f.magnitude) * 72}>B</text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ---- loop and solenoid on the axis ------------------------------------------------------------------------------------------------

type AxisFrameProps = { children: (c: { X: (x: number) => number; s: number; Hd: number }) => ReactNode; xr: number; label: string; k: number; uid: string; avail: number };
const AW = 700, AH = 330, AM = 36;
/** Greedy word wrap for the notes drawn inside a diagram: on a narrow screen the text is larger relative to the frame, so a long sentence must break instead of running off the edge. */
function wrapNote(text: string, k: number, width: number): { lines: string[]; size: number } {
  const size = 12 * Math.min(k, 1.15);
  const maxChars = Math.max(20, Math.floor(width / (0.53 * size)));
  const words = text.split(" "); const lines: string[] = []; let cur = "";
  for (const w of words) { if (cur && (cur + " " + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  if (cur) lines.push(cur);
  return { lines, size };
}
function NoteBlock({ text, k, x, y, width, anchor = "start", upward = false }: { text: string; k: number; x: number; y: number; width: number; anchor?: "start" | "end"; upward?: boolean }) {
  const { lines, size } = wrapNote(text, k, width);
  const lh = size * 1.3;
  return <text className="ph-note-text ph-halo" style={{ fontSize: size }} textAnchor={anchor} x={x} y={upward ? y - (lines.length - 1) * lh : y}>{lines.map((l, i) => <tspan dy={i === 0 ? 0 : lh} key={i} x={x}>{l}</tspan>)}</text>;
}
function AxisFrame({ children, xr, label, k, uid, avail }: AxisFrameProps) {
  const s = (AW - 2 * AM) / (2 * xr);
  const X = (x: number) => AW / 2 + s * x;
  const scale = siScale(xr, "m");
  const ticks = niceTicks(-xr / scale.factor, xr / scale.factor, 6);
  return (
    <svg aria-label={label} className="ph-svg" height={Math.round(AH * Math.min(1, avail / AW))} role="img" viewBox={`0 0 ${AW} ${AH}`} width={Math.round(Math.min(AW, avail))}>
      <ArrowDefs prefix={uid} />
      <rect className="ph-paper" height={AH} width={AW} x={0} y={0} />
      <line className="ph-axis-line" x1={AM / 2} x2={AW - AM / 2} y1={AH / 2} y2={AH / 2} />
      {ticks.map((t) => <g key={t}><line className="ph-grid" x1={X(t * scale.factor)} x2={X(t * scale.factor)} y1={AH / 2 - 5} y2={AH / 2 + 5} /><text className="ph-tick" style={{ fontSize: 12 * k }} textAnchor="middle" x={X(t * scale.factor)} y={AH - 8}>{t}</text></g>)}
      <text className="ph-note-text" style={{ fontSize: 12 * k }} textAnchor="end" x={AW - 8} y={AH - 8 - 14 * k}>axis position x ({scale.unit})</text>
      {children({ X, s, Hd: AH })}
    </svg>
  );
}

function AxisArrows({ X, Hd, xs, B, uid, k, axisX, current }: { X: (x: number) => number; Hd: number; xs: number[]; B: (x: number) => number; uid: string; k: number; axisX: number; current: number }) {
  const vals = xs.map((x) => Math.abs(B(x))).filter((b) => b > 0);
  const lo = vals.length ? Math.log10(Math.min(...vals)) : 0, hi = vals.length ? Math.log10(Math.max(...vals)) : 1;
  return (
    <g>
      {xs.map((x) => {
        const b = B(x);
        if (b === 0) return null;
        const t = hi > lo ? (Math.log10(Math.abs(b)) - lo) / (hi - lo) : 1;
        const d = Math.sign(b) * 17;
        return <g key={x} opacity={0.3 + 0.7 * t}><Arrow kind="c" prefix={uid} width={2} x1={X(x) - d} x2={X(x) + d} y1={Hd / 2 - 0} y2={Hd / 2} /></g>;
      })}
      {current !== 0 ? (
        <g>
          <circle cx={X(axisX)} cy={Hd / 2} fill="#0b6a72" r={5} stroke="#fff" strokeWidth={2} />
          <Arrow kind="v" prefix={uid} width={3.6} x1={X(axisX)} x2={X(axisX) + Math.sign(current) * 56} y1={Hd / 2 - 20} y2={Hd / 2 - 20} />
          <text className="ph-vec-label v ph-halo" style={{ fontSize: 14 * Math.min(k, 1.3) }} textAnchor="middle" x={X(axisX) + Math.sign(current) * 28} y={Hd / 2 + 22}>B = {formatSI(Math.abs(current), "T")}</text>
        </g>
      ) : null}
    </g>
  );
}

export function LoopDiagram({ p, axisX }: { p: LoopInput; axisX: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(AW);
  const k = Math.max(1, AW / avail);
  const xr = Math.max(3 * p.a, Math.abs(axisX) * 1.2, 0.1);
  const xs = Array.from({ length: 11 }, (_, i) => -xr * 0.9 + (i * xr * 1.8) / 10);
  const cur = loopAxial(p, axisX);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <AxisFrame avail={avail} k={k} label={`Current loop of radius ${formatSI(p.a, "m")} seen from the side, axis along x. The current is ${p.I > 0 ? "counter-clockwise" : "clockwise"} as seen from +x; the axial field is ${formatSI(Math.abs(cur), "T")} at x = ${fmt(axisX)} m, pointing ${cur >= 0 ? "along +x" : "along −x"}.`} uid={uid} xr={xr}>
        {({ X, s, Hd }) => {
          const r = p.a * s;
          return (
            <>
              <ellipse cx={X(0)} cy={Hd / 2} fill="rgba(11,106,114,0.07)" rx={Math.max(6, r * 0.28)} ry={r} stroke="#475569" strokeDasharray="4 3" strokeWidth={1.6} />
              <AxisArrows Hd={Hd} X={X} axisX={axisX} current={cur} k={k} uid={uid} B={(x) => loopAxial(p, x)} xs={xs} />
              <OutIn cx={X(0)} cy={Hd / 2 - r} out={p.I > 0} r={11} title={`Current ${p.I > 0 ? "out of" : "into"} the screen at the top of the loop`} />
              <OutIn cx={X(0)} cy={Hd / 2 + r} out={p.I < 0} r={11} title={`Current ${p.I > 0 ? "into" : "out of"} the screen at the bottom of the loop`} />
              <NoteBlock k={k} text={`Loop edge-on: the wire crosses the screen at the top (${p.I > 0 ? "⊙ out" : "⊗ in"}) and bottom (${p.I > 0 ? "⊗ in" : "⊙ out"}). I ${p.I > 0 ? ">" : "<"} 0: counter-clockwise as seen from +x${p.I > 0 ? "" : " reversed (clockwise)"}; B inside ${p.I > 0 ? "along +x" : "along −x"}.`} width={AW - 2 * AM} x={AM} y={18 * Math.min(k, 1.15) + 6} />
            </>
          );
        }}
      </AxisFrame>
    </div>
  );
}

export function SolenoidDiagram({ p, axisX }: { p: SolenoidInput; axisX: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(AW);
  const k = Math.max(1, AW / avail);
  const xr = Math.max(p.L * 0.8, Math.abs(axisX) * 1.2, 0.1);
  const xs = Array.from({ length: 13 }, (_, i) => -xr * 0.92 + (i * xr * 1.84) / 12);
  const cur = solenoidAxial(p, axisX) * Math.sign(p.I);
  const exact = (x: number) => solenoidAxial(p, x) * Math.sign(p.I);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <AxisFrame avail={avail} k={k} label={`Solenoid of length ${formatSI(p.L, "m")} seen in cross-section, ${fmt(p.n)} turns per metre, ${fmt(Math.abs(p.I))} A. Ideal interior field ${formatSI(solenoidIdeal(p), "T")}; on the axis at x = ${fmt(axisX)} m the exact field is ${formatSI(Math.abs(cur), "T")}.`} uid={uid} xr={xr}>
        {({ X, s, Hd }) => {
          const left = X(-p.L / 2), right = X(p.L / 2);
          const rr = Math.max(p.R * s, 34);
          const turns = Math.min(14, Math.max(3, Math.round(p.n * p.L)));
          const marks = Array.from({ length: turns }, (_, i) => left + ((i + 0.5) * (right - left)) / turns);
          return (
            <>
              <rect fill="rgba(11,106,114,0.07)" height={2 * rr} stroke="#475569" strokeWidth={1.6} width={right - left} x={left} y={Hd / 2 - rr} />
              <AxisArrows Hd={Hd} X={X} axisX={axisX} current={cur} k={k} uid={uid} B={exact} xs={xs} />
              {marks.map((x) => (
                <g key={x}>
                  <OutIn cx={x} cy={Hd / 2 - rr} out={p.I > 0} r={7.5} />
                  <OutIn cx={x} cy={Hd / 2 + rr} out={p.I < 0} r={7.5} />
                </g>
              ))}
              <NoteBlock k={k} text={`Winding cross-section (about ${turns} of ${fmt(p.n * p.L)} turns drawn)${p.R * s < 34 ? "; radius exaggerated for visibility" : ""}. Arrows: exact on-axis field; it falls to about half at each end.`} width={AW - 2 * AM} x={AM} y={18 * Math.min(k, 1.15) + 6} />
            </>
          );
        }}
      </AxisFrame>
    </div>
  );
}

// ---- vectors in three dimensions (Lorentz force, conductor) ----------------------------------------------------------------------------

export type VecItem = { id: string; label: string; v: Vec3; kind: "v" | "a" | "c" | "i" | "k"; note?: string };
const VW = 700, VH = 400;

/**
 * Vectors in the screen convention. The in-plane (x, y) part is drawn as an arrow whose length is 150 px times the fraction of the
 * vector that lies in the plane; the out-of-screen (z) part is shown by a ⊙ or ⊗ whose size grows with the z fraction. Lengths are
 * scaled separately for each vector, because a force and a field cannot share a unit.
 */
export function VectorDiagram({ items, title }: { items: VecItem[]; title: string }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(VW);
  const k = Math.max(1, VW / avail);
  const cx = VW / 2, cy = VH / 2 + 10;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`${title}. ${items.map((i) => `${i.label} points ${directionWords(i.v)}`).join("; ")}.`} className="ph-svg" height={Math.round(VH * Math.min(1, avail / VW))} role="img" viewBox={`0 0 ${VW} ${VH}`} width={Math.round(Math.min(VW, avail))}>
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={VH} width={VW} x={0} y={0} />
        <line className="ph-grid" x1={20} x2={VW - 20} y1={cy} y2={cy} />
        <line className="ph-grid" x1={cx} x2={cx} y1={20} y2={VH - 20} />
        <text className="ph-axis-label" style={{ fontSize: 13 * k }} x={VW - 30} y={cy - 6}>x</text>
        <text className="ph-axis-label" style={{ fontSize: 13 * k }} x={cx + 8} y={32}>y</text>
        <OutIn cx={VW - 40} cy={VH - 34} out r={9} title="z axis, out of the screen" />
        <text className="ph-axis-label" style={{ fontSize: 13 * k }} x={VW - 56} y={VH - 30} textAnchor="end">z (out of the screen)</text>
        {items.map((it, idx) => {
          const m = norm3(it.v);
          if (m === 0) return null;
          const fx = Math.hypot(it.v.x, it.v.y) / m, fz = it.v.z / m;
          const len = 150 * fx;
          const ex = cx + (it.v.x / m) * 150, ey = cy - (it.v.y / m) * 150;
          const gx = len > 14 ? ex : cx, gy = len > 14 ? ey : cy;
          return (
            <g key={it.id}>
              <Arrow kind={it.kind} prefix={uid} width={3.6} x1={cx} x2={ex} y1={cy} y2={ey} title={`${it.label}: ${directionWords(it.v)}`} />
              {Math.abs(fz) > 1e-6 ? <OutIn cx={gx + (len > 14 ? 0 : (idx - 1.5) * 34)} cy={gy + (len > 14 ? -22 : 0)} out={fz > 0} r={9 + 15 * Math.abs(fz)} title={`${it.label} has a ${fz > 0 ? "positive (out of the screen)" : "negative (into the screen)"} z component`} /> : null}
              <text className={`ph-vec-label ph-halo ${it.kind === "a" ? "a" : "v"}`} style={{ fontSize: 15 * k }} textAnchor={len > 14 ? (it.v.x / m < -0.3 ? "end" : it.v.x / m > 0.3 ? "start" : "middle") : "start"} x={len > 14 ? ex + (it.v.x / m) * 16 : cx + 10 + (idx - 1.5) * 34} y={len > 14 ? ey - (it.v.y / m) * 16 + (it.v.y / m < -0.3 ? 12 : it.v.y / m > 0.3 ? -4 : 5) : cy - 12 - (20 + 15 * Math.abs(fz))}>{it.label}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} fill={INK} r={4} />
      </svg>
    </div>
  );
}

// ---- particle motion ------------------------------------------------------------------------------------------------------------------

type Pt = { x: number; y: number };
function fitView(points: Pt[], W: number, H: number, mL: number, mR: number, mT: number, mB: number) {
  let x0 = Math.min(...points.map((p) => p.x)), x1 = Math.max(...points.map((p) => p.x));
  let y0 = Math.min(...points.map((p) => p.y)), y1 = Math.max(...points.map((p) => p.y));
  const long = Math.max(x1 - x0, y1 - y0, 1e-30);
  const nx = Math.max(x1 - x0, long * 0.3), ny = Math.max(y1 - y0, long * 0.3);
  x0 -= (nx - (x1 - x0)) / 2; x1 = x0 + nx; y0 -= (ny - (y1 - y0)) / 2; y1 = y0 + ny;
  const px = nx * 0.1, py = ny * 0.1; x0 -= px; x1 += px; y0 -= py; y1 += py;
  const pw = W - mL - mR, ph = H - mT - mB;
  const sc = Math.min(pw / (x1 - x0), ph / (y1 - y0));
  const ox = mL + (pw - sc * (x1 - x0)) / 2, oy = mT + (ph - sc * (y1 - y0)) / 2;
  return { X: (x: number) => ox + (x - x0) * sc, Y: (y: number) => oy + (y1 - y) * sc, sc, x0, x1, y0, y1, pw, ph };
}

const MW = 700, MH = 400;
export function MotionTopView({ p, t }: { p: MotionInput; t: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(MW);
  const k = Math.max(1, MW / avail);
  const trace = useMemo(() => motionTrace(p, 400), [p]);
  const now = motionState(p, t);
  const view = useMemo(() => fitView(trace.map((s) => ({ x: s.x, y: s.y })), MW, MH, 64, 24, 24, 46), [trace]);
  const { X, Y } = view;
  const scale = siScale(Math.max(Math.abs(view.x0), Math.abs(view.x1), Math.abs(view.y0), Math.abs(view.y1)), "m");
  const xt = niceTicks(view.x0 / scale.factor, view.x1 / scale.factor, 5), yt = niceTicks(view.y0 / scale.factor, view.y1 / scale.factor, 4);
  const out = p.Bz > 0;
  const vmag = Math.hypot(now.vx, now.vy);
  const fmag = Math.hypot(now.fx, now.fy);
  const vmax = Math.max(...trace.map((s) => Math.hypot(s.vx, s.vy)), 1e-30);
  const gx = [0.12, 0.3, 0.48, 0.66, 0.84], gy = [0.14, 0.4, 0.66, 0.9];
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Top view of a ${p.q > 0 ? "positive" : "negative"} particle in a magnetic field ${out ? "out of" : "into"} the screen of ${formatSI(Math.abs(p.Bz), "T")}; at ${formatSI(t, "s")} it is at (${formatSI(now.x, "m")}, ${formatSI(now.y, "m")}) with speed ${formatSI(now.speed, "m/s")}`}
        className="ph-svg"
        height={Math.round(MH * Math.min(1, avail / MW))}
        role="img"
        viewBox={`0 0 ${MW} ${MH}`}
        width={Math.round(Math.min(MW, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={MH} width={MW} x={0} y={0} />
        {xt.map((v) => <g key={`x${v}`}><line className="ph-grid" x1={X(v * scale.factor)} x2={X(v * scale.factor)} y1={24} y2={MH - 46} /><text className="ph-tick" style={{ fontSize: 12 * k }} textAnchor="middle" x={X(v * scale.factor)} y={MH - 46 + 16 * k}>{v}</text></g>)}
        {yt.map((v) => <g key={`y${v}`}><line className="ph-grid" x1={64} x2={MW - 24} y1={Y(v * scale.factor)} y2={Y(v * scale.factor)} /><text className="ph-tick" style={{ fontSize: 12 * k }} textAnchor="end" x={58} y={Y(v * scale.factor) + 4}>{v}</text></g>)}
        <text className="ph-axis-label" style={{ fontSize: 13 * k }} textAnchor="middle" x={64 + view.pw / 2} y={MH - 6}>x ({scale.unit})</text>
        <text className="ph-axis-label" style={{ fontSize: 13 * k }} textAnchor="middle" transform={`rotate(-90 14 ${24 + view.ph / 2})`} x={14} y={24 + view.ph / 2}>y ({scale.unit})</text>
        {gx.flatMap((fx) => gy.map((fy) => <g key={`${fx}${fy}`} opacity={0.4}><OutIn cx={64 + view.pw * fx} cy={24 + view.ph * fy} out={out} r={7} /></g>))}
        <polyline className="ph-path-future" fill="none" points={trace.map((s) => `${X(s.x).toFixed(1)},${Y(s.y).toFixed(1)}`).join(" ")} />
        <polyline className="ph-path-past" fill="none" points={trace.filter((s) => s.t <= t + 1e-30).concat([now]).map((s) => `${X(s.x).toFixed(1)},${Y(s.y).toFixed(1)}`).join(" ")} />
        <circle className="ph-start" cx={X(p.x0)} cy={Y(p.y0)} r={5} />
        <circle cx={X(now.x)} cy={Y(now.y)} fill={p.q > 0 ? POS : NEG} r={9} stroke="#fff" strokeWidth={2.5} />
        <text className="ph-charge-sign small" textAnchor="middle" x={X(now.x)} y={Y(now.y) + 5}>{p.q > 0 ? "+" : "−"}</text>
        {vmag > 0 ? <g><Arrow kind="v" prefix={uid} width={3.2} x1={X(now.x)} x2={X(now.x) + (now.vx / vmax) * 70} y1={Y(now.y)} y2={Y(now.y) - (now.vy / vmax) * 70} /><text className="ph-vec-label v" style={{ fontSize: 14 * k }} x={X(now.x) + (now.vx / vmax) * 78 + 3} y={Y(now.y) - (now.vy / vmax) * 78}>v</text></g> : null}
        {fmag > 0 ? <g><Arrow kind="a" prefix={uid} width={3.2} x1={X(now.x)} x2={X(now.x) + (now.fx / fmag) * 46} y1={Y(now.y)} y2={Y(now.y) - (now.fy / fmag) * 46} /><text className="ph-vec-label a" style={{ fontSize: 14 * k }} x={X(now.x) + (now.fx / fmag) * 54 + 3} y={Y(now.y) - (now.fy / fmag) * 54 + 12}>F</text></g> : null}
        <text className="ph-note-text" style={{ fontSize: 12 * k }} x={72} y={40}>B {out ? "out of the screen ⊙" : "into the screen ⊗"}, {formatSI(Math.abs(p.Bz), "T")}</text>
      </svg>
    </div>
  );
}

/** Cavalier (oblique) projection of the 3-D path: z comes out of the screen along the diagonal towards the lower left. */
export function MotionOblique({ p, t }: { p: MotionInput; t: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(MW);
  const k = Math.max(1, MW / avail);
  const trace = useMemo(() => motionTrace(p, 400), [p]);
  const now = motionState(p, t);
  const c = 0.5 * Math.SQRT1_2; // z contributes (−c·z, −c·z) to (x, y)
  const proj = (s: { x: number; y: number; z: number }): Pt => ({ x: s.x - c * s.z, y: s.y - c * s.z });
  const pts = useMemo(() => trace.map(proj), [trace]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useMemo(() => fitView(pts, MW, MH, 24, 24, 24, 24), [pts]);
  const { X, Y } = view;
  const here = proj(now);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Oblique 3-D view of the path. ${p.vz === 0 ? "With no velocity along the field the path is a flat circle." : `The velocity component along the field, ${formatSI(p.vz, "m/s")}, makes a helix.`}`}
        className="ph-svg"
        height={Math.round(MH * Math.min(1, avail / MW))}
        role="img"
        viewBox={`0 0 ${MW} ${MH}`}
        width={Math.round(Math.min(MW, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={MH} width={MW} x={0} y={0} />
        <g transform="translate(70 340)">
          <Arrow kind="k" prefix={uid} width={2.2} x1={0} x2={46} y1={0} y2={0} /><text className="ph-axis-label" style={{ fontSize: 13 * k }} x={52} y={4}>x</text>
          <Arrow kind="k" prefix={uid} width={2.2} x1={0} x2={0} y1={0} y2={-46} /><text className="ph-axis-label" style={{ fontSize: 13 * k }} x={-4} y={-52}>y</text>
          <Arrow kind="k" prefix={uid} width={2.2} x1={0} x2={-32} y1={0} y2={32} /><text className="ph-axis-label" style={{ fontSize: 13 * k }} x={-36} y={48}>z (out)</text>
        </g>
        <polyline className="ph-path-future" fill="none" points={pts.map((q) => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(" ")} />
        <polyline className="ph-path-past" fill="none" points={trace.filter((s) => s.t <= t + 1e-30).map(proj).concat([here]).map((q) => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(" ")} />
        <circle className="ph-start" cx={X(proj({ x: p.x0, y: p.y0, z: p.z0 }).x)} cy={Y(proj({ x: p.x0, y: p.y0, z: p.z0 }).y)} r={5} />
        <circle cx={X(here.x)} cy={Y(here.y)} fill={p.q > 0 ? POS : NEG} r={8} stroke="#fff" strokeWidth={2.5} />
        <NoteBlock anchor="end" k={k} text="Not to scale in z: the projection only shows that the path advances along the field." upward width={MW - 24} x={MW - 12} y={MH - 10} />
      </svg>
    </div>
  );
}
