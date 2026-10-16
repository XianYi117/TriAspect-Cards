"""把 src/ 組成可直接開啟的單一 index.html。用法：python3 tools/build.py"""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
back = 'data:image/jpeg;base64,' + base64.b64encode((root / 'assets' / 'card-back.jpg').read_bytes()).decode()
back_lg = 'data:image/jpeg;base64,' + base64.b64encode((root / 'assets' / 'card-back-large.jpg').read_bytes()).decode()
html = (src / 'template.html').read_text(encoding='utf-8')
html = (html.replace('__CARDS__', (root / 'data' / 'cards.json').read_text(encoding='utf-8'))
            .replace('__BACK_LG__', back_lg)
            .replace('__BACK__', back)
            .replace('__ENGINE__', (src / 'engine.js').read_text(encoding='utf-8'))
            .replace('__UI__', (src / 'ui.js').read_text(encoding='utf-8')))
(root / 'index.html').write_text(html, encoding='utf-8')
print('index.html', len(html), 'bytes')
