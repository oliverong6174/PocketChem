/**
 * Stage 26 provenance. A claim is "verified" only if the cited page was actually opened during Stage 26 and states it. Everything else is listed as
 * "not independently checked": it is standard textbook cell biology written from memory and is NOT presented as sourced. No quotations or page
 * numbers are given. Stage 25 provenance gaps (biochemistry) are untouched and remain recorded as unverified in their own module.
 */
export type ProvenanceStatus = "verified" | "not-checked";
export interface Claim { id: string; tool: "organelles" | "cellcycle" | "celldeath"; statement: string; status: ProvenanceStatus; /** `url` is stored without a scheme (the page adds the scheme); it is a citation only and nothing is fetched at run time. */
  source?: { title: string; url: string } }

const OS = (page: string, title: string) => ({ title: `OpenStax Biology 2e, ${title}`, url: `openstax.org/books/biology-2e/pages/${page}` });

export const CLAIMS: readonly Claim[] = [
  { id: "nuclear-envelope-double", tool: "organelles", statement: "The nuclear envelope is a double-membrane structure perforated by pores.", status: "verified", source: OS("4-3-eukaryotic-cells", "4.3 Eukaryotic Cells") },
  { id: "organelles-membrane-bound", tool: "organelles", statement: "Eukaryotic cells have a membrane-bound nucleus and membrane-bound organelles such as the ER, Golgi apparatus and mitochondria.", status: "verified", source: OS("4-3-eukaryotic-cells", "4.3 Eukaryotic Cells") },
  { id: "cyclin-cdk-positive", tool: "cellcycle", statement: "Cyclins and cyclin-dependent kinases are positive regulators that carry the cell through checkpoints; cyclin levels fluctuate through the cycle.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "rb-e2f", tool: "cellcycle", statement: "Active (dephosphorylated) Rb binds E2F and blocks production of proteins needed for the G1/S transition.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "p53-p21", tool: "cellcycle", statement: "p53 responds to damaged DNA, halts the cycle and induces p21, which inhibits Cdk/cyclin complexes; if damage cannot be repaired p53 can trigger apoptosis.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "g2-checkpoint", tool: "cellcycle", statement: "The G2 checkpoint bars mitotic entry until chromosomes are replicated and DNA is undamaged.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "spindle-checkpoint", tool: "cellcycle", statement: "The spindle (M) checkpoint holds the cycle until every sister-chromatid pair is attached to spindle fibres from opposite poles, because anaphase separation is irreversible.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  // Not checked in Stage 26: standard textbook mechanisms written from memory.
  { id: "srp-sec61", tool: "organelles", statement: "SRP, SRP receptor and Sec61 route signal-sequence proteins into the ER co-translationally; signal peptidase cleaves the signal.", status: "not-checked" },
  { id: "copii-copi", tool: "organelles", statement: "COPII (Sar1, Sec23/24, Sec13/31) buds ER-to-Golgi carriers; COPI (Arf1, coatomer) mainly retrieves proteins to the ER; Rab and SNARE examples.", status: "not-checked" },
  { id: "m6p", tool: "organelles", statement: "GlcNAc-1-phosphotransferase tags lysosomal hydrolases with mannose 6-phosphate; M6P receptors sort them at the TGN via clathrin/AP-1.", status: "not-checked" },
  { id: "import", tool: "organelles", statement: "Importin-α/β and the Ran-GTP gradient drive nuclear import; TOM/TIM23 and the membrane potential drive presequence import into the matrix.", status: "not-checked" },
  { id: "endosome-ph", tool: "organelles", statement: "Approximate pH values (early endosome 6.0–6.5, late endosome 5.0–5.5, lysosome 4.5–5.0).", status: "not-checked" },
  { id: "erad", tool: "organelles", statement: "ER quality control, ERAD (Hrd1, p97), proteasomal versus lysosomal degradation.", status: "not-checked" },
  { id: "licensing", tool: "cellcycle", statement: "ORC/Cdc6/Cdt1/MCM licensing in G1; CDK/DDK firing; geminin, Cdt1 degradation and CDK phosphorylation as brakes on re-licensing.", status: "not-checked" },
  { id: "atm-atr", tool: "cellcycle", statement: "ATM–CHK2 and ATR–CHK1 arms, Cdc25 inhibition, Wee1/Cdc25 control of CDK1, CAK activation, INK4 and CIP/KIP inhibitors.", status: "not-checked" },
  { id: "mcc-apc", tool: "cellcycle", statement: "MAD/BUB-dependent MCC, APC/C–Cdc20, securin, separase and cohesin cleavage.", status: "not-checked" },
  { id: "bcl2-momp", tool: "celldeath", statement: "BH3-only proteins, BCL-2 family, BAX/BAK redundancy, MOMP, cytochrome c, APAF1 apoptosome, caspase-9 and caspase-3/7.", status: "not-checked" },
  { id: "fas-disc", tool: "celldeath", statement: "Fas–FADD–DISC–caspase-8, c-FLIP, BID cleavage and the type I/type II distinction.", status: "not-checked" },
  { id: "autophagy", tool: "celldeath", statement: "mTORC1/AMPK–ULK1, Beclin 1–VPS34, ATG5/ATG7 LC3 lipidation, autophagosome–lysosome fusion; context-dependent links in the fate map (p53, ER stress, caspase cleavage of Beclin 1).", status: "not-checked" },
];
export const claimsFor = (tool: Claim["tool"]): Claim[] => CLAIMS.filter((c) => c.tool === tool);
