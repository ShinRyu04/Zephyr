import io, re, json

SRC = 'D:/Zephyr/src/lib/i18n-extra.ts'
KEYS = 'D:/Zephyr/_perlu-terjemah.json'

with io.open(SRC, 'r', encoding='utf-8', newline='') as f:
    text = f.read()

pat = re.compile(r'const ([A-Z][A-Z]): Dict = \{')
blocks = [(m.group(1), m.start()) for m in pat.finditer(text)]
blocks.append(('__END__', len(text)))
spans = {blocks[i][0]: (blocks[i][1], blocks[i+1][1]) for i in range(len(blocks)-1)}

ent = re.compile(r"^  ('(?:\\.|[^'\\])*'): ('(?:\\.|[^'\\])*'),\r?$", re.M)

def parse(lang):
    s, e = spans[lang]
    seg = text[s:e]
    out = {}
    for m in ent.finditer(seg):
        out[m.group(1)[1:-1]] = (m.group(2)[1:-1], m.start(2), m.end(2), m.group(2))
    return out, seg, s

ar, ar_seg, ar_s = parse('AR')
id_, _, _ = parse('ID')
en, _, _ = parse('EN')

with io.open(KEYS, 'r', encoding='utf-8') as f:
    keys = json.load(f)

print('AR entries:', len(ar), 'ID:', len(id_), 'EN:', len(en))
print('keys:', len(keys), 'unique:', len(set(keys)))
missing = [k for k in keys if k not in ar]
print('missing in AR:', len(missing))
for k in missing: print('  MISS:', repr(k))
klen = set(keys)
extra = [k for k in ar if k not in klen]
print('AR keys not in list:', len(extra))
for k in extra: print('  EXTRA:', repr(k))
