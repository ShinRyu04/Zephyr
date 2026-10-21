const fs = require("fs");
const t = fs.readFileSync("src/lib/aiStore.ts","utf8");
const m = [...t.matchAll(/^\s*messages\??:/gm)];
for (const x of m.slice(0,6)) {
  console.log("@" + x.index);
  console.log(t.slice(Math.max(0,x.index-400), x.index+160));
  console.log("=====");
}
