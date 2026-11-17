import { type ReactNode } from "react";
import { ArrowMarkers, SelG, Txt } from "./cell23";
import { COL, INK, MUTED, mv } from "./cellConst23";
import {
  ION_IDS, IONS, PASSIVE_SOLUTES, type BilayerComponentId, type BilayerState, type Direction, type IonExplorerInput, type OsmosisInput, type OsmosisResult, type PassiveInput, type PassiveResult, type PumpState, type SgltInput, type SgltResult,
  evaluateIons,
} from "../../utils/biology/membrane23";

/**
 * Membrane scenes. Every arrow, count and label is computed from the engine result passed in; the only decisions made here are
 * pixel positions. Extracellular space is always at the top, the cytosol at the bottom. An inward movement is a downward arrow.
 */
const W = 480;
const MT = 140; // membrane top (head centre of the outer leaflet)
const MB = 204; // membrane bottom (head centre of the inner leaflet)
const MID = (MT + MB) / 2;

const jitter = (i: number, amp: number) => Math.sin(i * 2.17 + 0.6) * amp;

interface BilayerProps { lipids: BilayerState["lipids"]; temperature: BilayerState["temperature"]; cholesterol: boolean; gaps: Array<[number, number]>; heads?: boolean }
/** The phospholipid bilayer: heads (circles) facing water and two tails each; kinked tails when unsaturated, wavier when warm. */
function Bilayer({ lipids, temperature, cholesterol, gaps }: BilayerProps) {
  const sp = lipids === "saturated" ? 15 : lipids === "mixed" ? 17 : 19;
  const amp = temperature === "cool" ? 0 : temperature === "moderate" ? 1.6 : 3.2;
  const items: ReactNode[] = [];
  const inGap = (x: number) => gaps.some(([a, b]) => x > a - 8 && x < b + 8);
  let k = 0;
  for (let x = 10; x < W - 6; x += sp) {
    k += 1;
    if (inGap(x)) continue;
    for (const leaflet of [0, 1] as const) {
      const hy = leaflet === 0 ? MT : MB;
      const dir = leaflet === 0 ? 1 : -1;
      const unsat = lipids === "unsaturated" || (lipids === "mixed" && k % 2 === 0);
      const tail = (dx: number, seed: number) => {
        const j = jitter(k * 2 + seed + leaflet * 7, amp);
        const x0 = x + dx, y0 = hy + dir * 6;
        const mid = y0 + dir * 14, end = y0 + dir * 28;
        const kinkX = unsat ? (seed % 2 === 0 ? 4 : -4) : 0;
        return <path d={`M${x0} ${y0} L${x0 + j * 0.4} ${(y0 + mid) / 2} L${x0 + kinkX + j} ${mid} L${x0 + j * 0.3} ${(mid + end) / 2} L${x0 + j * 0.6} ${end}`} fill="none" key={`t${leaflet}${dx}`} stroke={COL.tail} strokeLinejoin="round" strokeWidth={1.8} />;
      };
      items.push(<g key={`l${k}-${leaflet}`}><circle cx={x} cy={hy} fill={COL.head} r={6.2} stroke={COL.headStroke} strokeWidth={1.3} />{tail(-2.6, 1)}{tail(2.6, 2)}</g>);
    }
    if (cholesterol && k % 5 === 2) {
      for (const leaflet of [0, 1] as const) {
        const cy = leaflet === 0 ? MT + 18 : MB - 18;
        items.push(<g key={`c${k}-${leaflet}`}><rect fill="#fef3c7" height={20} rx={3} stroke={COL.chol} strokeWidth={1.4} width={6} x={x + 7} y={cy - 10} /><circle cx={x + 10} cy={leaflet === 0 ? MT + 8 : MB - 8} fill={COL.chol} r={2.2} /></g>);
      }
    }
  }
  return <g>{items}</g>;
}

const Water = ({ top = 0, bottom = H_MAX }: { top?: number; bottom?: number }) => (
  <g>
    <rect fill="#eaf6fd" height={MT - 6 - top} width={W} x={0} y={top} />
    <rect fill="#fffbe6" height={bottom - (MB + 6)} width={W} x={0} y={MB + 6} />
  </g>
);
const H_MAX = 330;
const SideLabels = ({ extra }: { extra?: ReactNode }) => (
  <g>
    <Txt anchor="start" bold fill={MUTED} size={12} x={8} y={16}>EXTRACELLULAR FLUID</Txt>
    <Txt anchor="start" bold fill={MUTED} size={12} x={8} y={H_MAX - 8}>CYTOSOL (INSIDE THE CELL)</Txt>
    {extra}
  </g>
);

/** Protein glyphs. y spans the membrane: 124..220. */
function Channel({ x, open = true, label, sel, onSelect, id = "channel", ion, wide = false }: { x: number; open?: boolean; label?: string; sel: string | null; onSelect: (id: string | null) => void; id?: string; ion?: string; wide?: boolean }) {
  const g = wide ? 8 : 6;
  return (
    <SelG id={id} label={label ?? "Channel protein"} onSelect={onSelect} selected={sel}>
      <rect fill={COL.protein} height={104} rx={6} stroke={COL.proteinStroke} strokeWidth={2} width={18} x={x - 18 - g} y={MT - 18} />
      <rect fill={COL.protein} height={104} rx={6} stroke={COL.proteinStroke} strokeWidth={2} width={18} x={x + g} y={MT - 18} />
      {open ? <rect fill="#dbeafe" height={96} width={g * 2} x={x - g} y={MT - 14} /> : <rect fill="#94a3b8" height={14} rx={3} width={g * 2 + 6} x={x - g - 3} y={MID - 7} />}
      {ion ? <Txt bold fill={COL.proteinStroke} size={11} x={x} y={MB + 46}>{ion}</Txt> : null}
      {sel === id ? <rect fill="none" height={116} rx={9} stroke="#1d4ed8" strokeDasharray="5 3" strokeWidth={2.2} width={g * 2 + 48} x={x - g - 24} y={MT - 24} /> : null}
    </SelG>
  );
}
function Carrier({ x, label = "Carrier protein", sel, onSelect, id = "carrier", loaded = false, facing = "out", tag }: { x: number; label?: string; sel: string | null; onSelect: (id: string | null) => void; id?: string; loaded?: boolean; facing?: "out" | "in" | "closed"; tag?: string }) {
  const notchY = facing === "out" ? MT - 18 : facing === "in" ? MB + 8 : MID - 6;
  return (
    <SelG id={id} label={label} onSelect={onSelect} selected={sel}>
      <rect fill={COL.protein} height={106} rx={26} stroke={COL.proteinStroke} strokeWidth={2} width={58} x={x - 29} y={MT - 20} />
      <rect fill="#ffffff" height={22} rx={10} stroke={COL.proteinStroke} strokeWidth={1.6} width={22} x={x - 11} y={notchY} />
      {loaded ? <circle cx={x} cy={notchY + 11} fill={COL.glu} r={7} /> : null}
      {tag ? <Txt bold fill={COL.proteinStroke} size={11} x={x} y={MB + 38}>{tag}</Txt> : null}
      {sel === id ? <rect fill="none" height={118} rx={12} stroke="#1d4ed8" strokeDasharray="5 3" strokeWidth={2.2} width={74} x={x - 37} y={MT - 26} /> : null}
    </SelG>
  );
}

function dots(n: number, x0: number, x1: number, y0: number, y1: number, color: string, shape: "circle" | "square" = "circle", seed = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * (x1 - x0)) / Math.max(1, y1 - y0))));
  const rows = Math.max(1, Math.ceil(n / cols));
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + ((i % cols) + 0.5 + jitter(i + seed, 0.18)) * ((x1 - x0) / cols);
    const cy = y0 + (Math.floor(i / cols) + 0.5 + jitter(i * 3 + seed, 0.18)) * ((y1 - y0) / rows);
    out.push(shape === "circle" ? <circle cx={cx} cy={cy} fill={color} key={`${seed}-${i}`} r={4.4} stroke="#ffffff" strokeWidth={0.8} /> : <rect fill={color} height={8} key={`${seed}-${i}`} stroke="#ffffff" strokeWidth={0.8} width={8} x={cx - 4} y={cy - 4} />);
  }
  return out;
}
const count = (c: number, max: number) => (c <= 0 ? 0 : Math.max(1, Math.round((c / max) * 18)));
const solColor = (s: string) => (s === "na" ? COL.na : s === "k" ? COL.k : s === "cl" ? COL.cl : s === "ca" ? COL.ca : s === "glucose" ? COL.glu : s === "o2" ? COL.o2 : "#475569");

// ---- bilayer ----------------------------------------------------------------------------------------------------------------------

export function BilayerScene({ state, onSelect }: { state: BilayerState; onSelect: (id: BilayerComponentId | null) => void }) {
  const sel = state.selected;
  const pick = (id: string | null) => onSelect(id as BilayerComponentId | null);
  const ring = (id: string, x: number, y: number, w: number, h: number) => (sel === id ? <rect fill="none" height={h} rx={8} stroke="#1d4ed8" strokeDasharray="5 3" strokeWidth={2.2} width={w} x={x} y={y} /> : null);
  const summary = `Phospholipid bilayer with ${state.lipids} lipids at ${state.temperature} temperature, cholesterol ${state.cholesterol ? "present" : "absent"}. Extracellular fluid above, cytosol below; hydrophilic heads face the water and hydrophobic tails fill the core. Drawn: glycoprotein, integral protein, channel, carrier, pump and a peripheral protein.${sel ? ` Selected: ${sel}.` : ""}`;
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox={`0 0 ${W} ${H_MAX}`}>
      <Water />
      <SideLabels />
      <Bilayer cholesterol={state.cholesterol} gaps={[[88, 104], [135, 175], [214, 246], [275, 320], [350, 400]]} lipids={state.lipids} temperature={state.temperature} />
      {/* glycoprotein on the outer surface */}
      <SelG id="glyco" label="Glycoprotein or glycolipid (carbohydrate on the outside surface)" onSelect={pick} selected={sel}>
        <rect fill={COL.protein} height={44} rx={4} stroke={COL.proteinStroke} strokeWidth={2} width={14} x={89} y={MT - 14} />
        <path d="M96 126 L96 92 M96 108 L82 96 M96 108 L110 96" fill="none" stroke={COL.glu} strokeWidth={2.4} />
        {[[96, 90], [82, 94], [110, 94]].map(([cx, cy]) => <circle cx={cx} cy={cy} fill="#fbcfe8" key={`${cx}`} r={5} stroke={COL.glu} strokeWidth={1.5} />)}
        {ring("glyco", 70, 78, 52, 100)}
      </SelG>
      {/* integral protein: helices spanning the bilayer */}
      <SelG id="integral" label="Integral membrane protein (spans the bilayer)" onSelect={pick} selected={sel}>
        {[142, 155, 168].map((x) => <rect fill={COL.protein} height={104} key={x} rx={6} stroke={COL.proteinStroke} strokeWidth={2} width={11} x={x - 5} y={MT - 18} />)}
        {ring("integral", 128, MT - 26, 56, 120)}
      </SelG>
      <Channel id="channel" label="Channel protein (water-filled pore)" onSelect={pick} sel={sel} x={230} />
      <Carrier id="carrier" label="Carrier protein" onSelect={pick} sel={sel} x={297} />
      <SelG id="pump" label="Pump (ATPase)" onSelect={pick} selected={sel}>
        <rect fill={COL.protein} height={108} rx={14} stroke={COL.proteinStroke} strokeWidth={2} width={50} x={350} y={MT - 22} />
        <path d="M358 190 L392 190" stroke={COL.atp} strokeWidth={3} />
        <rect fill="#cffafe" height={18} rx={9} stroke={COL.atp} strokeWidth={1.6} width={34} x={358} y={MB + 8} />
        <Txt bold fill={COL.atp} size={11} x={375} y={MB + 21}>ATP</Txt>
        {ring("pump", 340, MT - 30, 70, 126)}
      </SelG>
      <SelG id="peripheral" label="Peripheral membrane protein (on the surface, does not span the bilayer)" onSelect={pick} selected={sel}>
        <ellipse cx={170} cy={MB + 42} fill="#ddd6fe" rx={32} ry={17} stroke="#6d28d9" strokeWidth={2} />
        <Txt bold fill="#4c1d95" size={11} x={170} y={MB + 46}>peripheral</Txt>
        {ring("peripheral", 128, MB + 20, 84, 44)}
      </SelG>
      <SelG id="head" label="Phospholipid head group (hydrophilic)" onSelect={pick} selected={sel}>
        <circle cx={437} cy={MT} fill={COL.head} r={9} stroke={COL.headStroke} strokeWidth={1.6} />
        <rect fill="transparent" height={34} width={34} x={420} y={MT - 17} />
        {ring("head", 420, MT - 18, 34, 36)}
      </SelG>
      <SelG id="tail" label="Fatty-acid tails (hydrophobic core)" onSelect={pick} selected={sel}>
        <path d="M434 156 L434 184 M441 156 L441 184" fill="none" stroke={COL.tail} strokeWidth={3} />
        <rect fill="transparent" height={36} width={30} x={422} y={152} />
        {ring("tail", 420, 150, 36, 40)}
      </SelG>
      <SelG id="cholesterol" label="Cholesterol" onSelect={pick} selected={sel}>
        <rect fill="#fef3c7" height={26} rx={4} stroke={COL.chol} strokeDasharray={state.cholesterol ? undefined : "4 3"} strokeWidth={1.8} width={10} x={449} y={162} />
        <circle cx={454} cy={157} fill={COL.chol} r={3} opacity={state.cholesterol ? 1 : 0.4} />
        {ring("cholesterol", 440, 148, 30, 52)}
      </SelG>
      <Txt fill={INK} size={11} x={96} y={72}>glycoprotein</Txt>
      <Txt fill={INK} size={11} x={155} y={110}>integral</Txt>
      <Txt fill={INK} size={11} x={230} y={110}>channel</Txt>
      <Txt fill={INK} size={11} x={297} y={110}>carrier</Txt>
      <Txt fill={INK} size={11} x={375} y={110}>pump</Txt>
      <Txt fill={INK} size={10.5} x={437} y={110}>head</Txt>
      <Txt fill={INK} size={10.5} x={425} y={216}>tails</Txt>
      <Txt anchor="end" fill={INK} size={10.5} x={W - 4} y={230}>cholesterol{state.cholesterol ? "" : " (absent)"}</Txt>
      <Txt anchor="end" fill={MUTED} italic size={11} x={W - 8} y={H_MAX - 8}>Heads face water; tails form the hydrophobic core</Txt>
    </svg>
  );
}

// ---- passive transport ----------------------------------------------------------------------------------------------------------

const dirWord = (d: Direction) => (d === "inward" ? "INTO the cell" : d === "outward" ? "OUT of the cell" : "no net movement");

export function PassiveScene({ input, result, selected, onSelect }: { input: PassiveInput; result: PassiveResult; selected: string | null; onSelect: (id: string | null) => void }) {
  const def = PASSIVE_SOLUTES[input.solute];
  const color = solColor(input.solute);
  const maxC = Math.max(input.cOut, input.cIn);
  const nOut = count(input.cOut, maxC), nIn = count(input.cIn, maxC);
  const X = 190;
  const down = result.direction === "inward";
  const arrowColor = result.direction === "none" ? MUTED : COL.ok;
  const gaps: Array<[number, number]> = input.mechanism === "simple" ? [] : input.mechanism === "carrier" ? [[X - 29, X + 29]] : [[X - 26, X + 26]];
  const summary = `${def.label} ${input.mechanism === "simple" ? "simple diffusion" : input.mechanism === "carrier" ? "carrier-mediated facilitated diffusion" : "channel-mediated transport"}. Outside ${input.cOut} mM, inside ${input.cIn} mM. Net movement: ${dirWord(result.direction)}. No ATP is used.${result.ion ? ` Equilibrium potential ${result.ion.eMv.toFixed(1)} mV, membrane voltage ${input.vmMv} mV.` : ""}`;
  const chem = input.cOut > input.cIn ? "in" : input.cOut < input.cIn ? "out" : "none";
  const elec = result.ion ? (def.z * input.vmMv < 0 ? "in" : def.z * input.vmMv > 0 ? "out" : "none") : "none";
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox={`0 0 ${W} ${H_MAX}`}>
      <ArrowMarkers prefix="pa" />
      <Water />
      <SideLabels />
      <Bilayer cholesterol={false} gaps={gaps} lipids="mixed" temperature="moderate" />
      {input.mechanism === "channel" ? <Channel id="channel" ion={def.ion ? `${def.label} channel` : "channel"} onSelect={onSelect} sel={selected} x={X} /> : null}
      {input.mechanism === "carrier" ? <Carrier id="carrier" onSelect={onSelect} sel={selected} tag="GLUT carrier" x={X} /> : null}
      {dots(nOut, 20, 160, 28, 120, color, "circle", 1)}
      {dots(nIn, 20, 160, MB + 40, 300, color, "circle", 2)}
      <Txt anchor="start" bold fill={color} size={12} x={24} y={126}>{def.label}: {input.cOut} mM</Txt>
      <Txt anchor="start" bold fill={color} size={12} x={24} y={MB + 30}>{def.label}: {input.cIn} mM</Txt>
      {result.direction === "none" ? (
        <g>
          <line markerEnd="url(#pa-ink)" stroke={MUTED} strokeDasharray="4 3" strokeWidth={2.2} x1={X - 14} x2={X - 14} y1={74} y2={228} />
          <line markerEnd="url(#pa-ink)" stroke={MUTED} strokeDasharray="4 3" strokeWidth={2.2} x1={X + 14} x2={X + 14} y1={228} y2={76} />
          <Txt anchor="start" bold fill={MUTED} size={12} x={X + 34} y={118}>equal rates</Txt>
        </g>
      ) : (
        <g>
          <line markerEnd="url(#pa-ok)" stroke={arrowColor} strokeWidth={4} x1={X} x2={X} y1={down ? 74 : 228} y2={down ? 228 : 74} />
          <Txt anchor="start" bold fill={COL.ok} size={12} x={X + 34} y={118}>net: {down ? "in" : "out"}</Txt>
        </g>
      )}
      <Txt anchor="end" bold fill={COL.bad} size={11.5} x={W - 8} y={H_MAX - 26}>No ATP: passive ({input.mechanism === "simple" ? "simple diffusion" : "facilitated"})</Txt>
      {result.ion ? (
        <g>
          <rect fill="#ffffff" height={106} rx={8} stroke="#cbd5e1" width={150} x={322} y={22} />
          <Txt anchor="start" bold fill={INK} size={11} x={330} y={38}>Forces on {def.label}</Txt>
          <Txt anchor="start" fill={INK} size={11} x={330} y={56}>Concentration:</Txt>
          {chem === "none" ? <Txt anchor="start" fill={MUTED} size={11} x={420} y={56}>none</Txt> : <g><line markerEnd="url(#pa-ink)" stroke={INK} strokeWidth={2.4} x1={416} x2={416} y1={chem === "in" ? 46 : 62} y2={chem === "in" ? 62 : 46} /><Txt anchor="start" fill={INK} size={11} x={424} y={56}>{chem}</Txt></g>}
          <Txt anchor="start" fill={INK} size={11} x={330} y={78}>Electrical (Vm):</Txt>
          {elec === "none" ? <Txt anchor="start" fill={MUTED} size={11} x={430} y={78}>none</Txt> : <g><line markerEnd="url(#pa-ink)" stroke={INK} strokeWidth={2.4} x1={426} x2={426} y1={elec === "in" ? 68 : 84} y2={elec === "in" ? 84 : 68} /><Txt anchor="start" fill={INK} size={11} x={434} y={78}>{elec}</Txt></g>}
          <Txt anchor="start" bold fill={COL.ok} size={11} x={330} y={100}>Net: {result.direction === "none" ? "equilibrium" : result.direction}</Txt>
          <Txt anchor="start" fill={MUTED} size={10.5} x={330} y={118}>E {result.ion.eMv.toFixed(0)} mV · Vm {input.vmMv} mV</Txt>
          <Txt anchor="end" bold fill={INK} size={11} x={W - 6} y={MB + 20}>{input.vmMv < 0 ? "inside −" : input.vmMv > 0 ? "inside +" : "Vm = 0"}</Txt>
        </g>
      ) : null}
    </svg>
  );
}

// ---- ions ----------------------------------------------------------------------------------------------------------------------

export function IonScene({ input, selected, onSelect }: { input: IonExplorerInput; selected: string | null; onSelect: (id: string | null) => void }) {
  const ev = evaluateIons(input);
  const xs = [70, 175, 280, 385];
  const summary = `Four ion channels in the membrane. ${ev.ions.map((d) => `${IONS[d.ion].symbol}: outside ${input.ions[d.ion].out} mM, inside ${input.ions[d.ion].in} mM, equilibrium potential ${d.eMv.toFixed(1)} mV, net movement through an open channel ${d.direction === "none" ? "none" : d.direction}`).join("; ")}. Membrane voltage ${ev.vmMv.toFixed(1)} mV.`;
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox={`0 0 ${W} ${H_MAX}`}>
      <ArrowMarkers prefix="io" />
      <Water />
      <SideLabels extra={<Txt anchor="end" bold fill={INK} size={12} x={W - 8} y={16}>Vm = {mv(ev.vmMv)}</Txt>} />
      <Bilayer cholesterol={false} gaps={xs.map((x) => [x - 26, x + 26] as [number, number])} lipids="mixed" temperature="moderate" />
      {ION_IDS.map((id, i) => {
        const g = input.ions[id], d = ev.ions[i];
        const maxC = Math.max(g.out, g.in);
        const c = solColor(id);
        const x = xs[i];
        const on = selected === id;
        return (
          <g key={id}>
            <Channel id="channel" label={`${IONS[id].symbol} channel`} onSelect={() => onSelect(on ? null : id)} sel={on ? "channel" : null} wide x={x} />
            {dots(count(g.out, maxC), x - 40, x + 40, 34, 98, c, "circle", i + 1)}
            {dots(count(g.in, maxC), x - 40, x + 40, MB + 24, 290, c, "circle", i + 7)}
            <Txt bold fill={c} size={13} x={x} y={26}>{IONS[id].symbol}</Txt>
            <Txt fill={c} size={10.5} x={x} y={112}>{Number(g.out.toPrecision(3))} mM</Txt>
            <Txt fill={c} size={10.5} x={x} y={MB + 20}>{Number(g.in.toPrecision(3))} mM</Txt>
            {d.direction === "none" ? <Txt bold fill={MUTED} size={11.5} x={x} y={H_MAX - 8}>E = Vm: no net flow</Txt> : (
              <g>
                <line markerEnd="url(#io-ok)" stroke={COL.ok} strokeWidth={3.2} x1={x + 34} x2={x + 34} y1={d.direction === "inward" ? 128 : 218} y2={d.direction === "inward" ? 218 : 128} />
                <Txt bold fill={COL.ok} size={11.5} x={x} y={H_MAX - 8}>{d.direction === "inward" ? "net in" : "net out"} · E {Math.round(d.eMv)} mV</Txt>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The voltage ladder: every ion's equilibrium potential and the membrane voltage on one axis. */
export function VoltageLadder({ input }: { input: IonExplorerInput }) {
  const ev = evaluateIons(input);
  const lo = -130, hi = 150, w = 440, x0 = 20;
  const px = (v: number) => x0 + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * w;
  const summary = `Voltage ladder in millivolts. ${ev.ions.map((d) => `E(${IONS[d.ion].symbol}) = ${d.eMv.toFixed(1)}`).join(", ")}. Membrane voltage ${ev.vmMv.toFixed(1)} mV.`;
  const order = [...ev.ions].sort((a, b) => a.eMv - b.eMv);
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox="0 0 480 170">
      <line stroke={INK} strokeWidth={2} x1={x0} x2={x0 + w} y1={96} y2={96} />
      {[-100, -50, 0, 50, 100, 150].map((t) => <g key={t}><line stroke={INK} x1={px(t)} x2={px(t)} y1={90} y2={102} /><Txt fill={MUTED} size={11} x={px(t)} y={118}>{t}</Txt></g>)}
      <Txt anchor="end" fill={MUTED} size={11} x={x0 + w} y={140}>mV</Txt>
      {order.map((d, i) => (
        <g key={d.ion}>
          <line stroke={solColor(d.ion)} strokeWidth={2.4} x1={px(d.eMv)} x2={px(d.eMv)} y1={96} y2={30 + (i % 2) * 22} />
          <circle cx={px(d.eMv)} cy={96} fill={solColor(d.ion)} r={5} />
          <Txt bold fill={solColor(d.ion)} size={11.5} x={px(d.eMv)} y={26 + (i % 2) * 22}>E({IONS[d.ion].symbol}) {Math.round(d.eMv)}</Txt>
        </g>
      ))}
      <path d={`M${px(ev.vmMv)} 96 l-7 14 l14 0 z`} fill={INK} />
      <Txt bold fill={INK} size={12} x={px(ev.vmMv)} y={140}>Vm {Math.round(ev.vmMv)} mV</Txt>
    </svg>
  );
}

// ---- active transport -----------------------------------------------------------------------------------------------------------

export function PumpScene({ state }: { state: PumpState }) {
  const X = 240;
  const openTop = state.facing === "extracellular", openBottom = state.facing === "cytosol";
  const summary = `Na⁺/K⁺-ATPase step ${state.step} of 7: ${state.title}. Conformation ${state.conformation}, ${state.facing === "occluded" ? "occluded (open to neither side)" : `open to the ${state.facing}`}. ${state.phosphorylated ? "Phosphorylated." : "Not phosphorylated."} ${state.naBound} Na⁺ and ${state.kBound} K⁺ bound. Moved so far: ${state.naMovedOut} Na⁺ out, ${state.kMovedIn} K⁺ in; ATP hydrolysed ${state.atpHydrolyzed}.`;
  const cav = (y: number, open: boolean) => <rect fill={open ? "#ffffff" : COL.protein} height={34} rx={10} stroke={COL.proteinStroke} strokeWidth={open ? 1.6 : 0} width={44} x={X - 22} y={y} />;
  const ions: ReactNode[] = [];
  const cy = MID;
  for (let i = 0; i < state.naBound; i += 1) ions.push(<circle cx={X - 12 + i * 12} cy={cy - 4} fill={COL.na} key={`n${i}`} r={5.4} stroke="#fff" strokeWidth={1} />);
  for (let i = 0; i < state.kBound; i += 1) ions.push(<circle cx={X - 6 + i * 12} cy={cy + 8} fill={COL.k} key={`k${i}`} r={5.4} stroke="#fff" strokeWidth={1} />);
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox={`0 0 ${W} ${H_MAX}`}>
      <ArrowMarkers prefix="pu" />
      <Water />
      <SideLabels extra={<Txt anchor="end" bold fill={INK} size={12.5} x={W - 8} y={16}>{state.conformation} · {state.facing === "occluded" ? "occluded" : `open to ${state.facing}`}</Txt>} />
      <Bilayer cholesterol={false} gaps={[[X - 40, X + 40]]} lipids="mixed" temperature="moderate" />
      <rect fill={COL.protein} height={112} rx={16} stroke={COL.proteinStroke} strokeWidth={2.2} width={88} x={X - 44} y={MT - 24} />
      {openTop ? cav(MT - 18, true) : null}
      {openBottom ? cav(MB - 16, true) : null}
      {!openTop && !openBottom ? <rect fill="#ffffff" height={30} rx={10} stroke={COL.proteinStroke} strokeDasharray="3 3" strokeWidth={1.4} width={44} x={X - 22} y={MID - 15} /> : <rect fill="#ffffff" height={36} stroke="none" width={44} x={X - 22} y={openTop ? MT - 18 : MB - 18} />}
      {ions}
      {state.phosphorylated ? <g><circle cx={X + 40} cy={MB - 2} fill="#fde047" r={11} stroke="#a16207" strokeWidth={1.8} /><Txt bold size={12} x={X + 40} y={MB + 2}>P</Txt></g> : null}
      {state.atpBound ? <g><rect fill="#cffafe" height={20} rx={10} stroke={COL.atp} strokeWidth={1.8} width={44} x={X - 22} y={MB + 12} /><Txt bold fill={COL.atp} size={12} x={X} y={MB + 26}>ATP</Txt></g> : null}
      {state.adpReleased > 0 && state.step <= 4 ? <Txt bold fill={COL.atp} size={11.5} x={X - 70} y={MB + 40}>ADP released</Txt> : null}
      {state.piReleased > 0 ? <Txt bold fill={COL.atp} size={11.5} x={X + 70} y={MB + 40}>Pi released</Txt> : null}
      {dots(state.naMovedOut, X - 80, X + 40, 30, 92, COL.na, "circle", 3)}
      {dots(state.kMovedIn, X - 80, X + 80, MB + 50, 300, COL.k, "circle", 5)}
      <Txt anchor="start" fill={COL.na} size={11.5} x={14} y={60}>Na⁺ high outside</Txt>
      <Txt anchor="start" fill={COL.k} size={11.5} x={14} y={H_MAX - 40}>K⁺ high inside</Txt>
      {state.naMovedOut ? <Txt bold fill={COL.na} size={12.5} x={X - 60} y={108}>{state.naMovedOut} Na⁺ moved out</Txt> : null}
      {state.kMovedIn ? <Txt bold fill={COL.k} size={12.5} x={X} y={H_MAX - 8}>{state.kMovedIn} K⁺ moved in</Txt> : null}
      {state.naMovedOut === 3 && state.step === 4 ? <line markerEnd="url(#pu-blue)" stroke={COL.na} strokeWidth={3} x1={X + 60} x2={X + 60} y1={MT + 10} y2={64} /> : null}
      {state.kMovedIn === 2 && state.step === 7 ? <line markerEnd="url(#pu-ink)" stroke={COL.k} strokeWidth={3} x1={X + 60} x2={X + 60} y1={MB - 10} y2={MB + 68} /> : null}
    </svg>
  );
}

export function SgltScene({ input, result, step, step_titles }: { input: SgltInput; result: SgltResult; step: number; step_titles: readonly string[] }) {
  const X = 190;
  const rev = result.glucoseDirection === "outward";
  const none = result.glucoseDirection === "none";
  // forward cycle faces: 0 outward empty, 1 outward loaded, 2 occluded loaded, 3 inward releasing, 4 inward empty/return
  const facing = step <= 1 ? "out" : step === 2 ? "closed" : "in";
  const loaded = step >= 1 && step <= 2;
  const summary = `SGLT1, a Na⁺-glucose symporter (secondary active transport). Step ${step} of 4: ${step_titles[step]}. At these concentrations and voltage the net glucose movement is ${none ? "none (equilibrium)" : rev ? "outward (the cycle would run in reverse)" : "inward"}; the transporter hydrolyses no ATP.`;
  const nMaxOut = 18;
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox={`0 0 ${W} ${H_MAX}`}>
      <ArrowMarkers prefix="sg" />
      <Water />
      <SideLabels />
      <Bilayer cholesterol={false} gaps={[[X - 40, X + 40], [390 - 36, 390 + 36]]} lipids="mixed" temperature="moderate" />
      <Carrier facing={facing} id="sglt" label="SGLT1 cotransporter" loaded={loaded} onSelect={() => undefined} sel={null} tag="SGLT1" x={X} />
      {loaded ? <g><circle cx={X - 18} cy={(facing === "out" ? MT - 18 : MID - 6) + 11} fill={COL.na} r={5.5} /><circle cx={X + 18} cy={(facing === "out" ? MT - 18 : MID - 6) + 11} fill={COL.na} r={5.5} /></g> : null}
      {dots(count(input.naOut, Math.max(input.naOut, input.naIn)), 20, 110, 28, 100, COL.na, "circle", 1)}
      {dots(count(input.naIn, Math.max(input.naOut, input.naIn)), 20, 110, MB + 28, 300, COL.na, "circle", 2)}
      {dots(count(input.gluOut, Math.max(input.gluOut, input.gluIn)), 130, 250, 28, 100, COL.glu, "square", 3)}
      {dots(count(input.gluIn, Math.max(input.gluOut, input.gluIn)), 130, 250, MB + 28, 300, COL.glu, "square", 4)}
      <Txt anchor="start" bold fill={COL.na} size={11.5} x={24} y={118}>Na⁺ {input.naOut} mM</Txt>
      <Txt anchor="start" bold fill={COL.glu} size={11.5} x={134} y={118}>glucose {input.gluOut} mM</Txt>
      <Txt anchor="start" bold fill={COL.na} size={11.5} x={24} y={MB + 20}>Na⁺ {input.naIn} mM</Txt>
      <Txt anchor="start" bold fill={COL.glu} size={11.5} x={134} y={MB + 20}>glucose {input.gluIn} mM</Txt>
      {/* the pump that maintains the gradient */}
      <g opacity={0.95}>
        <rect fill={COL.protein} height={108} rx={14} stroke={COL.proteinStroke} strokeWidth={2} width={64} x={358} y={MT - 22} />
        <Txt bold fill={COL.proteinStroke} size={11} x={390} y={MID + 4}>Na⁺/K⁺</Txt>
        <rect fill="#cffafe" height={18} rx={9} stroke={COL.atp} strokeWidth={1.6} width={36} x={372} y={MB + 8} />
        <Txt bold fill={COL.atp} size={11} x={390} y={MB + 21}>ATP</Txt>
        <line markerEnd="url(#sg-blue)" stroke={COL.na} strokeWidth={2.4} x1={402} x2={402} y1={MT - 4} y2={66} />
        <Txt size={10.5} x={390} y={56}>pumps Na⁺ out</Txt>
      </g>
      {none ? <Txt bold fill={MUTED} size={12} x={X} y={H_MAX - 8}>glucose at equilibrium: no net movement</Txt> : (
        <g>
          <line markerEnd="url(#sg-ok)" stroke={COL.ok} strokeWidth={3.4} x1={X - 70} x2={X - 70} y1={rev ? 218 : 124} y2={rev ? 124 : 218} />
          <Txt bold fill={COL.ok} size={12} x={X} y={H_MAX - 8}>net glucose {rev ? "OUT (cycle reversed)" : "IN"} · no ATP at SGLT1</Txt>
        </g>
      )}
      <Txt anchor="end" fill={MUTED} italic size={10.5} x={W - 8} y={nMaxOut + 0}>Na⁺ gradient is made by the pump</Txt>
    </svg>
  );
}

// ---- osmosis ---------------------------------------------------------------------------------------------------------------------

export function OsmosisScene({ input, result }: { input: OsmosisInput; result: OsmosisResult }) {
  const cx = 240, cy = 170, r0 = 78;
  const into = result.initialWater === "into the cell", out = result.initialWater === "out of the cell";
  const rEq = result.relativeVolume !== null ? r0 * Math.sqrt(result.relativeVolume) : null;
  const sol = (n: number) => Math.min(40, Math.max(0, Math.round(n / 16)));
  const summary = `A cell in a ${result.tonicity} solution (${result.osmolarity}). Effective (impermeant) solute: ${result.outImpermeantOsm.toFixed(0)} mOsm/L outside, ${result.inImpermeantOsm.toFixed(0)} mOsm/L inside. Initial water movement: ${result.initialWater}; the cell ${result.cellInitially}.${rEq ? ` Idealized equilibrium volume ${result.relativeVolume!.toFixed(2)} times the starting volume.` : " No equilibrium volume is reported."}`;
  const p = (n: number, ring: "out" | "in", seed: number, color: string, shape: "circle" | "square") => {
    const items: ReactNode[] = [];
    for (let i = 0; i < n; i += 1) {
      for (let tries = 0; tries < 20; tries += 1) {
        const a = (i * 2.399 + seed * 1.3 + tries * 0.9) % (2 * Math.PI);
        const rad = ring === "in" ? 8 + ((i * 37 + seed * 11 + tries * 13) % (r0 - 18)) : r0 + 22 + ((i * 53 + seed * 7 + tries * 17) % 80);
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * (ring === "out" ? 0.92 : 1);
        if (x < 10 || x > W - 10 || y < 28 || y > 318) continue;
        items.push(shape === "circle" ? <circle cx={x} cy={y} fill={color} key={`${ring}${seed}${i}`} r={3.8} /> : <rect fill={color} height={7} key={`${ring}${seed}${i}`} width={7} x={x - 3.5} y={y - 3.5} />);
        break;
      }
    }
    return items;
  };
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox={`0 0 ${W} ${H_MAX}`}>
      <ArrowMarkers prefix="os" />
      <rect fill="#eaf6fd" height={H_MAX} width={W} x={0} y={0} />
      <Txt anchor="start" bold fill={MUTED} size={12} x={8} y={16}>EXTRACELLULAR SOLUTION</Txt>
      {rEq ? <circle cx={cx} cy={cy} fill="none" r={rEq} stroke={COL.bad} strokeDasharray="6 4" strokeWidth={2} /> : null}
      <circle cx={cx} cy={cy} fill="#fffbe6" r={r0} stroke={COL.headStroke} strokeWidth={5} />
      <circle cx={cx} cy={cy} fill="none" r={r0 - 3} stroke={COL.tail} strokeWidth={1.4} />
      {p(sol(result.inImpermeantOsm), "in", 1, "#475569", "circle")}
      {p(sol(input.inUrea * 1.5), "in", 2, COL.k, "square")}
      {p(sol(result.outImpermeantOsm), "out", 3, "#475569", "circle")}
      {p(sol(input.urea * 1.5), "out", 4, COL.k, "square")}
      {into ? [0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2 + 0.78; return <line key={k} markerEnd="url(#os-ok)" stroke="#0369a1" strokeWidth={3.2} x1={cx + Math.cos(a) * (r0 + 48)} x2={cx + Math.cos(a) * (r0 + 8)} y1={cy + Math.sin(a) * (r0 + 48)} y2={cy + Math.sin(a) * (r0 + 8)} />; }) : null}
      {out ? [0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2 + 0.78; return <line key={k} markerEnd="url(#os-ok)" stroke="#0369a1" strokeWidth={3.2} x1={cx + Math.cos(a) * (r0 - 14)} x2={cx + Math.cos(a) * (r0 + 40)} y1={cy + Math.sin(a) * (r0 - 14)} y2={cy + Math.sin(a) * (r0 + 40)} />; }) : null}
      <Txt bold fill="#0369a1" size={12.5} x={cx} y={cy - 4}>water {into ? "in" : out ? "out" : "balanced"}</Txt>
      <Txt fill={INK} size={12} x={cx} y={cy + 14}>{result.tonicity}</Txt>
      <rect fill="#ffffff" height={58} rx={8} stroke="#cbd5e1" width={196} x={W - 204} y={26} />
      <circle cx={W - 192} cy={42} fill="#475569" r={4} /><Txt anchor="start" size={11} x={W - 182} y={46}>impermeant solute</Txt>
      <rect fill={COL.k} height={8} width={8} x={W - 196} y={58} /><Txt anchor="start" size={11} x={W - 182} y={66}>permeant solute (urea)</Txt>
      <Txt anchor="start" size={11} x={W - 198} y={80}>inside {result.inImpermeantOsm.toFixed(0)} · outside {result.outImpermeantOsm.toFixed(0)} mOsm/L</Txt>
      {rEq ? <Txt anchor="start" fill={COL.bad} size={11} x={12} y={H_MAX - 10}>dashed: idealized equilibrium size ({result.relativeVolume!.toFixed(2)} × volume)</Txt> : <Txt anchor="start" fill={MUTED} size={11} x={12} y={H_MAX - 10}>no equilibrium size is predicted for these values</Txt>}
    </svg>
  );
}
