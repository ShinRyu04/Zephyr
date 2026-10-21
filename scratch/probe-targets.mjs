const PORT = process.argv[2] ?? '9223';
const LIST = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
console.log(JSON.stringify(LIST.map((t) => ({ type: t.type, title: t.title, url: t.url, ws: t.webSocketDebuggerUrl })), null, 2));
