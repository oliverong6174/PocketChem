import { type ReactNode } from "react";
import { ArrowMarkers, SelG, Txt } from "./cell23";
import { COL, INK, MUTED } from "./cellConst23";
import { LineChart, type ChartBand, type ChartMarker, type ChartSeries } from "../ui/LineChart";
import { DiagramFrame, Legend, type LegendItem } from "../ui/primitives";
import { NEURON_PARTS, SYNAPSE_EXAMPLES, channelState, postsynapticResponse, type ApPhase, type HhTrace, type PartId, type PropagationState, type SynapseInput, type SynapseState } from "../../utils/biology/neuron23";

const ring = (x: number, y: number, w: number, h: number, on: boolean) => (on ? <rect fill="none" height={h} rx={9} stroke="#1d4ed8" strokeDasharray="5 3" strokeWidth={2.4} width={w} x={x} y={y} /> : null);

// ---- anatomy -------------------------------------------------------------------------------------------------------------------

export function NeuronAnatomy({ selected, onSelect }: { selected: PartId | null; onSelect: (id: PartId | null) => void }) {
  const pick = (id: string | null) => onSelect(id as PartId | null);
  const S = selected;
  const summary = `A neuron from left to right: dendrites receive input, the soma integrates it, the axon hillock starts the action potential, the axon (with myelin sheaths and gaps called nodes of Ranvier) conducts it to the axon terminal, which releases neurotransmitter across the synaptic cleft onto the postsynaptic membrane.${S ? ` Selected: ${NEURON_PARTS.find((p) => p.id === S)?.label}.` : ""}`;
  return (
    <svg aria-label={summary} className="c23-svg is-wide" role="img" viewBox="0 0 700 270">
      <SelG id="dendrites" label="Dendrites" onSelect={pick} selected={S}>
        <g fill="none" stroke="#7c3aed" strokeLinecap="round" strokeWidth={5}>
          <path d="M112 118 L62 70 L28 52 M62 70 L44 28 M112 130 L40 130 L14 116 M40 130 L18 150 M112 142 L62 192 L30 214 M62 192 L40 238" />
        </g>
        {ring(6, 16, 120, 236, S === "dendrites")}
        <Txt bold fill="#4c1d95" size={13} x={60} y={262}>Dendrites</Txt>
      </SelG>
      <SelG id="soma" label="Soma (cell body)" onSelect={pick} selected={S}>
        <circle cx={150} cy={130} fill="#ddd6fe" r={38} stroke="#6d28d9" strokeWidth={3} />
        <circle cx={150} cy={130} fill="#a78bfa" r={13} stroke="#6d28d9" strokeWidth={2} />
        {ring(106, 86, 88, 88, S === "soma")}
        <Txt bold fill="#4c1d95" size={13} x={150} y={190}>Soma</Txt>
      </SelG>
      <SelG id="hillock" label="Axon hillock and initial segment" onSelect={pick} selected={S}>
        <path d="M184 112 L226 126 L226 134 L184 148 Z" fill="#fde68a" stroke="#b45309" strokeWidth={2.4} />
        {ring(176, 100, 60, 60, S === "hillock")}
        <Txt bold fill="#92400e" size={12} x={236} y={80}>Axon hillock</Txt>
        <Txt fill="#92400e" size={11} x={236} y={94}>(initial segment)</Txt>
      </SelG>
      <SelG id="axon" label="Axon" onSelect={pick} selected={S}>
        <line stroke="#334155" strokeWidth={5} x1={226} x2={566} y1={130} y2={130} />
        <rect fill="transparent" height={30} width={330} x={232} y={115} />
        {ring(226, 118, 340, 24, S === "axon")}
        <Txt bold size={13} x={400} y={200}>Axon</Txt>
      </SelG>
      <SelG id="myelin" label="Myelin sheath" onSelect={pick} selected={S}>
        {[[244, 314], [324, 394], [404, 474]].map(([a, b]) => <rect fill="#fef3c7" height={28} key={a} rx={13} stroke="#b45309" strokeWidth={2.4} width={b - a} x={a} y={116} />)}
        {ring(240, 108, 240, 44, S === "myelin")}
        <Txt bold fill="#92400e" size={12} x={279} y={102}>Myelin</Txt>
      </SelG>
      <SelG id="node" label="Node of Ranvier" onSelect={pick} selected={S}>
        {[319, 399, 479].map((x) => <g key={x}><rect fill="#bfdbfe" height={14} stroke="#1d4ed8" strokeWidth={1.8} width={10} x={x - 5} y={123} /></g>)}
        {ring(310, 112, 18, 36, S === "node")}
        <Txt bold fill="#1e3a8a" size={12} x={399} y={102}>Node of Ranvier</Txt>
        <line stroke="#1e3a8a" strokeWidth={1.4} x1={399} x2={399} y1={106} y2={121} />
      </SelG>
      <SelG id="terminal" label="Axon terminal" onSelect={pick} selected={S}>
        <path d="M566 130 C566 100 598 98 604 130 C598 162 566 160 566 130 Z" fill="#fde68a" stroke="#b45309" strokeWidth={2.6} />
        {[[580, 120], [588, 132], [578, 140]].map(([x, y]) => <circle cx={x} cy={y} fill="#ffffff" key={`${x}${y}`} r={4.4} stroke="#b45309" strokeWidth={1.4} />)}
        {ring(558, 92, 54, 76, S === "terminal")}
        <Txt bold fill="#92400e" size={12} x={584} y={86}>Axon terminal</Txt>
      </SelG>
      <SelG id="cleft" label="Synaptic cleft" onSelect={pick} selected={S}>
        <rect fill="#e0f2fe" height={80} stroke="#0369a1" strokeDasharray="3 3" strokeWidth={1.6} width={16} x={606} y={90} />
        {[[614, 112], [613, 128], [615, 144]].map(([x, y]) => <circle cx={x} cy={y} fill="#be185d" key={`${x}${y}`} r={2.8} />)}
        {ring(602, 86, 24, 88, S === "cleft")}
        <Txt bold fill="#0369a1" size={11} x={606} y={226}>Cleft</Txt>
      </SelG>
      <SelG id="postsynaptic" label="Postsynaptic membrane" onSelect={pick} selected={S}>
        <path d="M626 96 L690 96 L690 164 L626 164 Z" fill="#ddd6fe" stroke="#6d28d9" strokeWidth={2.6} />
        <rect fill="#c7d2fe" height={20} rx={4} stroke="#3730a3" strokeWidth={1.8} width={10} x={626} y={120} />
        {ring(620, 90, 76, 80, S === "postsynaptic")}
        <Txt bold fill="#4c1d95" size={11.5} x={660} y={186}>Postsynaptic</Txt>
        <Txt bold fill="#4c1d95" size={11.5} x={660} y={200}>membrane</Txt>
      </SelG>
      <Txt anchor="start" fill={MUTED} italic size={11.5} x={8} y={14}>Input → integration → initiation → propagation → output</Txt>
    </svg>
  );
}

// ---- propagation ---------------------------------------------------------------------------------------------------------------

const SITE_STYLE: Record<string, { fill: string; label: string }> = {
  firing: { fill: "#fde047", label: "⚡ firing" }, refractory: { fill: "#fca5a5", label: "refractory" }, depolarizing: { fill: "#fed7aa", label: "depolarizing" }, "passive-current": { fill: "#e0f2fe", label: "passive current" }, resting: { fill: "#f1f5f9", label: "resting" },
};
export function PropagationDiagram({ state, myelinated }: { state: PropagationState; myelinated: boolean }) {
  const n = state.units.length;
  const x0 = 24, w = 640 - 48, uw = w / n;
  const summary = `${myelinated ? "Myelinated" : "Unmyelinated"} axon, schematic. Site ${state.units.findIndex((u) => u.state === "firing") + 1}: ${state.units.map((u) => `${u.label} ${SITE_STYLE[u.state].label}`).join(", ")}.`;
  return (
    <svg aria-label={summary} className="c23-svg is-wide" role="img" viewBox="0 0 640 230">
      <ArrowMarkers prefix="pr" />
      <Txt anchor="start" bold fill={MUTED} size={11.5} x={8} y={16}>soma →  direction of the action potential  →  axon terminal</Txt>
      <line stroke="#94a3b8" strokeWidth={3} x1={x0} x2={x0 + w} y1={104} y2={104} />
      {state.units.map((u, i) => {
        const x = x0 + i * uw;
        const st = SITE_STYLE[u.state];
        const isInt = u.kind === "internode";
        return (
          <g key={u.id}>
            {isInt ? <rect fill="#fef3c7" height={40} rx={14} stroke="#b45309" strokeWidth={2} width={uw - 2} x={x + 1} y={84} /> : null}
            {!isInt ? <rect fill={st.fill} height={u.kind === "node" ? 56 : 40} rx={u.kind === "node" ? 3 : 6} stroke={u.state === "firing" ? "#a16207" : "#64748b"} strokeWidth={u.state === "firing" ? 3.4 : 1.8} width={Math.max(uw - 3, 10)} x={x + 1.5} y={u.kind === "node" ? 76 : 84} /> : <rect fill={st.fill} height={isInt ? 14 : 0} opacity={u.state === "passive-current" ? 0.9 : 0.5} rx={4} width={uw - 14} x={x + 7} y={97} />}
            {u.state === "firing" ? <Txt bold size={18} x={x + uw / 2} y={72}>⚡</Txt> : null}
            {u.state === "passive-current" ? <line markerEnd="url(#pr-blue)" stroke={COL.na} strokeWidth={2.6} x1={x + 8} x2={x + uw - 8} y1={104} y2={104} /> : null}
            {u.kind !== "internode" || myelinated ? <Txt fill={INK} size={Math.min(11, uw / 4.2)} x={x + uw / 2} y={150}>{u.kind === "initial" ? "initial" : u.kind === "terminal" ? "terminal" : u.kind === "node" ? "node" : u.kind === "internode" ? "internode" : `seg ${u.id.slice(1)}`}</Txt> : null}
            <Txt fill={u.state === "firing" ? "#92400e" : MUTED} size={Math.min(10, uw / 4.4)} x={x + uw / 2} y={166}>{u.state === "firing" ? "firing" : u.state === "refractory" ? "refractory" : u.state === "depolarizing" ? "depolarizing" : u.state === "passive-current" ? "passive" : ""}</Txt>
          </g>
        );
      })}
      <Txt anchor="start" bold fill={INK} size={12} x={8} y={206}>Regenerative sites to cover this length: {state.sitesNeeded}</Txt>
      <Txt anchor="end" fill={MUTED} italic size={11} x={632} y={206}>schematic: no velocities</Txt>
    </svg>
  );
}

// ---- channel states during the action potential --------------------------------------------------------------------------------------

export function ChannelDiagram({ tr, index, phase }: { tr: HhTrace; index: number; phase: ApPhase }) {
  const m = tr.m[index], h = tr.h[index], n = tr.n[index], v = tr.v[index], iNa = tr.iNa[index], iK = tr.iK[index];
  const cs = channelState(m, h, n);
  const MT = 74, MB = 134;
  const summary = `Channel states at ${tr.t[index].toFixed(2)} ms, membrane voltage ${v.toFixed(1)} mV. Na⁺ channel: activation gate m = ${m.toFixed(2)} (${cs.naActivation}), inactivation gate h = ${h.toFixed(2)} (${cs.naInactivation}). K⁺ channel: gate n = ${n.toFixed(2)} (${cs.kGate}). Net Na⁺ current ${iNa < -0.5 ? "inward" : "negligible"}, K⁺ current ${iK > 0.5 ? "outward" : iK < -0.5 ? "inward" : "negligible"}.`;
  const pore = 12;
  const na = (x: number) => (
    <g>
      <rect fill={COL.protein} height={92} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={22} x={x - pore - 22} y={MT - 14} />
      <rect fill={COL.protein} height={92} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={22} x={x + pore} y={MT - 14} />
      {/* activation gate (extracellular mouth): swings from closed (across the pore) to open (along the wall) */}
      <g transform={`rotate(${-90 * m} ${x - pore} ${MT - 6})`}><rect fill="#2563eb" height={6} rx={2} width={pore * 2} x={x - pore} y={MT - 9} /></g>
      {/* inactivation ball (cytoplasmic mouth): in the pore mouth when h is small */}
      <circle cx={x + (1 - (1 - h)) * 28 * 0.0 + h * 34 - 0} cy={MB + 4 + (h) * 14} fill="#be123c" r={9} stroke="#fff" strokeWidth={1.4} />
    </g>
  );
  const k = (x: number) => (
    <g>
      <rect fill={COL.protein} height={92} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={22} x={x - pore - 22} y={MT - 14} />
      <rect fill={COL.protein} height={92} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={22} x={x + pore} y={MT - 14} />
      <g transform={`rotate(${90 * n} ${x - pore} ${MB + 8})`}><rect fill="#c2410c" height={6} rx={2} width={pore * 2} x={x - pore} y={MB + 5} /></g>
    </g>
  );
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox="0 0 480 270">
      <ArrowMarkers prefix="ch" />
      <rect fill="#eaf6fd" height={MT - 14} width={480} x={0} y={0} />
      <rect fill="#fffbe6" height={270 - MB - 14} width={480} x={0} y={MB + 14} />
      <rect fill="#fde68a" height={MB - MT + 28} opacity={0.5} width={480} x={0} y={MT - 14} />
      <Txt anchor="start" bold fill={MUTED} size={11} x={8} y={14}>OUTSIDE</Txt>
      <Txt anchor="start" bold fill={MUTED} size={11} x={8} y={262}>INSIDE</Txt>
      <Txt anchor="end" bold size={12.5} x={472} y={16}>V = {v.toFixed(1)} mV, {tr.t[index].toFixed(2)} ms</Txt>
      {na(130)}{k(350)}
      {iNa < -0.5 ? <line markerEnd="url(#ch-blue)" stroke={COL.na} strokeWidth={Math.min(8, 2 + Math.abs(iNa) / 40)} x1={130} x2={130} y1={34} y2={MB + 12} /> : null}
      {iK > 0.5 ? <line markerEnd="url(#ch-bad)" stroke={COL.k} strokeWidth={Math.min(8, 2 + Math.abs(iK) / 40)} x1={350} x2={350} y1={MB + 12} y2={32} /> : iK < -0.5 ? <line markerEnd="url(#ch-ink)" stroke={COL.k} strokeWidth={3} x1={350} x2={350} y1={34} y2={MB + 12} /> : null}
      <Txt bold fill={COL.na} size={12.5} x={130} y={176}>Na⁺ channel</Txt>
      <Txt size={11} x={130} y={192}>activation gate m = {m.toFixed(2)}</Txt>
      <Txt size={11} x={130} y={206}>({cs.naActivation})</Txt>
      <Txt size={11} x={130} y={222}>inactivation gate h = {h.toFixed(2)}</Txt>
      <Txt size={11} x={130} y={236}>({cs.naInactivation})</Txt>
      <Txt bold fill={COL.k} size={12.5} x={350} y={176}>K⁺ channel (delayed rectifier)</Txt>
      <Txt size={11} x={350} y={192}>gate n = {n.toFixed(2)} ({cs.kGate})</Txt>
      <Txt size={11} x={350} y={208}>{cs.kChannel.replace("K⁺ channels: ", "")}</Txt>
      <Txt fill={COL.na} size={11} x={130} y={252}>{iNa < -0.5 ? "net Na⁺ current INWARD" : "no net Na⁺ current"}</Txt>
      <Txt fill={COL.k} size={11} x={350} y={252}>{iK > 0.5 ? "K⁺ current OUTWARD" : iK < -0.5 ? "K⁺ current inward" : "no net K⁺ current"}</Txt>
      <Txt anchor="start" bold fill="#be123c" size={10.5} x={176} y={MB + 30}>inactivation ball</Txt>
      <Txt anchor="end" bold fill="#2563eb" size={10.5} x={92} y={MT - 18}>activation gate</Txt>
      <Txt anchor="end" bold fill={INK} size={11.5} x={472} y={30}>{phase}</Txt>
    </svg>
  );
}

// ---- synapse ---------------------------------------------------------------------------------------------------------------------

export function SynapseDiagram({ input, state }: { input: SynapseInput; state: SynapseState }) {
  const ex = SYNAPSE_EXAMPLES.find((e) => e.id === input.example)!;
  const r = postsynapticResponse(input);
  const cationIn = r.polarity === "depolarizing";
  const summary = `Chemical synapse, ${ex.label}. Stage: ${state.stage.title}. Presynaptic voltage-gated Ca²⁺ channels ${state.cavOpen ? "open" : "closed"}; Ca²⁺ ${state.calciumInflux ? "entering" : "not entering"}; vesicles ${state.vesiclesFused ? "fused" : "not fused"}; ${ex.neurotransmitter} ${state.transmitterInCleft ? "in the cleft" : state.cleared ? "cleared" : "not released"}; ${ex.receptor} ${state.receptorActive ? `active (${r.polarity})` : "not active"}.`;
  const vesicles: ReactNode[] = [0, 1, 2].map((i) => {
    const fused = state.vesiclesFused && i === 1;
    const x = 150 + i * 70;
    return fused ? <path d={`M${x - 14} 122 Q${x} 136 ${x + 14} 122`} fill="none" key={i} stroke="#b45309" strokeWidth={2.6} /> : <circle cx={x} cy={104} fill="#ffffff" key={i} r={11} stroke="#b45309" strokeWidth={2.2} />;
  });
  const ntDots: ReactNode[] = [];
  if (state.transmitterInCleft) for (let i = 0; i < 9; i += 1) ntDots.push(<circle cx={170 + ((i * 29) % 140) + (state.transmitterBound ? 0 : 0)} cy={state.transmitterBound && i < 3 ? 182 : 136 + ((i * 17) % 40)} fill={COL.glu} key={i} r={3.8} />);
  const ionic = ex.kind === "ionotropic";
  const Xr = 220;
  return (
    <svg aria-label={summary} className="c23-svg" role="img" viewBox="0 0 480 350">
      <ArrowMarkers prefix="sy" />
      <rect fill="#fffbe6" height={118} rx={14} stroke="#b45309" strokeWidth={2.4} width={400} x={40} y={14} />
      <rect fill="#e0f2fe" height={64} width={480} x={0} y={138} />
      <rect fill="#ede9fe" height={130} stroke="#6d28d9" strokeWidth={2.4} width={480} x={0} y={202} />
      <Txt anchor="start" bold fill="#92400e" size={12} x={50} y={32}>PRESYNAPTIC TERMINAL</Txt>
      <Txt anchor="start" bold fill="#0369a1" size={11} x={8} y={156}>SYNAPTIC CLEFT</Txt>
      <Txt anchor="start" bold fill="#4c1d95" size={12} x={8} y={222}>POSTSYNAPTIC CELL</Txt>
      {vesicles}
      {state.apArrived ? <Txt bold fill="#b45309" size={12} x={250} y={54}>⚡ action potential arrives (depolarized)</Txt> : <Txt fill={MUTED} size={12} x={250} y={54}>terminal at rest</Txt>}
      {[110, 340].map((x) => (
        <g key={x}>
          <rect fill={state.cavOpen ? "#ddd6fe" : "#cbd5e1"} height={18} stroke="#6d28d9" strokeWidth={2} width={34} x={x - 17} y={124} />
          <rect fill={state.cavOpen ? "#ffffff" : "#64748b"} height={14} width={state.cavOpen ? 10 : 22} x={state.cavOpen ? x - 5 : x - 11} y={126} />
          {state.calciumInflux ? <g><circle cx={x} cy={96} fill={COL.ca} r={4.4} /><line markerEnd="url(#sy-blue)" stroke={COL.ca} strokeWidth={2.6} x1={x} x2={x} y1={80} y2={116} /></g> : null}
        </g>
      ))}
      <Txt bold fill="#4c1d95" size={10.5} x={110} y={78}>Ca²⁺ channel (voltage-gated)</Txt>
      <Txt fill={state.cavOpen ? COL.ca : MUTED} size={10.5} x={340} y={78}>{state.cavOpen ? "open" : "closed"}</Txt>
      {ntDots}
      {state.transmitterInCleft ? <Txt bold fill={COL.glu} size={11.5} x={400} y={162}>{ex.neurotransmitter}</Txt> : state.cleared ? <Txt bold fill={MUTED} size={11.5} x={400} y={162}>cleared</Txt> : null}
      {/* postsynaptic receptor */}
      {ionic ? (
        <g>
          <rect fill={COL.protein} height={66} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={20} x={Xr - 32} y={198} />
          <rect fill={COL.protein} height={66} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={20} x={Xr + 12} y={198} />
          <rect fill={state.receptorActive ? "#dbeafe" : "#94a3b8"} height={state.receptorActive ? 64 : 12} width={24} x={Xr - 12} y={state.receptorActive ? 199 : 226} />
          {state.transmitterBound ? <circle cx={Xr} cy={196} fill={COL.glu} r={5} /> : null}
          {state.receptorActive ? <line markerEnd="url(#sy-ok)" stroke={COL.ok} strokeWidth={3.4} x1={Xr} x2={Xr} y1={input.example === "gaba-a" ? (cationIn ? 262 : 184) : (cationIn ? 184 : 262)} y2={input.example === "gaba-a" ? (cationIn ? 184 : 262) : (cationIn ? 262 : 184)} /> : null}
          <Txt bold fill={COL.proteinStroke} size={11.5} x={Xr} y={288}>{ex.receptor}</Txt>
          <Txt fill={INK} size={11} x={Xr} y={303}>{state.receptorActive ? `${input.example === "gaba-a" ? "Cl⁻" : "cations"} ${(input.example === "gaba-a" ? !cationIn : cationIn) ? "enter" : "leave"} the cell` : "pore closed"}</Txt>
        </g>
      ) : (
        <g>
          <rect fill={COL.protein} height={60} rx={8} stroke={COL.proteinStroke} strokeWidth={2} width={44} x={Xr - 90} y={198} />
          <Txt bold fill={COL.proteinStroke} size={11} x={Xr - 68} y={234}>M₂</Txt>
          {state.transmitterBound ? <circle cx={Xr - 68} cy={196} fill={COL.glu} r={5} /> : null}
          <ellipse cx={Xr - 40} cy={272} fill={state.receptorActive ? "#bbf7d0" : "#e2e8f0"} rx={38} ry={13} stroke={COL.ok} strokeWidth={1.8} />
          <Txt bold size={10.5} x={Xr - 40} y={276}>{state.receptorActive ? "Gi, Gβγ freed" : "Gi (inactive)"}</Txt>
          <rect fill={COL.protein} height={66} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={18} x={Xr + 48} y={198} />
          <rect fill={COL.protein} height={66} rx={5} stroke={COL.proteinStroke} strokeWidth={2} width={18} x={Xr + 84} y={198} />
          <rect fill={state.receptorActive ? "#fed7aa" : "#94a3b8"} height={state.receptorActive ? 64 : 12} width={18} x={Xr + 66} y={state.receptorActive ? 199 : 226} />
          {state.receptorActive ? <line markerEnd="url(#sy-ok)" stroke={COL.k} strokeWidth={3.4} x1={Xr + 75} x2={Xr + 75} y1={262} y2={184} /> : null}
          <Txt bold fill={COL.proteinStroke} size={11.5} x={Xr + 75} y={288}>GIRK channel</Txt>
          <Txt fill={INK} size={11} x={Xr + 75} y={303}>{state.receptorActive ? "K⁺ leaves the cell" : "closed"}</Txt>
          <Txt bold fill={COL.proteinStroke} size={11.5} x={Xr - 60} y={288}>{ex.receptor}</Txt>
        </g>
      )}
      {state.receptorActive ? <Txt anchor="end" bold fill={r.effect === "excitatory" ? COL.ok : COL.bad} size={12} x={472} y={316}>{r.polarity}: {r.effect}</Txt> : null}
    </svg>
  );
}

// ---- charts in milliseconds -------------------------------------------------------------------------------------------------------------

export function MsChart({ title, yLabel, series, tEnd, t, y, onTime, yDomain, markers, bands, legend, caption, valueText }: {
  title: string; yLabel: string; series: ChartSeries[]; tEnd: number; t?: number; y?: number; onTime?: (t: number) => void; yDomain: [number, number];
  markers?: ChartMarker[]; bands?: ChartBand[]; legend?: LegendItem[]; caption?: string; valueText?: string;
}) {
  return (
    <DiagramFrame caption={caption} label={title} legend={legend ? <Legend items={legend} /> : undefined} title={title}>
      <LineChart
        bands={bands}
        current={t !== undefined && y !== undefined ? { x: t, y } : null}
        formatX={(x) => String(Number(x.toPrecision(3)))}
        formatY={(v) => String(Number(v.toPrecision(3)))}
        markers={markers}
        onXChange={onTime}
        series={series}
        title={title}
        valueText={valueText ?? `${title}${t !== undefined ? ` at t = ${t.toFixed(2)} ms` : ""}`}
        xDomain={[0, tEnd]}
        xLabel="Time (ms)"
        xStep={tEnd / 400}
        yDomain={yDomain}
        yLabel={yLabel}
      />
    </DiagramFrame>
  );
}
