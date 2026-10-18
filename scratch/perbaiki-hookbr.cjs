const fs = require('fs');
const p = 'scripts/verify-agc-hooks-browser.mjs';
let s = fs.readFileSync(p, 'utf8');

/*
 * `cdp.json(body)` runs `body` INSIDE a function that already ends with
 * `return JSON.stringify(...)`. So a body that itself starts with
 * `return JSON.stringify(...)` produces `return return ...` - which is the
 * "Invalid left-hand side in assignment" this script was failing with.
 *
 * The fix is a local helper that sends a plain expression and parses it here.
 * Every call site becomes `J(<expr>)`, and the expression is a normal IIFE.
 */
s = s.replace(
  "const { cdp } = await Cdp.attach(9223, 'Zephyr');",
  `const { cdp } = await Cdp.attach(9223, 'Zephyr');

/** Evaluate an expression and parse its JSON result, locally. */
async function J(expr, ms = 60000) {
  const raw = await cdp.eval(expr, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}`,
);

/* Rewrite every `cdp.json(\`return JSON.stringify(X)\`, N)` into `J(\`X\`, N)`. */
s = s.replace(/cdp\.json\(\s*`return JSON\.stringify\(([\s\S]*?)\)`\s*,\s*(\d+)\s*,?\s*\)/g, (m, inner, ms) => {
  return 'J(`' + inner + '`, ' + ms + ')';
});

/* And the async form: `return JSON.stringify(await (async () => {...})())`. */
s = s.replace(/cdp\.json\(\s*`return JSON\.stringify\(await \(([\s\S]*?)\)\)\(\)`\s*,\s*(\d+)\s*,?\s*\)/g, (m, inner, ms) => {
  return 'J(`await (' + inner + ')()`, ' + ms + ')';
});

/* Bare `await cdp.json(\`return JSON.stringify((() => {...})())\`)` with no ms. */
s = s.replace(/cdp\.json\(\s*`return JSON\.stringify\(([\s\S]*?)\)`\s*,?\s*\)/g, (m, inner) => {
  return 'J(`' + inner + '`)';
});

fs.writeFileSync(p, s);
console.log('ditulis ulang');
