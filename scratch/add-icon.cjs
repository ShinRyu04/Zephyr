const fs = require("fs");
const P = "src/components/ai/AiIkon.tsx";
let t = fs.readFileSync(P, "utf8");
// 1. tambah tipe
t = t.replace("    | 'chev-up'", "    | 'arrow-up'\n    | 'chev-up'");
// 2. tambah case sebelum case 'send'
const anchor = "    // A paper plane: send.\n    case 'send':";
const baru = `    // A plain upward arrow: submit. The reference composer uses this rather
    // than a paper plane - an arrow says "send this up", a plane says "email".
    case 'arrow-up':
      return (
        <svg {...box}>
          <path d="M8 13V3" />
          <path d="M3.6 7.2L8 2.8l4.4 4.4" />
        </svg>
      );
    // A paper plane: send.
    case 'send':`;
if (!t.includes("case 'arrow-up'")) {
  t = t.replace(anchor, baru);
  fs.writeFileSync(P, t, "utf8");
  console.log("ikon ditambah");
} else console.log("sudah ada");
