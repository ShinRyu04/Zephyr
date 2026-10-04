# Suara Neural & Mic Zephyr — Apa yang Bisa Dipakai

Dua fitur, dua endpoint, satu pola: **server lokal yang bicara OpenAI-compatible**,
ditunjuk lewat kolom URL di Settings, **tanpa API key**.

| Fitur | Field di Settings | Endpoint yang dipanggil |
|---|---|---|
| Suara neural (AI bicara) | Voice → `Voice server URL` | `POST /audio/speech` |
| Mic (dikte) | Mic → `Mic server URL` | `POST /audio/transcriptions` |

Fase 2 yang direncanakan: sherpa-onnx dipanggil **native dari Rust** (crate-nya
ada), jadi mic tidak butuh server perantara sama sekali.

---

## 1. Suara neural (TTS) — sudah jalan di mesin ini

Dipasang di `C:\Users\home\kokoro-tts`, port **8880**, model **Kokoro-82M**.

**54 suara, 9 bahasa:**

| Bahasa | Jumlah | Contoh |
|---|---|---|
| Inggris AS | 20 | `af_heart`, `am_adam`, `af_bella` |
| Inggris UK | 8 | `bf_emma`, `bm_george` |
| Jepang | 5 | `jf_alpha`, `jm_kumo` |
| Mandarin | 8 | `zf_xiaobei`, `zm_yunjian` |
| Spanyol | 3 | `ef_dora`, `em_alex` |
| Prancis / Hindi / Italia / Portugis | 10 | `ff_siwis`, `hf_alpha`, `if_sara`, `pf_dora` |

Kokoro **tidak punya suara Indonesia**. Untuk itu perlu engine lain (lihat bawah).

### Engine TTS lain, kalau Kokoro kurang

| Engine | Kelebihan | Kekurangan |
|---|---|---|
| **GPT-SoVITS** | **Ada Bahasa Indonesia** + cloning | Server sendiri, agak berat |
| **VoxCPM2** | 30 bahasa + cloning, serving resmi `/v1/audio/speech` | Butuh GPU + vLLM |
| CosyVoice | Multilingual + cloning | Server sendiri |
| ChatTTS | Dialog ekspresif (tawa, jeda) | AGPL, server sendiri |
| piper | Sangat ringan, offline penuh | Kualitas standar |
| edge-tts | Gratis tanpa install model | **Cloud Microsoft**, bukan lokal |

---

## 2. Mic (STT) — server sudah jalan, kualitas masih diuji

Dipasang di folder yang sama, port **8881**, model **sherpa-onnx Whisper**.

**Hasil uji jujur:**

| Bahasa | Hasil |
|---|---|
| Inggris | **Sempurna** — `"Hello, this is a test of the transcription server."` tepat 100% |
| Indonesia | **Kurang** — kata Inggris/istilah asing tepat, kata Indonesia sering meleset |

Kenapa Indonesia kurang, dan kenapa itu **bukan bug server**:

1. **Whisper** memang lemah di Bahasa Indonesia — data latihnya sedikit
   dibanding Inggris. Kata yang mirip Inggris selalu benar, kata asli Indonesia
   sering jadi fonetik terdekat.
2. Uji awal saya pakai suara **Kokoro `af_heart`** (suara Amerika) untuk membaca
   kalimat Indonesia — audionya memang aneh, jadi STT-nya diuji dengan masukan
   buruk. Diganti suara asli pun, Whisper tetap kesulitan di kosakata Indonesia.

**Rencana:** turunkan `whisper-turbo` (kualitas large-v3, 537 MB) untuk
memperbaiki akurasi, dan uji dengan rekaman mic asli — bukan suara sintetis.

### Engine STT lain, kalau Whisper kurang

| Engine | Kelebihan |
|---|---|
| **sherpa-onnx + Zipformer multibahasa** | Model `streaming-zipformer-ar_en_id_ja_ru_th_vi_zh` — **ada `id`**, dan streaming (kata muncul sambil bicara) |
| **sherpa-onnx native (Rust)** | Tanpa server perantara; crate tersedia |
| SenseVoice / FunASR | Cepat, deteksi emosi |
| whisper.cpp / faster-whisper | `/audio/transcriptions` siap pakai |

---

## 3. Yang TIDAK masuk daftar

RVC (voice *conversion*, bukan TTS), MockingBird (repo mati 2021), supertonic
(arsip), unsloth (training LLM), OpenMontage / voice-pro / pyvideotrans / leon
(aplikasi jadi, bukan engine).

---

## 4. Cara menjalankan

```bash
cd /c/Users/home/kokoro-tts
./.venv/Scripts/python.exe server_kokoro.py   # TTS, port 8880
./.venv/Scripts/python.exe server_stt.py      # STT, port 8881
```

Di Zephyr:

- **Voice** → `Use neural voice` ON → provider `Custom` → URL `http://127.0.0.1:8880/v1` → key **kosong**
- **Mic** → provider `Custom` → URL `http://127.0.0.1:8881/v1` → key **kosong**

Server lokal tidak butuh API key. Kalau UI meminta key untuk server lokal, itu bug —
laporkan.

---

## 5. Catatan pemasangan (jebakan yang sudah kena)

- `kokoro` di PyPI menarik `transformers 2.3.0` (dari 2020) yang merusak
  `misaki`/spacy, dan `tokenizers` gagal build dari sumber. Tambalan:
  `transformers>=4.44`, lalu `fugashi unidic-lite cutlet pyopenjtalk` untuk Jepang.
- `kokoro-onnx` **tidak boleh** dipasang bersama `kokoro` — keduanya memakai nama
  modul `kokoro`, dan yang satu menimpa yang lain (`KModel has no attribute device`).
- `ffmpeg` tidak terpasang di mesin ini. Dekode WebM/Opus memakai **PyAV**, yang
  membawa ffmpeg di dalam wheel-nya — jadi tidak perlu install sistem.
