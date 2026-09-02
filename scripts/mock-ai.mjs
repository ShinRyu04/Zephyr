// mock-ai.mjs — server provider AI tiruan untuk verifikasi fase 09.
//
// Kenapa perlu: V3..V7 harus membuktikan streaming, adapter per provider,
// dan cancel BENAR-BENAR jalan lewat jalur Rust — bukan mock di frontend.
// Memakai API asli akan (a) butuh key hidup, (b) membakar kuota, (c) membuat
// hasil tidak deterministik. Server ini bicara protokol yang sama persis:
//
//   POST /v1/chat/completions                       -> SSE (OpenAI)
//   POST /v1/messages                               -> SSE (Anthropic)
//   POST /v1beta/models/<model>:streamGenerateContent -> JSON array (Gemini)
//
// Port 8098 (8080 TIDAK bisa dipakai di mesin ini — WinError 10013).
//
// Perilaku bisa diatur dari prompt terakhir:
//   berisi "SLOW"    -> jeda 400ms antar token (untuk uji Stop/cancel)
//   berisi "BASHCMD" -> jawaban memuat fenced ```bash npm run build```
//   berisi "RMCMD"   -> jawaban memuat perintah destruktif (rm -rf)
//   berisi "ECHOFILE"-> mengutip 120 karakter pertama blok file terlampir
//   berisi "ERR401"  -> jawab HTTP 401 (uji pesan error ramah)
// Selain itu: jawaban default dengan **bold** untuk uji markdown.

import http from 'node:http';

const PORT = Number(process.argv[2] ?? 8098);
/** Dinaikkan tiap kali protokol/perilaku mock berubah. Harness menolak
 *  server versi lama yang masih nyangkut di port (sudah kena sekali:
 *  mock lama tanpa alt=sse membuat V3..V5 gagal padahal app benar). */
const VERSION = 2;
const log = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tokenize(text) {
  // Pecah per kata + spasi supaya terlihat "kata per kata" di UI.
  return text.match(/\S+\s*/g) ?? [text];
}

function buildReply(prompt) {
  if (prompt.includes('BASHCMD')) {
    // Perintah sengaja tidak berbahaya & mudah dibuktikan di buffer terminal.
    return 'Jalankan perintah ini untuk **memeriksa** terminal:\n\n```bash\necho ZEPHYR-RUN-OK\n```\n\nSelesai.';
  }
  if (prompt.includes('RMCMD')) {
    return 'Hapus folder build dengan:\n\n```bash\nrm -rf dist\n```\n';
  }
  if (prompt.includes('ECHOFILE')) {
    // Kutip isi blok kode yang dikirim frontend sebagai lampiran file.
    const m = /```\n([\s\S]*?)\n```/.exec(prompt);
    const isi = (m?.[1] ?? '(tidak ada lampiran)').slice(0, 120);
    const pathM = /File: ([^\n]+)/.exec(prompt);
    return `Ringkasan file **${pathM?.[1] ?? '?'}**:\n\n${isi}`;
  }
  if (prompt.includes('SLOW')) {
    return 'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua-belas tiga-belas empat-belas lima-belas';
  }
  return 'Halo, ini jawaban **uji** dari Zephyr.';
}

function readBody(req) {
  return new Promise((res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => res(raw));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '';
  const raw = await readBody(req);
  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* biarkan kosong */
  }

  // Kumpulkan prompt terakhir untuk menentukan perilaku + bukti isi request.
  let prompt = '';
  if (Array.isArray(body.messages)) {
    prompt = String(body.messages[body.messages.length - 1]?.content ?? '');
  } else if (Array.isArray(body.contents)) {
    prompt = String(body.contents[body.contents.length - 1]?.parts?.[0]?.text ?? '');
  }

  const entry = {
    at: Date.now(),
    url,
    kind: url.includes(':streamGenerateContent')
      ? 'gemini'
      : url.includes('/v1/messages')
        ? 'anthropic'
        : 'openai',
    // Gemini dipanggil dengan ?alt=sse oleh adapter (lihat gemini.rs):
    // tanpa itu Google membalas JSON array pretty-print yang tidak bisa
    // dipotong per baris.
    altSse: url.includes('alt=sse'),
    headers: {
      auth: req.headers['authorization'] ?? null,
      xApiKey: req.headers['x-api-key'] ?? null,
      xGoog: req.headers['x-goog-api-key'] ?? null,
      anthropicVersion: req.headers['anthropic-version'] ?? null,
    },
    body,
    promptHead: prompt.slice(0, 400),
  };
  log.push(entry);

  // Endpoint diagnostik untuk harness. TIDAK dicatat ke log: harness sering
  // memeriksa "request terakhir", dan /__log sendiri akan selalu jadi yang
  // terakhir kalau ikut tercatat (V4 pernah gagal karena ini).
  if (url.startsWith('/__log')) {
    log.pop();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(log));
    return;
  }
  if (url.startsWith('/__version')) {
    log.pop();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version: VERSION }));
    return;
  }
  if (url.startsWith('/__reset')) {
    log.length = 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  // Endpoint "list models" (dipakai test_model_connection fase 08).
  if (req.method === 'GET' || url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }));
    return;
  }

  if (prompt.includes('ERR401')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'kunci uji ditolak' } }));
    return;
  }

  const reply = buildReply(prompt);
  const slow = prompt.includes('SLOW');
  const gap = slow ? 400 : 45;

  // ── Gemini: alt=sse -> SSE seperti OpenAI; tanpa alt=sse -> JSON array ──
  if (entry.kind === 'gemini') {
    const toks = tokenize(reply);
    if (entry.altSse) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      for (const t of toks) {
        if (res.destroyed) return;
        res.write(
          `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] })}\n\n`,
        );
        await sleep(gap);
      }
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.write('[\n');
    for (let i = 0; i < toks.length; i++) {
      if (res.destroyed) return;
      const chunk = JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: toks[i] }] } }],
      });
      res.write(`${i === 0 ? '' : ',\n'}${chunk}`);
      await sleep(gap);
    }
    res.end('\n]\n');
    return;
  }

  // ── Anthropic: SSE dengan tipe event ──
  if (entry.kind === 'anthropic') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'message_start', message: { id: 'mock' } })}\n\n`);
    res.write(
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`,
    );
    for (const t of tokenize(reply)) {
      if (res.destroyed) return;
      res.write(
        `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })}\n\n`,
      );
      await sleep(gap);
    }
    res.write(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    res.end();
    return;
  }

  // ── OpenAI-compatible: SSE data: {...} + [DONE] ──
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for (const t of tokenize(reply)) {
    if (res.destroyed) return;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
    await sleep(gap);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-ai listening on http://127.0.0.1:${PORT}`);
});
