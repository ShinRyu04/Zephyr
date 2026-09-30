import io, json

p = 'D:/Zephyr/_ar_work/ar_map.json'
d = json.load(io.open(p, encoding='utf-8'))

for k in ('83', '231', '323'):
    v = d[k]
    # remove any backslash-escaped apostrophe variants; just use plain Zephyr
    v = v.replace("Zephyr\\\\'s", 'Zephyr').replace("Zephyr\\'s", 'Zephyr')
    d[k] = v

# also confirm the \\n placeholders survive (they must stay literal backslash-n)
for k in ('72',):
    print('72:', repr(d[k][:60]))

io.open(p, 'w', encoding='utf-8', newline='').write(json.dumps(d, ensure_ascii=False, indent=0))
print('entries:', len(d))
for k in ('83', '231', '323'):
    print(k, '->', repr(d[k][-40:]))
