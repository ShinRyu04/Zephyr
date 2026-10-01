import io

# 1) PersonaCard: nama & deskripsi lewat tr() supaya ikut bahasa aktif.
#    Persona buatan user tetap tampil apa adanya karena kuncinya tidak ada
#    di kamus — translate() mengembalikan kunci itu sendiri.
p = 'src/components/settings/PersonaCard.tsx'
s = io.open(p, encoding='utf-8', newline='').read()

s = s.replace(
    """                <span className="persona-nama">
                  {p.nama}""",
    """                <span className="persona-nama">
                  {tr(p.nama)}""",
)
s = s.replace(
    """                <span className="persona-ket">{p.deskripsi}</span>""",
    """                <span className="persona-ket">{tr(p.deskripsi)}</span>""",
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('  ✅ PersonaCard: nama + deskripsi lewat tr()')
