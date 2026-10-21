const fs = require('fs');
const path = require('path');
const p = path.join(process.env.APPDATA || '', 'Zephyr', 'settings.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('conversation di settings.json:');
console.log(JSON.stringify(j.conversation, null, 1));
