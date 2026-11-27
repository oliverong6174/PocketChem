import { useEffect, useRef } from "react";
import { useContainerWidth } from "../physics/simHooks";
import { boxesOf, cycleBox, lcaoGrid, levelsOf, type DiatomicSpecies } from "../../utils/generalChem/mo28";

const INK = "#0f172a";
const SLATE = "#475569";
const TEAL = "#0b6a72";
const AMBER = "#b45309";
const POS = "#2563eb";
const NEG = "#d97706";

/**
 * Qualitative MO diagram. Levels are spaced evenly in the declared ORDER (lowest at the bottom); heights are not energies.
 * Each orbital is a box that can be clicked or activated with the keyboard to cycle empty → ↑ → ↓ → ↑↓; the page also offers
 * explicit add/remove buttons for each orbital.
 */
export function MODiagram({ species, occ, onChange }: { species: DiatomicSpecies; occ: number[]; onChange: (next: number[]) => void }) {
  const [wrapRef, avail] = useContainerWidth(520);
  const levels = levelsOf(species); const boxes = boxesOf(species);
  const W = Math.max(320, Math.min(avail, 640)); const L = levels.length;
  const H = 90 + L * 54;
  const yOf = (li: number) => H - 54 - li * ((H - 120) / Math.max(1, L - 1));
  const cx = W / 2; const bw = 58;
  const xBox = (b: { level: number; sub: number }) => (levels[b.level].degeneracy === 2 ? cx + (b.sub === 0 ? -40 : 40) - bw / 2 : cx - bw / 2);
  const two = species.ordering !== "1s-only";
  const aoY = two
    ? { s: (yOf(0) + yOf(1)) / 2, p: levels.map((_, i) => i).filter((i) => i >= 2).reduce((a, i) => a + yOf(i), 0) / (L - 2) }
    : { s: (yOf(0) + yOf(1)) / 2, p: 0 };
  const arrow = (x: number, y: number, up: boolean, key: string) => <path d={`M${x} ${up ? y + 12 : y - 12}V${up ? y - 12 : y + 12}${up ? `m-4 5 4-5 4 5` : `m-4 -5 4 5 4-5`}`} fill="none" key={key} stroke={up ? TEAL : AMBER} strokeLinecap="round" strokeWidth={2.2} />;
  const stateWord = (c: number) => (c === 3 ? "two electrons, paired" : c === 1 ? "one electron, spin up" : c === 2 ? "one electron, spin down" : "empty");
  const desc = `Molecular orbital diagram of ${species.formula}. From the lowest orbital: ${levels.map((lv, li) => `${lv.label} (${lv.kind}): ${boxes.map((b, i) => ({ b, i })).filter(({ b }) => b.level === li).map(({ i }) => stateWord(occ[i])).join("; ")}`).join(". ")}.`;
  const activate = (i: number) => { const next = cycleBox(occ, i); if (next) onChange(next); };
  const aoLabel = species.ordering === "1s-only" ? "1s" : "";
  return (
    <div className="ph-diagram" ref={wrapRef}>
      <svg aria-label={desc} className="ph-svg" data-testid="mo-svg" height={H} role="group" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        <text fill={SLATE} fontSize={12} fontWeight={700} textAnchor="middle" x={46} y={20}>Atom A</text>
        <text fill={SLATE} fontSize={12} fontWeight={700} textAnchor="middle" x={cx} y={20}>Molecular orbitals</text>
        <text fill={SLATE} fontSize={12} fontWeight={700} textAnchor="middle" x={W - 46} y={20}>Atom B</text>
        {/* atomic orbitals and correlation lines */}
        {[46, W - 46].map((x, side) => (
          <g key={side}>
            <line stroke={INK} strokeWidth={2.5} x1={x - 24} x2={x + 24} y1={aoY.s} y2={aoY.s} />
            <text fill={INK} fontSize={12} textAnchor="middle" x={x} y={aoY.s - 6}>{two ? "2s" : aoLabel}</text>
            {two ? <><line stroke={INK} strokeWidth={2.5} x1={x - 24} x2={x + 24} y1={aoY.p} y2={aoY.p} /><text fill={INK} fontSize={12} textAnchor="middle" x={x} y={aoY.p - 6}>2p (×3)</text></> : null}
          </g>
        ))}
        {levels.map((_, li) => {
          const from = two ? (li < 2 ? aoY.s : aoY.p) : aoY.s;
          return [-1, 1].map((side) => (
            <line key={`${li}-${side}`} stroke={SLATE} strokeDasharray="3 4" strokeOpacity={0.6} x1={side < 0 ? 70 : W - 70} x2={side < 0 ? cx - 78 : cx + 78} y1={from} y2={yOf(li)} />
          ));
        })}
        {levels.map((lv, li) => (
          <text fill={lv.kind === "bonding" ? TEAL : AMBER} fontSize={14} fontWeight={700} key={lv.id} textAnchor="end" x={cx - 84} y={yOf(li) + 4}>{lv.label}</text>
        ))}
        {boxes.map((b, i) => {
          const x = xBox(b); const y = yOf(b.level); const c = occ[i];
          return (
            <g aria-label={`${levels[b.level].label}${levels[b.level].degeneracy === 2 ? ` orbital ${b.sub + 1}` : ""}: ${stateWord(c)}. Activate to change.`} data-testid={`mo-box-${b.id}`} key={b.id} onClick={() => activate(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(i); } }} role="button" style={{ cursor: "pointer" }} tabIndex={0}>
              <rect fill="transparent" height={34} width={bw + 8} x={x - 4} y={y - 17} />
              <rect fill={c ? "#e2f1f2" : "none"} height={26} stroke={INK} strokeWidth={1.6} width={bw} x={x} y={y - 13} />
              {c === 3 ? <>{arrow(x + bw * 0.34, y, true, "u")}{arrow(x + bw * 0.66, y, false, "d")}</> : c === 1 ? arrow(x + bw / 2, y, true, "u") : c === 2 ? arrow(x + bw / 2, y, false, "d") : null}
            </g>
          );
        })}
        <text fill={SLATE} fontSize={11} x={10} y={H - 8}>Heights show the ORDER of the orbitals only, not energies. Teal = bonding, amber = antibonding. Click or press Enter on an orbital to change it.</text>
      </svg>
    </div>
  );
}

/** Canvas of the LCAO σ1s or σ*1s of two hydrogen 1s orbitals in a plane containing the bond axis (vertical). */
export function LcaoCanvas({ combo, R }: { combo: "bonding" | "antibonding"; R: number }) {
  const [wrapRef, avail] = useContainerWidth(380);
  const wpx = Math.max(240, Math.min(avail, 420));
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const grid = lcaoGrid(combo === "bonding" ? 1 : -1, R);
    const N = grid.N; const off = document.createElement("canvas"); off.width = N; off.height = N;
    const octx = off.getContext("2d"); const ctx = canvas.getContext("2d"); if (!octx || !ctx) return;
    const img = octx.createImageData(N, N);
    for (let k = 0; k < N * N; k++) {
      const a = grid.amplitude[k] / (grid.maxAmp || 1); const t = Math.sqrt(Math.abs(a));
      const [r, g, b] = a >= 0 ? [251 - t * (251 - 37), 250 - t * (250 - 99), 247 - t * (247 - 235)] : [251 - t * (251 - 217), 250 - t * (250 - 119), 247 - t * (247 - 6)];
      img.data[4 * k] = r; img.data[4 * k + 1] = g; img.data[4 * k + 2] = b; img.data[4 * k + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    const hpx = Math.round(wpx * ((2 * grid.extentZ) / (2 * grid.extentX)));
    canvas.width = wpx; canvas.height = hpx; ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, wpx, hpx);
    const zpx = (z: number) => hpx / 2 - (z / grid.extentZ) * (hpx / 2);
    ctx.fillStyle = INK; for (const z of [R / 2, -R / 2]) { ctx.beginPath(); ctx.arc(wpx / 2, zpx(z), 4, 0, 2 * Math.PI); ctx.fill(); }
    ctx.strokeStyle = "rgba(15,23,42,0.5)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(wpx / 2, 0); ctx.lineTo(wpx / 2, hpx); ctx.stroke(); ctx.setLineDash([]);
  }, [combo, R, wpx]);
  const hpxCss = Math.round(wpx * ((2 * (R / 2 + 4.5)) / 9));
  return (
    <div className="ph-diagram" ref={wrapRef} style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <canvas aria-label={`LCAO ${combo === "bonding" ? "σ1s, in-phase" : "σ*1s, out-of-phase"} combination of two hydrogen 1s orbitals separated by ${R.toFixed(1)} bohr. ${combo === "bonding" ? "The amplitude has one sign everywhere and is largest between and around the nuclei." : "The amplitude changes sign across a nodal plane midway between the nuclei."} Blue is positive and orange negative amplitude (sign of the wavefunction, not charge).`} data-testid="lcao-canvas" ref={ref} role="img" style={{ width: wpx, height: hpxCss, border: "1px solid var(--border)", borderRadius: 6 }} />
      <p className="gc-field-hint" style={{ margin: 0 }}>Plane containing the bond axis (vertical, dashed); dots are the nuclei. Blue and orange are the two signs of ψ.</p>
    </div>
  );
}

/** Schematic p-orbital lobes for σ (end-on) and π (side-on) combinations. Drawn, not computed. */
export function SchematicLobes({ kind, combo }: { kind: "sigma" | "pi"; combo: "bonding" | "antibonding" }) {
  const W = 400; const H = 190; const xa = 120; const xb = 280; const y0 = 95;
  const bonding = combo === "bonding";
  const fill = (s: number) => (s > 0 ? POS : NEG);
  const lobe = (x: number, y: number, sign: number, rx: number, ry: number, key: string) => <ellipse cx={x} cy={y} fill={fill(sign)} fillOpacity={0.55} key={key} rx={rx} ry={ry} stroke={fill(sign)} strokeWidth={1.5} />;
  const name = `${kind === "sigma" ? (bonding ? "σ2p" : "σ*2p") : (bonding ? "π2p" : "π*2p")}`;
  const desc = `Schematic of the ${name} combination of two 2p orbitals ${kind === "sigma" ? "overlapping end-on along the bond axis" : "overlapping side-on above and below the bond axis"}. ${bonding ? "Overlapping lobes have the same sign (in phase), so density builds up in the overlap region." : "Facing lobes have opposite signs (out of phase), giving a nodal plane between the nuclei (or along the axis for π)."} Blue and orange are the signs of the wavefunction, not charge. Not computed.`;
  return (
    <div className="ph-diagram">
      <svg aria-label={desc} className="ph-svg" data-testid="lobes-svg" height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
        <rect className="ph-paper" height={H} width={W} />
        {kind === "sigma" ? (
          <>
            {lobe(xa - 38, y0, -1, 34, 17, "al")}{lobe(xa + 38, y0, 1, 34, 17, "ar")}
            {lobe(xb - 38, y0, bonding ? 1 : -1, 34, 17, "bl")}{lobe(xb + 38, y0, bonding ? -1 : 1, 34, 17, "br")}
            {!bonding ? <line stroke={INK} strokeDasharray="5 4" strokeWidth={1.6} x1={(xa + xb) / 2} x2={(xa + xb) / 2} y1={40} y2={150} /> : null}
          </>
        ) : (
          <>
            {lobe(xa, y0 - 38, 1, 17, 34, "at")}{lobe(xa, y0 + 38, -1, 17, 34, "ab")}
            {lobe(xb, y0 - 38, bonding ? 1 : -1, 17, 34, "bt")}{lobe(xb, y0 + 38, bonding ? -1 : 1, 17, 34, "bb")}
            {bonding ? <line stroke={INK} strokeDasharray="5 4" strokeWidth={1.6} x1={60} x2={340} y1={y0} y2={y0} /> : <line stroke={INK} strokeDasharray="5 4" strokeWidth={1.6} x1={(xa + xb) / 2} x2={(xa + xb) / 2} y1={25} y2={165} />}
          </>
        )}
        <circle cx={xa} cy={y0} fill={INK} r={4} /><circle cx={xb} cy={y0} fill={INK} r={4} />
        <text fill={INK} fontSize={14} fontWeight={700} x={14} y={22}>{name}: {bonding ? "in phase" : "out of phase"}</text>
        <text fill={SLATE} fontSize={11} x={14} y={H - 8}>Schematic (not computed). Blue/orange = sign of ψ, not charge. Dashed line = nodal plane{kind === "pi" && bonding ? " (contains the bond axis)" : ""}.</text>
      </svg>
    </div>
  );
}
