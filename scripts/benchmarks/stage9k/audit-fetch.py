import datetime,hashlib,json,pathlib,urllib.request
base=pathlib.Path(__file__).resolve().parent/'audit';base.mkdir(exist_ok=True)
url='https://w3pharm.u-shizuoka-ken.ac.jp/yakka/Japanese/manabeCLASS/yuki_2/2010_11_slides.pdf'
target=base/'shizuoka-diels-alder-lecture.pdf'
if target.exists():raise SystemExit('Already downloaded')
with urllib.request.urlopen(url,timeout=45) as r:data=r.read()
target.write_bytes(data)
(base/'external-source.json').write_text(json.dumps(dict(url=url,retrievedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),sha256=hashlib.sha256(data).hexdigest(),purpose='Post-freeze Stage 9J Diels-Alder audit only; not a new benchmark reference'),indent=2)+'\n',encoding='utf8')
print(len(data),'bytes downloaded')
