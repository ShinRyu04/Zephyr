import io

p = 'src/components/ai/SubAgentPanel.tsx'
lines = io.open(p, encoding='utf-8', newline='').read().split('\n')

# Baris 270 (index 269): `              disabled={sibuk}` di dalam blok follow-up.
i = 269
print('  sebelum:', repr(lines[i]))
lines[i] = lines[i].replace('{sibuk}', '{sibukGlobal}')
print('  sesudah:', repr(lines[i]))

io.open(p, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('  selesai')
