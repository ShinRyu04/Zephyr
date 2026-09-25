#!/usr/bin/env python3
"""isi-doc-zephyr.py — isi Google Doc "Zephyr 1.1.11" dengan daftar fitur AI VS Code.

Pakai:  python scripts/isi-doc-zephyr.py

Doc target: 16SD3Apn5C329GMGxW17xFXli0PPQ_xn6LBGFRK8MhgA
Menulis dokumen berstruktur: H1 judul, H2 per bagian, bullet list, tabel fitur.
"""

import json
import sys
from pathlib import Path

HERMES = Path.home() / ".hermes"
sys.path.insert(0, str(HERMES / "skills" / "productivity" / "google-workspace" / "scripts"))

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

DOC_ID = "16SD3Apn5C329GMGxW17xFXli0PPQ_xn6LBGFRK8MhgA"
TOKEN = HERMES / "google_token.json"

creds = Credentials.from_authorized_user_file(str(TOKEN))
docs = build("docs", "v1", credentials=creds)

# ── Kumpulan permintaan: (teks, gaya) ─────────────────────────────────────────
# Gaya: 'h1' | 'h2' | 'h3' | 'bold' | 'bullet' | 'text'
REQ = []


def t(teks, gaya="text"):
    REQ.append((teks, gaya))


t("Zephyr 1.1.11 — Rencana Update dari VS Code", "h1")
t("Dokumen ini berisi daftar fitur AI dari VS Code (2018–2026) yang cocok "
  "diadopsi ke Zephyr, disusun dari arsip resmi code.visualstudio.com/updates. "
  "Setiap item dicatat dengan versi asal, status di Zephyr, dan prioritas.", "text")

# ── Bagian 1: Timeline fitur AI VS Code ──────────────────────────────────────
t("1. Timeline Fitur AI VS Code", "h2")
t("VS Code memulai perjalanan AI-nya tahun 2023 (Copilot Chat) dan berubah "
  "total menjadi editor agentik di 2026.", "text")

t("2023 — Awal Copilot Chat", "h3")
for s in [
    "1.79 (Mei 2023) — Chat session history; Inline chat live preview",
    "1.80 (Jun 2023) — Copilot scaffold workspace/notebook",
    "1.81 (Jul 2023) — Accessible View untuk chat responses",
    "1.85 (Nov 2023) — Inline chat improvements; penjelasan kode Rust",
]:
    t(s, "bullet")

t("2024 — Copilot Matang", "h3")
for s in [
    "1.86 (Jan 2024) — Voice command: mulai chat pakai suara",
    "1.87 (Feb 2024) — Copilot-powered rename suggestions",
    "1.89 (Apr 2024) — Navigasi chat code blocks; Copilot content exclusion",
    "1.90 (Mei 2024) — Copilot extensibility; chat context attach",
    "1.91 (Jun 2024) — Chat + Language Model API stable",
    "1.93 (Ags 2024) — Quick Chat context; improved test generation",
    "1.94 (Sep 2024) — Drag & drop file ke chat",
    "1.95 (Okt 2024) — Copilot Chat di sidebar; Copilot code reviews",
    "1.96 (Nov 2024) — Copilot gratis; copilot-debug; symbols+folder as context",
]:
    t(s, "bullet")

t("2025 — Agent Mode", "h3")
for s in [
    "1.97 (Jan 2025) — Next Edit Suggestions (preview); auto-accept edits",
    "1.98 (Feb 2025) — AGENT MODE (preview): Copilot jalan otonom; code search",
    "1.107 (Nov 2025) — Agent sessions side-by-side; penanda input-required; "
    "salin perubahan workspace saat membuat sesi background",
]:
    t(s, "bullet")

t("2026 — Era Agentik", "h3")
for s in [
    "1.109 (Jan 2026) — Chat UX revamp; streaming lebih cepat; reasoning results",
    "1.110 (Feb 2026) — Agent plugins; Agentic browser tools; session memory; "
    "context compaction; fork chat session; Agent Debug panel",
    "1.111 — Autopilot (agent iterasi mandiri); agent-scoped hooks; agent troubleshooting",
    "1.112 — Integrated browser debugging; MCP server sandboxing; agent image support; "
    "monorepo customizations",
    "1.113 — Nested subagents; configurable thinking effort; chat customizations; CLI agent capabilities",
    "1.114 — Preview video; copy chat response; /troubleshoot; semantic workspace search",
    "1.115 — Integrated browser untuk agent; terminal tools",
    "1.116 — Agent debug logs; Copilot CLI thinking effort; Copilot built-in (tanpa ekstensi)",
    "1.117 — BYOK Business/Enterprise; incremental chat rendering; Copilot CLI di terminal",
    "1.118 — Remote control CLI session; semantic codebase search; dedicated context untuk skills",
    "1.119 — Agent-browser interaction; optimized token usage; OpenTelemetry tracing",
    "1.120 — Agents window (stable); BYOK token tracking; token optimization",
    "1.121 — Remote agents; model configurability; HTML file preview",
    "1.122 — 1M context windows; air-gapped BYOK; browser device emulation",
    "1.124 — Background sessions; session navigation; browser history",
    "1.125 — Install model providers dari Marketplace; browser search; Copilot policies",
    "1.126 — Session-level cost; multiple chats per session",
    "1.127 — Browser tools GA; per-site browser permissions; subagent credits",
    "1.128 — Multi-chat sessions; quick chats; Copilot Vision (gambar/PDF)",
    "1.129 — Agent host (proses terpisah); editor panel di Agents window; perintah prefix !",
    "1.130 — Agent host multi-window; compact diffs; assisted tool approvals",
    "1.131 — Detail subagent (model/waktu/tool); built-in dictation; hybrid Markdown editor",
    "1.132 — Comment di integrated browser; multilingual dictation; side chats /btw",
    "1.133 — Ganti model provider antar turn; Agents window tanpa GitHub sign-in",
    "1.134 — Side-by-side chats; prompt timeline; find in chat",
    "1.135 — External agent sessions; Rubber Duck; rincian token per model",
    "1.136 — Agent Merge; multi-root workspaces; chat backgrounds; hierarki sesi",
    "1.137 — Automations (cron agent); Voice Mode; GitHub issues di Agents window",
    "1.138 — Agent di Dev Containers; Codex harness; session cleanup",
    "1.139 — Remote Dev Container sessions; perbaikan daftar sesi",
]:
    t(s, "bullet")

# ── Bagian 2: Yang bisa diadopsi ─────────────────────────────────────────────
t("2. Fitur yang Cocok Diadopsi Zephyr", "h2")
t("Dipilih berdasarkan fondasi yang sudah ada di Zephyr. Prioritas: P1 = "
  "berdampak besar dan fondasinya siap; P2 = perlu kerja menengah; P3 = eksperimen.", "text")

t("Prioritas P1", "h3")
for s in [
    "Nested subagents (dari 1.113) — Zephyr sudah punya subagent paralel; "
    "tinggal izinkan subagent memanggil subagent lain",
    "Configurable thinking effort (dari 1.113) — Zephyr sudah punya reasoningEffort; "
    "tinggal kontrol dari UI chat",
    "Token/cost tracking per sesi (dari 1.126 & 1.135) — ContextMeter sudah ada; "
    "tinggal tambah estimasi biaya per model",
    "Context compaction manual (dari 1.110) — belum ada; berguna untuk sesi panjang",
]:
    t(s, "bullet")

t("Prioritas P2", "h3")
for s in [
    "Agent plugins (dari 1.110) — bundel skills+tools+hooks; Zephyr punya sistem skills",
    "Browser tools untuk agent (dari 1.127) — Zephyr sudah punya browser pane",
    "Agent image support (dari 1.112) — lampiran gambar sudah ada",
    "BYOK / ganti provider per turn (dari 1.117 & 1.133) — multi-provider sudah ada",
    "Automations / cron agent (dari 1.137) — Zephyr punya cronjob",
    "Session memory / fork chat (dari 1.110) — belum ada",
]:
    t(s, "bullet")

t("Prioritas P3", "h3")
for s in [
    "Side chats /btw (dari 1.132) — pertanyaan sampingan tanpa mengganggu agent",
    "Rubber Duck (dari 1.135) — second opinion dari model lain",
    "Voice Mode (dari 1.137) — bicara dengan agent",
    "Agent Merge (dari 1.136) — bantu selesaikan PR sampai siap merge",
]:
    t(s, "bullet")

# ── Bagian 3: Catatan ────────────────────────────────────────────────────────
t("3. Catatan Pengerjaan", "h2")
for s in [
    "Daftar ini disusun dari 117 versi VS Code (1.20 s/d 1.139) yang ditarik dari "
    "code.visualstudio.com/updates; 47 versi memuat fitur AI.",
    "Format halaman release notes berubah sejak 1.99: highlight tidak lagi berupa "
    "bullet, melainkan paragraf berjudul kategori.",
    "Kerjakan hanya item yang disetujui; setiap perubahan UI wajib dikonfirmasi dulu.",
    "Setelah semua beres: test semua fitur di Zephyr debug, lapor, lalu tunggu "
    "konfirmasi sebelum rebuild/release.",
]:
    t(s, "bullet")

# ── Bangun request batchUpdate ───────────────────────────────────────────────
GAYA = {
    "h1": {"namedStyleType": "HEADING_1", "bold": True, "fontSize": 20},
    "h2": {"namedStyleType": "HEADING_2", "bold": True, "fontSize": 15},
    "h3": {"namedStyleType": "HEADING_3", "bold": True, "fontSize": 12},
    "bullet": {"bullet": True},
    "text": {},
    "bold": {"bold": True},
}

# Susun teks final + index
teks = ""
idx = 1  # Docs body mulai di index 1
letak = []
for isi, gaya in REQ:
    baris = isi + "\n"
    letak.append((idx, idx + len(baris), gaya))
    teks += baris
    idx += len(baris)

reqs = [{"insertText": {"location": {"index": 1}, "text": teks}}]
for a, b, gaya in letak:
    if gaya == "text":
        continue
    rng = {"startIndex": a, "endIndex": b}
    if gaya == "bullet":
        reqs.append({"createParagraphBullets": {"range": rng, "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE"}})
    else:
        st = GAYA[gaya]
        reqs.append({"updateParagraphStyle": {"range": rng, "paragraphStyle": {"namedStyleType": st["namedStyleType"]}, "fields": "namedStyleType"}})
        reqs.append({"updateTextStyle": {"range": rng, "textStyle": {"bold": st["bold"], "fontSize": {"magnitude": st["fontSize"], "unit": "PT"}}, "fields": "bold,fontSize"}})

docs.documents().batchUpdate(documentId=DOC_ID, body={"requests": reqs}).execute()
print(f"OK — {len(REQ)} paragraf ditulis ke Doc {DOC_ID}")
print(f"   https://docs.google.com/document/d/{DOC_ID}/edit")
