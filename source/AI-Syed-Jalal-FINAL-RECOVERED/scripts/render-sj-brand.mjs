/* Regenerate website/PWA and Android launcher art from the retained crowned SJ
   source. Requires the repo's Playwright + @sparticuz/chromium dev dependencies. */
import { readFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chromiumPack from '@sparticuz/chromium';
import { chromium } from '@playwright/test';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(root, 'frontend');
const svgFile = resolve(frontend, 'assets/approved-sj-rainbow-crown.svg');
const svg = await readFile(svgFile);
const image = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const browser = await chromium.launch({ headless: true, executablePath: await chromiumPack.executablePath(), args: chromiumPack.args.filter(arg => arg !== '--single-process'), env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
try {
  async function icon(name, size, maskable = false) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center;background:${maskable ? '#102439' : 'transparent'}}.tile{width:100%;height:100%;display:grid;place-items:center;background:radial-gradient(circle at 50% 25%,#263850,#102439 72%);border-radius:${maskable ? 0 : '22%'}}img{width:${maskable ? 72 : 86}%;height:${maskable ? 72 : 86}%;object-fit:contain}</style><div class="tile"><img src="${image}" alt=""></div>`);
    await page.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: resolve(frontend, `assets/app-icons/${name}.png`), omitBackground: true });
    await page.close();
  }
  for (const [name,size,maskable] of [['icon-192',192,false],['icon-512',512,false],['icon-maskable-512',512,true],['apple-touch-icon-180',180,false],['favicon-16',16,false],['favicon-32',32,false],['favicon-48',48,false]]) await icon(name,size,maskable);
  await copyFile(svgFile, resolve(frontend, 'assets/brand/favicon.svg'));
  await copyFile(resolve(frontend, 'assets/app-icons/icon-512.png'), resolve(root, '../../android/app/src/main/res/drawable-nodpi/ic_launcher.png'));
  const page = await browser.newPage({ viewport: { width:1200, height:630 }, deviceScaleFactor:1 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:radial-gradient(circle at 8% 0%,#b8e6e2,transparent 48%),radial-gradient(circle at 90% 20%,#f9d8c7,transparent 40%),#f2f8f8;color:#193643;font-family:system-ui,-apple-system,sans-serif}.frame{position:absolute;inset:34px;border:1px solid #fff9;border-radius:36px;background:#ffffffaa;display:flex;align-items:center;gap:58px;padding:65px;box-shadow:0 28px 60px #39616d25}.mark{flex:none;width:290px;height:290px;display:grid;place-items:center;border-radius:68px;background:radial-gradient(circle at 50% 25%,#263850,#102439 72%);box-shadow:0 20px 40px #2546532e}.mark img{width:86%}.eyebrow{font-size:16px;letter-spacing:.19em;font-weight:800;color:#246a75}.title{font-size:58px;line-height:1.05;letter-spacing:-.055em;font-weight:850;margin:18px 0}.title span{color:#246a75}.desc{font-size:24px;line-height:1.4;color:#506873;margin:0}.bottom{font-size:16px;font-weight:750;letter-spacing:.05em;color:#246a75;margin-top:38px}</style><div class="frame"><div class="mark"><img src="${image}" alt=""></div><div><div class="eyebrow">YOUR CONNECTED AI WORKSPACE</div><div class="title">Alsyed Jalal AI<br><span>Plan. Create. Improve.</span></div><p class="desc">Your tools, your ideas, one beautiful space.</p><div class="bottom">ai-syed-jalal-live.pages.dev</div></div></div>`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(frontend, 'assets/brand/sj-social-1200x630.png') });
  await page.close();
} finally { await browser.close(); }
console.log('Rendered crowned SJ website, PWA, social and Android assets.');
