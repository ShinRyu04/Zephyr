const PORT = 9333;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
console.log("targets:", list.map(x=>x.type+" "+x.url.slice(0,60)).join("\n  "));
