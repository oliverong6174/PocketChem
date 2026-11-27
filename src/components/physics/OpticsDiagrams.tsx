import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { fmt } from "../../utils/physics/format";
import { principalRays, solveImaging, solveRefraction, type ImagingInput, type RefractionInput } from "../../utils/physics/optics";
import { useContainerWidth } from "./simHooks";

const TEAL = "#0b6a72";
const AMBER = "#b45309";
const INK = "#0f172a";
const RED = "#be123c";
const GREY = "#94a3b8";
const RAY_COLORS = [TEAL, AMBER, "#6d28d9"];

/**
 * Ray diagram for a thin lens or spherical mirror. Coordinates are in cm: the element is at x = 0, light arrives from the left. The
 * vertical scale is exaggerated relative to the horizontal (paraxial drawing). The object can be dragged, or moved with the arrow keys.
 * Rays are drawn from the same geometric construction the tests check against the equation.
 */
export function ImagingDiagram({ input, onObjectDistance }: { input: ImagingInput; onObjectDistance?: (s: number) => void }) {
  const [wrapRef, avail] = useContainerWidth();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const uid = useId().replace(/:/g, "");
  const r = solveImaging(input);
  const rays = principalRays(input);
  const { f, s, h, element } = input;
  const W = Math.max(300, Math.min(avail, 960));
  const compact = W < 520;
  const H = compact ? 280 : 340;
  const mid = H / 2;
  // horizontal extent
  const reach = Math.max(s, 2 * Math.abs(f)) * 1.12;
  const imgX = r.imageX;
  const imageVisible = imgX !== null && Math.abs(imgX) <= 3.2 * Math.max(s, Math.abs(f));
  let xmin = -reach;
  let xmax = element === "lens" ? Math.max(2 * Math.abs(f) * 1.12, s * 0.5) : Math.max(Math.abs(f) * 1.5, 0.3 * s);
  if (element === "mirror") xmax = Math.max(xmax, 0.25 * reach);
  if (imageVisible && imgX !== null) { xmin = Math.min(xmin, imgX * 1.1 - 1); xmax = Math.max(xmax, imgX * 1.1 + 1); }
  const left = 14;
  const sx = (W - 2 * left) / (xmax - xmin);
  const px = (x: number) => left + (x - xmin) * sx;
  const hmax = Math.max(h, imageVisible && r.hPrime !== null ? Math.abs(r.hPrime) : 0, ...rays.map((q) => Math.abs(q.hit.y)), 0.5) * 1.25;
  const sy = (mid - 30) / hmax;
  const py = (y: number) => mid - y * sy;
  const elH = hmax * 1.05;
  const edgeX = element === "lens" ? xmax : xmin;
  const draw = (q: (typeof rays)[number], k: number) => {
    const color = RAY_COLORS[k];
    const [from, hit] = q.incoming;
    const tEdge = q.dir.x === 0 ? 0 : (edgeX - q.hit.x) / q.dir.x;
    const end = { x: q.hit.x + tEdge * q.dir.x, y: q.hit.y + tEdge * q.dir.y };
    const virtual = r.nature === "virtual" && imgX !== null && r.hPrime !== null;
    return (
      <g key={q.id}>
        <line stroke={color} strokeWidth={2.2} x1={px(from.x)} x2={px(hit.x)} y1={py(from.y)} y2={py(hit.y)} />
        {tEdge > 0 ? <line stroke={color} strokeWidth={2.2} x1={px(q.hit.x)} x2={px(end.x)} y1={py(q.hit.y)} y2={py(end.y)} /> : null}
        {virtual ? <line stroke={color} strokeDasharray="6 4" strokeWidth={1.8} x1={px(q.hit.x)} x2={px(imgX as number)} y1={py(q.hit.y)} y2={py(r.hPrime as number)} /> : null}
      </g>
    );
  };
  const focalLabel = (x: number, name: string) => (
    <g key={name + x}>
      <circle cx={px(x)} cy={mid} fill={INK} r={3.5} />
      <text className="ph-note-text" textAnchor="middle" x={px(x)} y={mid + 18}>{name}</text>
    </g>
  );
  const marks = element === "lens"
    ? [focalLabel(-f, "F"), focalLabel(f, "F′"), focalLabel(-2 * f, "2F"), focalLabel(2 * f, "2F′")]
    : [focalLabel(-f, "F"), focalLabel(-2 * f, "C")];
  const moveTo = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !onObjectDistance) return;
    const box = svg.getBoundingClientRect();
    const x = xmin + ((clientX - box.left) / box.width * W - left) / sx;
    onObjectDistance(Math.round(Math.min(300, Math.max(1, -x)) * 10) / 10);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!onObjectDistance) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") { e.preventDefault(); onObjectDistance(Math.min(300, s + step)); }
    if (e.key === "ArrowRight") { e.preventDefault(); onObjectDistance(Math.max(1, s - step)); }
  };
  const drag = useRef(false);
  const imgTitle = r.sPrime === null ? "no image: the rays leave parallel (image at infinity)" : `${r.nature} ${r.orientation} image at ${fmt(r.sPrime)} cm, height ${fmt(r.hPrime as number)} cm`;
  const arrow = (x: number, y: number, color: string, dashed: boolean, key: string) => {
    const dir = y >= 0 ? -1 : 1;
    const tipY = py(y);
    return (
      <g key={key}>
        <line stroke={color} strokeDasharray={dashed ? "6 4" : undefined} strokeWidth={3.2} x1={px(x)} x2={px(x)} y1={mid} y2={tipY} />
        <path d={`M${px(x) - 6} ${tipY - dir * 9} L${px(x)} ${tipY} L${px(x) + 6} ${tipY - dir * 9}`} fill="none" stroke={color} strokeWidth={3} />
      </g>
    );
  };
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Ray diagram: ${element === "lens" ? (f > 0 ? "converging lens" : "diverging lens") : f > 0 ? "concave mirror" : "convex mirror"} with focal length ${fmt(f)} cm, object ${fmt(h)} cm tall at ${fmt(s)} cm; ${imgTitle}`}
        className="ph-svg" height={H} onPointerMove={(e: PointerEvent) => { if (drag.current) moveTo(e.clientX); }}
        onPointerUp={() => { drag.current = false; }} ref={svgRef} role="img" viewBox={`0 0 ${W} ${H}`} width={W}
      >
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <line stroke={GREY} strokeWidth={1.4} x1={left} x2={W - left} y1={mid} y2={mid} />
        {element === "lens" ? (
          <g>
            <line stroke={INK} strokeWidth={3} x1={px(0)} x2={px(0)} y1={py(elH)} y2={py(-elH)} />
            {f > 0
              ? [1, -1].map((d) => <path d={`M${px(0) - 8} ${py(d * elH) + d * 12} L${px(0)} ${py(d * elH)} L${px(0) + 8} ${py(d * elH) + d * 12}`} fill="none" key={d} stroke={INK} strokeWidth={3} />)
              : [1, -1].map((d) => <path d={`M${px(0) - 8} ${py(d * elH) - d * 12} L${px(0)} ${py(d * elH)} L${px(0) + 8} ${py(d * elH) - d * 12}`} fill="none" key={d} stroke={INK} strokeWidth={3} />)}
          </g>
        ) : (
          <g>
            <line stroke={INK} strokeWidth={4} x1={px(0)} x2={px(0)} y1={py(elH)} y2={py(-elH)} />
            {Array.from({ length: 9 }, (_, k) => <line key={k} stroke={INK} strokeWidth={1.4} x1={px(0)} x2={px(0) + 9} y1={py(elH) + ((py(-elH) - py(elH)) * k) / 8} y2={py(elH) + ((py(-elH) - py(elH)) * k) / 8 + 9} />)}
          </g>
        )}
        {marks}
        {rays.map(draw)}
        {arrow(-s, h, INK, false, "obj")}
        <text className="ph-axis-label" textAnchor="middle" x={px(-s)} y={py(h) - 14}>object</text>
        {onObjectDistance ? (
          <rect
            aria-label={`Object distance: ${fmt(s)} cm. Drag, or use the left and right arrow keys (shift for larger steps).`} aria-valuemax={300} aria-valuemin={1} aria-valuenow={s}
            aria-valuetext={`${fmt(s)} cm from the ${element}`} className="ph-drag-handle" fill="transparent" height={Math.abs(py(-h) - py(h)) + 30} onKeyDown={onKey}
            onPointerDown={(e) => { drag.current = true; (e.currentTarget as SVGRectElement).setPointerCapture?.(e.pointerId); moveTo(e.clientX); }}
            role="slider" stroke={RED} strokeDasharray="3 3" tabIndex={0} width={34} x={px(-s) - 17} y={py(h) - 15}
          />
        ) : null}
        {imageVisible && imgX !== null && r.hPrime !== null ? (
          <g>
            {arrow(imgX, r.hPrime, RED, r.nature === "virtual", "img")}
            <text className="ph-axis-label" textAnchor="middle" x={px(imgX)} y={r.hPrime >= 0 ? py(r.hPrime) - 14 : py(r.hPrime) + 24}>{r.nature} image</text>
          </g>
        ) : null}
        <text className="ph-note-text" x={8} y={16}>{imgTitle}{imgX !== null && !imageVisible ? " (off the diagram)" : ""}</text>
        <text className="ph-note-text" x={8} y={H - 10}>horizontal scale to cm; vertical scale exaggerated. Dashed: backward extensions of the rays (virtual image).</text>
        <title id={`${uid}-t`}>Ray diagram</title>
      </svg>
    </div>
  );
}

/** Two media, the normal, and the incident, reflected and refracted rays. */
export function RefractionDiagram({ input }: { input: RefractionInput }) {
  const [wrapRef, avail] = useContainerWidth();
  const r = solveRefraction(input);
  const W = Math.max(300, Math.min(avail, 640));
  const H = Math.min(W * 0.85, 420);
  const cx = W / 2;
  const cy = H / 2;
  const L = Math.min(W, H) * 0.42;
  const rad = Math.PI / 180;
  // incident ray comes from the upper left, reflected goes to the upper right, refracted goes to the lower right.
  const inc: [number, number] = [cx - Math.sin(input.theta1 * rad) * L, cy - Math.cos(input.theta1 * rad) * L];
  const refl: [number, number] = [cx + Math.sin(input.theta1 * rad) * L, cy - Math.cos(input.theta1 * rad) * L];
  const refr: [number, number] | null = r.theta2 === null ? null : [cx + Math.sin(r.theta2 * rad) * L, cy + Math.cos(r.theta2 * rad) * L];
  const shade = (n: number) => `rgba(11, 106, 114, ${Math.min(0.5, 0.05 + (n - 1) * 0.22)})`;
  const arc = (a: number, up: boolean, side: 1 | -1, radius: number) => {
    const x0 = cx;
    const y0 = up ? cy - radius : cy + radius;
    const x1 = cx + side * Math.sin(a * rad) * radius;
    const y1 = up ? cy - Math.cos(a * rad) * radius : cy + Math.cos(a * rad) * radius;
    const sweep = (up && side === -1) || (!up && side === 1) ? 0 : 1;
    return `M${x0} ${y0} A${radius} ${radius} 0 0 ${sweep} ${x1} ${y1}`;
  };
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg
        aria-label={`Refraction: light in medium n = ${fmt(input.n1)} meets medium n = ${fmt(input.n2)} at ${fmt(input.theta1)} degrees from the normal; ${r.tir ? "total internal reflection, no refracted ray" : `refracted ray at ${fmt(r.theta2 as number)} degrees`}`}
        className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}
      >
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        <rect fill={shade(input.n1)} height={cy} width={W} x={0} y={0} />
        <rect fill={shade(input.n2)} height={H - cy} width={W} x={0} y={cy} />
        <line stroke={INK} strokeWidth={2} x1={0} x2={W} y1={cy} y2={cy} />
        <line stroke={GREY} strokeDasharray="6 5" strokeWidth={1.6} x1={cx} x2={cx} y1={8} y2={H - 8} />
        <text className="ph-note-text" x={8} y={20}>n₁ = {fmt(input.n1)}</text>
        <text className="ph-note-text" x={8} y={H - 10}>n₂ = {fmt(input.n2)}</text>
        <text className="ph-note-text" x={cx + 6} y={16}>normal</text>
        <line stroke={TEAL} strokeWidth={3} x1={inc[0]} x2={cx} y1={inc[1]} y2={cy} />
        <line stroke={AMBER} strokeOpacity={r.tir ? 1 : 0.55} strokeWidth={r.tir ? 3 : 2} x1={cx} x2={refl[0]} y1={cy} y2={refl[1]} />
        {refr ? <line stroke={RED} strokeWidth={3} x1={cx} x2={refr[0]} y1={cy} y2={refr[1]} /> : null}
        {input.theta1 > 0 ? <path d={arc(input.theta1, true, -1, L * 0.38)} fill="none" stroke={TEAL} strokeWidth={1.8} /> : null}
        {r.theta2 !== null && r.theta2 > 0 ? <path d={arc(r.theta2, false, 1, L * 0.5)} fill="none" stroke={RED} strokeWidth={1.8} /> : null}
        <text className="ph-axis-label" textAnchor="end" x={cx - 8} y={cy - L * 0.42}>θ₁ = {fmt(input.theta1)}°</text>
        {r.theta2 !== null ? <text className="ph-axis-label" x={cx + 10} y={cy + L * 0.62}>θ₂ = {fmt(r.theta2)}°</text> : <text className="ph-axis-label" fill={RED} x={cx + 10} y={cy + 40}>no refracted ray</text>}
        <text className="ph-note-text" textAnchor="end" x={W - 8} y={cy - 8}>{r.tir ? "total internal reflection" : "reflected ray (faint: some light only)"}</text>
        {r.critical !== null ? <text className="ph-note-text" textAnchor="end" x={W - 8} y={cy - 24}>critical angle {fmt(r.critical)}°</text> : null}
      </svg>
    </div>
  );
}
