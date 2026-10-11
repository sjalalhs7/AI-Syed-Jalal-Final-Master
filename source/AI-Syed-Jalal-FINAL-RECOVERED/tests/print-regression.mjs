import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8');
assert.match(html,/id="printScale"/); assert.match(html,/id="printMargin"/); assert.match(html,/size:A4 portrait/); assert.match(html,/width:210mm;height:297mm/); assert.match(html,/@page\{size:A4 portrait;margin:0\}/); assert.match(html,/transform:scale/); assert.match(html,/padding:\$\{mg\}mm/);
console.log('V40 print regression checks passed');
