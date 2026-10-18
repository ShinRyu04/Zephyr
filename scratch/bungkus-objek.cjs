const fs = require('fs');
const p = 'scripts/verify-agc-hooks-browser.mjs';
let s = fs.readFileSync(p, 'utf8');

/*
 * Object literals passed to J must be parenthesised.
 *
 * `J(`{ nilai: x }`)` becomes `await ({ nilai: x })` - fine - but the rewrite
 * produced `await ({ nilai: x })` only when the braces were already wrapped.
 * Where they were not, the parser saw a BLOCK containing `nilai: x` and threw
 * "Invalid left-hand side in assignment". Wrapping every bare `{ ... }` body in
 * parentheses is the fix.
 */
s = s.replace(/J\(`\{ ([\s\S]*?) \}`/g, 'J(`({ $1 })`');

fs.writeFileSync(p, s);
console.log('dibungkus');
