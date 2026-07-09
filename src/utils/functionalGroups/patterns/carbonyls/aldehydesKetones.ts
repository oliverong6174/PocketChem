//Aldol, Benzoin 
import type { FunctionalGroupPattern } from "../../types";

export const aldehydeKetoneGroups: FunctionalGroupPattern[] = [
  {
    name: "Aldehyde",
    priority: 8,
    nomenclaturePriority: 8,
    confidence: "High",
    suffix: "-al",
    prefix: "formyl / oxo",
    smarts: "[CX3H1](=[OX1])[#6,H]",
    mcatNote:
      "Aldehydes contain a terminal carbonyl. They are electrophilic and readily oxidized to carboxylic acids.",
    displaySmarts: "[CX3H1](=[OX1])",
    category: "functionalGroup",
  },
  {
    name: "Ketone",
    priority: 9,
    nomenclaturePriority: 9,
    confidence: "High",
    suffix: "-one",
    prefix: "oxo",
    smarts: "[#6][CX3](=[OX1])[#6]",
    mcatNote:
      "Ketones contain an internal carbonyl. They undergo nucleophilic addition reactions and are less easily oxidized than aldehydes.",
    displaySmarts: "[CX3]=[OX1]",
    category: "functionalGroup",
  },
  
  {
  name: "Acyl azide",
  priority: 5.5,
  nomenclaturePriority: 5.5,
  confidence: "High",
  suffix: "-oyl azide",
  prefix: "azidocarbonyl",
  equivalentNames: ["carbonyl azide", "carboxylic acid azide"],
  smarts: "[CX3](=[OX1])~[N;D2,N-;D2]~[N+;D2]~[N;D1,N-;D1]",
  displaySmarts:
    "[CX3](=[OX1])~[N;D2,N-;D2]~[N+;D2]~[N;D1,N-;D1]",
  mcatNote:
    "Acyl azides are carboxylic acid derivatives with the R-C(=O)-N3 motif. They are reactive acylating/azide compounds and can rearrange to isocyanates in the Curtius rearrangement.",
  category: "functionalGroup",
},
{
  name: "Acyl azide",
  priority: 5.5,
  nomenclaturePriority: 5.5,
  confidence: "High",
  suffix: "-oyl azide",
  prefix: "azidocarbonyl",
  equivalentNames: ["carbonyl azide", "carboxylic acid azide"],
  smarts:
    "[CX3](=[OX1])[N;D2,N-;D2]~[N+;D2]~[N;D1,N-;D1]",
  displaySmarts:
    "[CX3](=[OX1])[N;D2,N-;D2]~[N+;D2]~[N;D1,N-;D1]",
  mcatNote:
    "Acyl azides are carboxylic acid derivatives with the R-C(=O)-N3 motif. This pattern accepts both common azide resonance drawings.",
  category: "functionalGroup",
},
  {
    name: "Aldol",
    priority: 10.7,
    nomenclaturePriority: 10.7,
    confidence: "Medium",
    suffix: "hydroxy carbonyl",
    prefix: "hydroxyoxo",
    equivalentNames: ["β-hydroxy aldehyde", "β-hydroxy ketone"],
    smarts: "[OX2H][CX4][CX3](=O)",
    mcatNote:
      "Aldols are β-hydroxy aldehydes or ketones formed by aldol addition reactions.",
    displaySmarts: "[OX2H][CX4][CX3](=O)",
    category: "motif",
  },
  {
    name: "Benzoin",
    priority: 10.6,
    nomenclaturePriority: 10.6,
    confidence: "Medium",
    suffix: "benzoin",
    prefix: "hydroxyoxo",
    equivalentNames: ["α-hydroxy aryl ketone"],
    smarts: "[a][CX3](=O)[CX4]([OX2H])[a]",
    mcatNote:
      "Benzoin is an α-hydroxy ketone connecting two aromatic rings. It is produced in the benzoin condensation.",
    displaySmarts: "[CX3](=O)[CX4]([OX2H])",
    category: "motif",
  },
    {
  name: "Ketene",
  priority: 8.7,
  nomenclaturePriority: 8.7,
  confidence: "High",
  suffix: "ketene",
  prefix: "ketenyl",
  smarts: "[CX2]=[CX2]=[OX1]",
  displaySmarts: "[CX2]=[CX2]=[OX1]",
  mcatNote:
    "Ketenes contain C=C=O and are highly reactive carbonyl-like electrophiles.",
  category: "functionalGroup",
  },
];