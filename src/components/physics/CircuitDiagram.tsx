import { useId, useMemo, type KeyboardEvent } from "react";
import { type Circuit, type CircuitAnalysis } from "../../utils/physics/circuits";
import { GEO, layoutCircuit } from "../../utils/physics/circuitLayout";
import { fmt, formatSI } from "../../utils/physics/format";
import { Arrow, ArrowDefs } from "./sim";
import { useContainerWidth } from "./simHooks";

/**
 * Schematic of the resistor network, drawn from the layout of the same circuit tree that the analysis uses. Every wire is a
 * segment of that layout; conventional current runs left to right through the network, and each resistor shows
 * V = V(left) − V(right) with its current. Resistors (and groups, through the table) can be selected.
 */
export function CircuitDiagram({
  circuit, analysis, selected, onSelect,
}: { circuit: Circuit; analysis: CircuitAnalysis; selected: string | null; onSelect: (id: string | null) => void }) {
  const drawing = useMemo(() => layoutCircuit(circuit), [circuit]);
  const uid = useId().replace(/:/g, "");
  const [wrapRef, avail] = useContainerWidth();
  // keep text readable: scale to fit, but never below 70 % (the frame then scrolls sideways instead of shrinking the text further)
  const scale = Math.min(1, Math.max(0.7, avail / drawing.width));
  const w = Math.round(drawing.width * scale);
  const h = Math.round(drawing.height * scale);
  const mid = drawing.source.plus.y + 30;
  const railTop = drawing.wires.find((x) => x.a.x === GEO.sourceX && x.b.x === GEO.sourceX && x.a.y < drawing.source.plus.y)?.a.y ?? 12;
  const railBottom = drawing.wires.find((x) => x.a.x === GEO.sourceX && x.a.y > drawing.source.minus.y)?.a.y ?? drawing.height - GEO.pad;
  const selectedGroup = selected ? drawing.groups.find((g) => g.id === selected) : null;
  const key = (id: string) => (event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(selected === id ? null : id); } };

  return (
    <div className="ph-diagram ph-circuit-wrap" ref={wrapRef}>
      <svg
        aria-label={`Circuit diagram: ${circuit.voltage} V source driving ${drawing.resistors.length} resistors; total current ${formatSI(analysis.current, "A")}`}
        className="ph-svg"
        height={h}
        role="group"
        viewBox={`0 0 ${drawing.width} ${drawing.height}`}
        width={w}
      >
        <ArrowDefs prefix={uid} />
        <rect className="ph-paper" height={drawing.height} width={drawing.width} x={0} y={0} />
        {selectedGroup ? <rect className="ph-group-hl" height={selectedGroup.h} rx={8} width={selectedGroup.w} x={selectedGroup.x} y={selectedGroup.y} /> : null}

        {drawing.wires.map((wire, i) => <line className="ph-wire" key={i} x1={wire.a.x} x2={wire.b.x} y1={wire.a.y} y2={wire.b.y} />)}

        {/* source: long plate = + terminal (top), short plate = − terminal (bottom) */}
        <g className="ph-source">
          <line className="ph-wire" x1={GEO.sourceX} x2={GEO.sourceX} y1={drawing.source.plus.y} y2={mid - 5} />
          <line className="ph-plate long" x1={GEO.sourceX - 17} x2={GEO.sourceX + 17} y1={mid - 5} y2={mid - 5} />
          <line className="ph-plate" x1={GEO.sourceX - 9} x2={GEO.sourceX + 9} y1={mid + 5} y2={mid + 5} />
          <line className="ph-wire" x1={GEO.sourceX} x2={GEO.sourceX} y1={mid + 5} y2={drawing.source.minus.y} />
          <text className="ph-sign" textAnchor="end" x={GEO.sourceX - 8} y={mid - 10}>+</text>
          <text className="ph-sign" textAnchor="end" x={GEO.sourceX - 8} y={mid + 20}>−</text>
          <text className="ph-comp-label" textAnchor="start" x={GEO.sourceX + 22} y={mid + 5}>{fmt(circuit.voltage)} V</text>
        </g>

        {/* the loop current: out of +, along the top rail, back along the bottom rail */}
        <Arrow kind="i" prefix={uid} width={2.6} x1={GEO.sourceX + 40} x2={GEO.sourceX + 78} y1={railTop} y2={railTop} />
        <text className="ph-i-label" textAnchor="middle" x={GEO.sourceX + 62} y={railTop - 8}>I = {formatSI(analysis.current, "A")}</text>
        <Arrow kind="i" prefix={uid} width={2.6} x1={GEO.sourceX + 78} x2={GEO.sourceX + 40} y1={railBottom} y2={railBottom} />

        {drawing.resistors.map((r) => {
          const res = analysis.byId[r.id];
          const cx = (r.a.x + r.b.x) / 2;
          const sel = selected === r.id;
          const zig = zigzag(r.a.x, r.b.x, r.a.y);
          return (
            <g
              aria-label={`${res.label}: ${formatSI(res.resistance, "Ω")}, ${formatSI(res.voltage, "V")} across, ${formatSI(res.current, "A")} through, ${formatSI(res.power, "W")}`}
              aria-pressed={sel}
              className={`ph-resistor${sel ? " is-selected" : ""}`}
              data-resistor={r.id}
              key={r.id}
              onClick={() => onSelect(sel ? null : r.id)}
              onKeyDown={key(r.id)}
              role="button"
              tabIndex={0}
            >
              <rect className="ph-hit" height={GEO.resistorH + 2 * GEO.note} rx={8} width={r.b.x - r.a.x + 8} x={r.a.x - 4} y={r.a.y - GEO.resistorH / 2 - GEO.note} />
              <polyline className="ph-zigzag" fill="none" points={zig} />
              <text className="ph-comp-label" textAnchor="middle" x={cx} y={r.a.y - 38}>{res.label} = {formatSI(res.resistance, "Ω")}</text>
              <Arrow kind="i" prefix={uid} width={2} x1={cx - 20} x2={cx + 20} y1={r.a.y - 26} y2={r.a.y - 26} />
              <text className="ph-val" textAnchor="middle" x={cx} y={r.a.y + 26}>V = {formatSI(res.voltage, "V")}</text>
              <text className="ph-val" textAnchor="middle" x={cx} y={r.a.y + 42}>I = {formatSI(res.current, "A")}</text>
              <text className="ph-sign small" textAnchor="start" x={r.a.x + 1} y={r.a.y + 14}>+</text>
              <text className="ph-sign small" textAnchor="end" x={r.b.x - 1} y={r.a.y + 14}>−</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Resistor symbol: lead wires and a zigzag. */
function zigzag(x0: number, x1: number, y: number): string {
  const lead = 14;
  const a = x0 + lead;
  const b = x1 - lead;
  const n = 6;
  const pts: Array<[number, number]> = [[x0, y], [a, y]];
  for (let i = 0; i < n; i += 1) pts.push([a + ((i + 0.5) * (b - a)) / n, y + (i % 2 ? 11 : -11)]);
  pts.push([b, y], [x1, y]);
  return pts.map(([px, py]) => `${px},${py}`).join(" ");
}
