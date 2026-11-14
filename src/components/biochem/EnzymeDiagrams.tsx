import type { BindingModel, MechState } from "../../utils/biochem/enzyme";

const INK = "#1e293b", MUTED = "#64748b", PAPER = "#ffffff";

/** Enzyme and substrate for the three binding models. `bound` moves the substrate into the site; the site changes shape only for induced fit and conformational selection. */
export function BindingDiagram({ model, bound }: { model: BindingModel; bound: boolean }) {
  const W = 560, H = 230;
  // Site opening: the open conformation is slightly wider than the substrate (induced fit) or already matches (lock and key).
  const open = model === "lock-and-key" ? 0 : bound ? 0 : 14;
  const sx = bound ? 280 : 480;
  return (
    <svg aria-label={`${model} model, substrate ${bound ? "bound" : "free"}`} className="bc-svg" role="img" viewBox={`0 0 ${W} ${H}`}>
      <rect fill={PAPER} height={H} width={W} />
      <path d={`M130 190 V105 Q130 70 165 70 H${220 - open} V${120 - open / 2} H${250 - open} V70 H${310 + open} V${120 - open / 2} H${340 + open} V70 H395 Q430 70 430 105 V190 Z`} fill="#ccfbf1" stroke="#0f766e" strokeWidth={2.5} />
      <text fill={INK} fontSize={13} textAnchor="middle" x={280} y={170}>Enzyme</text>
      <text fill={MUTED} fontSize={11} textAnchor="middle" x={280} y={188}>active site (top cleft)</text>
      {model === "conformational-selection" && !bound ? (
        <path d="M130 190 V105 Q130 70 165 70 H206 V106 H236 V70 H324 V106 H354 V70 H395 Q430 70 430 105 V190 Z" fill="none" stroke="#0f766e" strokeDasharray="5 4" strokeWidth={1.5} />
      ) : null}
      <g transform={`translate(${sx - 280} ${bound ? 0 : -30})`}>
        <path d="M250 60 H310 V100 H290 V82 H270 V100 H250 Z" fill="#fde68a" stroke="#b45309" strokeWidth={2} transform={bound ? "translate(0 -2)" : undefined} />
        <text fill={INK} fontSize={12} textAnchor="middle" x={280} y={52}>Substrate</text>
      </g>
      <text fill={INK} fontSize={12} x={20} y={30}>{model === "lock-and-key" ? "Rigid site already complementary to the substrate" : model === "induced-fit" ? (bound ? "Binding has reshaped the site around the substrate" : "Site not yet perfectly shaped; binding will change it") : (bound ? "Substrate bound to the closed conformation it selected" : "Free enzyme samples open and closed forms (dashed = closed)")}</text>
      <text fill={MUTED} fontSize={11} x={20} y={H - 10}>Schematic. Weak interactions (H bonds, ionic, hydrophobic) hold the substrate; they are not drawn.</text>
    </svg>
  );
}

const SER = (s: MechState) => (s.ser === "OH" ? "Ser195 –O–H" : s.ser === "O–C bond" ? "Ser195 –O–C" : "Ser195 –O–H (restored)");

/** The chymotrypsin-like serine-protease mechanism, one MechState at a time. Positions are fixed; the state decides which species are drawn. */
export function MechanismDiagram({ state, hideLabels }: { state: MechState; hideLabels: boolean }) {
  const W = 620, H = 330;
  const sub = state.substrate;
  const bound = sub !== "free" && sub !== "released";
  const tetra = sub === "tetrahedral" || sub === "second-tetrahedral";
  const acyl = sub === "acyl-enzyme" || sub === "second-tetrahedral";
  const closed = state.site === "closed";
  const cx = 360, cy = 150; // carbonyl carbon of the scissile bond
  return (
    <svg aria-label={`Mechanism step: ${state.title}`} className="bc-svg" role="img" viewBox={`0 0 ${W} ${H}`}>
      <rect fill={PAPER} height={H} width={W} />
      <path d={closed ? "M40 300 V90 Q40 40 90 40 H520 Q575 40 575 90 V300 Z" : "M40 300 V90 Q40 40 90 40 H250 L290 95 L330 40 H520 Q575 40 575 90 V300 Z"} fill="#ecfdf5" stroke="#0f766e" strokeWidth={2.5} />
      {!hideLabels ? <text fill={MUTED} fontSize={11} x={52} y={290}>Enzyme ({closed ? "closed site" : "open site"})</text> : null}
      {/* catalytic triad */}
      <g>
        <rect fill="#fef3c7" height={30} rx={6} stroke="#b45309" width={150} x={240} y={215} />
        <text fill={INK} fontSize={11} textAnchor="middle" x={315} y={234}>{hideLabels ? "residue A" : SER(state)}</text>
        <rect fill={state.his === "protonated" ? "#dbeafe" : "#e0f2fe"} height={30} rx={6} stroke="#1d4ed8" strokeDasharray={state.his === "protonated" ? undefined : "4 3"} width={112} x={110} y={215} />
        <text fill={INK} fontSize={11} textAnchor="middle" x={166} y={234}>{hideLabels ? "residue B" : state.his === "protonated" ? "His57 (N–H⁺)" : "His57"}</text>
        <rect fill="#fee2e2" height={30} rx={6} stroke="#be123c" width={96} x={62} y={262} />
        <text fill={INK} fontSize={11} textAnchor="middle" x={110} y={281}>{hideLabels ? "residue C" : "Asp102 (COO⁻)"}</text>
        <line stroke={MUTED} x1={166} x2={166} y1={245} y2={262} />
        <line stroke={MUTED} x1={222} x2={250} y1={230} y2={230} />
        <text fill={MUTED} fontSize={10} x={190} y={226}>H</text>
        <line stroke={INK} x1={306} x2={bound || acyl ? cx - 6 : 306} y1={215} y2={bound || acyl ? cy + 22 : 200} />
      </g>
      {/* oxyanion hole */}
      <g>
        <path d="M425 232 q30 -30 55 0" fill="none" stroke={state.oxyanion ? "#be123c" : MUTED} strokeDasharray={state.oxyanion ? undefined : "3 3"} strokeWidth={2} />
        <text fill={state.oxyanion ? "#be123c" : MUTED} fontSize={11} x={420} y={252}>{hideLabels ? "N–H hole" : "oxyanion hole (backbone N–H)"}</text>
      </g>
      {/* substrate */}
      {sub !== "released" ? (
        <g transform={bound ? undefined : "translate(0 -110)"}>
          <line stroke={INK} strokeWidth={2.5} x1={cx - 100} x2={cx - 40} y1={cy} y2={cy} />
          <text fill={INK} fontSize={11} textAnchor="middle" x={cx - 70} y={cy - 8}>…–NH–CHR–</text>
          <circle cx={cx} cy={cy} fill="#fff" r={14} stroke={INK} strokeWidth={2} />
          <text fill={INK} fontSize={12} textAnchor="middle" x={cx} y={cy + 4}>C</text>
          {/* carbonyl O or oxyanion */}
          <line stroke="#be123c" strokeWidth={2.2} x1={cx + 6} x2={cx + 38} y1={cy + 12} y2={cy + 52} />
          <text fill="#be123c" fontSize={12} x={cx + 40} y={cy + 66}>{tetra ? "O⁻" : "O"}</text>
          {/* leaving amine side (P1) */}
          {state.product1 === "none" || state.product1 === "leaving" || sub === "bound-intact" || sub === "free" || sub === "tetrahedral" ? (
            <g opacity={state.product1 === "leaving" ? 0.55 : 1}>
              <line stroke={INK} strokeDasharray={state.product1 === "leaving" ? "4 4" : undefined} strokeWidth={2.5} x1={cx + 14} x2={cx + 74} y1={cy} y2={cy - 6 - (state.product1 === "leaving" ? 24 : 0)} />
              <text fill={INK} fontSize={11} x={cx + 78} y={cy - 8 - (state.product1 === "leaving" ? 24 : 0)}>{state.product1 === "leaving" ? "H₂N–R′ (P₁ leaving)" : "–NH–R′"}</text>
            </g>
          ) : null}
          {/* nucleophilic Ser–O bond or bond to O–H */}
          {tetra || acyl ? <text fill={INK} fontSize={11} x={cx - 40} y={cy + 40}>–O–Ser195</text> : null}
          {sub === "second-tetrahedral" ? <text fill={INK} fontSize={11} x={cx + 40} y={cy + 28}>–OH</text> : null}
        </g>
      ) : null}
      {state.water && sub !== "released" ? (
        <g><circle cx={cx + 110} cy={cy + 70} fill="#bae6fd" r={11} stroke="#0369a1" /><text fill={INK} fontSize={10} textAnchor="middle" x={cx + 110} y={cy + 74}>H₂O</text></g>
      ) : null}
      {state.product1 === "free" && sub !== "released" ? <text fill={INK} fontSize={12} x={430} y={70}>P₁ (amine) released</text> : null}
      {sub === "released" ? <g><text fill={INK} fontSize={13} x={300} y={120}>Free enzyme regenerated</text><text fill={INK} fontSize={12} x={300} y={145}>P₂ (carboxylic acid, R–COOH) released</text></g> : null}
      <text fill={MUTED} fontSize={11} x={52} y={22}>{hideLabels ? "Names hidden: use the description below, then reveal." : state.species}</text>
    </svg>
  );
}

/** Four enzyme species with their fraction of total enzyme drawn as bars (E, ES, EI, ESI). */
export function SpeciesBars({ fractions }: { fractions: { E: number; ES: number; EI: number; ESI: number } }) {
  const rows: Array<[string, number, string]> = [["E (free enzyme)", fractions.E, "#64748b"], ["ES (substrate bound)", fractions.ES, "#0f766e"], ["EI (inhibitor bound)", fractions.EI, "#b45309"], ["ESI (both bound)", fractions.ESI, "#be123c"]];
  return (
    <svg aria-label="Fractions of enzyme in each form" className="bc-svg" data-testid="species-bars" role="img" viewBox="0 0 560 150">
      <rect fill={PAPER} height={150} width={560} />
      {rows.map(([name, f, color], i) => (
        <g key={name}>
          <text fill={INK} fontSize={12} x={10} y={28 + i * 32}>{name}</text>
          <rect fill="#e2e8f0" height={14} width={260} x={190} y={16 + i * 32} />
          <rect fill={color} height={14} width={Math.max(0, 260 * f)} x={190} y={16 + i * 32} />
          <text fill={INK} fontSize={12} x={460} y={28 + i * 32}>{(f * 100).toFixed(1)}%</text>
        </g>
      ))}
    </svg>
  );
}
