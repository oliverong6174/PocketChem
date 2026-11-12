import { useId, useMemo } from "react";
import { niceTicks } from "../../utils/chartTicks";
import { fmt } from "../../utils/physics/format";
import { stateAt, trace, type Kinematics, type MotionState, type MotionSummary } from "../../utils/physics/mechanics";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * The 2D motion diagram: ground, axes, trajectory, time ticks, the particle, and its velocity and acceleration vectors, all drawn
 * from the one model (`stateAt`) at the shared simulation time. Distances are marked with dimension lines.
 */
const M = { top: 22, right: 22, bottom: 84, left: 54 };

export function MotionDiagram({
  kin, summary, t, equal, showComponents,
}: { kin: Kinematics; summary: MotionSummary; t: number; equal: boolean; showComponents: boolean }) {
  const [wrapRef, width] = useContainerWidth();
  const uid = useId().replace(/:/g, "");
  const compact = width < 520;
  const now: MotionState = stateAt(kin, t);

  const geo = useMemo(() => {
    const tr = trace(kin, 180);
    const xs = [...tr.x, kin.x0, 0];
    const ys = [...tr.y, 0];
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMax = Math.max(...ys);
    const yMin = Math.min(...ys, 0);
    const padX = Math.max((xMax - xMin) * 0.06, 0.5);
    const x0 = xMin - padX;
    const x1 = xMax + padX;
    const spanY = Math.max(yMax - yMin, 0.5);
    const y0 = yMin - spanY * 0.08;
    const y1 = yMax + spanY * 0.28;
    return { tr, x0, x1, y0, y1 };
  }, [kin]);

  const plotW = width - M.left - M.right;
  const worldW = geo.x1 - geo.x0;
  const worldH = geo.y1 - geo.y0;
  // equal scales: one metre is the same length in x and y; the drawing is at least 220 px and at most 440 px high
  const natural = (plotW * worldH) / worldW;
  const plotH = equal ? Math.min(440, Math.max(compact ? 200 : 230, natural)) : Math.min(380, Math.max(compact ? 220 : 260, plotW * 0.5));
  const sxScale = plotW / worldW;
  const syScale = equal ? Math.min(plotH / worldH, sxScale) : plotH / worldH;
  const height = plotH + M.top + M.bottom;
  const sx = (x: number) => M.left + (x - geo.x0) * sxScale;
  // anchor the ground (y = 0) near the bottom so extra vertical room becomes sky
  const groundPx = M.top + plotH - (0 - geo.y0) * syScale;
  const sy = (y: number) => groundPx - y * syScale;

  const xTicks = niceTicks(geo.x0, geo.x1, compact ? 4 : 7);
  const yTicksRaw = niceTicks(Math.max(0, geo.y0), Math.max(geo.y1, 1), compact ? 3 : 5).filter((v) => sy(v) >= M.top - 1 && sy(v) <= M.top + plotH + 1);
  const path = geo.tr.t.map((_, i) => `${i ? "L" : "M"}${sx(geo.tr.x[i]).toFixed(1)},${sy(geo.tr.y[i]).toFixed(1)}`).join("");
  const past: string[] = [];
  for (let i = 0; i < geo.tr.t.length && geo.tr.t[i] <= t; i += 1) past.push(`${sx(geo.tr.x[i]).toFixed(1)},${sy(geo.tr.y[i]).toFixed(1)}`);
  const pastPath = past.length ? `M${past.join("L")}L${sx(now.x).toFixed(1)},${sy(now.y).toFixed(1)}` : "";

  // dots at equal time steps (a motion diagram): about ten across the whole motion, at a round interval
  const dtTick = summary.tEnd > 0 ? niceTicks(0, summary.tEnd, 10).reduce((m, v, i, a) => (i ? Math.min(m, v - a[i - 1]) : m), Infinity) : 0;
  const stepDots: Array<{ x: number; y: number; t: number }> = [];
  if (Number.isFinite(dtTick) && dtTick > 0) for (let tt = dtTick; tt < summary.tEnd - dtTick * 0.05 && stepDots.length < 60; tt += dtTick) { const s = stateAt(kin, tt); stepDots.push({ x: s.x, y: s.y, t: tt }); }

  // vectors: velocity scaled so the fastest point of the motion is 70 px long; acceleration always 46 px
  const vMax = Math.max(1e-9, ...geo.tr.t.map((_, i) => Math.hypot(geo.tr.vx[i], geo.tr.vy[i])));
  const kv = 70 / vMax;
  const aMag = Math.hypot(kin.ax, kin.ay);
  const ka = aMag > 0 ? 46 / aMag : 0;
  const px = sx(now.x);
  const py = sy(now.y);
  const vEnd = { x: px + now.vx * kv, y: py - now.vy * kv };
  const aEnd = { x: px + kin.ax * ka, y: py - kin.ay * ka };

  const landX = sx(summary.end.x);
  const startX = sx(kin.x0);
  const rangeY = M.top + plotH + 42;

  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Motion diagram: ${fmt(now.x)} m across, ${fmt(now.y)} m high at t = ${fmt(t)} s`}
        className="ph-svg"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-sky" height={Math.max(0, groundPx - M.top)} width={plotW} x={M.left} y={M.top} />
        <rect className="ph-earth" height={Math.max(0, M.top + plotH + 8 - groundPx)} width={plotW} x={M.left} y={groundPx} />
        {yTicksRaw.map((v) => (
          <g key={`y${v}`}>
            <line className="ph-grid" x1={M.left} x2={M.left + plotW} y1={sy(v)} y2={sy(v)} />
            <text className="ph-tick" dominantBaseline="middle" textAnchor="end" x={M.left - 8} y={sy(v)}>{v}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line className="ph-grid" x1={sx(v)} x2={sx(v)} y1={M.top} y2={groundPx} />
            <text className="ph-tick" textAnchor="middle" x={sx(v)} y={M.top + plotH + 24}>{v}</text>
          </g>
        ))}
        <line className="ph-ground" x1={M.left} x2={M.left + plotW} y1={groundPx} y2={groundPx} />
        <text className="ph-axis-label" textAnchor="middle" x={M.left + plotW / 2} y={height - 6}>x (m)</text>
        <text className="ph-axis-label" textAnchor="middle" transform={`rotate(-90) translate(${-(M.top + plotH / 2)} 14)`}>y, height above ground (m)</text>
        <text className="ph-note-text" x={M.left + 8} y={groundPx + 15}>ground, y = 0</text>

        <path className="ph-path-future" d={path} fill="none" />
        {pastPath ? <path className="ph-path-past" d={pastPath} fill="none" /> : null}
        {stepDots.map((d) => <circle className="ph-step-dot" cx={sx(d.x)} cy={sy(d.y)} key={d.t} r={2.6}><title>{`t = ${fmt(d.t)} s`}</title></circle>)}

        {/* range dimension line (only when the particle lands) */}
        {summary.lands && summary.range !== null && Math.abs(landX - startX) > 40 ? (
          <g className="ph-dim">
            <line x1={startX} x2={landX} y1={rangeY} y2={rangeY} />
            <line x1={startX} x2={startX} y1={rangeY - 5} y2={rangeY + 5} />
            <line x1={landX} x2={landX} y1={rangeY - 5} y2={rangeY + 5} />
            <text textAnchor="middle" x={(startX + landX) / 2} y={rangeY + 15}>range {fmt(summary.range)} m</text>
          </g>
        ) : null}

        {/* markers: launch, apex, landing */}
        <circle className="ph-mark" cx={startX} cy={sy(kin.y0)} r={4}><title>launch</title></circle>
        {summary.apexIsTurning ? (
          <g>
            <circle className="ph-mark apex" cx={sx(stateAt(kin, summary.tApex).x)} cy={sy(summary.maxHeight)} r={4.5} />
            {!compact ? <text className="ph-note-text" textAnchor="middle" x={sx(stateAt(kin, summary.tApex).x)} y={sy(summary.maxHeight) - 9}>apex {fmt(summary.maxHeight)} m</text> : null}
          </g>
        ) : null}
        {summary.lands && !summary.degenerate ? <circle className="ph-mark land" cx={landX} cy={groundPx} r={4.5}><title>landing</title></circle> : null}

        {/* distances for the current position: height above ground and horizontal distance from the launch point */}
        {now.y > 0.02 * (geo.y1 - geo.y0) ? (
          <g className="ph-dim soft">
            <line x1={px} x2={px} y1={py} y2={groundPx} />
            {!compact ? <text textAnchor="start" x={px + 6} y={(py + groundPx) / 2}>y = {fmt(now.y)} m</text> : null}
          </g>
        ) : null}

        {/* vectors */}
        {showComponents ? (
          <>
            <Arrow dash="4 3" kind="c" prefix={uid} width={1.8} x1={px} x2={px + now.vx * kv} y1={py} y2={py} title="horizontal velocity component" />
            <Arrow dash="4 3" kind="c" prefix={uid} width={1.8} x1={px} x2={px} y1={py} y2={py - now.vy * kv} title="vertical velocity component" />
          </>
        ) : null}
        <Arrow kind="v" prefix={uid} title={`velocity (${fmt(now.vx)}, ${fmt(now.vy)}) m/s`} x1={px} x2={vEnd.x} y1={py} y2={vEnd.y} />
        <Arrow kind="a" prefix={uid} title={`acceleration (${fmt(kin.ax)}, ${fmt(kin.ay)}) m/s²`} width={2.4} x1={px} x2={aEnd.x} y1={py} y2={aEnd.y} />
        <circle className="ph-particle" cx={px} cy={py} r={7} />
        {Math.hypot(vEnd.x - px, vEnd.y - py) > 14 ? <text className="ph-vec-label v" x={vEnd.x + (vEnd.x >= px ? 6 : -6)} textAnchor={vEnd.x >= px ? "start" : "end"} y={vEnd.y - 6}>v</text> : null}
        {aMag > 0 ? <text className="ph-vec-label a" x={aEnd.x + (aEnd.x >= px ? 6 : -6)} textAnchor={aEnd.x >= px ? "start" : "end"} y={aEnd.y + (aEnd.y > py ? 14 : -6)}>a</text> : null}
      </svg>
      <p className="ph-note ph-legend-line">
        dashed path = whole motion, solid = so far. <span className="ph-key v" aria-hidden="true" />velocity v (length ∝ speed) <span className="ph-key a" aria-hidden="true" />acceleration a (fixed length) {showComponents ? <><span className="ph-key c" aria-hidden="true" />components</> : null}
        <span className="ph-key dot" aria-hidden="true" />dots every {fmt(dtTick)} s
      </p>
    </div>
  );
}
