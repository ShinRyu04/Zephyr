import io, re
SRC = 'D:/Zephyr/src/lib/i18n-extra.ts'
with io.open(SRC, 'r', encoding='utf-8', newline='') as f:
    text = f.read()
i = text.index('const AR: Dict = {')
seg = text[i:i+400]
print(repr(seg[:200]))
ent = re.compile(r"^  ('(?:\\.|[^'\\])*'): ('(?:\\.|[^'\\])*'),$", re.M)
print('matches in first 400:', len(ent.findall(seg)))
print('matches whole file:', len(ent.findall(text)))
