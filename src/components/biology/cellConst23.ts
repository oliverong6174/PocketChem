/** Colours and formatters shared by the Stage 23 diagrams and pages. */
export const INK = "#0f172a", MUTED = "#475569", PAPER = "#ffffff";
export const COL = {
  head: "#fde68a", headStroke: "#b45309", tail: "#f59e0b", water: "#e0f2fe", cyto: "#fef9c3", protein: "#c7d2fe", proteinStroke: "#3730a3",
  na: "#2563eb", k: "#c2410c", cl: "#15803d", ca: "#7e22ce", glu: "#be185d", o2: "#0f766e", ok: "#166534", bad: "#b91c1c", chol: "#a16207", atp: "#0e7490",
};
export const mv = (x: number, digits = 1) => `${x < 0 ? "−" : x > 0 ? "+" : ""}${Math.abs(x).toFixed(digits)} mV`;
export const sci = (x: number) => (x === 0 ? "0" : Math.abs(x) >= 0.01 && Math.abs(x) < 1000 ? String(Number(x.toPrecision(3))) : x.toExponential(2));
