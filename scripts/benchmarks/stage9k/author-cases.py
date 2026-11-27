"""Pre-prediction authoring from external records and explicit textbook applications."""
import json, pathlib, re, hashlib, sys
from fetch_references_config import NAMES, MS
BASE=pathlib.Path(__file__).resolve().parent
def slug(s): return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
def load(p): return json.loads(p.read_text(encoding='utf8'))
def ref(p,url,quality):return dict(file=p.relative_to(BASE).as_posix(),url=url,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),quality=quality)
def textbook(prefix):
    p=next((BASE/'references').glob('openstax-'+prefix+'*.html'))
    return ref(p,'https://openstax.org/books/organic-chemistry/pages/'+p.stem[len('openstax-'):],'B: explicit general textbook rule; exact substrate/product is an evaluator extrapolation, not experimental exact-case validation')
cases=[]; exclusions=[]
for n in NAMES:
    p=BASE/'references'/('pubchem-'+slug(n)+'.json')
    if not p.exists():exclusions.append(dict(kind='nomenclature',title=n,reason='No retrievable PubChem property record'));continue
    x=load(p)['PropertyTable']['Properties'][0]
    cases.append(dict(id='NM-'+str(len([c for c in cases if c['kind']=='nomenclature'])+1).zfill(2),kind='nomenclature',title=n,smiles=x['SMILES'],conditions='Molecular identity as specified; no reaction',expected=dict(name=x['IUPACName'],accepted_names=list(dict.fromkeys([x['IUPACName'],n])),formula=x['MolecularFormula']),source=ref(p,'https://pubchem.ncbi.nlm.nih.gov/compound/'+str(x['CID']),'A: exact database name/structure pair (computed Lexichem name, not an IUPAC ruling)'),criteria=['molecularIdentity','nomenclature']+(['stereochemistry'] if '@' in x['SMILES'] or '/' in x['SMILES'] else []),uncertainties='Other valid systematic names may be missed by a finite lexical list. No synonym may erase or contradict specified stereochemistry. Identity is an end-to-end name-to-structure database cross-check, not an experimental assay.'))
for n,cas in MS:
    p=BASE/'references'/('nist-'+slug(n)+'.jdx'); q=BASE/'references'/('pubchem-'+slug(n)+'.json')
    if not p.exists() or not q.exists():exclusions.append(dict(kind='ms',title=n,reason='Missing NIST spectrum or independent PubChem formula/structure'));continue
    text=p.read_text(); x=load(q)['PropertyTable']['Properties'][0]
    if '##PEAK TABLE=' not in text:exclusions.append(dict(kind='ms',title=n,reason='No JCAMP peak table'));continue
    formula=re.search(r'##MOLFORM=(.*)',text).group(1).strip().replace(' ','')
    if formula!=x['MolecularFormula']:exclusions.append(dict(kind='ms',title=n,reason='Formula mismatch '+formula+' versus '+x['MolecularFormula']));continue
    body=text.split('##PEAK TABLE=')[1].split('\n',1)[1].split('##END=')[0]
    peaks=[(int(a),float(b)) for a,b in re.findall(r'(\d+),([\d.]+)',body)]; top=max(v for _,v in peaks); peaks=[(a,100*b/top) for a,b in peaks]
    mass=round(float(x['MonoisotopicMass'])); mi=dict(peaks).get(mass,0)
    bases=[a for a,b in peaks if abs(b-100)<1e-8]
    keys=sorted([(a,b) for a,b in peaks if b>=20 and a not in [mass,mass+1,mass+2]+bases],key=lambda v:(-v[1],v[0]))[:3]
    cases.append(dict(id='MS-'+str(len([c for c in cases if c['kind']=='ms'])+1).zfill(2),kind='ms',title=n,smiles=x['SMILES'],formula=formula,conditions='NIST WebBook EI library spectrum, Index=0. Electron energy is not provided by these downloaded JCAMP records; no 70 eV claim.',expected=dict(molecular_ion_mz=mass if mi>=1 else None,molecular_ion_reference_intensity=mi,base_peaks_mz=bases,key_fragments=[dict(mz=a,relativeIntensity=round(b,4)) for a,b in keys]),source=ref(p,'https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C'+cas+'&Index=0&Type=Mass','A: exact NIST library peak table'),identity_source=ref(q,'https://pubchem.ncbi.nlm.nih.gov/compound/'+str(x['CID']),'A: independent formula/structure cross-check'),criteria=(['molecularIon'] if mi>=1 else [])+['basePeak']+(['keyFragments'] if keys else []),uncertainties='Single library spectrum; relative intensities depend on instrument and EI energy. Molecular ion is scored only if at least 1% relative abundance; this tests m/z, not observability or intensity. Key peaks are the three strongest non-parent/non-parent-isotope/non-base peaks >=20%, all required within 0.5 m/z.'))
def rx(i,title,s,condition,family,products,forbidden,criteria,chapter,stereo=None,minor=None,rule=''):
    cases.append(dict(id=f'RX-{i:02}',kind='reaction',title=title,reactants=[s],conditions=condition,family=family,adapter_rule_hint=rule,expected=dict(products=[dict(smiles=p,role='major' if minor else 'expected') for p in products],forbidden=forbidden,minor=minor or [],stereo=stereo),source=textbook(chapter),criteria=criteria,uncertainties='Exact-molecule application of a textbook rule, separately scored as B (rule-derived); not a direct experimental product distribution. Conditions are fixed; no numerical yield or ratio inferred. Racemic mirrors are acceptable when appropriate.'))
rx(1,'non-1-ene ionic HBr','C=CCCCCCCC','HBr, no peroxides, inert solvent, ambient','hbr',['CC(Br)CCCCCCC'],['BrCCCCCCCCC'],['connectivity','regiochemistry'],'7-8')
rx(2,'dec-1-ene hydroboration','C=CCCCCCCCC','1 BH3/THF; 2 H2O2/NaOH','hydroboration',['OCCCCCCCCCC'],['CC(O)CCCCCCCC'],['connectivity','regiochemistry'],'8-5')
rx(3,'vinylcyclopentane hydroboration','C=CC1CCCC1','1 BH3/THF; 2 H2O2/NaOH','hydroboration',['OCCC1CCCC1'],['CC(O)C1CCCC1'],['connectivity','regiochemistry'],'8-5')
rx(4,'undec-1-ene ionic HBr','C=CCCCCCCCCC','HBr, no peroxides, inert solvent, ambient','hbr',['CC(Br)CCCCCCCCC'],['BrCCCCCCCCCCC'],['connectivity','regiochemistry'],'7-8')
rx(5,'cycloheptene anti bromination','C1=CCCCCC1','Br2, dry CH2Cl2, ambient, no light','bromination',['Br[C@H]1[C@H](Br)CCCCC1'],[],['connectivity','stereochemistry'],'8-2','racemic')
rx(6,'cyclooctene anti bromination','C1=CCCCCCC1','Br2, dry CH2Cl2, ambient, no light','bromination',['Br[C@H]1[C@H](Br)CCCCCC1'],[],['connectivity','stereochemistry'],'8-2','racemic')
rx(7,'1,2-dimethylcycloheptene syn hydrogenation','CC1=C(C)CCCCC1','H2, Pd/C, ambient','hydrogenation',['C[C@H]1[C@@H](C)CCCCC1'],[],['connectivity','stereochemistry'],'8-6','racemic')
rx(8,'oct-3-yne Lindlar reduction','CCC#CCCCC','H2, Lindlar catalyst (poisoned Pd), ambient','lindlar',['CC/C=C\\CCCC'],[],['connectivity','stereochemistry'],'9-5','exact')
rx(9,'oct-3-yne dissolving metal reduction','CCC#CCCCC','Na, liquid NH3, low temperature','dissolving-metal',['CC/C=C/CCCC'],[],['connectivity','stereochemistry'],'9-5','exact')
rx(10,'chiral 2-bromohexane cyanide inversion','C[C@H](Br)CCCC','NaCN, DMSO, ambient; score SN2 product','sn2-cyanide',['C[C@@H](C#N)CCCC'],[],['connectivity','stereochemistry'],'11-2','exact',rule='haloalkane-sn2-cyanide')
rx(11,'chiral 2-bromoheptane iodide inversion','C[C@@H](Br)CCCCC','NaI, acetone, ambient; score SN2 product','sn2-iodide',['C[C@H](I)CCCCC'],[],['connectivity','stereochemistry'],'11-2','exact',rule='haloalkane-sn2-iodide')
rx(12,'2-bromooctane small-base E2','CC(Br)CCCCCC','NaOEt, ethanol, heat; compare E2 constitutional products only','e2-ethoxide',['CC=CCCCCC'],[],['connectivity','regiochemistry','majorMinorRanking'],'11-7',minor=['C=CCCCCCC'],rule='haloalkane-e2-ethoxide')
rx(13,'2-bromononane small-base E2','CC(Br)CCCCCCC','NaOEt, ethanol, heat; compare E2 constitutional products only','e2-ethoxide',['CC=CCCCCCC'],[],['connectivity','regiochemistry','majorMinorRanking'],'11-7',minor=['C=CCCCCCCC'],rule='haloalkane-e2-ethoxide')
rx(14,'1-bromoheptane cyanide homologation','CCCCCCCBr','NaCN, DMSO, ambient','sn2-cyanide',['CCCCCCCC#N'],[],['connectivity'],'11-2',rule='haloalkane-sn2-cyanide')
rx(15,'hept-1-yne mercury hydration','C#CCCCCC','HgSO4, H2SO4, water','alkyne-hydration',['CCCCCC(=O)C'],['CCCCCCC=O'],['connectivity','regiochemistry'],'9-4')
rx(16,'oct-1-yne hydroboration oxidation','C#CCCCCCC','1 disiamylborane; 2 H2O2/NaOH','alkyne-hydroboration',['CCCCCCCC=O'],['CCCCCCC(=O)C'],['connectivity','regiochemistry'],'9-4')
def route(i,title,label,s,product,rule,condition,chapter,why,co=None):
    cases.append(dict(id=f'RQ-{i:02}',kind='route',title=title,conditions=condition,expected=dict(label=label,rationale=why),steps=[dict(rule=rule,reactants=[s]+(co or []),product=product)],source=textbook(chapter),criteria=['routeSensitivity' if label=='flag' else 'routeSpecificity'],uncertainties='Seeded one-step route assessment, not route search or optimality. Exact molecule extrapolated from explicit textbook incompatibility/standard transformation. Report quality-assessor findings separately from structural replay failures.'))
route(1,'decanal reduction','clear','CCCCCCCCCC=O','CCCCCCCCCCO','aldehyde-reduction','NaBH4, methanol, ambient; aqueous workup','17-4','Standard aldehyde to primary alcohol')
route(2,'branched ketone reduction','clear','CC(=O)CC(C)CC','CC(O)CC(C)CC','ketone-reduction','NaBH4, methanol, ambient; aqueous workup','17-4','Standard ketone to secondary alcohol; stereo unspecified')
route(3,'methyl nonanoate full reduction','clear','CCCCCCCCC(=O)OC','CCCCCCCCCO.CO','ester-lah-reduction','1 excess LiAlH4, dry ether; 2 aqueous workup','21-6','Simple ester to primary alcohol and methanol')
route(4,'ortho-toluic acid esterification','clear','Cc1ccccc1C(=O)O','Cc1ccccc1C(=O)OC','fischer-esterification','Excess methanol, catalytic H2SO4, reflux','21-6','Fischer esterification; no conversion/yield claim',co=['CO'])
route(5,'primary nonyl cyanide substitution','clear','CCCCCCCCCBr','CCCCCCCCCC#N','haloalkane-sn2-cyanide','NaCN, DMSO, ambient','11-2','Primary alkyl bromide SN2 with cyanide',co=['[C-]#N'])
route(6,'ethyl decanoate full reduction','clear','CCCCCCCCCC(=O)OCC','CCCCCCCCCCO.CCO','ester-lah-reduction','1 excess LiAlH4, dry ether; 2 aqueous workup','21-6','Simple ester to decanol and ethanol')
route(7,'unprotected bromopropanol Grignard','flag','OCCCBr','OCCC[Mg]Br','haloalkane-grignard-formation-bromide','Mg, dry ether, no OH protection','17-8','Free OH quenches organomagnesium')
route(8,'unprotected bromobutanol Grignard','flag','OCCCCBr','OCCCC[Mg]Br','haloalkane-grignard-formation-bromide','Mg, dry ether, no OH protection','17-8','Free OH quenches organomagnesium')
route(9,'keto ester LAH retains ketone','flag','CCC(=O)CCC(=O)OCC','CCC(=O)CCCO.CCO','ester-lah-reduction','1 excess LiAlH4, dry ether; 2 aqueous workup','17-4','LAH also reduces the ketone; drawn selectivity is implausible')
route(10,'long keto ester LAH retains ketone','flag','CCC(=O)CCCC(=O)OC','CCC(=O)CCCCO.CO','ester-lah-reduction','1 excess LiAlH4, dry ether; 2 aqueous workup','17-4','LAH also reduces the ketone; drawn selectivity is implausible')
route(11,'nitrotoluene Friedel Crafts acylation','flag','Cc1ccc([N+](=O)[O-])cc1','CCC(=O)c1cc(C)ccc1[N+](=O)[O-]','aromatic-friedel-crafts-acylation','Propanoyl chloride, AlCl3, dry CH2Cl2','16-3','Nitro substituted ring is too deactivated for conventional Friedel Crafts',co=['CCC(=O)Cl'])
route(12,'aminobenzoate Friedel Crafts acylation','flag','COC(=O)c1ccc(N)cc1','COC(=O)c1cc(C(C)=O)c(N)cc1','aromatic-friedel-crafts-acylation','Acetyl chloride, AlCl3, dry CH2Cl2; unprotected NH2','16-3','Basic amine binds Lewis acid; ester further deactivates ring',co=['CC(=O)Cl'])
(BASE/'candidate-cases.json').write_text(json.dumps(dict(cases=cases),indent=2)+'\n',encoding='utf8')
(BASE/'source-exclusions.json').write_text(json.dumps(exclusions,indent=2)+'\n',encoding='utf8')
print('Candidates:',len(cases),'; source exclusions:',len(exclusions))
