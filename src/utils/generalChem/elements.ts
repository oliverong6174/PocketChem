/**
 * Atomic masses for the stoichiometry, gas and electrochemistry tools.
 *
 * Source and precision: abridged conventional standard atomic weights as published by IUPAC/CIAAW (2013 table, with the
 * conventional single values used for elements whose weight is an interval, e.g. H 1.008, C 12.011, S 32.06) and rounded to
 * the precision those tables use for general work (3 to 5 significant figures; 0.001 to 0.01 g/mol). These suit
 * teaching calculations; they are not isotope-specific, and they are not suitable for isotope-abundance work. Elements
 * without a stable isotope are omitted (Tc, Pm, Po and beyond, except Th and U). The values were transcribed into this file
 * and then checked in the tests only against independently remembered molar masses of common compounds (H2O 18.015 g/mol,
 * NaCl 58.44 g/mol, ...), not against the original CIAAW file, which is not available offline.
 */
export interface ElementInfo { symbol: string; name: string; Z: number; mass: number }

const RAW: Array<[string, string, number]> = [
  ["H", "hydrogen", 1.008], ["He", "helium", 4.0026], ["Li", "lithium", 6.94], ["Be", "beryllium", 9.0122], ["B", "boron", 10.81],
  ["C", "carbon", 12.011], ["N", "nitrogen", 14.007], ["O", "oxygen", 15.999], ["F", "fluorine", 18.998], ["Ne", "neon", 20.180],
  ["Na", "sodium", 22.990], ["Mg", "magnesium", 24.305], ["Al", "aluminium", 26.982], ["Si", "silicon", 28.085], ["P", "phosphorus", 30.974],
  ["S", "sulfur", 32.06], ["Cl", "chlorine", 35.45], ["Ar", "argon", 39.948], ["K", "potassium", 39.098], ["Ca", "calcium", 40.078],
  ["Sc", "scandium", 44.956], ["Ti", "titanium", 47.867], ["V", "vanadium", 50.942], ["Cr", "chromium", 51.996], ["Mn", "manganese", 54.938],
  ["Fe", "iron", 55.845], ["Co", "cobalt", 58.933], ["Ni", "nickel", 58.693], ["Cu", "copper", 63.546], ["Zn", "zinc", 65.38],
  ["Ga", "gallium", 69.723], ["Ge", "germanium", 72.630], ["As", "arsenic", 74.922], ["Se", "selenium", 78.971], ["Br", "bromine", 79.904],
  ["Kr", "krypton", 83.798], ["Rb", "rubidium", 85.468], ["Sr", "strontium", 87.62], ["Y", "yttrium", 88.906], ["Zr", "zirconium", 91.224],
  ["Nb", "niobium", 92.906], ["Mo", "molybdenum", 95.95], ["Ru", "ruthenium", 101.07], ["Rh", "rhodium", 102.91], ["Pd", "palladium", 106.42],
  ["Ag", "silver", 107.87], ["Cd", "cadmium", 112.41], ["In", "indium", 114.82], ["Sn", "tin", 118.71], ["Sb", "antimony", 121.76],
  ["Te", "tellurium", 127.60], ["I", "iodine", 126.90], ["Xe", "xenon", 131.29], ["Cs", "caesium", 132.91], ["Ba", "barium", 137.33],
  ["La", "lanthanum", 138.91], ["Ce", "cerium", 140.12], ["Pr", "praseodymium", 140.91], ["Nd", "neodymium", 144.24], ["Sm", "samarium", 150.36],
  ["Eu", "europium", 151.96], ["Gd", "gadolinium", 157.25], ["Tb", "terbium", 158.93], ["Dy", "dysprosium", 162.50], ["Ho", "holmium", 164.93],
  ["Er", "erbium", 167.26], ["Tm", "thulium", 168.93], ["Yb", "ytterbium", 173.05], ["Lu", "lutetium", 174.97], ["Hf", "hafnium", 178.49],
  ["Ta", "tantalum", 180.95], ["W", "tungsten", 183.84], ["Re", "rhenium", 186.21], ["Os", "osmium", 190.23], ["Ir", "iridium", 192.22],
  ["Pt", "platinum", 195.08], ["Au", "gold", 196.97], ["Hg", "mercury", 200.59], ["Tl", "thallium", 204.38], ["Pb", "lead", 207.2],
  ["Bi", "bismuth", 208.98], ["Th", "thorium", 232.04], ["U", "uranium", 238.03],
];
const Z_OF: Record<string, number> = { H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10, Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18, K: 19, Ca: 20, Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30, Ga: 31, Ge: 32, As: 33, Se: 34, Br: 35, Kr: 36, Rb: 37, Sr: 38, Y: 39, Zr: 40, Nb: 41, Mo: 42, Ru: 44, Rh: 45, Pd: 46, Ag: 47, Cd: 48, In: 49, Sn: 50, Sb: 51, Te: 52, I: 53, Xe: 54, Cs: 55, Ba: 56, La: 57, Ce: 58, Pr: 59, Nd: 60, Sm: 62, Eu: 63, Gd: 64, Tb: 65, Dy: 66, Ho: 67, Er: 68, Tm: 69, Yb: 70, Lu: 71, Hf: 72, Ta: 73, W: 74, Re: 75, Os: 76, Ir: 77, Pt: 78, Au: 79, Hg: 80, Tl: 81, Pb: 82, Bi: 83, Th: 90, U: 92 };

export const ELEMENTS: Readonly<Record<string, ElementInfo>> = Object.freeze(
  Object.fromEntries(RAW.map(([symbol, name, mass]) => [symbol, { symbol, name, mass, Z: Z_OF[symbol] }])),
);
export const atomicMass = (symbol: string): number | null => ELEMENTS[symbol]?.mass ?? null;
export const isElement = (symbol: string): boolean => Object.prototype.hasOwnProperty.call(ELEMENTS, symbol);
