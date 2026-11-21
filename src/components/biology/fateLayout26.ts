import type { FateNodeId } from "../../utils/biology/celldeath26";

/** Column layout of the fate map: stressors on the left, mechanisms in the middle, modelled outcomes on the right. Layout positions only. */
const SIZE = { w: 200, h: 62 };
const POS: Record<FateNodeId, [number, number]> = {
  "dna-damage": [10, 30], "er-stress": [10, 120], "nutrient-deprivation": [10, 210], "mito-stress": [10, 300], "death-ligand": [10, 390], "lysosomal-dysfunction": [10, 480],
  checkpoint: [300, 30], bcl2: [300, 150], intrinsic: [300, 250], extrinsic: [300, 360], autophagy: [300, 470],
  arrest: [590, 30], caspases: [590, 300], recycling: [590, 470],
};
export function layoutSizeForFate(): { pos: Record<FateNodeId, [number, number]>; size: { w: number; h: number } } { return { pos: POS, size: SIZE }; }
