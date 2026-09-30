# -*- coding: utf-8 -*-
"""Replikasi verify-i18n.mjs untuk melacak dari mana kunci Cari dkk berasal."""
import io

src = io.open(r'D:\Zephyr\src\lib\i18n.ts', encoding='utf-8', newline='').read()
extra = io.open(r'D:\Zephyr\src\lib\i18n-extra.ts', encoding='utf-8', newline='').read()


def keysOf(name, teks):
    i = teks.find('const %s: Dict' % name)
    if i == -1:
        return None
    j = teks.find('};', i)
    out = set()
    for l in teks[i:j].replace('\r\n', '\n').split('\n'):
        m = l.startswith("  '") and l.split("':", 1)
        if m and len(m) == 2 and m[1].startswith(':'):
            pass
        # pakai regex sederhana sesuai script
        import re
        mm = re.match(r"^  '(.+?)':", l)
        if mm:
            out.add(mm.group(1))
    return out


def semua(name):
    a = keysOf(name, src) or set()
    b = keysOf(name, extra) or set()
    return set(list(a) + list(b))


ref = semua('EN')
target = {'Cari', 'Telaah', 'Rencana', 'Kerja', 'Jelajah'}
print('ref contains target?', {t: (t in ref) for t in target})
for d in ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR']:
    ks = semua(d)
    kurang = [k for k in ref if k not in ks]
    print(d, 'keys=%d' % len(ks), 'kurang=%s' % kurang)
    if d == 'ID':
        print('   ID has Cari?', 'Cari' in ks)
        print('   ID-extra has Cari?', 'Cari' in (keysOf('ID', extra) or set()))
