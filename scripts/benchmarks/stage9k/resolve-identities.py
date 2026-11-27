"""One post-prediction independent database lookup per unmatched emitted name; no retries."""
import datetime,json,pathlib,re,time,urllib.request,urllib.parse
BASE=pathlib.Path(__file__).resolve().parent
out=BASE/'results'/'identity-resolution';out.mkdir(exist_ok=True)
def norm(s):return re.sub(r'[\s\-\u2010-\u2015]','',s.lower())
for c in json.loads((BASE/'cases.json').read_text(encoding='utf8'))['cases']:
    if c['kind']!='nomenclature':continue
    record=json.loads((BASE/'results'/(c['id']+'.json')).read_text(encoding='utf8'))
    n=record.get('identity',{}).get('nomenclature',{});name=n.get('estimatedName') or n.get('displayName')
    if n.get('namingStatus')=='unsupported' or not name:continue
    target=out/(c['id']+'.json')
    if target.exists():raise SystemExit('Identity resolution already attempted for '+c['id'])
    data=dict(id=c['id'],emittedName=name,startedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if any(norm(name)==norm(a) for a in c['expected']['accepted_names']):
        data.update(smiles=c['smiles'],method='exact frozen accepted name/structure pair')
    else:
        url='https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'+urllib.parse.quote(name,safe='')+'/property/IUPACName,IsomericSMILES/JSON'
        data['url']=url;time.sleep(1)
        try:
            with urllib.request.urlopen(url,timeout=30) as r: raw=r.read()
            (out/(c['id']+'-response.json')).write_bytes(raw)
            p=json.loads(raw)['PropertyTable']['Properties'][0]
            data.update(smiles=p['SMILES'],cid=p['CID'],resolvedName=p['IUPACName'],method='single PubChem name resolution of full emitted systematic name')
        except Exception as e:data['error']=str(e)
    target.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
    print(c['id'],name,'->',data.get('smiles',data.get('error')))
