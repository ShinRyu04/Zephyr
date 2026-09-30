# -*- coding: utf-8 -*-
import io, re
s = io.open(r'D:\Zephyr\src\lib\i18n.ts', encoding='utf-8', newline='').read()
i = s.find('const ID: Dict')
j = s.find('};', i)
blk = s[i:j]
ENTRY = re.compile(r"^  '((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',?\s*$")
ks = []
for l in blk.split('\r\n'):
    m = ENTRY.match(l)
    if m:
        ks.append((m.group(1), m.group(2)))
print('ID entries:', len(ks))
for k, v in ks:
    if v in ('Search', 'Review', 'Plan', 'Audit', 'Work', 'Explore'):
        print(repr(k), '->', repr(v))
print('--- any key named Cari/Telaah/etc in this block?')
print([k for k, v in ks if k in ('Cari', 'Telaah', 'Rencana', 'Kerja', 'Jelajah')])
