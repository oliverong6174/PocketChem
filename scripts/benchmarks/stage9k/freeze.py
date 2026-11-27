import collections,hashlib,json,pathlib,subprocess,datetime
BASE=pathlib.Path(__file__).resolve().parent
ROOT=BASE.parents[2]
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
assert git('rev-parse','HEAD')=='7f4cdc021790f1d047f96ff9f2c89352ba4c58ee'
assert not git('diff','--name-only','HEAD','--','src')
cases=json.loads((BASE/'cases.json').read_text(encoding='utf8'))['cases']
files=[p for p in BASE.rglob('*') if p.is_file() and p.name!='manifest.json' and '__pycache__' not in p.parts and 'results' not in p.parts]
data=dict(frozenUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),engineCommit=git('rev-parse','HEAD'),engineSrcTree=git('rev-parse','HEAD:src'),caseCounts=dict(collections.Counter(c['kind'] for c in cases)),denominators=dict(collections.Counter(('A' if c['source']['quality'].startswith('A:') else 'B')+'/'+d for c in cases for d in c['criteria'])),hashMode='SHA-256 raw bytes',hashes={p.relative_to(BASE).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)})
with (BASE/'manifest.json').open('x',encoding='utf8') as f:f.write(json.dumps(data,indent=2)+'\n')
print(data['caseCounts'],data['denominators'],'files',len(files))
