import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { fmt, formatSI, siScale } from "../../utils/physics/format";
import {
  equipotential, fieldAt, fieldGrid, fieldLine, fieldLineSeeds, forceOnTest, uniformState, uniformTrace, WORLD,
  type PointCharge, type UniformFieldInput,
} from "../../utils/physics/electrostatics";
import { niceTicks } from "../../utils/chartTicks";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * Diagrams for the Electric fields laboratory. Coordinates: x to the right, y up (so screen y = −world y). Every arrow, contour and
 * line is computed from the same fieldAt / potentialAt functions as the readouts. Arrow length is NOT the field strength (the
 * arrows are drawn at one length so directions stay legible); the shade carries the strength, and the page says so.
 */

const W = 700, H = 490, S = 70;
const px = (x: number) => W / 2 + S * x;
const py = (y: number) => H / 2 - S * y;
const POS = "#be123c", NEG = "#1d4ed8";

function viewPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }): { x: number; y: number } | null {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(m.inverse());
  return { x: (p.x - W / 2) / S, y: (H / 2 - p.y) / S };
}
const snap = (v: number) => Math.round(v * 20) / 20;
const clampX = (x: number) => Math.min(WORLD.xMax - 0.05, Math.max(WORLD.xMin + 0.05, x));
const clampY = (y: number) => Math.min(WORLD.yMax - 0.05, Math.max(WORLD.yMin + 0.05, y));
const nC = (q: number) => { const a = Math.abs(q); return `${q < 0 ? "−" : "+"}${a >= 1e-6 ? `${Number((a * 1e6).toPrecision(3))} µC` : `${Number((a * 1e9).toPrecision(3))} nC`}`; };

export type EfieldDiagramProps = {
  charges: PointCharge[]; selected: string | null; probe: { x: number; y: number }; qTest: number;
  showArrows: boolean; showLines: boolean; levels: number[];
  onSelect: (id: string | null) => void;
  onMoveCharge: (id: string, x: number, y: number) => void;
  onMoveProbe: (x: number, y: number) => void;
};

export function EfieldDiagram({ charges, selected, probe, qTest, showArrows, showLines, levels, onSelect, onMoveCharge, onMoveProbe }: EfieldDiagramProps) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(W);
  const k = Math.max(1, W / avail); // keeps text at least ~12 px on a narrow screen
  const fs = (n: number) => n * k;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ kind: "charge" | "probe"; id: string } | null>(null);

  const grid = useMemo(() => fieldGrid(charges), [charges]);
  const lines = useMemo(() => (showLines ? fieldLineSeeds(charges).map((s) => fieldLine(charges, s.start, s.dir)) : []), [charges, showLines]);
  const contours = useMemo(() => levels.map((level) => ({ level, segs: equipotential(charges, level) })), [charges, levels]);
  const logs = grid.map((g) => Math.log10(Math.max(g.magnitude, 1e-30)));
  const lo = logs.length ? Math.min(...logs) : 0, hi = logs.length ? Math.max(...logs) : 1;
  const field = fieldAt(charges, probe);
  const F = field.ok ? forceOnTest(field.E, qTest) : { x: 0, y: 0 };
  const eMag = field.ok ? field.magnitude : 0;

  const begin = (e: PointerEvent<SVGGElement>, kind: "charge" | "probe", id: string) => {
    drag.current = { kind, id };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (kind === "charge") onSelect(id);
    e.preventDefault();
  };
  const move = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    const p = viewPoint(svgRef.current, e);
    if (!p) return;
    const x = snap(clampX(p.x)), y = snap(clampY(p.y));
    // keep the configuration valid: never drop a charge on the probe or on another charge
    if (d.kind === "charge") {
      if (Math.hypot(x - probe.x, y - probe.y) < 0.12 || charges.some((c) => c.id !== d.id && Math.hypot(x - c.x, y - c.y) < 0.12)) return;
      onMoveCharge(d.id, x, y);
    } else {
      if (charges.some((c) => Math.hypot(x - c.x, y - c.y) < 0.12)) return;
      onMoveProbe(x, y);
    }
  };
  const end = (e: PointerEvent<SVGGElement>) => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  const keys = (e: KeyboardEvent<SVGGElement>, kind: "charge" | "probe", id: string, x: number, y: number) => {
    const step = e.shiftKey ? 0.5 : 0.1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === "Enter" || e.key === " ") { if (kind === "charge") onSelect(selected === id ? null : id); e.preventDefault(); return; }
    if (e.key === "Escape") { onSelect(null); return; }
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    const nx = snap(clampX(x + m[0])), ny = snap(clampY(y + m[1]));
    if (kind === "charge") {
      if (Math.hypot(nx - probe.x, ny - probe.y) < 0.12 || charges.some((c) => c.id !== id && Math.hypot(nx - c.x, ny - c.y) < 0.12)) return;
      onMoveCharge(id, nx, ny);
    } else {
      if (charges.some((c) => Math.hypot(nx - c.x, ny - c.y) < 0.12)) return;
      onMoveProbe(nx, ny);
    }
  };

  const arrowLen = 22;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Electric field of ${charges.length} point charge${charges.length === 1 ? "" : "s"}; probe at (${fmt(probe.x)}, ${fmt(probe.y)}) m where the field is ${formatSI(eMag, "N/C")}`}
        className="ph-svg"
        height={Math.round(H * Math.min(1, avail / W))}
        ref={svgRef}
        role="group"
        viewBox={`0 0 ${W} ${H}`}
        width={Math.round(Math.min(W, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {Array.from({ length: 11 }, (_, i) => WORLD.xMin + i).map((x) => <line className="ph-grid" key={`gx${x}`} x1={px(x)} x2={px(x)} y1={0} y2={H} />)}
        {Array.from({ length: 8 }, (_, i) => WORLD.yMin + i).map((y) => <line className="ph-grid" key={`gy${y}`} x1={0} x2={W} y1={py(y)} y2={py(y)} />)}
        <line className="ph-axis-line" x1={0} x2={W} y1={py(0)} y2={py(0)} />
        <line className="ph-axis-line" x1={px(0)} x2={px(0)} y1={0} y2={H} />
        {[-4, -2, 2, 4].map((x) => <text className="ph-tick" style={{ fontSize: fs(12) }} key={`tx${x}`} textAnchor="middle" x={px(x)} y={py(0) + fs(15)}>{x}</text>)}
        {[-2, 2].map((y) => <text className="ph-tick" style={{ fontSize: fs(12) }} key={`ty${y}`} x={px(0) + 4} y={py(y) - 3}>{y}</text>)}
        <text className="ph-note-text" style={{ fontSize: fs(12) }} textAnchor="end" x={W - 6} y={H - 6}>x, y in metres</text>

        {contours.map((c, ci) => (
          <g key={c.level}>
            {c.segs.map((s, i) => <line className="ph-contour" key={i} x1={px(s[0])} x2={px(s[2])} y1={py(s[1])} y2={py(s[3])} />)}
            {c.segs.length ? (() => { const s = c.segs[Math.min(c.segs.length - 1, Math.floor(c.segs.length * ((0.5 + 0.21 * ci) % 1)))]; return <text className="ph-contour-label" style={{ fontSize: fs(12) }} x={px((s[0] + s[2]) / 2) + 4} y={py((s[1] + s[3]) / 2) - 4}>{formatSI(c.level, "V")}</text>; })() : null}
          </g>
        ))}

        {lines.map((l, i) => {
          const m = Math.floor(l.points.length / 2);
          const a = l.points[m], b = l.points[Math.min(m + 1, l.points.length - 1)];
          const ang = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
          return (
            <g key={i}>
              <polyline className="ph-fline" points={l.points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")} />
              {l.points.length > 4 ? <path className="ph-fline-head" d="M-5 -4 L5 0 L-5 4 z" transform={`translate(${px(a.x)} ${py(a.y)}) rotate(${ang})`} /> : null}
            </g>
          );
        })}

        {showArrows ? (
          <g>
            {grid.map((g, i) => {
              const m = Math.hypot(g.E.x, g.E.y) || 1;
              const dx = (g.E.x / m) * arrowLen, dy = (-g.E.y / m) * arrowLen;
              const t = hi > lo ? (Math.log10(Math.max(g.magnitude, 1e-30)) - lo) / (hi - lo) : 1;
              return (
                <g key={i} opacity={0.3 + 0.7 * t}>
                  <Arrow kind="c" prefix={uid} width={1.8} x1={px(g.x) - dx / 2} x2={px(g.x) + dx / 2} y1={py(g.y) - dy / 2} y2={py(g.y) + dy / 2} />
                </g>
              );
            })}
          </g>
        ) : null}

        {charges.map((c) => {
          const sel = c.id === selected;
          const x = px(c.x), y = py(c.y);
          return (
            <g
              aria-label={`Charge ${c.id}, ${nC(c.q)} at (${fmt(c.x)}, ${fmt(c.y)}) m. Drag or use the arrow keys to move it; Enter selects it.`}
              aria-pressed={sel}
              className={`ph-charge${sel ? " is-selected" : ""}`}
              key={c.id}
              onKeyDown={(e) => keys(e, "charge", c.id, c.x, c.y)}
              onPointerCancel={end}
              onPointerDown={(e) => begin(e, "charge", c.id)}
              onPointerMove={move}
              onPointerUp={end}
              role="button"
              tabIndex={0}
            >
              <circle className="ph-hit-ring" cx={x} cy={y} r={26} />
              {sel ? <circle className="ph-sel-ring" cx={x} cy={y} r={21} /> : null}
              <circle cx={x} cy={y} fill={c.q > 0 ? POS : NEG} r={14} stroke="#ffffff" strokeWidth={2.5} />
              <text className="ph-charge-sign" textAnchor="middle" x={x} y={y + 6}>{c.q > 0 ? "+" : "−"}</text>
              <text className="ph-charge-label" style={{ fontSize: fs(12) }} x={x + 18} y={y - 14}>{c.id} {nC(c.q)}</text>
            </g>
          );
        })}

        <g
          aria-label={`Probe at (${fmt(probe.x)}, ${fmt(probe.y)}) m. Drag or use the arrow keys to move it.`}
          className="ph-probe"
          onKeyDown={(e) => keys(e, "probe", "probe", probe.x, probe.y)}
          onPointerCancel={end}
          onPointerDown={(e) => begin(e, "probe", "probe")}
          onPointerMove={move}
          onPointerUp={end}
          role="button"
          tabIndex={0}
        >
          <circle className="ph-hit-ring" cx={px(probe.x)} cy={py(probe.y)} r={24} />
          <circle className="ph-probe-dot" cx={px(probe.x)} cy={py(probe.y)} r={6.5} />
          <text className="ph-probe-label" style={{ fontSize: fs(13) }} x={px(probe.x) + 10} y={py(probe.y) + 18}>P</text>
        </g>
        {field.ok && eMag > 0 ? (
          <g pointerEvents="none">
            <Arrow kind="v" prefix={uid} width={3.4} x1={px(probe.x)} x2={px(probe.x) + (field.E.x / eMag) * 62} y1={py(probe.y)} y2={py(probe.y) - (field.E.y / eMag) * 62} />
            <text className="ph-vec-label v" style={{ fontSize: fs(14) }} x={px(probe.x) + (field.E.x / eMag) * 70 + 4} y={py(probe.y) - (field.E.y / eMag) * 70}>E</text>
            {(() => { const fm = Math.hypot(F.x, F.y); return fm > 0 ? (
              <g>
                <Arrow kind="a" prefix={uid} width={3.2} x1={px(probe.x)} x2={px(probe.x) + (F.x / fm) * 42} y1={py(probe.y)} y2={py(probe.y) - (F.y / fm) * 42} />
                <text className="ph-vec-label a" style={{ fontSize: fs(14) }} x={px(probe.x) + (F.x / fm) * 50 + 4} y={py(probe.y) - (F.y / fm) * 50 + 14}>F</text>
              </g>) : null; })()}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/** Uniform field: the path of one charged particle, drawn with equal scales on both axes, with v and F at the shown time. */
export function UniformFieldDiagram({ p, t }: { p: UniformFieldInput; t: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth(W);
  const k = Math.max(1, W / avail);
  const fs = (n: number) => n * k;
  const trace = useMemo(() => uniformTrace(p, 160), [p]);
  const now = uniformState(p, t);
  const Wd = 700, Hd = 380, mL = 64, mR = 24, mT = 24, mB = 46;
  const xs = trace.map((s) => s.x), ys = trace.map((s) => s.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const spanX = Math.max(x1 - x0, 1e-30), spanY = Math.max(y1 - y0, 1e-30);
  const spanLong = Math.max(spanX, spanY);
  // a nearly straight path would otherwise fill the frame with a single line: keep a minimum extent of a quarter of the longer side
  const needX = Math.max(spanX, spanLong * 0.3), needY = Math.max(spanY, spanLong * 0.3);
  x0 -= (needX - spanX) / 2; x1 += (needX - spanX) / 2; y0 -= (needY - spanY) / 2; y1 += (needY - spanY) / 2;
  const padX = needX * 0.2, padY = needY * 0.2; // room for the v and F arrows at the ends of the path
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const pw = Wd - mL - mR, ph = Hd - mT - mB;
  const sc = Math.min(pw / (x1 - x0), ph / (y1 - y0));
  const ox = mL + (pw - sc * (x1 - x0)) / 2, oy = mT + (ph - sc * (y1 - y0)) / 2;
  const X = (x: number) => ox + (x - x0) * sc;
  const Y = (y: number) => oy + (y1 - y) * sc; // screen y grows downward
  const scale = siScale(Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)), "m");
  const xt = niceTicks(x0 / scale.factor, x1 / scale.factor, 5), yt = niceTicks(y0 / scale.factor, y1 / scale.factor, 4);
  const fmag = Math.hypot(now.fx, now.fy);
  const vmax = Math.max(...trace.map((s) => s.speed), 1e-30);
  const Ex = p.Ex, Ey = p.Ey, Em = Math.hypot(Ex, Ey);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Path of a ${p.q > 0 ? "positive" : "negative"} particle in a uniform field of ${formatSI(Em, "V/m")}; at ${formatSI(t, "s")} it is at (${formatSI(now.x, "m")}, ${formatSI(now.y, "m")}) moving at ${formatSI(now.speed, "m/s")}`}
        className="ph-svg"
        height={Math.round(Hd * Math.min(1, avail / Wd))}
        role="img"
        viewBox={`0 0 ${Wd} ${Hd}`}
        width={Math.round(Math.min(Wd, avail))}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={Hd} width={Wd} x={0} y={0} />
        {xt.map((v) => <g key={`x${v}`}><line className="ph-grid" x1={X(v * scale.factor)} x2={X(v * scale.factor)} y1={mT} y2={Hd - mB} /><text className="ph-tick" style={{ fontSize: fs(12) }} textAnchor="middle" x={X(v * scale.factor)} y={Hd - mB + fs(16)}>{v}</text></g>)}
        {yt.map((v) => <g key={`y${v}`}><line className="ph-grid" x1={mL} x2={Wd - mR} y1={Y(v * scale.factor)} y2={Y(v * scale.factor)} /><text className="ph-tick" style={{ fontSize: fs(12) }} textAnchor="end" x={mL - 6} y={Y(v * scale.factor) + 4}>{v}</text></g>)}
        <text className="ph-axis-label" style={{ fontSize: fs(13) }} textAnchor="middle" x={mL + pw / 2} y={Hd - 6}>x ({scale.unit})</text>
        <text className="ph-axis-label" style={{ fontSize: fs(13) }} textAnchor="middle" transform={`rotate(-90 14 ${mT + ph / 2})`} x={14} y={mT + ph / 2}>y ({scale.unit})</text>
        {Em > 0 ? [0.2, 0.5, 0.8].flatMap((fx) => [0.25, 0.75].map((fy) => {
          const cx = mL + pw * fx, cy = mT + ph * fy, ux = (Ex / Em) * 16, uy = (-Ey / Em) * 16;
          return <g key={`${fx}-${fy}`} opacity={0.55}><Arrow kind="c" prefix={uid} width={1.8} x1={cx - ux} x2={cx + ux} y1={cy - uy} y2={cy + uy} /></g>;
        })) : null}
        <polyline className="ph-path-future" fill="none" points={trace.map((s) => `${X(s.x).toFixed(1)},${Y(s.y).toFixed(1)}`).join(" ")} />
        <polyline className="ph-path-past" fill="none" points={trace.filter((s) => s.t <= t + 1e-30).concat([now]).map((s) => `${X(s.x).toFixed(1)},${Y(s.y).toFixed(1)}`).join(" ")} />
        <circle className="ph-start" cx={X(p.x0)} cy={Y(p.y0)} r={5} />
        <circle cx={X(now.x)} cy={Y(now.y)} fill={p.q > 0 ? POS : NEG} r={9} stroke="#ffffff" strokeWidth={2.5} />
        <text className="ph-charge-sign small" textAnchor="middle" x={X(now.x)} y={Y(now.y) + 5}>{p.q > 0 ? "+" : "−"}</text>
        {now.speed > 0 ? (
          <g>
            <Arrow kind="v" prefix={uid} width={3.2} x1={X(now.x)} x2={X(now.x) + (now.vx / vmax) * 54} y1={Y(now.y)} y2={Y(now.y) - (now.vy / vmax) * 54} />
            <text className="ph-vec-label v ph-halo" style={{ fontSize: fs(14) }} x={X(now.x) + (now.vx / vmax) * 62 + 3} y={Y(now.y) - (now.vy / vmax) * 62}>v</text>
          </g>
        ) : null}
        {fmag > 0 ? (
          <g>
            <Arrow kind="a" prefix={uid} width={3.2} x1={X(now.x)} x2={X(now.x) + (now.fx / fmag) * 38} y1={Y(now.y)} y2={Y(now.y) - (now.fy / fmag) * 38} />
            <text className="ph-vec-label a ph-halo" style={{ fontSize: fs(14) }} x={X(now.x) + (now.fx / fmag) * 46 + 6} y={Y(now.y) - (now.fy / fmag) * 46 + 12}>F</text>
          </g>
        ) : null}
        <text className="ph-note-text" style={{ fontSize: fs(12) }} x={mL + 6} y={mT + 14}>Grey arrows: the uniform field E ({formatSI(Em, "V/m")})</text>
      </svg>
    </div>
  );
}

