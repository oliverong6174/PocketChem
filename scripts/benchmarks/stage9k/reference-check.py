import json,pathlib,sys
from rdkit import Chem
from rdkit.Chem import rdMolDescriptors
sys.stdout.reconfigure(encoding='utf8')
base=pathlib.Path(__file__).resolve().parent
cases=json.loads((base/'cases.json').read_text(encoding='utf8'))['cases']
rows=[]
for c in cases:
    structures=[c.get('smiles'),*(c.get('reactants',[])),*(p['smiles'] for p in c.get('expected',{}).get('products',[])),*(c.get('expected',{}).get('minor',[])),*(c.get('expected',{}).get('forbidden',[]))]
    for s in c.get('steps',[]):structures+=s['reactants']+[s['product']]
    for s in filter(None,structures):
        m=Chem.MolFromSmiles(s)
        assert m is not None,(c['id'],s)
        assert Chem.MolToSmiles(Chem.MolFromSmiles(Chem.MolToSmiles(m)))==Chem.MolToSmiles(m)
        rows.append(dict(id=c['id'],smiles=s,canonical=Chem.MolToSmiles(m),formula=rdMolDescriptors.CalcMolFormula(m),centers=Chem.FindMolChiralCenters(m,includeUnassigned=True)))
    if c['kind']=='ms':assert rdMolDescriptors.CalcMolFormula(Chem.MolFromSmiles(c['smiles']))==c['formula']
data=dict(tool='Independent Python RDKit 2026.09.1; structure validation, not PocketChem prediction',checks=rows,stereoReasoning={'RX-06':'Adjacent identical Br substituents on unsubstituted ring: R,R / S,S = trans; R,S = cis. Target is R,R.', 'RX-07':'Adjacent identical methyl substituents: R,S = cis for this symmetric ring. Syn H2 addition leaves methyls cis.', 'RX-08/09':'Opposite slash types along linear traversal denote Z; matching slash types denote E.', 'RX-10/11':'Same atom traversal with nucleophile replacing Br and @ inverted specifies backside inversion; R/S letter alone is insufficient when priority changes.'})
(base/'reference-check.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
print('Validated',len(rows),'structures; MS formulas agree; stereochemical targets explicitly reasoned.')
