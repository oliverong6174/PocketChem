import json,pathlib
BASE=pathlib.Path(__file__).resolve().parent
data=json.loads((BASE/'candidate-cases.json').read_text(encoding='utf8'))
overlap=json.loads((BASE/'overlap.json').read_text(encoding='utf8'))
exclude={r['id'] for r in overlap['rows'] if r['primaryOverlap'] or r['invalid']}
data['cases']=[c for c in data['cases'] if c['id'] not in exclude]
data['independence']='Separate evaluator from implementer; knows exposed reports/failure categories; no new predictions or detailed prediction-logic inspection before freeze. Purposive selection; not random/blind.'
(BASE/'cases.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
(BASE/'case-exclusions.json').write_text(json.dumps([r for r in overlap['rows'] if r['id'] in exclude],indent=2)+'\n',encoding='utf8')
counts={k:len([c for c in data['cases'] if c['kind']==k]) for k in ['nomenclature','ms','reaction','route']}
print(counts,'total',len(data['cases']))
