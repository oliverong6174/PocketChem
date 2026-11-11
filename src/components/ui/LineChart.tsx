import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { niceTicks } from "../../utils/chartTicks";

/**
 * Small SVG line chart for scientific curves (no dependency). Draws on a paper surface (put it in a DiagramFrame).
 *  - labelled axes with units and "nice" ticks, drawn in real pixels so text never scales below ~12px
 *  - one or more series, shaded x-bands, labelled markers, and one draggable "current" marker
 *  - the current marker is a slider: pointer drag on the plot, or ArrowLeft/Right (step), PageUp/PageDown (10 steps),
 *    Home/End; value announced through aria-valuetext
 *  - a pure presentation component: callers pass already-computed numbers, so the plot and any readout come from the
 *    same model
 */

export interface ChartPoint { x: number; y: number }
export interface ChartSeries { id: string; label: string; points: ChartPoint[] }
export interface ChartMarker { id: string; x: number; y: number; label: string; kind: "equivalence" | "half" | "info" }
export interface ChartBand { id: string; x0: number; x1: number; label: string }

interface Props {
  title: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  xDomain: [number, number];
  yDomain: [number, number];
  markers?: ChartMarker[];
  bands?: ChartBand[];
  current?: { x: number; y: number } | null;
  onXChange?: (x: number) => void;
  /** Keyboard step for the current marker, in x units. */
  xStep?: number;
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
  /** Text read by assistive technology for the current position. */
  valueText?: string;
  yTickStep?: number;
}

const MARGIN = { top: 14, right: 16, bottom: 46, left: 52 };

function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function LineChart({
  title, xLabel, yLabel, series, xDomain, yDomain, markers = [], bands = [], current = null,
  onXChange, xStep, formatX = (x) => String(Number(x.toPrecision(4))), formatY = (y) => y.toFixed(1), valueText, yTickStep,
}: Props) {
  const [wrapRef, width] = useWidth();
  const id = useId();
  const compact = width < 520;
  const height = Math.round(Math.min(420, Math.max(250, width * (compact ? 0.78 : 0.56))));
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const sx = (x: number) => MARGIN.left + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y: number) => MARGIN.top + (1 - (y - y0) / (y1 - y0)) * plotH;
  const xTicks = useMemo(() => niceTicks(x0, x1, compact ? 4 : 7), [x0, x1, compact]);
  const yTicks = useMemo(() => (yTickStep ? niceTicks(y0, y1, (y1 - y0) / yTickStep) : niceTicks(y0, y1, 7)), [y0, y1, yTickStep]);
  const dragging = useRef(false);

  const fromPointer = (event: PointerEvent<SVGElement>): number => {
    const rect = (event.currentTarget.ownerSVGElement ?? (event.currentTarget as SVGSVGElement)).getBoundingClientRect();
    const px = event.clientX - rect.left;
    return Math.min(x1, Math.max(x0, x0 + ((px - MARGIN.left) / plotW) * (x1 - x0)));
  };
  const onKey = (event: KeyboardEvent<SVGGElement>) => {
    if (!onXChange || current === null) return;
    const step = xStep ?? (x1 - x0) / 200;
    const deltas: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 };
    const next = event.key === "Home" ? x0 : event.key === "End" ? x1 : event.key in deltas ? current.x + deltas[event.key] : null;
    if (next === null) return;
    event.preventDefault();
    onXChange(Math.min(x1, Math.max(x0, next)));
  };

  const path = (points: ChartPoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(Math.min(y1, Math.max(y0, p.y))).toFixed(2)}`).join("");

  return (
    <div className="gc-chart" ref={wrapRef}>
      <svg
        aria-label={title}
        className="gc-chart-svg"
        height={height}
        role="group"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        onPointerDown={(event) => {
          if (!onXChange) return;
          dragging.current = true;
          (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
          onXChange(fromPointer(event));
        }}
        onPointerMove={(event) => { if (dragging.current && onXChange) onXChange(fromPointer(event)); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        style={{ touchAction: onXChange ? "pan-y" : undefined, cursor: onXChange ? "crosshair" : undefined }}
      >
        <defs><clipPath id={`${id}-clip`}><rect height={plotH} width={plotW} x={MARGIN.left} y={MARGIN.top} /></clipPath></defs>

        {bands.map((band) => (
          <rect className="gc-band" height={plotH} key={band.id} width={Math.max(0, sx(band.x1) - sx(band.x0))} x={sx(band.x0)} y={MARGIN.top}>
            <title>{band.label}</title>
          </rect>
        ))}

        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="gc-grid" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={sy(t)} y2={sy(t)} />
            <text className="gc-tick" dominantBaseline="middle" textAnchor="end" x={MARGIN.left - 8} y={sy(t)}>{formatY(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line className="gc-grid" x1={sx(t)} x2={sx(t)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <text className="gc-tick" textAnchor="middle" x={sx(t)} y={MARGIN.top + plotH + 18}>{formatX(t)}</text>
          </g>
        ))}
        <rect className="gc-frame" height={plotH} width={plotW} x={MARGIN.left} y={MARGIN.top} />

        <g clipPath={`url(#${id}-clip)`}>
          {series.map((s) => <path className="gc-line" d={path(s.points)} fill="none" key={s.id} />)}
        </g>

        {markers.map((m) => {
          const cx = sx(m.x);
          const cy = sy(Math.min(y1, Math.max(y0, m.y)));
          const right = cx < MARGIN.left + plotW - 110;
          return (
            <g className={`gc-marker kind-${m.kind}`} key={m.id}>
              <circle cx={cx} cy={cy} r={5.5} />
              {!compact ? <text textAnchor={right ? "start" : "end"} x={cx + (right ? 9 : -9)} y={cy + (m.kind === "half" ? 15 : -8)}>{m.label}</text> : null}
              <title>{m.label}</title>
            </g>
          );
        })}

        {current ? (
          <g
            aria-label={`${title}: current position`}
            aria-orientation="horizontal"
            aria-valuemax={x1}
            aria-valuemin={x0}
            aria-valuenow={Number(current.x.toPrecision(6))}
            aria-valuetext={valueText}
            className="gc-current"
            onKeyDown={onKey}
            role={onXChange ? "slider" : "img"}
            tabIndex={onXChange ? 0 : undefined}
          >
            <line x1={sx(current.x)} x2={sx(current.x)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <circle cx={sx(current.x)} cy={sy(Math.min(y1, Math.max(y0, current.y)))} r={7} />
          </g>
        ) : null}

        <text className="gc-axis-label" textAnchor="middle" x={MARGIN.left + plotW / 2} y={height - 8}>{xLabel}</text>
        <text className="gc-axis-label" textAnchor="middle" transform={`rotate(-90) translate(${-(MARGIN.top + plotH / 2)} 14)`}>{yLabel}</text>
      </svg>
    </div>
  );
}
