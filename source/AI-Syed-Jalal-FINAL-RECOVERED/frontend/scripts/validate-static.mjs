import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const required = ['index.html', 'assets/v101-palette.css', 'assets/web-logo.svg', 'assets/app-logo.svg', 'assets/approved-sj-rainbow-crown.svg', 'assets/visual-system.css', 'assets/visual-theme.js', 'assets/jarvis-welcome.js', 'assets/brand/favicon.svg', 'assets/app-icons/icon-512.png', 'manifest.webmanifest', 'sw.js', 'assets/ai-widget.js', 'guide.html', 'assets/guide.js', 'assets/guide.css', 'agent.html', 'assets/agent.js', 'assets/agent.css', 'assets/host-mode.js', 'assets/speech-preferences.js', 'agent-lab.html', 'assets/agent-lab.js', 'assets/agent-lab.css', 'arena.html', 'assets/arena.js', 'assets/arena.css', 'jarvis.html', 'assets/jarvis.js', 'assets/jarvis.css', 'critic.html', 'assets/critic.js', 'assets/critic.css', 'refactor-plan.html', 'allinone.html', 'assets/allinone.js', 'assets/allinone.css', 'ai-hub.html', 'media-studio.html', 'assets/media-studio.js', 'assets/media-studio-utils.js', 'assets/media-studio.css', 'assets/vendor/mediabunny-1.65.2.min.mjs', 'assets/ai-hub.js', 'assets/ai-hub-data.js', 'assets/ai-hub.css', 'assets/ai-hub-orbit.jpg', 'config/agent-skill-index.json'];
const missing = required.filter((p) => !existsSync(join(root, p)));
assert.deepEqual(missing, [], `Missing required frontend files: ${missing.join(', ')}`);

const html = read('index.html');
const css = read('assets/v101-palette.css');
const logo = read('assets/approved-sj-rainbow-crown.svg');
const manifest = JSON.parse(read('manifest.webmanifest'));
const guide = read('guide.html');
const agent = read('agent.html');
const checks = [
  ['quick-start guide is linked from homepage', /href=["']guide\.html["']/.test(html)],
  ['quick-start guide explains local and cloud modes', /Local tools work now/.test(guide) && /server-side provider key/.test(guide)],
  ['homepage closes', /<\/html>\s*$/i.test(html)],
  ['viewport configured', /name=["']viewport["']/i.test(html)],
  ['canonical URL present', /rel=["']canonical["']/i.test(html)],
  ['Open Graph metadata present', /property=["']og:title["']/i.test(html)],
  ['stylesheet loaded', /assets\/v101-palette\.css/.test(html)],
  ['PWA manifest linked', /manifest\.webmanifest/.test(html)],
  ['service worker registration present', /serviceWorker\.register/.test(html)],
  ['responsive grid utility present', /\.auto-fit-grid/.test(css)],
  ['fluid type utility present', /\.fluid-type/.test(css)],
  ['container query present', /@container/.test(css)],
  ['reduced motion support present', /prefers-reduced-motion/.test(css)],
  ['restored crowned SJ logo has accessible title', /<title[^>]*>SJ — Syed Jalal<\/title>/.test(logo)],
  ['PWA manifest points to available icon', Array.isArray(manifest.icons) && manifest.icons.length > 0 && manifest.icons.every((i) => existsSync(join(root, i.src)))],
  ['login modal preserved', /id=["']login["']/.test(html)],
  ['AI widget preserved', /AIWidget\.js/.test(html)],
  ['Agent Studio linked from homepage', /href=["']agent\.html["']/.test(html)],
  ['AI Hub is reachable from homepage, guide and Agent Studio', ['index.html','guide.html','agent.html'].every(page => read(page).includes('ai-hub.html'))],
  ['AI Hub clearly separates curated prompts from independent agents and unavailable generation', read('ai-hub.html').includes('not an independently executable agent') && read('ai-hub.html').includes('generation are not connected') && read('assets/ai-hub.js').includes("'/api/ai/capabilities'")],
  ['AI Hub public shell and reference index are available offline', read('sw.js').includes("'./ai-hub.html'") && read('sw.js').includes("'./config/agent-skill-index.json'") && read('sw.js').includes("url.pathname.startsWith('/api/')")],
  ['Media Studio offers local photo editing and honest browser-dependent video trimming', read('ai-hub.html').includes('media-studio.html') && read('media-studio.html').includes('No sign-in, database or AI key') && read('media-studio.html').includes('browser chooses a supported') && read('assets/media-studio.js').includes('library.Conversion.init')],
  ['Agent Lab self-check page is linked from the homepage', /href=["']agent-lab\.html["']/.test(html)],
  ['Agent Lab ships a runnable self-check with honest limits', read('agent-lab.html').includes('id="runBtn"') && read('assets/agent-lab.js').includes("'/agent/self-check'") && read('agent-lab.html').includes('What this page does and does not prove')],
  ['Agent Lab page is excluded from precache like the other private shells', !read('sw.js').includes("'./agent-lab.html'") && read('sw.js').includes("endsWith('/agent-lab.html')")],
  ['Arena battle page is linked from the homepage', /href=["']arena\.html["']/.test(html)],
  ['Arena is reachable from the assistant, workspace and dashboard, not only the homepage', ['jalalai.html','workspace.html','dashboard.html'].every(page => read(page).includes('arena.html'))],
  ['Arena ships blind comparison with honest judge wording', read('arena.html').includes('id="voteButtons"') && read('assets/arena.js').includes("'/arena/battles'") && read('arena.html').includes('not a human reviewer')],
  ['Arena page is excluded from precache like the other private shells', !read('sw.js').includes("'./arena.html'") && read('sw.js').includes("endsWith('/arena.html')")],
  ['Agent Studio has Direct/Agent/Compare modes', /data-mode="chat"/.test(agent) && /data-mode="agent"/.test(agent) && /data-mode="compare"/.test(agent)],
  ['Agent Studio keeps private shell out of precache', !read('sw.js').includes("'./agent.html'") && read('sw.js').includes("url.pathname.endsWith('/agent.html')")],
  ['static-host login guard is shipped', read('assets/host-mode.js').includes('window.AJ_STATIC_HOST') && html.includes('assets/host-mode.js')],
  ['one shared speech voice preference reaches every read-aloud surface', ['workspace.html', 'jalalai.html', 'agent.html'].every(p => read(p).includes('assets/speech-preferences.js') && read(p).includes('data-aj-voice')) && read('assets/jalalai.js').includes('window.AJSpeech.apply') && read('assets/agent.js').includes('window.AJSpeech.apply')],
  ['no orphaned main-prompt wiring remains in the workspace', !read('workspace.html').includes('mainPrompt')],
  ['JARVIS voice console states its limits and shares the one voice preference', read('jarvis.html').includes('id="talkBtn"') && read('jarvis.html').includes('data-aj-voice') && read('jarvis.html').includes('does not upload audio') && read('assets/jarvis.js').includes('window.AJSpeech.apply')],
  ['JARVIS is reachable from the assistant, home, guide, arena, lab, dashboard and workspace', ['jalalai.html','index.html','guide.html','arena.html','agent-lab.html','dashboard.html','workspace.html'].every(page => read(page).includes('jarvis.html'))],
  ['JARVIS page is excluded from precache like the other private shells', !read('sw.js').includes("'./jarvis.html'") && read('sw.js').includes("endsWith('/jarvis.html')")],
  ['Expert Critic page grades stored evidence and states its limits', read('critic.html').includes('id="runBtn"') && read('critic.html').includes('database connected to this deployment') && read('critic.html').includes('cannot see CDN logs') && read('assets/critic.js').includes("'/assistant/critic/review'")],
  ['Architecture record names what merged, what stayed separate and what remains', read('refactor-plan.html').includes('One runtime, four front doors') && read('refactor-plan.html').includes('remaining') && read('refactor-plan.html').includes('refused')],
  ['All-in-one panel answers with named specialists and states its limits', read('allinone.html').includes('id="askBtn"') && read('allinone.html').includes('It is not') && read('assets/allinone.js').includes("'/assistant/all/answer'")],
  ['All-in-one panel is excluded from precache and reachable from the main surfaces', !read('sw.js').includes("'./allinone.html'") && read('sw.js').includes("endsWith('/allinone.html')") && ['index.html','jalalai.html','jarvis.html','agent-lab.html','critic.html'].every(page => read(page).includes('allinone.html'))],
  ['Arena publishes its feature map from the shared module', read('arena.html').includes('id="features"') && read('assets/arena.js').includes("'/arena/features'")],
  ['Critic and architecture pages are excluded from precache', !read('sw.js').includes("'./critic.html'") && read('sw.js').includes("endsWith('/critic.html')") && read('sw.js').includes("endsWith('/refactor-plan.html')")],
  ['Expert Critic and the architecture record are reachable from the main surfaces', ['index.html','jalalai.html','agent-lab.html','guide.html'].every(page => read(page).includes('critic.html'))],
  ['Toolbench runs requests through the shared agent runtime', read('toolbench.html').includes('id="runBtn"') && read('toolbench.html').includes('What this page really does') && read('assets/toolbench.js').includes("mode: 'agent'") && read('functions/toolbox.mjs').includes('TOOLBOX_TOOLS') && read('functions/agent-runtime.mjs').includes('...TOOLBOX_TOOLS')],
  ['Page Builder produces a downloadable page it also audits', read('pagebuilder.html').includes('id="buildBtn"') && read('pagebuilder.html').includes('id="downloadBtn"') && read('assets/pagebuilder.js').includes("'/assistant/pagebuilder'") && read('functions/page-builder.mjs').includes('auditCode(html')],
  ['Page Builder states what it is not and that its contact section is a placeholder', read('pagebuilder.html').includes('not a general code generator') && read('pagebuilder.html').includes('contact section is a placeholder')],
  ['Page Builder is excluded from precache and reachable from the main surfaces', !read('sw.js').includes("'./pagebuilder.html'") && read('sw.js').includes("endsWith('/pagebuilder.html')") && ['index.html','toolbench.html','allinone.html','arena.html','critic.html','guide.html'].every(page => read(page).includes('pagebuilder.html'))],
  ['generated pages load nothing external', !read('functions/page-builder.mjs').includes('cdn.') && read('functions/page-builder.mjs').includes('no external requests')],
  ['Toolbench is excluded from precache and reachable from the main surfaces', !read('sw.js').includes("'./toolbench.html'") && read('sw.js').includes("endsWith('/toolbench.html')") && ['index.html','allinone.html','critic.html','guide.html','arena.html'].every(page => read(page).includes('toolbench.html'))],
  ['Arena ships a prompt library with checkable properties', read('arena.html').includes('id="promptList"') && read('assets/arena.js').includes("'/arena/prompts'") && read('functions/prompt-library.mjs').includes('What it tests') === false && read('functions/prompt-library.mjs').includes('tests:')],
  ['Arena battles can be exported with their rubric intact', read('arena.html').includes('id="exportBtn"') && read('assets/arena.js').includes('format=markdown') && read('functions/prompt-library.mjs').includes('battleToMarkdown')],
  ['prompt library and feature map are readable before sign-in', readFileSync(join(root, 'functions/api/[[path]].js'), 'utf8').includes("'/api/arena/prompts'&&request.method==='GET'&&!me") && readFileSync(join(root, 'functions/api/[[path]].js'), 'utf8').includes("'/api/arena/features'&&request.method==='GET'&&!me")],
  ['toolbox publishes bounded local helpers without a model', read('functions/toolbox.mjs').includes('planFromToolbox') && read('functions/toolbox.mjs').includes('contrastRatio') && read('functions/toolbox.mjs').includes('auditCode') && !read('functions/toolbox.mjs').includes('eval(')],
  ['GitHub Pages workflow publishes the frontend', existsSync(join(root, '../../../.github/workflows/pages.yml')) && readFileSync(join(root, '../../../.github/workflows/pages.yml'), 'utf8').includes('source/AI-Syed-Jalal-FINAL-RECOVERED/frontend')],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) process.exitCode = 1;
else console.log(`\nAll ${checks.length} static checks passed.`);
