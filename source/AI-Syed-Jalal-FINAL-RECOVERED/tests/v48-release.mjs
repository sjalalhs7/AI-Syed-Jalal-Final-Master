import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url);
const server=fs.readFileSync(new URL('backend/server.mjs',root),'utf8');
const runtime=fs.readFileSync(new URL('backend/ai-runtime.mjs',root),'utf8');
const html=fs.readFileSync(new URL('frontend/index.html',root),'utf8');
assert.match(server,/version:'V48'/);
assert.match(runtime,/ai-runtime-v47\.mjs/);
assert.match(html,/AL-SYED JALAL AI/);
assert.match(html,/Mission Command Center/);
assert.match(html,/LIVE PRODUCTION/);
assert.match(html,/DEMO MODE/);
const zip=process.argv[2];
if(zip){const data=fs.readFileSync(zip);assert.ok(data.length>1e6);assert.equal(data.readUInt32LE(0),0x04034b50);console.log('V48 package header: PASS');}
console.log('V48 release test: PASS');
