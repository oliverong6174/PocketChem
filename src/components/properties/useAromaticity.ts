import { useEffect, useState } from "react";
import { analyzeAromaticity, type AromaticityAnalysis } from "../../utils/aromaticity";

export function useAromaticity(smiles: string) {
  const [state, setState] = useState<{ smiles: string; result?: AromaticityAnalysis; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (smiles === "Not analyzed yet" || !smiles) return;
    void analyzeAromaticity(smiles).then((result) => { if (!cancelled) setState({ smiles, result }); }).catch(() => { if (!cancelled) setState({ smiles, error: "Aromaticity could not be assigned to this structure." }); });
    return () => { cancelled = true; };
  }, [smiles]);
  return state?.smiles === smiles ? state : null;
}

