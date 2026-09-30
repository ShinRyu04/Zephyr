import io, re, json

SRC = 'D:/Zephyr/src/lib/i18n-extra.ts'
KEYS = 'D:/Zephyr/_perlu-terjemah.json'
MAP = 'D:/Zephyr/_ar_work/ar_map.json'

text = io.open(SRC, encoding='utf-8', newline='').read()
keys = json.load(io.open(KEYS, encoding='utf-8'))
amap = json.load(io.open(MAP, encoding='utf-8'))

m = re.search(r'const AR: Dict = \{', text)
start = m.start()
nm = re.search(r'\r?\nconst [A-Z][A-Z]: Dict = \{', text[start+10:])
ar_end = start + 10 + nm.start() if nm else text.index('\r\n};', start) + 4
ar_seg = text[start:ar_end]

# exact literal prefix per key, as it appears in the file
want = {}
for i, k in enumerate(keys):
    want[k] = amap[str(i)]
# keys that appear literally inside a line (raw file text). Build prefix map.
pref = {}
for i, k in enumerate(keys):
    pref["  '" + k + "': '"] = (k, amap[str(i)])

lines = ar_seg.split('\r\n')
out = []
replaced = set()
for ln in lines:
    hit = None
    for p, (k, v) in pref.items():
        if ln.startswith(p):
            hit = (k, v, p)
            break
    if hit:
        k, v, p = hit
        out.append(p + v + "',")
        replaced.add(k)
    else:
        out.append(ln)

missing = [k for k in keys if k not in replaced]
print('replaced:', len(replaced), 'missing:', len(missing))
for k in missing: print('  MISS:', repr(k))

if not missing:
    with io.open(SRC, 'w', encoding='utf-8', newline='') as f:
        f.write(text[:start] + '\r\n'.join(out) + text[ar_end:])
    print('WROTE')
