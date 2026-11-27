from html.parser import HTMLParser
import pathlib, sys
sys.stdout.reconfigure(encoding='utf-8')
class Paragraphs(HTMLParser):
    def __init__(self): super().__init__(); self.depth=0; self.text=[]; self.rows=[]
    def handle_starttag(self,tag,attrs):
        if tag=='p': self.depth+=1
    def handle_endtag(self,tag):
        if tag=='p' and self.depth:
            self.depth-=1
            if not self.depth: self.rows.append(' '.join(''.join(self.text).split())); self.text=[]
    def handle_data(self,data):
        if self.depth:self.text.append(data)
p=pathlib.Path(__file__).resolve().parent/'references'
for f in sorted(p.glob('openstax-*.html')):
    parser=Paragraphs();parser.feed(f.read_text(encoding='utf8'))
    paragraphs=list(dict.fromkeys(parser.rows))
    f.with_suffix('.paragraphs.txt').write_text('\n'.join(paragraphs),encoding='utf8')
    if any(q in f.name for q in sys.argv[1:]):
        print('\n'+f.name)
        for t in paragraphs:
            if any(q in t.lower() for q in ['endo','syn ','anti ','primary','borohydride','deactivated','amino','lithium','cis ','trans '] ):print(t)
