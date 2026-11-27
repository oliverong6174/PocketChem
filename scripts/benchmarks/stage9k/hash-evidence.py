import hashlib,json,pathlib
base=pathlib.Path(__file__).resolve().parent
files=[p for d in ['results','audit'] for p in (base/d).rglob('*') if p.is_file()]
out={p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
with (base/'EVIDENCE-HASHES.json').open('x',encoding='utf8')as f:f.write(json.dumps(out,indent=2)+'\n')
print('Hashed',len(files),'post-freeze evidence files.')
