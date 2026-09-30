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
    return {m.group(1)[1:-1]: m.group(2)[1:-1] for m in ent.finditer(seg)}

ar = parse('AR')
id_ = parse('ID')
en = parse('EN')

with io.open(KEYS, 'r', encoding='utf-8') as f:
    keys = json.load(f)

out = []
for k in keys:
    out.append({'key': k, 'ar': ar.get(k), 'id': id_.get(k), 'en': en.get(k)})

with io.open('D:/Zephyr/_ar_work/ar_todo.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

# also dump as readable text
with io.open('D:/Zephyr/_ar_work/ar_todo.txt', 'w', encoding='utf-8') as f:
    for i, o in enumerate(out):
        f.write('### %d\nKEY: %s\nAR : %s\nID : %s\nEN : %s\n\n' % (i, o['key'], o['ar'], o['id'], o['en']))
print('written', len(out))
