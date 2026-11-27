import hashlib, json, pathlib, subprocess, datetime
root = pathlib.Path(__file__).resolve().parents[3]
out = pathlib.Path(__file__).resolve().parent
def git(*args): return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
historic = {}
for stage in ['stage9f','stage9h','stage9i','stage9j']:
    for p in (root/'scripts/benchmarks'/stage).rglob('*'):
        if p.is_file(): historic[p.relative_to(root).as_posix()] = digest(p)
untracked = ['CLAUDE.md','scripts/browser/stage9fLiveCheck.mjs','stage5-changes.patch','stage5-status.txt']
data = dict(timeUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),head=git('rev-parse','HEAD'),srcTree=git('rev-parse','HEAD:src'),branch=git('branch','--show-current'),status=git('status','--short'),historicSHA256=historic,unrelatedSHA256={p:digest(root/p) for p in untracked},node=subprocess.check_output(['node','--version'],text=True).strip())
target=out/'starting-state.json'
if target.exists(): raise SystemExit('starting-state exists; refusing overwrite')
target.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print('Captured',len(historic),'historical files; HEAD',data['head'])
