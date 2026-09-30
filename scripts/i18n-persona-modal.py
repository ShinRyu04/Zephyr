import io

p = 'src/components/settings/PersonaCard.tsx'
s = io.open(p, encoding='utf-8', newline='').read()

# 1) Nilai awal field: terjemahkan nama & deskripsi persona bawaan supaya
#    yang muncul di input adalah versi bahasa aktif, bukan teks Indonesia.
s = s.replace(
    "  const [nama, setNama] = useState(awal?.nama ?? '');\n"
    "  const [deskripsi, setDeskripsi] = useState(awal?.deskripsi ?? '');",
    "  /*\n"
    "   * A built-in persona stores its name and description as i18n keys, so the\n"
    "   * input has to show the translated text. The original value is kept beside\n"
    "   * it: if the field comes back unchanged we store the key again, otherwise\n"
    "   * the persona would freeze in whatever language it was last edited in.\n"
    "   */\n"
    "  const asliNama = awal?.nama ?? '';\n"
    "  const asliDeskripsi = awal?.deskripsi ?? '';\n"
    "  const [nama, setNama] = useState(awal ? tr(awal.nama) : '');\n"
    "  const [deskripsi, setDeskripsi] = useState(awal ? tr(awal.deskripsi) : '');",
)

# 2) Saat menyimpan: pakai nilai asli kalau field tidak diubah.
s = s.replace(
    "              void simpan({\n"
    "                nama: nama.trim(),\n"
    "                deskripsi: deskripsi.trim(),",
    "              void simpan({\n"
    "                nama: nama.trim() === tr(asliNama) ? asliNama : nama.trim(),\n"
    "                deskripsi:\n"
    "                  deskripsi.trim() === tr(asliDeskripsi) ? asliDeskripsi : deskripsi.trim(),",
)

# 3) Pemeriksaan nama bentrok harus membandingkan nilai asli, bukan terjemahan.
s = s.replace(
    "  const namaBentrok = usePersona((s) =>\n"
    "    s.daftar.some((x) => x.nama.toLowerCase() === nama.trim().toLowerCase() && x.id !== awal?.id),\n"
    "  );",
    "  const namaBentrok = usePersona((s) =>\n"
    "    s.daftar.some(\n"
    "      (x) =>\n"
    "        x.id !== awal?.id &&\n"
    "        (x.nama.toLowerCase() === nama.trim().toLowerCase() ||\n"
    "          tr(x.nama).toLowerCase() === nama.trim().toLowerCase()),\n"
    "    ),\n"
    "  );",
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('  ✅ PersonaCard: nama & deskripsi diterjemahkan di modal, nilai asli disimpan')
