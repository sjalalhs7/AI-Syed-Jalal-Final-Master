import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const required=['#FF6F61','#0B1F3A','#18B981','#F4C95D'];
const files=['frontend/index.html','frontend/workspace.html','frontend/assets/v101-palette.css','frontend/assets/design-tokens.css'];
for(const f of files){if(!fs.existsSync(path.join(root,f)))throw new Error(`Missing ${f}`)}
const css=fs.readFileSync(path.join(root,'frontend/assets/v101-palette.css'),'utf8');
for(const c of required)if(!css.includes(c))throw new Error(`Missing palette color ${c}`);
for(const f of files.slice(0,2)){
 const s=fs.readFileSync(path.join(root,f),'utf8');
 if(!s.includes('assets/v101-palette.css'))throw new Error(`${f} does not load V101 palette`);
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'backend/package.json')));
if(pkg.version!=='75.0.0')throw new Error('Historical backend package contract was changed');
console.log('V101 palette staging PASS');
