# -*- coding: utf-8 -*-
import io, re
s = io.open(r'D:\Zephyr\src\lib\i18n.ts', encoding='utf-8', newline='').read()
lines = s.split('\r\n')
cur = None
res = {}
ENTRY = re.compile(r"^  '((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',?\s*$")
for i, l in enumerate(lines):
    m = re.match(r'^const ([A-Z]{2}): Dict', l)
    if m:
        cur = m.group(1)
        res[cur] = []
    m2 = ENTRY.match(l)
    if m2 and cur:
        res[cur].append((i + 1, m2.group(1), m2.group(2)))
print({k: len(v) for k, v in res.items()})
for k, v in res.items():
    hit = [(n, key, val) for n, key, val in v if key in ('Cari', 'Telaah', 'Rencana', 'Kerja', 'Jelajah')]
    if hit:
        print(k, hit)
