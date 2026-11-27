import { useId } from "react";
import { fmt, formatSI } from "../../utils/physics/format";
import type { EnergyAnalysis, EnergyState } from "../../utils/physics/energy";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * The physical configuration for the four energy scenarios, drawn from the same EnergyState the bars and graphs read.
 * Incline: the block slides on a tilted track; flat: a block on a rough floor; spring: a block at a compressed spring;
 * height: a ball between the ground and its highest point with the reference level marked.
 */
export function EnergyDiagram({ analysis, state }: { analysis: EnergyAnalysis; state: EnergyState }) {
  const [wrapRef, avail] = useContainerWidth();
  const uid = useId().replace(/:/g, "");
  const i = analysis.input;
  const compact = avail < 520;
  const W = Math.max(300, Math.min(avail, 760));
  const H = compact ? 280 : 320;
  const ground = H - 52;
  const label = (x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "start") => <text className="ph-note-text" textAnchor={anchor} x={x} y={y}>{text}</text>;
  const velArrow = (x: number, y: number, dirX: number, dirY: number) => {
    const len = Math.min(70, Math.abs(state.v) * 6);
    if (len < 8) return null;
    const sg = Math.sign(state.v) || 1;
    return <Arrow kind="v" prefix={uid} title={`velocity ${fmt(state.v)} m/s`} x1={x} x2={x + sg * dirX * len} y1={y} y2={y + sg * dirY * len} />;
  };

  let body: JSX.Element;
  if (i.scenario === "incline") {
    const th = (i.theta * Math.PI) / 180;
    const len = Math.min((W - 120) / Math.cos(th), (H - 110) / Math.sin(th));
    const x0 = 56;
    const topX = x0 + len * Math.cos(th);
    const topY = ground - len * Math.sin(th);
    const frac = state.pos / i.L;
    const bx = x0 + frac * len * Math.cos(th);
    const by = ground - frac * len * Math.sin(th);
    const nx = -Math.sin(th) * 14;
    const ny = -Math.cos(th) * 14;
    body = (
      <g>
        <polygon className="ph-earth" points={`${x0},${ground} ${topX},${ground} ${topX},${topY}`} />
        <line className="ph-ground" x1={x0} x2={topX} y1={ground} y2={topY} />
        <line className="ph-ground" x1={x0 - 20} x2={topX + 20} y1={ground} y2={ground} />
        <line className="ph-dim-line" x1={x0 - 12} x2={topX + 24} y1={ground} y2={ground} strokeDasharray="4 3" />
        {label(x0 - 18, ground + 18, "PE = 0 (bottom)")}
        <line className="ph-dim-line" x1={bx + nx} x2={bx + nx} y1={by + ny} y2={ground} strokeDasharray="3 3" />
        {label(bx + nx + 6, (by + ny + ground) / 2, `h = ${fmt(state.height)} m`)}
        <g transform={`rotate(${-i.theta} ${bx} ${by})`}>
          <rect className="ph-block" height={26} rx={3} width={40} x={bx - 20} y={by - 26} />
        </g>
        {velArrow(bx + nx, by + ny, Math.cos(th), -Math.sin(th))}
        <path className="ph-angle" d={`M ${x0 + 46} ${ground} A 46 46 0 0 0 ${x0 + 46 * Math.cos(th)} ${ground - 46 * Math.sin(th)}`} fill="none" />
        {label(x0 + 52, ground - 6, `${fmt(i.theta)}°`)}
        {label(x0 + 6, 20, `slope length ${fmt(i.L)} m; block ${fmt(state.pos)} m up from the bottom`)}
      </g>
    );
  } else if (i.scenario === "flat") {
    const lo = Math.min(0, analysis.posMin);
    const hi = Math.max(1, analysis.posMax);
    const pad = 70;
    const s = (W - 2 * pad - 40) / (hi - lo);
    const px = (x: number) => pad + (x - lo) * s;
    const by = ground;
    const trail = state.path;
    body = (
      <g>
        <rect className="ph-earth" height={52} width={W} x={0} y={ground} />
        <line className="ph-ground" x1={0} x2={W} y1={ground} y2={ground} />
        <line className="ph-dim-line" x1={px(0)} x2={px(0)} y1={ground - 70} y2={ground + 6} strokeDasharray="3 3" />
        {label(px(0), ground + 22, "start", "middle")}
        <rect className="ph-block" height={34} rx={3} width={46} x={px(state.pos) - 23} y={by - 34} />
        <text className="ph-block-label" textAnchor="middle" x={px(state.pos)} y={by - 12}>{fmt(i.m)} kg</text>
        {i.F !== 0 ? <Arrow kind="i" prefix={uid} title={`applied force ${fmt(i.F)} N`} width={3.4} x1={px(state.pos) - Math.sign(i.F) * 23} x2={px(state.pos) - Math.sign(i.F) * 23 + Math.sign(i.F) * Math.min(80, Math.abs(i.F) * 0.6 + 14)} y1={by - 17} y2={by - 17} /> : null}
        {velArrow(px(state.pos), by - 52, 1, 0)}
        {label(px(state.pos), by - 58 - 10, `x = ${fmt(state.pos)} m`, "middle")}
        {label(8, 20, `distance slid ${fmt(trail)} m, heat ${formatSI(state.Q, "J")}${i.F !== 0 ? `, push ${fmt(i.F)} N` : ""}`)}
      </g>
    );
  } else if (i.scenario === "spring") {
    const wallX = 40;
    const natural = Math.min(150, W * 0.28);
    const hi = Math.max(analysis.posMax, 0.1 * i.x0);
    const s = Math.min((W - wallX - natural - 90) / Math.max(hi, 0.001), natural / i.x0 * 0.9);
    const bxFace = wallX + natural + state.pos * s; // left face of the block
    const coils = 12;
    const pts: string[] = [`${wallX},${ground - 17}`];
    const springEnd = bxFace;
    for (let k = 0; k < coils; k += 1) pts.push(`${wallX + 12 + ((k + 0.5) * (springEnd - wallX - 24)) / coils},${ground - 17 + (k % 2 ? 11 : -11)}`);
    pts.push(`${springEnd},${ground - 17}`);
    body = (
      <g>
        <rect className="ph-earth" height={52} width={W} x={0} y={ground} />
        <line className="ph-ground" x1={0} x2={W} y1={ground} y2={ground} />
        <rect className="ph-wall" height={90} width={12} x={wallX - 12} y={ground - 90} />
        {state.pos < 0 || state.compression > 0 ? <polyline className="ph-zigzag" fill="none" points={pts.join(" ")} /> : <line className="ph-wire" x1={wallX} x2={wallX + 4} y1={ground - 17} y2={ground - 17} />}
        <line className="ph-dim-line" x1={wallX + natural} x2={wallX + natural} y1={ground - 70} y2={ground + 8} strokeDasharray="3 3" />
        {label(wallX + natural, ground + 24, "natural length", "middle")}
        <rect className="ph-block" height={34} rx={3} width={46} x={bxFace} y={ground - 34} />
        <text className="ph-block-label" textAnchor="middle" x={bxFace + 23} y={ground - 12}>{fmt(i.m)} kg</text>
        {velArrow(bxFace + 23, ground - 54, 1, 0)}
        {label(8, 20, state.compression > 0 ? `spring compressed ${fmt(state.compression)} m (${formatSI(state.PEs, "J")} stored)` : `free of the spring, ${fmt(state.pos)} m past the natural length`)}
      </g>
    );
  } else {
    const top = Math.max(analysis.posMax, i.h0, i.href, 1) * 1.08;
    const bottom = Math.min(0, i.href) - 0.02 * top;
    const s = (ground - 30) / (top - bottom);
    const py = (h: number) => ground - (h - 0) * s;
    const x = W * 0.5;
    body = (
      <g>
        <rect className="ph-earth" height={52} width={W} x={0} y={ground} />
        <line className="ph-ground" x1={0} x2={W} y1={ground} y2={ground} />
        <line className="ph-dim-line" x1={W * 0.2} x2={W * 0.8} y1={py(i.href)} y2={py(i.href)} strokeDasharray="6 4" />
        {label(W * 0.8 + 6, py(i.href) + 4, `PE = 0 at ${fmt(i.href)} m`)}
        <line className="ph-dim-line" x1={x} x2={x} y1={py(state.height)} y2={ground} strokeDasharray="3 3" />
        {label(x + 14, (py(state.height) + ground) / 2, `h = ${fmt(state.height)} m`)}
        <circle className="ph-particle" cx={x} cy={py(state.height) - 8} r={9} />
        {velArrow(x - 26, py(state.height) - 8, 0, -1)}
        {label(8, 20, `max height ${fmt(analysis.posMax)} m; PE = mg(h − ${fmt(i.href)})`)}
      </g>
    );
  }
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Energy scenario ${i.scenario}: speed ${fmt(Math.abs(state.v))} m/s, kinetic ${fmt(state.KE)} J, potential ${fmt(state.PEg + state.PEs)} J, heat ${fmt(state.Q)} J`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <ArrowDefs prefix={uid} />
        <rect className="ph-sky" height={H} width={W} x={0} y={0} />
        {body}
      </svg>
    </div>
  );
}

/**
 * Energy accounting bars at the selected time. Each bar is the exact value of the model's ledger (zero axis drawn, so a negative
 * potential energy extends to the left). The lower row shows the sum KE + PE + Q, which always equals the starting energy plus the
 * work done by the applied force.
 */
export function EnergyBars({ state, initial, scaleMax }: { state: EnergyState; initial: EnergyState; scaleMax: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const rows: Array<{ id: string; label: string; value: number; cls: string }> = [
    { id: "KE", label: "Kinetic", value: state.KE, cls: "ke" },
    { id: "PEg", label: "Gravitational PE", value: state.PEg, cls: "peg" },
    { id: "PEs", label: "Spring PE", value: state.PEs, cls: "pes" },
    { id: "Q", label: "Heat (friction)", value: state.Q, cls: "q" },
  ];
  const W = Math.max(280, Math.min(avail, 760));
  const labelW = W < 420 ? 108 : 132;
  const valueW = 86;
  const neg = Math.max(0, ...rows.map((r) => -r.value));
  const pos = Math.max(scaleMax, ...rows.map((r) => r.value), 1e-9);
  const room = W - labelW - valueW - 12;
  const unit = room / (pos + neg);
  const left = labelW + neg * unit;
  const total = state.KE + state.PEg + state.PEs + state.Q;
  const expected = initial.Etotal + state.Wapplied;
  const rowH = 30;
  const H = rows.length * rowH + 130;
  const bar = (v: number) => ({ x: v >= 0 ? left : left + v * unit, w: Math.abs(v) * unit });
  const y0 = rows.length * rowH;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Energy bars: ${rows.map((r) => `${r.label} ${fmt(r.value)} joules`).join(", ")}; total ${fmt(total)} joules`} className="ph-svg ph-bars" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <line className="ph-wire" x1={left} x2={left} y1={8} y2={y0 + 16} />
        {rows.map((r, k) => {
          const b = bar(r.value);
          return (
            <g data-bar={r.id} key={r.id}>
              <text className="ph-comp-label" textAnchor="end" x={labelW - 8} y={k * rowH + 32}>{r.label}</text>
              <rect className={`ph-bar ${r.cls}`} height={20} width={b.w} x={b.x} y={k * rowH + 16} />
              <text className="ph-val" x={Math.min(W - valueW + 6, left + Math.max(r.value, 0) * unit + 8)} y={k * rowH + 31}>{formatSI(r.value, "J")}</text>
            </g>
          );
        })}
        <g data-bar="total">
          <line className="ph-dim-line" x1={10} x2={W - 10} y1={y0 + 30} y2={y0 + 30} />
          <text className="ph-comp-label" x={10} y={y0 + 52}>KE + PE + heat = {formatSI(total, "J")}</text>
          <rect className="ph-bar total" height={14} width={Math.max(0, total) * unit} x={left} y={y0 + 60} />
          <text className="ph-val" x={10} y={y0 + 92}>= start {formatSI(initial.Etotal, "J")}</text>
          <text className="ph-val" x={10} y={y0 + 108}>+ applied work {formatSI(state.Wapplied, "J")} = {formatSI(expected, "J")}</text>
        </g>
      </svg>
    </div>
  );
}
