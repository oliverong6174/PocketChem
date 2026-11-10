import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_CHAIR_VIEW,
  projectPoint,
  synDiaxialInteractions,
  type ChairConformer,
  type ChairModel,
} from "../../utils/conformations/chair";
import type { ConformationGraph, GraphBond } from "../../utils/conformations/graph";
import {
  atomLabel,
  type EnergyProfile,
  type NewmanDiagram,
  type SawhorseDiagram,
  type TorsionSetup,
} from "../../utils/conformations/torsion";

// ---------------------------------------------------------------------------------------------
// Responsive text: SVG drawings scale with their container, so on a phone 13-unit labels would render at
// ~7px. `--inv` (viewBox width / displayed width, never below 1) lets the stylesheet keep every label at
// least ~11.5 CSS pixels on screen: font-size: max(var(--fs), calc(11.5px * var(--inv))).
// ---------------------------------------------------------------------------------------------

function useInverseScale<T extends SVGSVGElement>(viewBoxWidth: number) {
  const ref = useRef<T | null>(null);
  const [inv, setInv] = useState(1);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => {
      const width = node.getBoundingClientRect().width;
      if (width > 0) setInv(Math.max(1, Math.round((viewBoxWidth / width) * 100) / 100));
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewBoxWidth]);
  return { ref, style: { "--inv": inv } as CSSProperties };
}

// ---------------------------------------------------------------------------------------------
// Chair
// ---------------------------------------------------------------------------------------------

type ChairViewProps = {
  graph: ConformationGraph;
  model: ChairModel;
  conformer: ChairConformer;
  showHydrogens: boolean;
  showDiaxial: boolean;
  /** Practice mode: no axial/equatorial colouring or tags. */
  hideLabels: boolean;
  /** Ring atom positions labelled with the input atom index. */
  showIndices: boolean;
};

const CHAIR_W = 560;
const CHAIR_H = 340;
const CHAIR_SCALE = 96;

export function ChairDrawing({ graph, model, conformer, showHydrogens, showDiaxial, hideLabels, showIndices }: ChairViewProps) {
  const scaled = useInverseScale<SVGSVGElement>(CHAIR_W);
  const project = (p: { x: number; y: number; z: number }) => {
    const q = projectPoint(p, DEFAULT_CHAIR_VIEW);
    return { x: CHAIR_W / 2 + q.x * CHAIR_SCALE, y: CHAIR_H / 2 + 8 - q.y * CHAIR_SCALE, depth: q.depth };
  };
  const ring = conformer.ringPoints.map(project);
  const depths = ring.map((p) => p.depth);
  const maxDepth = Math.max(...depths);
  const minDepth = Math.min(...depths);
  const weight = (depth: number) => 1.6 + 3.2 * ((depth - minDepth) / Math.max(1e-6, maxDepth - minDepth));

  const bonds = ring.map((p, i) => {
    const q = ring[(i + 1) % 6];
    return { i, p, q, depth: (p.depth + q.depth) / 2 };
  });
  bonds.sort((a, b) => a.depth - b.depth);

  const subs = conformer.substituents
    .filter((item) => showHydrogens || !item.slot.isHydrogen)
    .map((item) => {
      const origin = ring[item.slot.position];
      const end = project(item.point);
      return { item, origin, end };
    });
  const diaxial = synDiaxialInteractions(conformer);

  return (
    <svg ref={scaled.ref} style={scaled.style} className="conf-svg conf-chair" viewBox={`0 0 ${CHAIR_W} ${CHAIR_H}`} role="img" aria-label={`${conformer.label}: cyclohexane chair`}>
      {subs.filter((s) => s.item.orientation === "axial").map(({ item, origin, end }) => (
        <line key={`ax-${item.slot.position}-${item.slot.atom}`} x1={origin.x} y1={origin.y} x2={end.x} y2={end.y} className={`conf-sub ${hideLabels ? "" : "conf-axial"} ${item.slot.isHydrogen ? "conf-h" : ""}`} />
      ))}
      {bonds.map(({ i, p, q, depth }) => (
        <line key={`ring-${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="conf-ring-bond" strokeWidth={weight(depth)} />
      ))}
      {subs.filter((s) => s.item.orientation === "equatorial").map(({ item, origin, end }) => (
        <line key={`eq-${item.slot.position}-${item.slot.atom}`} x1={origin.x} y1={origin.y} x2={end.x} y2={end.y} className={`conf-sub ${hideLabels ? "" : "conf-equatorial"} ${item.slot.isHydrogen ? "conf-h" : ""}`} />
      ))}
      {showDiaxial && !hideLabels && diaxial.map((d, i) => {
        const a = subs.find((s) => s.item.slot.atom === d.substituentAtom);
        const b = subs.find((s) => s.item.slot.atom === d.partnerAtom);
        if (!a || !b) return null;
        return <line key={`dia-${i}`} x1={a.end.x} y1={a.end.y} x2={b.end.x} y2={b.end.y} className="conf-diaxial" />;
      })}
      {ring.map((p, i) => (
        <g key={`atom-${i}`}>
          <circle cx={p.x} cy={p.y} r={4} className="conf-atom" />
          {showIndices && <text x={p.x} y={p.y + 16} className="conf-index" textAnchor="middle">{model.ring[i]}</text>}
        </g>
      ))}
      {subs.map(({ item, end, origin }) => {
        const dx = end.x - origin.x;
        const dy = end.y - origin.y;
        const norm = Math.hypot(dx, dy) || 1;
        const label = item.slot.isHydrogen ? "H" : atomLabel(graph, item.slot.atom, item.slot.ringAtom);
        const x = end.x + (dx / norm) * 11;
        const y = end.y + (dy / norm) * 11 + 4;
        return (
          <text key={`lab-${item.slot.position}-${item.slot.atom}`} x={x} y={y} textAnchor="middle" className={item.slot.isHydrogen ? "conf-label conf-label-h" : "conf-label"}>
            {label}
            {!hideLabels && !item.slot.isHydrogen && <tspan className="conf-tag" dx={3} dy={-8}>{item.orientation === "axial" ? "ax" : "eq"}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Newman
// ---------------------------------------------------------------------------------------------

const N_SIZE = 320;
const N_C = N_SIZE / 2;
const N_CIRCLE = 66;
const N_OUT = 118;
const N_LABEL = 142;

const polar = (radius: number, angle: number) => {
  const r = (angle * Math.PI) / 180;
  return { x: N_C + radius * Math.sin(r), y: N_C - radius * Math.cos(r) };
};

type NewmanProps = {
  diagram: NewmanDiagram;
  setup: TorsionSetup;
  /** Practice mode hides the dihedral readout colouring. */
  onRotate: (rotation: number) => void;
  onPickRef: (end: "front" | "rear", atom: number) => void;
  compact?: boolean;
};

export function NewmanDrawing({ diagram, setup, onRotate, onPickRef, compact = false }: NewmanProps) {
  const scaled = useInverseScale<SVGSVGElement>(N_SIZE);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  function rotateToPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = scaled.ref.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * N_SIZE - N_C;
    const y = ((event.clientY - box.top) / box.height) * N_SIZE - N_C;
    if (Math.hypot(x, y) < 8) return;
    const pointer = (Math.atan2(x, -y) * 180) / Math.PI;
    // The rear reference follows the pointer; the front reference is at 12 o'clock (angle 0).
    onRotate(Math.round(((pointer % 360) + 360) % 360));
  }

  function endDrag() {
    dragging.current = false;
    setIsDragging(false);
  }

  // Keyboard: arrows turn the rear carbon by 5 degrees (1 with Alt), Page Up/Down by 60 (one staggered/eclipsed step), Home resets to 0.
  function onKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    const current = Math.round(((diagram.rotation % 360) + 360) % 360);
    const fine = event.altKey ? 1 : 5;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + fine;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - fine;
    else if (event.key === "PageUp") next = current + 60;
    else if (event.key === "PageDown") next = current - 60;
    else if (event.key === "Home") next = 0;
    if (next === null) return;
    event.preventDefault();
    onRotate(((next % 360) + 360) % 360);
  }

  const rearRef = diagram.rear.find((item) => item.atom === setup.rearRef);
  const rearAngle = rearRef?.angle ?? 0;
  const arcStart = polar(34, 0);
  const arcEnd = polar(34, rearAngle);
  const large = rearAngle > 180 ? 1 : 0;
  const rotation = Math.round(((diagram.rotation % 360) + 360) % 360);
  const chipRadius = compact ? 13 : 17;
  const interactive = !compact;

  return (
    <svg
      ref={scaled.ref}
      style={scaled.style}
      className={`conf-svg conf-newman${compact ? " conf-compact" : ""}${isDragging ? " is-dragging" : ""}`}
      viewBox={`0 0 ${N_SIZE} ${N_SIZE}`}
      {...(interactive
        ? {
            role: "slider",
            tabIndex: 0,
            "aria-label": `Newman projection about atoms ${diagram.frontAtom} (front) and ${diagram.rearAtom} (rear). Drag, or use the arrow keys, to rotate the rear carbon.`,
            "aria-valuemin": 0,
            "aria-valuemax": 360,
            "aria-valuenow": rotation,
            "aria-valuetext": `${rotation} degrees`,
            onKeyDown,
          }
        : { role: "img", "aria-label": `Newman projection of the same conformation, dihedral ${rotation} degrees` })}
      onPointerDown={(event) => {
        if (!interactive) return;
        dragging.current = true;
        setIsDragging(true);
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        rotateToPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current && interactive) rotateToPointer(event);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {/* 60-degree ticks around the front carbon: staggered and eclipsed positions fall on them */}
      {[0, 60, 120, 180, 240, 300].map((tick) => {
        const a = polar(N_CIRCLE + 2, tick);
        const b = polar(N_CIRCLE + 9, tick);
        return <line key={`t-${tick}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="conf-n-tick" />;
      })}
      {diagram.rear.map((item) => {
        const a = polar(N_CIRCLE, item.angle);
        const b = polar(N_OUT, item.angle);
        return <line key={`r-${item.atom}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="conf-n-rear" />;
      })}
      <circle cx={N_C} cy={N_C} r={N_CIRCLE} className="conf-n-circle" />
      {diagram.front.map((item) => {
        const b = polar(N_OUT, item.angle);
        return <line key={`f-${item.atom}`} x1={N_C} y1={N_C} x2={b.x} y2={b.y} className="conf-n-front" />;
      })}
      {rearRef && rotation > 1 && rotation < 359 && (
        <path d={`M ${arcStart.x} ${arcStart.y} A 34 34 0 ${large} 1 ${arcEnd.x} ${arcEnd.y}`} className="conf-n-arc" fill="none" />
      )}
      {diagram.rear.map((item) => {
        const p = polar(N_LABEL, item.angle);
        return (
          <g key={`rl-${item.atom}`} className="conf-n-pick" onPointerDown={(event) => event.stopPropagation()} onClick={() => onPickRef("rear", item.atom)}>
            <circle cx={p.x} cy={p.y} r={chipRadius} className={item.atom === setup.rearRef ? "conf-n-chip conf-n-ref conf-rear-chip" : "conf-n-chip conf-rear-chip"} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" className="conf-label">{item.label}</text>
            <title>{`Rear substituent (atom ${item.atom}). Click to use it as the rear reference.`}</title>
          </g>
        );
      })}
      {diagram.front.map((item) => {
        const p = polar(N_LABEL, item.angle);
        return (
          <g key={`fl-${item.atom}`} className="conf-n-pick" onPointerDown={(event) => event.stopPropagation()} onClick={() => onPickRef("front", item.atom)}>
            <circle cx={p.x} cy={p.y} r={chipRadius} className={item.atom === setup.frontRef ? "conf-n-chip conf-n-ref conf-front-chip" : "conf-n-chip conf-front-chip"} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" className="conf-label">{item.label}</text>
            <title>{`Front substituent (atom ${item.atom}). Click to use it as the front reference.`}</title>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Sawhorse
// ---------------------------------------------------------------------------------------------

const S_W = 340;
const S_H = 300;
const S_SCALE = 78;

export function SawhorseDrawing({ diagram, setup, compact = false }: { diagram: SawhorseDiagram; setup: TorsionSetup; compact?: boolean }) {
  const scaled = useInverseScale<SVGSVGElement>(S_W);
  const map = (p: { x: number; y: number }) => ({ x: S_W / 2 + p.x * S_SCALE, y: S_H / 2 + 10 - p.y * S_SCALE });
  const front = map(diagram.frontCarbon);
  const rear = map(diagram.rearCarbon);
  const label = (end: { x: number; y: number }, from: { x: number; y: number }) => {
    const dx = end.x - from.x;
    const dy = end.y - from.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: end.x + (dx / n) * 13, y: end.y + (dy / n) * 13 + 4 };
  };
  return (
    <svg ref={scaled.ref} style={scaled.style} className={`conf-svg conf-sawhorse ${compact ? "conf-compact" : ""}`} viewBox={`0 0 ${S_W} ${S_H}`} role="img"
      aria-label={`Sawhorse projection about atoms ${diagram.frontAtom} (front) and ${diagram.rearAtom} (rear), dihedral ${diagram.rotation.toFixed(0)} degrees`}>
      {diagram.rear.map((item) => {
        const end = map(item.end);
        return <line key={`r-${item.atom}`} x1={rear.x} y1={rear.y} x2={end.x} y2={end.y} className="conf-s-rear" />;
      })}
      <line x1={front.x} y1={front.y} x2={rear.x} y2={rear.y} className="conf-s-axis" />
      {diagram.front.map((item) => {
        const end = map(item.end);
        return <line key={`f-${item.atom}`} x1={front.x} y1={front.y} x2={end.x} y2={end.y} className="conf-s-front" />;
      })}
      <circle cx={front.x} cy={front.y} r={4} className="conf-atom" />
      <circle cx={rear.x} cy={rear.y} r={4} className="conf-atom conf-atom-rear" />
      {diagram.rear.map((item) => {
        const p = label(map(item.end), rear);
        return <text key={`rl-${item.atom}`} x={p.x} y={p.y} textAnchor="middle" className={item.atom === setup.rearRef ? "conf-label conf-label-ref" : "conf-label"}>{item.label}</text>;
      })}
      {diagram.front.map((item) => {
        const p = label(map(item.end), front);
        return <text key={`fl-${item.atom}`} x={p.x} y={p.y} textAnchor="middle" className={item.atom === setup.frontRef ? "conf-label conf-label-ref" : "conf-label"}>{item.label}</text>;
      })}
      <text x={front.x - 6} y={front.y + 24} textAnchor="end" className="conf-caption">front (C{diagram.frontAtom})</text>
      <text x={rear.x + 6} y={rear.y - 20} textAnchor="start" className="conf-caption">rear (C{diagram.rearAtom})</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Energy graph
// ---------------------------------------------------------------------------------------------

type PlacedLabel = { x0: number; x1: number; y: number };

/**
 * Strain-versus-dihedral curve. Drawn in real pixels (the width follows the container, so labels are never
 * scaled down on a phone). Feature labels are placed greedily: clamped inside the plot (so nothing runs into
 * the y-axis ticks near 0 and 360 degrees) and stacked upward when two labels would overlap. Narrow widths
 * label markers with energies only; the table under the graph carries the names.
 */
export function EnergyGraph({ profile, rotation, onRotate }: { profile: EnergyProfile; rotation: number; onRotate: (angle: number) => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(560);
  useLayoutEffect(() => {
    const node = svgRef.current?.parentElement;
    if (!node) return undefined;
    const update = () => {
      const w = node.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  if (!profile.supported) return null;

  const W = Math.max(260, width);
  const compact = W < 480;
  const H = compact ? 230 : 280;
  const L = compact ? 38 : 50;
  const R = 14;
  const T = 40;
  const B = compact ? 40 : 46;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const maxKJ = Math.max(...profile.points.map((p) => p.kJ), 1);
  const step = maxKJ <= 20 ? 5 : maxKJ <= 50 ? 10 : 20;
  const top = Math.ceil(maxKJ / step) * step;
  const x = (angle: number) => L + (angle / 360) * plotW;
  const y = (kJ: number) => T + (1 - kJ / top) * plotH;
  const path = profile.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.angle).toFixed(1)} ${y(p.kJ).toFixed(1)}`).join(" ");
  const angle = ((rotation % 360) + 360) % 360;
  const here = profile.points.reduce((best, p) => (Math.abs(p.angle - angle) < Math.abs(best.angle - angle) ? p : best), profile.points[0]);

  const pick = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = event.clientX - box.left;
    const a = ((px - L) / plotW) * 360;
    onRotate(Math.max(0, Math.min(360, Math.round(a))));
  };

  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const xTicks = compact ? [0, 120, 240, 360] : [0, 60, 120, 180, 240, 300, 360];

  // greedy label placement (left to right)
  const placed: PlacedLabel[] = [];
  const charW = 6.1;
  const labels = [...profile.features]
    .sort((a, b) => x(a.angle) - x(b.angle))
    .map((feature) => {
      const text = compact ? feature.kJ.toFixed(feature.kJ < 10 ? 1 : 0) : `${feature.name} ${feature.kJ.toFixed(feature.kJ < 10 ? 1 : 0)}`;
      const w = text.length * charW + 6;
      const cx = x(feature.angle);
      const x0 = Math.min(Math.max(cx - w / 2, L + 2), W - R - 2 - w);
      const py = y(feature.kJ);
      let chosen = py - 10;
      for (const lift of [10, 24, 38]) {
        const candidate = py - lift;
        if (candidate < 12) continue;
        const clash = placed.some((other) => x0 < other.x1 + 2 && x0 + w > other.x0 - 2 && Math.abs(candidate - other.y) < 13);
        chosen = candidate;
        if (!clash) break;
      }
      placed.push({ x0, x1: x0 + w, y: chosen });
      return { feature, text, x0, y: chosen, cx, py, leader: py - chosen > 12 };
    });

  return (
    <svg
      ref={svgRef}
      className="conf-svg conf-graph"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label="Strain energy against dihedral angle. Drag to set the rotation; the slider above does the same from the keyboard."
      onPointerDown={(event) => {
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) pick(event);
      }}
    >
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} className="conf-grid" />
          <text x={L - 7} y={y(tick) + 4} textAnchor="end" className="conf-axis">{tick}</text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line x1={x(tick)} x2={x(tick)} y1={T} y2={H - B} className="conf-grid" />
          <text x={x(tick)} y={H - B + 16} textAnchor={tick === 0 ? "start" : tick === 360 ? "end" : "middle"} className="conf-axis">{tick}°</text>
        </g>
      ))}
      <text x={L + plotW / 2} y={H - 6} textAnchor="middle" className="conf-axis-title">{compact ? "dihedral angle" : "dihedral angle between the reference groups"}</text>
      <text x={L} y={T - 24} textAnchor="start" className="conf-axis-title">strain, kJ/mol</text>
      <path d={path} className="conf-curve" fill="none" />
      {labels.map(({ feature, text, x0, y: ly, cx, py, leader }) => (
        <g key={`${feature.kind}-${feature.angle}`}>
          {leader && <line x1={cx} x2={cx} y1={ly + 3} y2={py - 5} className="conf-leader" />}
          <circle cx={cx} cy={py} r={4} className={feature.kind === "minimum" ? "conf-min" : "conf-max"} />
          <text x={x0 + 3} y={ly} textAnchor="start" className="conf-feature">{text}</text>
        </g>
      ))}
      <line x1={x(here.angle)} x2={x(here.angle)} y1={T} y2={H - B} className="conf-cursor" />
      <circle cx={x(here.angle)} cy={y(here.kJ)} r={6.5} className="conf-cursor-dot" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Structure map: choose a bond or ring on a 2D depiction (the bond-selection adapter)
// ---------------------------------------------------------------------------------------------

type MapProps = {
  graph: ConformationGraph;
  mode: "bond" | "ring";
  rotatable: Map<number, string | null>;
  selectedBond: [number, number] | null;
  frontAtom: number | null;
  rings: Array<{ ring: number[]; eligible: boolean; reason?: string }>;
  selectedRing: number[] | null;
  showIndices: boolean;
  onPickBond: (bond: GraphBond) => void;
  onPickRing: (ring: number[]) => void;
};

const M_W = 420;
const M_H = 260;

export function StructureMap({ graph, mode, rotatable, selectedBond, frontAtom, rings, selectedRing, showIndices, onPickBond, onPickRing }: MapProps) {
  const mapScaled = useInverseScale<SVGSVGElement>(M_W);
  const xs = graph.coords2D.map((p) => p.x);
  const ys = graph.coords2D.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = Math.min((M_W - 70) / Math.max(maxX - minX, 1), (M_H - 60) / Math.max(maxY - minY, 1), 60 / 1.0, 70);
  void span;
  const pt = (i: number) => ({
    x: M_W / 2 + (graph.coords2D[i].x - (minX + maxX) / 2) * scale,
    y: M_H / 2 - (graph.coords2D[i].y - (minY + maxY) / 2) * scale,
  });
  const sameBond = (bond: GraphBond) =>
    selectedBond !== null && ((bond.a === selectedBond[0] && bond.b === selectedBond[1]) || (bond.a === selectedBond[1] && bond.b === selectedBond[0]));
  return (
    <svg ref={mapScaled.ref} style={mapScaled.style} className="conf-svg conf-map" viewBox={`0 0 ${M_W} ${M_H}`} role="group" aria-label="Structure: click a bond or ring to analyse">
      {mode === "ring" && rings.map((item, i) => {
        const points = item.ring.map((a) => pt(a));
        const centre = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
        const selected = selectedRing !== null && selectedRing.length === item.ring.length && item.ring.every((a) => selectedRing.includes(a));
        return (
          <g
            key={`ring-${i}`}
            onClick={() => item.eligible && onPickRing(item.ring)}
            className={item.eligible ? "conf-ring-pick" : "conf-ring-off"}
            {...(item.eligible
              ? { role: "button", tabIndex: 0, "aria-label": `Use ring ${item.ring.join("–")} for the chair analysis`, onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPickRing(item.ring); } } }
              : {})}
          >
            <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} className={selected ? "conf-ring-fill conf-selected" : "conf-ring-fill"} />
            <title>{item.eligible ? "Use this ring for the chair analysis" : item.reason}</title>
            <text x={centre.x} y={centre.y + 4} textAnchor="middle" className="conf-index">{item.eligible ? "chair" : "×"}</text>
          </g>
        );
      })}
      {graph.bonds.map((bond) => {
        const a = pt(bond.a);
        const b = pt(bond.b);
        const reason = rotatable.get(bond.index);
        const eligible = mode === "bond" && reason === null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const n = Math.hypot(dx, dy) || 1;
        const offsets = bond.order === 2 ? [-2.5, 2.5] : bond.order === 3 ? [-3.5, 0, 3.5] : [0];
        return (
          <g
            key={`b-${bond.index}`}
            className={eligible ? "conf-bond-pick" : "conf-bond-off"}
            onClick={() => eligible && onPickBond(bond)}
            {...(eligible
              ? { role: "button", tabIndex: 0, "aria-label": `View along bond ${bond.a}–${bond.b}${sameBond(bond) ? " (selected)" : ""}`, onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPickBond(bond); } } }
              : {})}
          >
            {offsets.map((offset) => (
              <line key={offset} x1={a.x - (dy / n) * offset} y1={a.y + (dx / n) * offset} x2={b.x - (dy / n) * offset} y2={b.y + (dx / n) * offset}
                className={sameBond(bond) ? "conf-bond conf-selected" : "conf-bond"} />
            ))}
            {mode === "bond" && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="conf-bond-hit" />}
            {mode === "bond" && <title>{reason === null ? `Bond ${bond.a}–${bond.b}: click to view along it` : `Bond ${bond.a}–${bond.b}: ${reason}`}</title>}
            {sameBond(bond) && <circle cx={mx} cy={my} r={3} className="conf-bond-mid" />}
          </g>
        );
      })}
      {graph.atoms.map((atom) => {
        const p = pt(atom.index);
        const hetero = atom.atomicNumber !== 6;
        return (
          <g key={`a-${atom.index}`}>
            {hetero && <circle cx={p.x} cy={p.y} r={9} className="conf-map-atom-bg" />}
            {hetero && <text x={p.x} y={p.y + 4} textAnchor="middle" className="conf-label">{atom.symbol}</text>}
            {(showIndices || atom.index === frontAtom) && (
              <text x={p.x + 8} y={p.y - 7} className={atom.index === frontAtom ? "conf-index conf-front-mark" : "conf-index"}>{atom.index === frontAtom ? `${atom.index} (front)` : atom.index}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
