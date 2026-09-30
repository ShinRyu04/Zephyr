/*
 * Find the editor page, not just the first page.
 *
 * The browser can hold more than one page target — a WebView2 permission prompt
 * opened as its own target during dictation, and the harness kept attaching to
 * it because it was listed first. Every check then ran against a document with
 * no app and no bridges, and every bridge came back `undefined`, which reads
 * exactly like a broken build. Match on the title instead.
 */
export async function halamanZephyr(port = '9223', judul = 'Zephyr') {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const halaman = list.filter((t) => t.type === 'page');
  return (
    halaman.find((t) => (t.title || '').includes(judul)) ??
    halaman.find((t) => (t.url || '').includes('localhost')) ??
    halaman[0] ??
    null
  );
}
