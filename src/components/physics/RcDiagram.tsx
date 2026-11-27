import { useId } from "react";
import { fmt, formatSI } from "../../utils/physics/format";
import { type RcInput, type RcState } from "../../utils/physics/rc";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * The one-loop RC schematic at the shared simulation time: source on the left, resistor on top, capacitor on the right. The
 * capacitor is filled in proportion to its voltage, the current arrow follows the sign of i (it reverses when discharging,
 * and its opacity follows |i| / |i(0)|), and the voltages across R and C add up to the source voltage (KVL).
 */
export function RcDiagram({ p, now, i0 }: { p: RcInput; now: RcState; i0: number }) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth();
  const compact = avail < 560;
  const W = compact ? 430 : 700;
  const H = 300;
  const scale = Math.min(1, Math.max(0.7, avail / W));
  const vRef = Math.max(Math.abs(p.Vs), Math.abs(p.V0), 1e-9);
  const fill = Math.max(-1, Math.min(1, now.vC / vRef));
  const iFrac = i0 === 0 ? 0 : Math.min(1, Math.abs(now.i) / Math.abs(i0));
  const charging = now.i > 0;
  const idle = Math.abs(now.i) <= 1e-9 * Math.abs(i0) || i0 === 0;
  const topY = 80;
  const botY = 240;
  const srcX = compact ? 90 : 170;
  const capX = compact ? 340 : 520;
  const resX0 = compact ? 160 : 280;
  const resX1 = compact ? 270 : 420;
  const zig: Array<[number, number]> = [[resX0, topY], [resX0 + 14, topY]];
  for (let k = 0; k < 6; k += 1) zig.push([resX0 + 14 + ((k + 0.5) * (resX1 - resX0 - 28)) / 6, topY + (k % 2 ? 12 : -12)]);
  zig.push([resX1 - 14, topY], [resX1, topY]);
  const plateTop = 150;
  const plateBot = 176;
  const plateW = 74;
  const gap = plateBot - plateTop;
  const fillH = Math.abs(fill) * (gap - 4);
  const arrowOpacity = idle ? 0.15 : 0.35 + 0.65 * iFrac;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`RC circuit at t = ${formatSI(now.t, "s")}: capacitor ${fmt(now.vC)} V, current ${formatSI(now.i, "A")}`}
        className="ph-svg"
        height={Math.round(H * scale)}
        role="img"
        viewBox={`0 0 ${W} ${H}`}
        width={Math.round(W * scale)}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {/* wires */}
        <polyline className="ph-wire" fill="none" points={`${srcX},138 ${srcX},${topY} ${resX0},${topY}`} />
        <polyline className="ph-wire" fill="none" points={`${resX1},${topY} ${capX},${topY} ${capX},${plateTop}`} />
        <polyline className="ph-wire" fill="none" points={`${capX},${plateBot} ${capX},${botY} ${srcX},${botY} ${srcX},150`} />
        {/* source */}
        <line className="ph-plate long" x1={srcX - 20} x2={srcX + 20} y1={138} y2={138} />
        <line className="ph-plate" x1={srcX - 11} x2={srcX + 11} y1={150} y2={150} />
        <text className="ph-sign" textAnchor="end" x={srcX - 12} y={134}>+</text>
        <text className="ph-sign" textAnchor="end" x={srcX - 12} y={162}>−</text>
        <text className="ph-comp-label" textAnchor="end" x={srcX - 26} y={150}>Vs = {fmt(p.Vs)} V</text>
        {/* resistor */}
        <polyline className="ph-zigzag" fill="none" points={zig.map(([x, y]) => `${x},${y}`).join(" ")} />
        <text className="ph-comp-label" textAnchor="middle" x={(resX0 + resX1) / 2} y={topY - 22}>R = {formatSI(p.R, "Ω")}</text>
        <text className="ph-val" textAnchor="middle" x={(resX0 + resX1) / 2} y={topY + 38}>vR = {formatSI(now.vR, "V")}</text>
        {/* capacitor with charge level */}
        <rect className="ph-cap-fill" height={fillH} style={{ opacity: 0.55 }} width={plateW - 8} x={capX - plateW / 2 + 4} y={fill >= 0 ? plateBot - 2 - fillH : plateTop + 2} />
        <line className="ph-plate long" x1={capX - plateW / 2} x2={capX + plateW / 2} y1={plateTop} y2={plateTop} />
        <line className="ph-plate long" x1={capX - plateW / 2} x2={capX + plateW / 2} y1={plateBot} y2={plateBot} />
        <text className="ph-sign small" x={capX + plateW / 2 + 8} y={plateTop + 4}>{now.vC >= 0 ? "+" : "−"}</text>
        <text className="ph-sign small" x={capX + plateW / 2 + 8} y={plateBot + 4}>{now.vC >= 0 ? "−" : "+"}</text>
        <text className="ph-comp-label" textAnchor={compact ? "end" : "start"} x={compact ? capX - plateW / 2 - 12 : capX + plateW / 2 + 20} y={plateTop + 4}>C = {formatSI(p.C, "F")}</text>
        <text className="ph-val strong" textAnchor={compact ? "end" : "start"} x={compact ? capX - plateW / 2 - 12 : capX + plateW / 2 + 20} y={plateBot + 2}>vC = {fmt(now.vC)} V</text>
        <text className="ph-val" textAnchor={compact ? "end" : "start"} x={compact ? capX - plateW / 2 - 12 : capX + plateW / 2 + 20} y={plateBot + 20}>U = {formatSI(now.energy, "J")}</text>
        {/* current: clockwise (source → R → capacitor) when positive, reversed when negative */}
        <g opacity={arrowOpacity}>
          {charging || idle ? (
            <Arrow kind="i" prefix={uid} width={3.4} x1={resX0 + 20} x2={resX1 - 20} y1={topY - 42} y2={topY - 42} />
          ) : (
            <Arrow kind="i" prefix={uid} width={3.4} x1={resX1 - 20} x2={resX0 + 20} y1={topY - 42} y2={topY - 42} />
          )}
        </g>
        <text className="ph-i-label" textAnchor="middle" x={(resX0 + resX1) / 2} y={topY - 56}>i = {formatSI(now.i, "A")} {idle ? "" : charging ? "(into the + plate)" : "(out of the + plate)"}</text>
        <text className="ph-note-text" textAnchor="middle" x={(srcX + capX) / 2} y={botY + 22}>KVL: Vs = vR + vC → {fmt(p.Vs)} = {fmt(now.vR)} + {fmt(now.vC)} V</text>
      </svg>
    </div>
  );
}
