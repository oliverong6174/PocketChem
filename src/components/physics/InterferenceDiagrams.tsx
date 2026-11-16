import { useMemo } from "react";
import { fmt } from "../../utils/physics/format";
import { intensityAtScreen, pathDifferenceWavelengths, samplePattern, wavelengthColor, type SlitInput } from "../../utils/physics/interference";
import { useContainerWidth } from "./simHooks";

const INK = "#0f172a";
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const RED = "#be123c";

/** The pattern on the screen as a coloured strip, brightness = sqrt(I/I0) so faint fringes stay visible. */
export function FringeStrip({ slits, halfWidth, probeY }: { slits: SlitInput; halfWidth: number; probeY: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(300, Math.min(avail, 960));
  const H = 96;
  const left = 52;
  const right = W - 16;
  const cols = Math.min(400, Math.max(120, Math.floor(right - left)));
  const color = wavelengthColor(slits.lambdaNm);
  const data = useMemo(() => samplePattern(slits, halfWidth, cols), [slits, halfWidth, cols]);
  const px = (y: number) => left + ((y + halfWidth) / (2 * halfWidth)) * (right - left);
  const cw = (right - left) / cols + 0.6;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Screen pattern from ${fmt(-halfWidth * 1000)} to ${fmt(halfWidth * 1000)} mm; the marked point at ${fmt(probeY * 1000)} mm has relative intensity ${fmt(intensityAtScreen(slits, probeY))}`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect fill="#05080d" height={46} width={right - left} x={left} y={10} />
        {data.map((d, k) => <rect fill={color} fillOpacity={Math.sqrt(Math.max(0, Math.min(1, d.I)))} height={46} key={k} width={cw} x={left + (k * (right - left)) / cols} y={10} />)}
        <line stroke="#ffffff" strokeWidth={2} x1={px(probeY)} x2={px(probeY)} y1={6} y2={60} />
        <polygon fill={RED} points={`${px(probeY)},62 ${px(probeY) - 6},72 ${px(probeY) + 6},72`} />
        {[-1, -0.5, 0, 0.5, 1].map((f) => (
          <g key={f}>
            <line stroke={INK} x1={px(f * halfWidth)} x2={px(f * halfWidth)} y1={56} y2={61} />
            <text className="ph-tick" textAnchor="middle" x={px(f * halfWidth)} y={78 + 8}>{fmt(f * halfWidth * 1000)}</text>
          </g>
        ))}
        <text className="ph-note-text" x={4} y={32}>screen</text>
        <text className="ph-note-text" textAnchor="end" x={W - 16} y={H - 0.5}>position on the screen (mm); brightness is √(I/I₀)</text>
      </svg>
    </div>
  );
}

/** A schematic (not to scale) of the slits, the screen, and the two paths to the probe point whose difference is d sinθ. */
export function SlitSetupDiagram({ slits, probeY }: { slits: SlitInput; probeY: number }) {
  const [wrapRef, avail] = useContainerWidth();
  const W = Math.max(300, Math.min(avail, 760));
  const H = 230;
  const plateX = 70;
  const screenX = W - 70;
  const mid = H / 2;
  const slitsShown = Math.min(slits.N, 6);
  const gap = 26;
  const ys = Array.from({ length: slitsShown }, (_, k) => mid + (k - (slitsShown - 1) / 2) * gap);
  const theta = Math.atan2(probeY, slits.L);
  const pY = mid - Math.max(-70, Math.min(70, (Math.tan(theta) * (screenX - plateX)) * 0.8));
  const delta = slits.N > 1 ? pathDifferenceWavelengths(slits, probeY) : 0;
  const bright = Math.abs(delta - Math.round(delta)) < 0.05;
  const dark = Math.abs(Math.abs(delta % 1) - 0.5) < 0.05;
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Slit schematic: ${slits.N} slit${slits.N > 1 ? "s" : ""}, screen ${fmt(slits.L)} m away, probe at ${fmt(probeY * 1000)} mm from the centre${slits.N > 1 ? `, path difference ${fmt(delta)} wavelengths` : ""}`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} x={0} y={0} />
        {Array.from({ length: 4 }, (_, k) => <path d={`M${plateX - 54 + k * 10} ${mid - 20} Q${plateX - 40 + k * 10} ${mid} ${plateX - 54 + k * 10} ${mid + 20}`} fill="none" key={k} stroke={TEAL} strokeOpacity={0.5} strokeWidth={1.6} />)}
        <rect fill={INK} height={H - 40} width={8} x={plateX - 4} y={20} />
        {ys.map((y) => <rect fill="#fbfaf7" height={8} key={y} width={8} x={plateX - 4} y={y - 4} />)}
        {slits.N > slitsShown ? <text className="ph-note-text" x={plateX + 8} y={H - 24}>only {slitsShown} of {slits.N} slits drawn</text> : null}
        <rect fill="#e5dfd0" height={H - 40} width={8} x={screenX - 4} y={20} />
        {slits.N > 1 && slits.N <= 2 + 4 ? ys.slice(0, 2).map((y, k) => <line key={k} stroke={k === 0 ? TEAL : AMBER} strokeWidth={2} x1={plateX} x2={screenX} y1={y} y2={pY} />) : ys.slice(0, 1).map((y) => <line key={y} stroke={TEAL} strokeWidth={2} x1={plateX} x2={screenX} y1={y} y2={pY} />)}
        <circle cx={screenX} cy={pY} fill={RED} r={6} stroke="#fff" strokeWidth={2}><title>probe point on the screen</title></circle>
        <text className="ph-axis-label" textAnchor="middle" x={plateX} y={14}>slits</text>
        <text className="ph-axis-label" textAnchor="middle" x={screenX} y={14}>screen</text>
        <text className="ph-note-text" textAnchor="middle" x={(plateX + screenX) / 2} y={H - 8}>not to scale: L = {fmt(slits.L)} m, d = {fmt(slits.dUm)} µm, a = {fmt(slits.aUm)} µm, λ = {fmt(slits.lambdaNm)} nm</text>
        {slits.N > 1 ? <text className="ph-axis-label" textAnchor="middle" x={(plateX + screenX) / 2} y={mid - 90}>path difference = d sinθ = {fmt(delta)} λ — {bright ? "bright (in step)" : dark ? "dark (out of step)" : "in between"}</text> : <text className="ph-axis-label" textAnchor="middle" x={(plateX + screenX) / 2} y={mid - 90}>one slit: waves from different parts of the slit interfere</text>}
      </svg>
    </div>
  );
}
