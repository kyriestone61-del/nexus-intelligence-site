from html.parser import HTMLParser
from pathlib import Path
import sys

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.labels_for=set()
        self.inputs=[]
        self.buttons=[]
        self._label_depth=0

    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        if tag=='label':
            self._label_depth+=1
            if data.get('for'):
                self.labels_for.add(data['for'])
        if tag in {'input','select','textarea'}:
            self.inputs.append({
                'tag':tag,
                'id':data.get('id'),
                'type':data.get('type',''),
                'aria_label':data.get('aria-label'),
                'aria_labelledby':data.get('aria-labelledby'),
                'inside_label':self._label_depth>0,
            })
        if tag=='button':
            self.buttons.append({'id':data.get('id'),'aria_label':data.get('aria-label'),'type':data.get('type')})

    def handle_endtag(self,tag):
        if tag=='label' and self._label_depth:
            self._label_depth-=1


def audit(file='portal.html'):
    text=Path(file).read_text(encoding='utf-8')
    p=AuditParser();p.feed(text)
    findings=[]
    for item in p.inputs:
        if item['type']=='hidden':
            continue
        labelled=(item['id'] in p.labels_for if item['id'] else False) or item['inside_label'] or item['aria_label'] or item['aria_labelledby']
        if not labelled:
            findings.append(('P1','UNLABELLED_CONTROL',f"{item['tag']}#{item['id'] or '(no id)'} has no explicit accessible label"))
    if 'role="dialog"' not in text and 'class="modal"' in text:
        findings.append(('P1','MODAL_DIALOG_SEMANTICS','Modal markup exists without an explicit role="dialog" contract.'))
    if 'aria-modal="true"' not in text and 'class="modal"' in text:
        findings.append(('P1','MODAL_ARIA_MODAL','Modal markup exists without aria-modal="true".'))
    if 'skip' not in text.lower() or 'main' not in text.lower():
        findings.append(('P2','SKIP_NAV','No obvious skip-to-main navigation contract detected.'))
    return findings

if __name__=='__main__':
    findings=audit(sys.argv[1] if len(sys.argv)>1 and not sys.argv[1].startswith('--') else 'portal.html')
    print('# Relystra accessibility static audit')
    for severity,code,message in findings:
        print(f'{severity} · {code} · {message}')
    if not findings:
        print('No configured static accessibility findings detected.')
    if '--strict' in sys.argv and any(x[0]=='P1' for x in findings):
        raise SystemExit(1)
