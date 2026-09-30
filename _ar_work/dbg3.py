import io, re
SRC = 'D:/Zephyr/src/lib/i18n-extra.ts'
text = io.open(SRC, encoding='utf-8', newline='').read()
m = re.search(r'const AR: Dict = \{', text)
start = m.start()
nm = re.search(r'\r?\nconst [A-Z][A-Z]: Dict = \{', text[start+10:])
ar_end = start + 10 + nm.start() if nm else len(text)
seg = text[start:ar_end]
for ln in seg.split('\r\n'):
    if 'Zephyr' in ln and ('built-in behaviour with nothing added' in ln or 'default identity' in ln):
        print(repr(ln[:140]), '...=> len', len(ln))
    if ln.startswith("  'yang aktif") or ln.startswith("  ' yang aktif"):
        print('KEYLINE:', repr(ln[:120]))
