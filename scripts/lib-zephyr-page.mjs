/*
 * Find the editor page, not just the first page.
 *
 * The browser can hold more than one page target — a WebView2 permission prompt
 * opened as its own target during dictation, and the harness kept attaching to
 * it because it was listed first. Every check then ran against a document with
 * no app and no bridges, and every bridge came back `undefined`, which reads
 * exactly like a broken build. Match on the title instead.
 *
 * The Agents window is a SECOND full app target with the SAME title and the
 * same origin: its URL is `.../index.html#agents`. A title match alone therefore
 * picked whichever came first in the list, and a harness written for the main
 * window would attach to the Agents window and fail every check ("the menu
 * button is in the DOM but not visible" was one such false alarm). The main
 * window is the one WITHOUT `#agents`, so that is preferred explicitly.
 */
export async function halamanZephyr(port = '9223', judul = 'Zephyr') {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const halaman = list.filter((t) => t.type === 'page');
  const bukanAgents = halaman.filter((t) => !(t.url || '').includes('#agents'));
  return (
    bukanAgents.find((t) => (t.title || '').includes(judul)) ??
    bukanAgents.find((t) => (t.url || '').includes('localhost')) ??
    halaman.find((t) => (t.title || '').includes(judul)) ??
    halaman.find((t) => (t.url || '').includes('localhost')) ??
    halaman[0] ??
    null
  );
}
