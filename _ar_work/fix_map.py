import io, json
p = 'D:/Zephyr/_ar_work/ar_map.json'
d = json.load(io.open(p, encoding='utf-8'))
for k in ('83', '231', '323'):
    v = d[k]
    # want file text Zephyr\'s  -> python string 'Zephyr\\'s'
    v = v.replace("Zephyr\\\\'s", "Zephyr\\'s")
    d[k] = v
io.open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=0))
for k in ('83', '231', '323'):
    print(k, repr(d[k][-30:]))
