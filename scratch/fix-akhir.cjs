const fs = require("fs");
const P = "src/styles/ai-streaming.css";
let t = fs.readFileSync(P, "utf8");
t = t.replace(`  gap: 24px;
  flex-wrap: nowrap;
}`,
`  gap: 24px;
  flex-wrap: nowrap;
  /* The spacer is what pushes the model + Send to the trailing edge. Without
     a real flex-basis the row's own gap would still be applied on both sides
     of it, so it is declared here rather than left to the old shorthand. */
  justify-content: flex-start;
}
.ai-input-row .ai-input-toolbar > .ai-toolbar-spacer {
  flex: 1 1 auto;
  min-width: 0;
}`);
t = t.replace(`  /* 110, not 132: at a 24px gap the row needs the room. The reference's
     model chip is 122px for a 17-character id; 110 keeps ours on one line
     and lets a longer id ellipsize rather than push the row into a wrap. */
  max-width: 110px;`,
`  /* The reference's model chip is 122px for a 17-character id. Now that the
     chip sits on the trailing edge there is room for the full name, so the
     cap only exists to stop a very long id from eating the whole row. */
  max-width: 150px;`);
fs.writeFileSync(P, t, "utf8");
console.log("ok");
