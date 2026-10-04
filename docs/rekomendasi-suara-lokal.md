# Rekomendasi Engine Suara Lokal untuk Zephyr

Pola integrasi Zephyr: server lokal yang bicara OpenAI-compatible, ditunjuk lewat
kolom **Voice server URL** di Settings → Voice / Mic, **tanpa API key**.
Neural (TTS) butuh `POST /audio/speech`, Mic (STT) butuh `POST /audio/transcriptions`.

## Suara neural (TTS) — kandidat layak

| Engine | Kelebihan | Kekurangan | Status |
|---|---|---|---|
| VoxCPM2 | 30 bahasa, cloning, 48kHz, Apache-2.0, serving resmi vLLM-Omni dengan `/v1/audio/speech` | Butuh GPU + vLLM | **Pilihan utama** — siap pakai |
| kokoro | Ringan, suara natural, lisensi permisif | Perlu server wrapper komunitas | Cadangan ringan |
| ChatTTS | Dialog ekspresif (tawa, jeda), Mandarin+Inggris | Perlu bungkus server sendiri, AGPL-3.0 | Layak bila perlu ekspresi |
| CosyVoice / Fun-CosyVoice | Multilingual + cloning, termasuk Korea | Perlu server sendiri | Layak |
| dia | Dialog Inggris ultra-realistis | Inggris saja, perlu server sendiri | Opsional |
| OpenVoice | Cloning instan, MIT | Perlu server sendiri | Opsional |
| index-tts | Cloning + kontrol emosi | Perlu server sendiri | Opsional |
| GPT-SoVITS | Cloning + Bahasa Indonesia | Perlu server sendiri | Relevan untuk ID |
| edge-tts | Gratis, tanpa key, tanpa install model | Cloud Microsoft (bukan lokal, privasi) | Jalan pintas saja |
| piper | Sangat ringan, MIT, offline penuh | Kualitas standar, perlu server sendiri | Opsi hemat resource |

## Mic (STT) — kandidat layak

| Engine | Kelebihan | Status |
|---|---|---|
| sherpa-onnx | Lokal, Indonesia, build Windows, binding Rust (integrasi native mungkin) | **Pilihan utama mic** |
| SenseVoice / FunASR | Cepat + deteksi emosi | Cadangan |
| whisper.cpp / faster-whisper + server | `/audio/transcriptions` siap pakai | Jalan pintas |

## Tidak masuk

RVC (voice conversion, bukan TTS), MockingBird (repo mati 2021), supertonic
(arsip), unsloth (training LLM), OpenMontage / voice-pro / pyvideotrans / leon
(aplikasi jadi, bukan engine).

## Rencana integrasi

1. **Fase 1 (sudah jalan):** server eksternal via Voice server URL, tanpa key.
2. **Fase 2:** sherpa-onnx native via Rust crate untuk mic (tanpa server perantara).
3. **Fase 3:** bundel server TTS (VoxCPM2/kokoro) sebagai opsi sekali-klik.

## Langkah praktik sekarang

1. Jalankan server TTS lokal (mis. `vllm serve openbmb/VoxCPM2 --omni --port 8000`).
2. Settings → Voice → provider `Ollama/Custom`, URL `http://localhost:8000/v1`, key kosong.
3. Sama untuk Mic dengan server STT lokal.
