/**
 * V141 — Page builder.
 *
 * Generates a complete, accessible, single-file web page from a short spec, then
 * audits its own output with the same rules Toolbench publishes. Deterministic:
 * the same spec always produces byte-identical HTML, so a generated page can be
 * reviewed, diffed and tested.
 *
 * Deliberate limits, stated on the page that uses this:
 *  - It composes a landing/info page from known sections. It is not a general
 *    code generator and cannot invent a bespoke application.
 *  - No external requests: no fonts, no CDNs, no analytics.
 *  - The output is audited by pattern rules, not proven correct.
 */

import { auditCode } from './toolbox.mjs';

export const PALETTES = Object.freeze({
  midnight: { name: 'Midnight', bg: '#050b14', panel: '#0c1626', text: '#e8f0fb', muted: '#9fb2cb', accent: '#6ea8fe', line: '#1e2f47' },
  emerald: { name: 'Emerald', bg: '#04120e', panel: '#0a2019', text: '#e6f6ef', muted: '#93b8a9', accent: '#3ddc97', line: '#173a2e' },
  sunset: { name: 'Sunset', bg: '#150a06', panel: '#241310', text: '#fdeee6', muted: '#c9a598', accent: '#ff8a4c', line: '#3d2119' },
  paper: { name: 'Paper', bg: '#fbfaf7', panel: '#ffffff', text: '#16181d', muted: '#5b6472', accent: '#1c5fd8', line: '#dcd9d1' }
});

export const SECTIONS = Object.freeze(['hero', 'features', 'pricing', 'faq', 'contact', 'footer']);

const DEFAULT_SPEC = Object.freeze({
  title: 'Your page', tagline: 'A clear sentence about what this is and who it is for.',
  sections: ['hero', 'features', 'footer'], palette: 'midnight', cta: 'Get started'
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

/** Turns a plain sentence into a page title that is safe in HTML and in a <title>. */
function tidy(text, max = 90) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

/**
 * Reads a short natural-language brief into a spec. Every field has a default, so
 * a vague brief still produces a valid page instead of an error page.
 */
export function parseSpec(prompt) {
  const text = String(prompt || '').trim();
  const lower = text.toLowerCase();
  const spec = { ...DEFAULT_SPEC, sections: [...DEFAULT_SPEC.sections] };

  // Title: an explicit "titled X" / "for X", else the first clause of the brief.
  // A brief's subject ends at the first clause boundary, otherwise the page ends
  // up titled "a dental clinic with pricing and faq" — which is a sentence, not a
  // title, and reads badly in the browser tab.
  const clause = value => tidy(String(value).split(/\s+(?:with|and|plus|using|in the|that|which)\s+|[,.;\n]/i)[0].trim(), 70);
  const titled = /\b(?:titled|called|named)\s+["“']?([^,"”'\n]{3,80})/i.exec(text);
  const aimed = /\b(?:landing page for|page for|site for|website for)\s+["“']?([^,"”'.\n]{3,80})/i.exec(text);
  const about = /\b(?:a|an)\s+(?:page|site|website)\s+(?:about|describing)\s+["“']?([^,"”'.\n]{3,80})/i.exec(text);
  const chosen = titled || aimed || about;
  if (chosen) spec.title = clause(chosen[1]);

  const paletteKey = Object.keys(PALETTES).find(key => lower.includes(key)) || (/\b(light|white|paper)\b/.test(lower) ? 'paper' : spec.palette);
  if (paletteKey) spec.palette = paletteKey;

  const wanted = [];
  if (/\bhero|landing|above the fold\b/.test(lower) || true) wanted.push('hero');
  if (/\bfeatures?|benefits|why\b/.test(lower)) wanted.push('features');
  if (/\bpricing|plans?|tiers?\b/.test(lower)) wanted.push('pricing');
  if (/\bfaq|questions?\b/.test(lower)) wanted.push('faq');
  if (/\bcontact|get in touch|sign ?up|waitlist\b/.test(lower)) wanted.push('contact');
  wanted.push('footer');
  spec.sections = [...new Set(wanted)];

  // Quoted or bare: "button says Book now" is how people actually write it.
  const cta = /\b(?:button|cta)\s+(?:says|reads|labeled|labelled)\s+["“']?([^"”'\n,.]{2,40})/i.exec(text);
  if (cta) spec.cta = tidy(cta[1], 40);

  if (!spec.tagline || spec.tagline.startsWith('A clear sentence')) {
    spec.tagline = `Everything about ${spec.title.toLowerCase()}, on one page — the essentials first.`;
  }
  return spec;
}

function sectionHtml(name, spec) {
  switch (name) {
    case 'hero':
      return `  <header class="hero">
    <p class="eyebrow">${escapeHtml(spec.title)}</p>
    <h1>${escapeHtml(spec.title)}</h1>
    <p class="lead">${escapeHtml(spec.tagline)}</p>
    <a class="cta" href="#contact">${escapeHtml(spec.cta)}</a>
  </header>`;
    case 'features':
      return `  <section id="features" aria-labelledby="features-title">
    <h2 id="features-title">What you get</h2>
    <ul class="cards">
      <li><h3>Fast</h3><p>One file, no external requests, no build step.</p></li>
      <li><h3>Accessible</h3><p>Semantic landmarks, a skip link and a visible focus ring.</p></li>
      <li><h3>Responsive</h3><p>Reads cleanly from 320&nbsp;px to a wide desktop.</p></li>
    </ul>
  </section>`;
    case 'pricing':
      return `  <section id="pricing" aria-labelledby="pricing-title">
    <h2 id="pricing-title">Pricing</h2>
    <div class="cards">
      <article><h3>Starter</h3><p class="price">Free</p><p>One page, everything above.</p></article>
      <article><h3>Pro</h3><p class="price">$29<span>/month</span></p><p>Custom sections and a private domain.</p></article>
    </div>
  </section>`;
    case 'faq':
      return `  <section id="faq" aria-labelledby="faq-title">
    <h2 id="faq-title">Questions</h2>
    <details><summary>Is this page editable?</summary><p>Yes — download the HTML and change it; there is no build step.</p></details>
    <details><summary>Does it load anything external?</summary><p>No fonts, scripts, images or analytics from anywhere else.</p></details>
  </section>`;
    case 'contact':
      return `  <section id="contact" aria-labelledby="contact-title">
    <h2 id="contact-title">Get in touch</h2>
    <p>Replace this line with your real contact route before publishing. This page sends nothing anywhere.</p>
  </section>`;
    case 'footer':
      return `  <footer class="foot">
    <p>${escapeHtml(spec.title)} · built with SJ Page Builder · no external requests</p>
  </footer>`;
    default:
      return '';
  }
}

/** Builds the page. Returns { html, bytes, sections, palette, audit }. */
export function buildPage(input) {
  const spec = typeof input === 'string' ? parseSpec(input) : { ...DEFAULT_SPEC, ...(input || {}) };
  const palette = PALETTES[spec.palette] || PALETTES.midnight;
  const sections = (spec.sections || DEFAULT_SPEC.sections).filter(name => SECTIONS.includes(name));
  const body = sections.map(name => sectionHtml(name, spec)).filter(Boolean).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.title)}</title>
<meta name="description" content="${escapeHtml(spec.tagline)}">
<style>
  :root { color-scheme: ${spec.palette === 'paper' ? 'light' : 'dark'};
    --bg: ${palette.bg}; --panel: ${palette.panel}; --text: ${palette.text};
    --muted: ${palette.muted}; --accent: ${palette.accent}; --line: ${palette.line}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 64rem; margin: 0 auto; padding: 0 1.25rem; }
  .skip { position: absolute; left: -9999px; }
  .skip:focus { left: 1rem; top: 1rem; background: var(--accent); color: #000; padding: .5rem .75rem; border-radius: .5rem; z-index: 9; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .hero { padding: clamp(3rem, 10vw, 7rem) 1.25rem clamp(2rem, 6vw, 4rem); max-width: 64rem; margin: 0 auto; }
  .eyebrow { color: var(--accent); text-transform: uppercase; letter-spacing: .12em; font-size: .78rem; margin: 0 0 1rem; }
  h1 { font-size: clamp(2rem, 6vw, 3.5rem); line-height: 1.1; margin: 0 0 1rem; }
  h2 { font-size: clamp(1.4rem, 3.5vw, 2rem); margin: 0 0 1rem; }
  h3 { margin: 0 0 .5rem; font-size: 1.05rem; }
  .lead { color: var(--muted); font-size: clamp(1rem, 2.2vw, 1.2rem); max-width: 44ch; }
  .cta { display: inline-block; margin-top: 1.5rem; background: var(--accent); color: #04101f;
    text-decoration: none; font-weight: 650; padding: .8rem 1.4rem; border-radius: .6rem; }
  .cta:hover { filter: brightness(1.08); }
  section { max-width: 64rem; margin: 0 auto; padding: clamp(2rem, 5vw, 3.5rem) 1.25rem; border-top: 1px solid var(--line); }
  .cards { list-style: none; display: grid; gap: 1rem; padding: 0; margin: 0;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
  .cards li, .cards article { background: var(--panel); border: 1px solid var(--line);
    border-radius: .9rem; padding: 1.1rem; }
  .cards p { color: var(--muted); margin: 0; }
  .price { font-size: 1.6rem; font-weight: 700; color: var(--text); margin: .25rem 0 .5rem; }
  .price span { font-size: .9rem; font-weight: 400; color: var(--muted); }
  details { background: var(--panel); border: 1px solid var(--line); border-radius: .75rem; padding: .85rem 1rem; margin: 0 0 .6rem; }
  summary { cursor: pointer; font-weight: 600; }
  .foot { border-top: 1px solid var(--line); padding: 2rem 1.25rem; color: var(--muted); font-size: .9rem; text-align: center; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<main id="main" class="wrap">
${body}
</main>
</body>
</html>
`;

  // Audit our own output with the published rules. A page that fails its own
  // audit must say so rather than being presented as good work.
  const audit = auditCode(html, 'html');
  return {
    html,
    bytes: new TextEncoder().encode(html).length,
    sections,
    palette: palette.name,
    // palette is echoed in the spec too: the UI shows the parse and must not
    // render an empty row where the palette was detected.
    spec: { title: spec.title, tagline: spec.tagline, cta: spec.cta, palette: palette.name },
    audit: {
      checked: audit.checked,
      findings: audit.findings,
      note: audit.note,
      passing: audit.findings.filter(finding => finding.severity === 'high').length === 0
    }
  };
}

/** Terse bullets describing what was produced, for the agent to report. */
export function describePage(result) {
  const lines = [
    `Built a single-file page: “${result.spec.title}” — ${result.sections.join(', ')} · ${result.palette} palette · ${result.bytes} bytes.`,
    `Self-audit: ${result.audit.findings.length} finding(s) from ${result.audit.checked} checks${result.audit.passing ? ' — no high-severity findings.' : ' — HIGH severity findings remain.'}`
  ];
  for (const finding of result.audit.findings.slice(0, 6)) lines.push(`• [${finding.severity}] ${finding.message}`);
  lines.push('The page loads nothing external, sends nothing anywhere, and can be downloaded from the builder.');
  return lines.join('\n');
}
