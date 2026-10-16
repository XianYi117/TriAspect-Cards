"""修正 PDF 複製文字時出現「⼿」「⾓」這類部首字的問題。
Chromium 輸出 Noto CJK 字型時，部分字的對照表會指到康熙部首（U+2F00–2FDF）或部首補充（U+2E80–2EFF），
複製貼上就會變成長得很像但不同的字。這裡把對照表改回一般的中文字。
用法：python3 tools/fix_pdf_text.py docs/xxx.pdf"""
import re, sys, unicodedata
import pikepdf

def fix_hex(h):
    s = bytes.fromhex(h).decode('utf-16-be', 'surrogatepass')
    t = ''.join(unicodedata.normalize('NFKC', c) if 0x2E80 <= ord(c) <= 0x2FDF else c for c in s)
    return t.encode('utf-16-be').hex().upper() if t != s else h

def fix_cmap(data):
    out, section, changed = [], None, 0
    for line in data.decode('latin-1').split('\n'):
        if 'beginbfchar' in line: section = 'char'
        elif 'beginbfrange' in line: section = 'range'
        elif 'endbf' in line: section = None
        elif section:
            toks = re.findall(r'<([0-9A-Fa-f]+)>', line)
            if (section == 'char' and len(toks) == 2) or (section == 'range' and len(toks) == 3):
                new = fix_hex(toks[-1])
                if new != toks[-1]:
                    i = line.rfind('<' + toks[-1] + '>'); line = line[:i] + '<' + new + '>' + line[i + len(toks[-1]) + 2:]; changed += 1
        out.append(line)
    return '\n'.join(out).encode('latin-1'), changed

path = sys.argv[1]
pdf = pikepdf.open(path, allow_overwriting_input=True)
total, seen = 0, set()
for page in pdf.pages:
    fonts = page.get('/Resources', {}).get('/Font', {})
    for name in fonts.keys():
        f = fonts[name]
        tu = f.get('/ToUnicode')
        if tu is None or tu.objgen in seen: continue
        seen.add(tu.objgen)
        data, n = fix_cmap(tu.read_bytes())
        if n: tu.write(data); total += n
pdf.save(path)
print(f'修正 {total} 個字的對照')
