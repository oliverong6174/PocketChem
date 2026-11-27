"""Independent graph-to-stereo check; no PocketChem import or prediction."""
import json,pathlib
from rdkit import Chem
from rdkit.Chem import rdDepictor
base=pathlib.Path(__file__).resolve().parent
m=Chem.MolFromSmiles('C1C(C)C=CC(C)C1C(=O)OC')
rdDepictor.Compute2DCoords(m)
for center,branch in [(1,2),(5,6),(7,8)]:
    b=m.GetBondBetweenAtoms(center,branch)
    assert b.GetBeginAtomIdx()==center
    b.SetBondDir(Chem.BondDir.BEGINDASH)
Chem.AssignChiralTypesFromBondDirs(m,replaceExistingTags=True)
Chem.AssignStereochemistry(m,cleanIt=True,force=True)
drawn=Chem.MolToSmiles(m)
expected='C1[C@H](C)C=C[C@H](C)[C@@H]1C(=O)OC'
exo='C1[C@@H](C)C=C[C@@H](C)[C@@H]1C(=O)OC'
def canon(s):return Chem.MolToSmiles(Chem.MolFromSmiles(s))
def mirror(s):return s.replace('@@','TEMP').replace('@','@@').replace('TEMP','@')
data=dict(method='Python RDKit 2026.09.1: generate independent 2D hexagon; set all three external substituent bonds to BEGINDASH; assign atom chirality from bond directions; compare canonical structures.',drawnCanonical=drawn,stage9jExpectedCanonical=canon(expected),matchesExpectedOrMirror=drawn in [canon(expected),canon(mirror(expected))],differentFromExoOrMirror=drawn not in [canon(exo),canon(mirror(exo))],centers=Chem.FindMolChiralCenters(m),externalEvidence='University of Shizuoka lecture PDF page 15; inspect lecture-page-15.png')
(base/'diels-parity.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
(base/'all-cis-drawn.mol').write_text(Chem.MolToMolBlock(m),encoding='utf8')
assert data['matchesExpectedOrMirror'] and data['differentFromExoOrMirror']
print(json.dumps(data,indent=2))
