"""Reference retrieval only. Never imports or calls PocketChem."""
import concurrent.futures, datetime, hashlib, json, pathlib, re, time, urllib.request, urllib.parse
BASE=pathlib.Path(__file__).resolve().parent
OUT=BASE/'references'; OUT.mkdir(exist_ok=True)
NAMES=['2,3-dimethylpentane','3-ethylhexane','2,2,4-trimethylpentane','3-methylhexan-2-one','4-methylhexan-2-one','2,2-dimethylbutanoic acid','3,3-dimethylbutanoic acid','2-ethylbutanoic acid','ethyl 2-methylbutanoate','methyl 3-methylpentanoate','N-ethylpropanamide','N,N-dimethylbenzamide','3-bromobenzoic acid','4-chlorobenzaldehyde','3-methoxybenzoic acid','2-aminobutan-1-ol','(R)-2-chloropentane','(S)-2-chloropentane','(E)-hept-3-ene','(Z)-hept-3-ene']
MS=[('thiophene','110021'),('pyrrole','109977'),('furan','110009'),('pyridazine','289805'),('pyrimidine','289952'),('pyrazine','290379'),('cycloheptanone','502421'),('cyclopentanone','120923'),('2-nonanone','821556'),('nonanal','124196'),('methyl heptanoate','106730'),('ethyl heptanoate','106309'),('heptanoic acid','111148'),('nonanenitrile','2243278'),('1-decanol','112301'),('dipropylamine','142847'),('tripropylamine','102692'),('ethoxybenzene','103731')]
PAGES=['8-2-halogenation-of-alkenes-addition-of-x2','8-5-hydration-of-alkenes-addition-of-h2o-by-hydroboration','8-6-reduction-of-alkenes-hydrogenation','9-4-hydration-of-alkynes-addition-of-h2o','9-3-reactions-of-alkynes-addition-of-hx-and-x2','9-5-reduction-of-alkynes','11-2-the-sn2-reaction','11-8-the-e2-reaction-and-the-deuterium-isotope-effect','11-12-a-summary-of-reactivity-sn1-sn2-e1-e1cb-and-e2','16-3-alkylation-and-acylation-of-aromatic-rings-the-friedel-crafts-reaction','17-4-alcohols-from-carbonyl-compounds-reduction','17-8-protection-of-alcohols','19-7-nucleophilic-addition-of-hydride-and-grignard-reagents-alcohol-formation','21-6-chemistry-of-esters','14-5-characteristics-of-the-diels-alder-reaction','7-8-orientation-of-electrophilic-additions-markovnikovs-rule']
PAGES += ['9-4-hydration-of-alkynes','11-7-elimination-reactions-zaitsevs-rule']
def slug(s): return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
tasks=[]
for n in dict.fromkeys(NAMES+[n for n,_ in MS]):
    tasks.append(('pubchem-'+slug(n)+'.json','https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'+urllib.parse.quote(n,safe='')+'/property/IUPACName,CanonicalSMILES,IsomericSMILES,MolecularFormula,MonoisotopicMass/JSON'))
for n,cas in MS: tasks.append(('nist-'+slug(n)+'.jdx','https://webbook.nist.gov/cgi/cbook.cgi?JCAMP=C'+cas+'&Index=0&Type=Mass'))
for p in PAGES: tasks.append(('openstax-'+p+'.html','https://openstax.org/books/organic-chemistry/pages/'+p))
def fetch(t):
    name,url=t; p=OUT/name
    if p.exists(): return dict(file='references/'+name,url=url,status='cached',sha256=hashlib.sha256(p.read_bytes()).hexdigest())
    time.sleep(3)
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'PocketChem-independent-validation/9K (reference audit)'})
        with urllib.request.urlopen(req,timeout=45) as r: data=r.read(); code=r.status
        p.write_bytes(data)
        return dict(file='references/'+name,url=url,status=code,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),retrievedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat())
    except Exception as e: return dict(file='references/'+name,url=url,status='error',error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool: records=list(pool.map(fetch,tasks))
target=BASE/'reference-retrieval.json'
if target.exists():
    with (BASE/'reference-retrieval-followups.jsonl').open('a',encoding='utf-8') as f: f.write(json.dumps(records)+'\n')
else: target.write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
for r in records: print(r['file'],r['status'],r.get('bytes',r.get('error','')))
