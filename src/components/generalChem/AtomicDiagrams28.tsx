import { useEffect, useMemo, useRef } from "react";
import { useContainerWidth } from "../physics/simHooks";
import {
  SLICE_N, enclosureTable, hydrogenicEnergyEV, isoDensityForEnclosure, sliceGrid, wavelengthToRgb,
  type OrbitalBasis, type SlicePlane, type Transition,
} from "../../utils/generalChem/hydrogenic28";
import type { SubshellBoxes } from "../../utils/generalChem/config28";

const INK = "#0f172a";
const SLATE = "#475569";
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const RED = "#be123c";

const AXES: Record<SlicePlane, [string, string]> = { xz: ["x", "z"], xy: ["x", "y"], yz: ["y", "z"] };

/**
 * Slice of ψ (signed amplitude) or |ψ|² (density) through the nucleus. Everything is computed by hydrogenic28 from the closed-form
 * wavefunction; the outline is the iso-density line that encloses the chosen share of the electron probability (3-D grid estimate).
 * Colours: density uses one sequential hue; amplitude uses two hues for the two SIGNS of ψ, which is a phase and not a charge.
 */
export function OrbitalSlice({ n, l, ml, basis, plane, mode, enclosurePct, Z, description }: {
  n: number; l: number; ml: number; basis: OrbitalBasis; plane: SlicePlane; mode: "density" | "amplitude"; enclosurePct: number; Z: number; description: string;
}) {
  const [wrapRef, avail] = useContainerWidth(420);
  const size = Math.max(240, Math.min(avail, 460));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const grid = useMemo(() => sliceGrid({ n, l, ml, basis, plane, Z }), [n, l, ml, basis, plane, Z]);
  const iso = useMemo(() => isoDensityForEnclosure(enclosureTable(n, l, ml, basis, Z), enclosurePct / 100), [n, l, ml, basis, Z, enclosurePct]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const N = SLICE_N;
    const off = document.createElement("canvas");
    off.width = N; off.height = N;
    const octx = off.getContext("2d");
    const ctx = canvas.getContext("2d");
    if (!octx || !ctx) return;
    const img = octx.createImageData(N, N);
    const maxD = grid.maxDensity || 1; const maxA = grid.maxAmplitude || 1;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i; const d = grid.density[k];
        const inside = d >= iso && d > 0;
        let r: number; let g: number; let b: number;
        if (mode === "density") {
          const t = Math.sqrt(d / maxD);
          r = Math.round(251 - t * (251 - 11)); g = Math.round(250 - t * (250 - 106)); b = Math.round(247 - t * (247 - 114));
        } else {
          const a = grid.amplitude[k] / maxA; const t = Math.sqrt(Math.abs(a));
          if (a >= 0) { r = Math.round(251 - t * (251 - 37)); g = Math.round(250 - t * (250 - 99)); b = Math.round(247 - t * (247 - 235)); }
          else { r = Math.round(251 - t * (251 - 217)); g = Math.round(250 - t * (250 - 119)); b = Math.round(247 - t * (247 - 6)); }
        }
        const edge = inside && (i === 0 || j === 0 || i === N - 1 || j === N - 1 || grid.density[k - 1] < iso || grid.density[k + 1] < iso || grid.density[k - N] < iso || grid.density[k + N] < iso);
        if (edge) { r = 15; g = 23; b = 42; }
        const p = 4 * k; img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    canvas.width = size; canvas.height = size;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, size, size);
    ctx.strokeStyle = "rgba(71,85,105,0.55)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = INK; ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(AXES[plane][0], size - 16, size / 2 - 6); ctx.fillText(AXES[plane][1], size / 2 + 6, 14);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, 3, 0, 2 * Math.PI); ctx.fill();
  }, [grid, iso, mode, plane, size]);
  const ext = grid.extent;
  return (
    <div className="ph-diagram" ref={wrapRef} style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <canvas aria-label={description} data-testid="orbital-canvas" height={size} ref={canvasRef} role="img" style={{ width: size, height: size, border: "1px solid var(--border)", borderRadius: 6 }} width={size} />
      <p className="gc-field-hint" style={{ margin: 0 }}>Slice through the nucleus, ±{ext < 10 ? ext.toFixed(1) : Math.round(ext)} a₀{Z > 1 ? "/Z" : ""} on each axis; dashed lines are the axes. The dark outline encloses {enclosurePct} % of the probability (3-D estimate).</p>
    </div>
  );
}

/** Orbital boxes with spin arrows for each occupied subshell. */
export function OrbitalBoxes({ subshells, label }: { subshells: SubshellBoxes[]; label: string }) {
  const BOX = 34; const GAP = 3; const rowH = 54; const lab = 46;
  const maxBoxes = Math.max(1, ...subshells.map((s) => s.boxes.length));
  const W = lab + maxBoxes * (BOX + GAP) + 16; const H = subshells.length * rowH + 14;
  const arrow = (cx: number, y0: number, up: boolean, key: string) => {
    const y1 = y0 + 24; const [a, b] = up ? [y1, y0] : [y0, y1];
    return <path d={`M${cx} ${a}V${b}${up ? `m-4 5 4-5 4 5` : `m-4 -5 4 5 4-5`}`} fill="none" key={key} stroke={up ? TEAL : AMBER} strokeLinecap="round" strokeWidth={2} />;
  };
  const text = subshells.map((s) => `${s.label}: ${s.boxes.map((c) => (c === 3 ? "paired" : c === 1 ? "up" : c === 2 ? "down" : "empty")).join(", ")}`).join("; ");
  return (
    <div className="ph-diagram">
      <svg aria-label={`${label}. Orbital boxes. ${text}`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        {subshells.map((s, r) => (
          <g key={s.label} transform={`translate(0 ${10 + r * rowH})`}>
            <text fill={INK} fontSize={14} fontWeight={600} x={6} y={30}>{s.label}</text>
            {s.boxes.map((c, k) => {
              const x = lab + k * (BOX + GAP);
              return (
                <g key={k}>
                  <rect fill="none" height={42} stroke={INK} strokeWidth={1.5} width={BOX} x={x} y={4} />
                  {c === 3 ? <>{arrow(x + BOX * 0.32, 11, true, "u")}{arrow(x + BOX * 0.68, 11, false, "d")}</> : c === 1 ? arrow(x + BOX / 2, 11, true, "u") : c === 2 ? arrow(x + BOX / 2, 11, false, "d") : null}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Hydrogen-like energy levels drawn at their true relative energies, with the chosen transition and its photon. */
export function EnergyLevels({ Z, t }: { Z: number; t: Transition }) {
  const [wrapRef, avail] = useContainerWidth(520);
  const W = Math.max(300, Math.min(avail, 640)); const H = 380;
  const top = 24; const bottom = H - 30;
  const E1 = hydrogenicEnergyEV(1, Z);
  const y = (E: number) => top + ((0 - E) / (0 - E1)) * (bottom - top);
  const levels = [1, 2, 3, 4, 5, 6, 7, 8];
  const xL = 90; const xR = W - 150;
  const xi = xL + (xR - xL) * 0.35; const xf = xL + (xR - xL) * 0.65;
  const rgb = wavelengthToRgb(t.wavelengthNm);
  const col = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : SLATE;
  const up = t.kind === "absorption";
  const yi = y(t.Ei); const yf = y(t.Ef);
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Energy levels of a one-electron species with Z = ${Z}. ${t.kind === "emission" ? "Emission" : "Absorption"} between n = ${t.ni} and n = ${t.nf}: photon energy ${t.photonEV.toFixed(3)} electronvolts, wavelength ${t.wavelengthNm.toFixed(1)} nanometres, ${t.region}.`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <defs><marker id="lv-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="4" viewBox="0 0 8 8"><path d="M0 0.5 L7.5 4 L0 7.5 z" fill={INK} /></marker></defs>
        <rect className="ph-paper" height={H} width={W} />
        <line stroke={SLATE} strokeDasharray="4 4" x1={xL} x2={xR + 20} y1={y(0)} y2={y(0)} />
        <text fill={SLATE} fontSize={12} x={xR + 26} y={y(0) + 4}>n = ∞, E = 0</text>
        {levels.map((n) => {
          const E = hydrogenicEnergyEV(n, Z); const on = n === t.ni || n === t.nf;
          return (
            <g key={n}>
              <line stroke={on ? INK : SLATE} strokeWidth={on ? 3 : 1.5} x1={xL} x2={xR} y1={y(E)} y2={y(E)} />
              {n <= 3 || on ? <text fill={INK} fontSize={12} x={xL - 8} y={y(E) + 4} textAnchor="end">n = {n}</text> : null}
              {n <= 3 || on ? <text fill={SLATE} fontSize={12} x={xR + 8} y={y(E) + 4}>{E.toFixed(2)} eV</text> : null}
            </g>
          );
        })}
        <line markerEnd="url(#lv-arrow)" stroke={INK} strokeWidth={2} x1={up ? xi : xf} x2={up ? xi : xf} y1={up ? yf : yi} y2={up ? yi : yf} />
        <path d={`M${(xi + xf) / 2 - 36} ${(yi + yf) / 2}q9 -12 18 0t18 0t18 0t18 0`} fill="none" stroke={col} strokeWidth={4} transform={`translate(${(xf - xi) / 2 + 6} 0)`} />
        <text fill={INK} fontSize={13} fontWeight={600} x={xL} y={14}>{t.kind === "emission" ? "Emission" : "Absorption"} {t.ni} → {t.nf}: λ = {t.wavelengthNm.toFixed(1)} nm ({t.region})</text>
        <text fill={SLATE} fontSize={11} x={xL} y={H - 8}>Heights are the true energies E = −13.6 Z²/n² eV (ideal one-electron model).</text>
      </svg>
    </div>
  );
}

/** Wavelength axis with the lines of a series; the selected line is highlighted. The visible band uses an approximate screen colour map. */
export function SpectrumStrip({ lines, selected }: { lines: Transition[]; selected: Transition }) {
  const [wrapRef, avail] = useContainerWidth(520);
  const W = Math.max(300, Math.min(avail, 700)); const H = 120;
  const all = [...lines.map((l) => l.wavelengthNm), selected.wavelengthNm];
  const lo = Math.min(...all) * 0.92; const hi = Math.max(...all) * 1.06;
  const x = (nm: number) => 16 + ((nm - lo) / (hi - lo)) * (W - 32);
  const grads: Array<{ nm: number; color: string }> = [];
  for (let nm = Math.max(380, lo); nm <= Math.min(750, hi); nm += 10) { const c = wavelengthToRgb(nm); if (c) grads.push({ nm, color: `rgb(${c[0]},${c[1]},${c[2]})` }); }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={`Spectrum of the series ending on n = ${selected.lowerLevel}: ${lines.map((l) => `${l.ni}→${l.nf} ${l.wavelengthNm.toFixed(0)} nanometres`).join(", ")}. Selected: ${selected.wavelengthNm.toFixed(1)} nanometres.`} className="ph-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        <rect fill="#e2e8f0" height={46} width={W - 32} x={16} y={20} />
        {grads.map((g) => <rect fill={g.color} height={46} key={g.nm} width={Math.max(1, x(g.nm + 10) - x(g.nm))} x={x(g.nm)} y={20} />)}
        {lines.map((l) => (
          <line key={`${l.ni}-${l.nf}`} stroke={l.ni === selected.ni && l.nf === selected.nf ? RED : INK} strokeWidth={l.ni === selected.ni && l.nf === selected.nf ? 3 : 1.5} x1={x(l.wavelengthNm)} x2={x(l.wavelengthNm)} y1={14} y2={72} />
        ))}
        <text fill={SLATE} fontSize={11} x={16} y={14}>colour band = visible (380–750 nm), approximate screen colours</text>
        {ticks.map((t) => <g key={t}><line stroke={SLATE} x1={x(t)} x2={x(t)} y1={72} y2={78} /><text fill={INK} fontSize={11} textAnchor="middle" x={x(t)} y={92}>{Math.round(t)}</text></g>)}
        <text fill={INK} fontSize={12} textAnchor="middle" x={W / 2} y={112}>Wavelength (nm)</text>
      </svg>
    </div>
  );
}

