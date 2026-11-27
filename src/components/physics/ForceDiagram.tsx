import { useId, useMemo } from "react";
import { fmt } from "../../utils/physics/format";
import type { ForceAnalysis, ForceId, ForceMoment, ForceVector } from "../../utils/physics/forces";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * The free-body diagram: the body on its surface (tilted when inclined) with one arrow per force, drawn to one common scale
 * (px per newton) from the same ForceMoment the readouts use, plus the net-force and acceleration arrows. The body slides along the
 * surface with the simulation time. In a pulley system the hanging mass is drawn too, with its own weight and the tension.
 */
const KIND: Record<ForceId, "v" | "a" | "c" | "i" | "k"> = { weight: "c", normal: "v", friction: "a", applied: "i", tension: "i", hangingWeight: "c" };
const COLOR: Record<string, string> = { c: "#475569", v: "#0b6a72", a: "#b45309", i: "#be123c", k: "#0f172a" };
const SHORT: Record<ForceId, string> = { weight: "W", normal: "N", friction: "f", applied: "F", tension: "T", hangingWeight: "W₂" };

export function ForceDiagram({
  analysis, moment, xRange, selected, onSelect, hideArrows,
}: { analysis: ForceAnalysis; moment: ForceMoment; xRange: number; selected: ForceId | null; onSelect: (id: ForceId | null) => void; hideArrows: boolean }) {
  const [wrapRef, avail] = useContainerWidth();
  const uid = useId().replace(/:/g, "");
  const i = analysis.input;
  const pulley = i.mode === "pulley";
  const compact = avail < 520;
  const W = Math.max(300, Math.min(avail, 760));
  const H = compact ? 330 : 380;
  const theta = pulley ? 0 : (i.theta * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  // the surface passes through the pivot; the body slides along it
  const pivot = { x: W * (pulley ? 0.42 : 0.5), y: H * (theta > 0 ? 0.68 : 0.62) };
  const along = Math.min(W * 0.22, 150) / Math.max(1, xRange);
  const slideLimit = W * 0.3;
  const sPx = Math.max(-slideLimit, Math.min(slideLimit, moment.x * along));
  // body centre in screen coordinates: surface point plus half the body height along the normal
  const half = 24;
  const bx = pivot.x + sPx * cosT - half * sinT;
  const by = pivot.y - sPx * sinT - half * cosT;
  const toScreen = (f: { x: number; y: number }) => ({ x: f.x * cosT - f.y * sinT, y: -(f.x * sinT + f.y * cosT) });

  const forces = moment.forces;
  const maxF = Math.max(1e-9, ...forces.map((f) => f.magnitude), moment.net.magnitude);
  const scale = (compact ? 70 : 95) / maxF;
  const sel = selected ? forces.find((f) => f.id === selected) ?? null : null;

  const arrowFor = (f: ForceVector, selectedStyle: boolean) => {
    const s = toScreen(f);
    const x2 = bx + s.x * scale;
    const y2 = by + s.y * scale;
    return (
      <g
        aria-label={`${f.label}: ${fmt(f.magnitude)} newtons. Select to inspect.`}
        aria-pressed={selectedStyle}
        className={`ph-force${selectedStyle ? " is-selected" : ""}`}
        data-force={f.id}
        key={f.id}
        onClick={() => onSelect(selectedStyle ? null : f.id)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(selectedStyle ? null : f.id); } }}
        role="button"
        tabIndex={0}
      >
        <Arrow kind={KIND[f.id]} prefix={uid} title={`${f.label}: ${fmt(f.magnitude)} N`} width={selectedStyle ? 4.4 : 3} x1={bx} x2={x2} y1={by} y2={y2} />
        {f.magnitude * scale > 6 ? (
          <text className="ph-force-label" fill={COLOR[KIND[f.id]]} textAnchor={x2 >= bx ? "start" : "end"} x={x2 + (x2 >= bx ? 6 : -6)} y={y2 + (y2 >= by ? 14 : -6)}>{SHORT[f.id]} = {fmt(f.magnitude)} N</text>
        ) : null}
      </g>
    );
  };

  const net = toScreen(moment.net);
  const ticks = useMemo(() => [-2, -1, 0, 1, 2], []);
  // table + pulley layout
  const tableY = pivot.y;
  const pulleyX = W - 70;
  const hangY = Math.min(H - 70, tableY + 70 + Math.max(-30, Math.min(60, -moment.x * along * 0.6)));

  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Free-body diagram: ${forces.map((f) => `${f.label} ${fmt(f.magnitude)} newtons`).join(", ")}; net force ${fmt(moment.net.magnitude)} newtons`} className="ph-svg" height={H} role="group" viewBox={`0 0 ${W} ${H}`} width={W}>
        <ArrowDefs prefix={uid} />
        <rect className="ph-sky" height={H} width={W} x={0} y={0} />
        {/* the surface */}
        <g transform={`rotate(${-(theta * 180) / Math.PI} ${pivot.x} ${pivot.y})`}>
          <rect className="ph-earth" height={90} width={W * 1.6} x={pivot.x - W * 0.8} y={pivot.y} />
          <line className="ph-ground" x1={pivot.x - W * 0.8} x2={pivot.x + W * 0.8} y1={pivot.y} y2={pivot.y} />
          {ticks.map((k) => <line className="ph-grid" key={k} x1={pivot.x + k * 60} x2={pivot.x + k * 60} y1={pivot.y} y2={pivot.y + 10} />)}
        </g>
        {!pulley && theta > 0 ? (
          <g>
            <line className="ph-dim-line" x1={pivot.x - 110} x2={pivot.x + 60} y1={pivot.y} y2={pivot.y} />
            <path className="ph-angle" d={`M ${pivot.x + 40} ${pivot.y} A 40 40 0 0 0 ${pivot.x + 40 * cosT} ${pivot.y - 40 * sinT}`} fill="none" />
            <text className="ph-note-text" x={pivot.x + 46} y={pivot.y - 6}>θ = {fmt(i.theta)}°</text>
          </g>
        ) : null}
        {pulley ? (
          <g>
            <line className="ph-wire" x1={bx + 36} x2={pulleyX} y1={by} y2={by} />
            <circle className="ph-pulley" cx={pulleyX} cy={by} r={14} />
            <line className="ph-wire" x1={pulleyX + 14} x2={pulleyX + 14} y1={by} y2={hangY - 20} />
            <rect className="ph-block hang" height={40} rx={4} width={44} x={pulleyX - 8} y={hangY - 20} />
            <text className="ph-block-label" textAnchor="middle" x={pulleyX + 14} y={hangY + 5}>{fmt(i.m2)} kg</text>
            {!hideArrows && moment.tension !== null ? (
              <g>
                <Arrow kind="i" prefix={uid} width={2.6} x1={pulleyX + 14} x2={pulleyX + 14} y1={hangY - 20} y2={hangY - 20 - Math.max(8, moment.tension * scale * 0.5)} />
                <Arrow kind="c" prefix={uid} width={2.6} x1={pulleyX + 14} x2={pulleyX + 14} y1={hangY + 20} y2={hangY + 20 + Math.max(8, i.m2 * i.g * scale * 0.5)} />
              </g>
            ) : null}
            <text className="ph-note-text" textAnchor="middle" x={pulleyX + 14} y={H - 8}>hanging mass</text>
          </g>
        ) : null}
        {/* the body (rotated with the surface) */}
        <g transform={`rotate(${-(theta * 180) / Math.PI} ${bx} ${by})`}>
          <rect className="ph-block" height={half * 2} rx={4} width={70} x={bx - 35} y={by - half} />
          <text className="ph-block-label" textAnchor="middle" x={bx} y={by + 5}>{fmt(i.m)} kg</text>
        </g>
        {!hideArrows ? (
          <>
            {forces.map((f) => arrowFor(f, f.id === selected))}
            {moment.net.magnitude > 1e-9 ? (
              <g className="ph-net">
                <Arrow dash="6 4" kind="k" prefix={uid} title={`net force ${fmt(moment.net.magnitude)} N`} width={3.6} x1={bx} x2={bx + net.x * scale} y1={by - 0} y2={by + net.y * scale} />
                <text className="ph-force-label" fill="#0f172a" textAnchor={net.x >= 0 ? "start" : "end"} x={bx + net.x * scale + (net.x >= 0 ? 6 : -6)} y={by + net.y * scale - 8}>F_net = {fmt(moment.net.magnitude)} N</text>
              </g>
            ) : (
              <text className="ph-force-label" fill="#0f172a" textAnchor="middle" x={bx} y={by - half - 14}>F_net = 0</text>
            )}
            {Math.abs(moment.a) > 1e-9 ? (() => {
              const sa = Math.sign(moment.a);
              const len = Math.max(14, Math.min(70, Math.abs(moment.a) * 6));
              const off = toScreen({ x: 0, y: -(half + 18) });
              const x1 = bx + off.x;
              const y1 = by + off.y;
              return (
                <g>
                  <Arrow kind="a" prefix={uid} title={`acceleration ${fmt(moment.a)} m/s² along the surface`} width={2.6} x1={x1} x2={x1 + sa * len * cosT} y1={y1} y2={y1 - sa * len * sinT} />
                  <text className="ph-note-text" x={Math.min(W - 150, Math.max(6, x1 - 10))} y={y1 + 18 + 8 * cosT}>a = {fmt(moment.a)} m/s²</text>
                </g>
              );
            })() : null}
          </>
        ) : (
          <text className="ph-note-text" textAnchor="middle" x={W / 2} y={28}>Forces hidden: decide which forces act on the body, then check.</text>
        )}
        {sel ? <text className="ph-note-text" x={10} y={H - 10}>{sel.label}: {fmt(sel.x)} N along the surface, {fmt(sel.y)} N perpendicular</text> : null}
      </svg>
      <p className="ph-note">All force arrows use one scale (the longest is {fmt(maxF)} N). Click an arrow or a table row to inspect it.{!hideArrows ? " Dashed arrow: net force; short arrow under the body: acceleration." : ""}</p>
    </div>
  );
}
