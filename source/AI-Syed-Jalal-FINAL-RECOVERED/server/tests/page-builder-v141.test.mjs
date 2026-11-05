import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPage, parseSpec, describePage, PALETTES, SECTIONS } from '../../frontend/functions/page-builder.mjs';
import { auditCode } from '../../frontend/functions/toolbox.mjs';
import { AGENT_TOOLS, runAgent } from '../../frontend/functions/agent-runtime.mjs';
import { planFromToolbox } from '../../frontend/functions/toolbox.mjs';
import { routePrompt } from '../../frontend/functions/all-in-one.mjs';

const db = { query: async () => [] };
const me = { id: 'user-1', username: 'tester', role: 'Admin' };

test('the builder produces a complete, standalone HTML document', () => {
  const result = buildPage('build a landing page for a dental clinic with pricing and faq');
  assert.match(result.html, /^<!doctype html>/i);
  assert.match(result.html, /<html lang="en">/);
  assert.match(result.html, /<\/html>\s*$/);
  assert.match(result.html, /<meta name="viewport"/);
  assert.match(result.html, /<main id="main"/);
  // Nothing may be fetched from anywhere: a generated page must not phone home.
  assert.equal((result.html.match(/https?:\/\//g) || []).length, 0);
  assert.ok(result.bytes > 1500);
  // The UI renders spec.palette in the parse panel; an empty string there showed
  // as a blank row, so the resolved palette name must always be present.
  assert.equal(result.spec.palette, 'Midnight');
  assert.equal(buildPage('a page for a bakery, emerald palette').spec.palette, 'Emerald');
});

test('the build is deterministic — the same brief is byte-identical', () => {
  const brief = 'make a page titled Nightshift Coffee with features';
  assert.equal(buildPage(brief).html, buildPage(brief).html);
  assert.equal(buildPage('a').bytes, buildPage('a').bytes);
});

test('the brief parser reads title, palette, sections and CTA', () => {
  const spec = parseSpec('build a landing page for a dental clinic in Rawalpindi with pricing and faq, emerald palette, button says Book now');
  assert.equal(spec.title, 'a dental clinic in Rawalpindi');
  assert.equal(spec.palette, 'emerald');
  assert.equal(spec.cta, 'Book now');
  assert.deepEqual(spec.sections, ['hero', 'pricing', 'faq', 'footer']);

  assert.equal(parseSpec('make a page titled Nightshift Coffee, light palette').title, 'Nightshift Coffee');
  assert.equal(parseSpec('make a page titled Nightshift Coffee, light palette').palette, 'paper');
  assert.deepEqual(parseSpec('create a website for a cycling club with features and contact').sections, ['hero', 'features', 'contact', 'footer']);
  // A vague brief still yields a valid page instead of an error page.
  const vague = buildPage('something nice');
  assert.match(vague.html, /^<!doctype html>/i);
  assert.ok(vague.sections.includes('hero'));
});

test('the builder audits its own output and reports high severity honestly', () => {
  const result = buildPage('build a page for a bakery with pricing');
  const independent = auditCode(result.html, 'html');
  // The reported audit must be the real audit of the real bytes, not a claim.
  assert.equal(result.audit.findings.length, independent.findings.length);
  assert.deepEqual(result.audit.findings.map(f => f.id), independent.findings.map(f => f.id));
  assert.equal(result.audit.passing, true, 'generated page should have no high-severity findings');
  // The only expected finding is the deliberate single-file <style> block.
  assert.deepEqual(result.audit.findings.map(f => f.id), ['inline-style']);
  assert.match(describePage(result), /Self-audit: 1 finding\(s\)/);
});

test('user text is escaped, so a brief cannot inject markup', () => {
  const result = buildPage('make a page titled <script>alert(1)</script>');
  assert.ok(!result.html.includes('<script>alert(1)</script>'), 'raw script tag leaked into the page');
  assert.match(result.html, /&lt;script&gt;/);
  // And the escaped output still passes our own XSS-relevant checks.
  assert.equal(result.audit.passing, true);
});

test('every published palette and section builds without error', () => {
  for (const palette of Object.keys(PALETTES)) {
    const result = buildPage({ title: 'T', tagline: 'S', sections: [...SECTIONS], palette, cta: 'Go' });
    assert.match(result.html, new RegExp(PALETTES[palette].accent.replace('#', '#')), `${palette} accent missing`);
    assert.equal(result.sections.length, SECTIONS.length);
    assert.ok(!/undefined|\[object Object\]/.test(result.html), `${palette} leaked a placeholder`);
  }
});

test('the page builder is a real agent tool and chat produces a downloadable artifact', async () => {
  assert.ok(AGENT_TOOLS.some(tool => tool.id === 'pagebuild'), 'pagebuild must be published');
  assert.ok(planFromToolbox('build me a landing page for a coffee shop').some(step => step.tool === 'pagebuild'));
  assert.equal(routePrompt('build me a landing page for a coffee shop')[0].id, 'agent');

  const run = await runAgent({ prompt: 'build me a landing page for a coffee shop with pricing, emerald palette', db, me, env: {} });
  assert.equal(run.ok, true);
  assert.deepEqual(run.trace.tools, ['pagebuild']);
  assert.equal(run.artifacts.length, 1);
  assert.equal(run.artifacts[0].language, 'html');
  assert.equal(run.artifacts[0].kind, 'preview');
  assert.match(run.artifacts[0].code, /^<!doctype html>/i);
  // The step reports the artifact size without embedding it twice.
  assert.ok(run.steps[0].artifacts[0].bytes > 1500);
  assert.ok(!run.output.includes(run.artifacts[0].code.slice(0, 200)), 'the full HTML must not be duplicated into the prose');
});

test('a page-request that is not a page request does not trigger the builder', async () => {
  // "audit this page" is a review, not a build — the audit tool must win.
  assert.ok(planFromToolbox('audit this code\n```html\n<img src=x>\n```').some(step => step.tool === 'audit'));
  assert.ok(!planFromToolbox('audit this code\n```html\n<img src=x>\n```').some(step => step.tool === 'pagebuild'));
  const run = await runAgent({ prompt: 'calculate 40 * 3', db, me, env: {} });
  assert.deepEqual(run.trace.tools, ['calculator']);
  assert.equal(run.artifacts.length, 0);
});
