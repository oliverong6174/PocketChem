import { DiagramFrame, Legend, type LegendItem } from "../ui/primitives";
import { LineChart, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { fmt } from "../../utils/physics/format";

/** A graph against the shared simulation time: the marker follows `t`, dragging or the arrow keys move it. */
export function TimeChart({
  title, yLabel, series, t, tEnd, value, onTime, markers = [], include0 = false, legend, formatValue,
}: {
  title: string; yLabel: string; series: ChartSeries[]; t: number; tEnd: number; value: number; onTime: (t: number) => void;
  markers?: ChartMarker[]; include0?: boolean; legend?: LegendItem[]; formatValue?: (v: number) => string;
}) {
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter(Number.isFinite);
  let lo = Math.min(...ys, include0 ? 0 : Infinity);
  let hi = Math.max(...ys, include0 ? 0 : -Infinity);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  const span = hi - lo || Math.max(1, Math.abs(hi));
  const fv = formatValue ?? ((v: number) => fmt(v));
  return (
    <DiagramFrame label={title} legend={legend ? <Legend items={legend} /> : undefined} title={title}>
      <LineChart
        current={{ x: t, y: value }}
        formatX={(x) => String(Number(x.toPrecision(3)))}
        formatY={(y) => String(Number(y.toPrecision(3)))}
        markers={markers}
        onXChange={onTime}
        series={series}
        title={title}
        valueText={`${title}: ${fv(value)} at t = ${fmt(t)} s`}
        xDomain={[0, tEnd]}
        xLabel="Time (s)"
        xStep={tEnd / 200}
        yDomain={[lo - span * 0.08, hi + span * 0.08]}
        yLabel={yLabel}
      />
    </DiagramFrame>
  );
}
