'use strict';
/*
 * Page Builder.
 *
 * The whole point is that the artifact is real: the preview is an iframe fed the
 * exact bytes of the download, and the audit shown is the one the server ran on
 * those same bytes. Nothing is re-rendered client-side to look better than the file.
 */
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', user = null, busy = false, last = null, tab = 'preview';

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(60000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  const setStatus = (text, kind = '') => { const node = $('status'); node.textContent = text; node.dataset.kind = kind; };

  const EXAMPLES = [
    'build a landing page for a dental clinic in Rawalpindi with pricing and faq, emerald palette, button says Book now',
    'make a page titled Nightshift Coffee, light palette, with features and contact',
    'create a website for a cycling club with features and contact, sunset palette',
    'a page about my garden'
  ];

  function update() {
    const ready = Boolean(user) && !busy && $('brief').value.trim().length >= 3;
    $('buildBtn').disabled = !ready;
    $('buildBtn').textContent = busy ? 'Building…' : 'Build the page ↗';
    $('downloadBtn').disabled = !last;
  }

  function renderParse(spec) {
    const host = $('parsed');
    host.replaceChildren();
    const rows = [
      ['Title', spec.title],
      ['Tagline', spec.tagline],
      ['Button', spec.cta],
      ['Palette', spec.palette]
    ];
    for (const [key, value] of rows) {
      const dt = document.createElement('dt'); dt.textContent = key;
      const dd = document.createElement('dd'); dd.textContent = value;
      host.append(dt, dd);
    }
    $('parsePanel').hidden = false;
  }

  function renderSections(list) {
    const host = $('sectionPicker');
    host.replaceChildren();
    const legend = document.createElement('legend');
    legend.textContent = `Sections in this build (${list.join(', ')})`;
    host.appendChild(legend);
    $('resultMeta').dataset.sections = list.join(',');
  }

  function paint(result) {
    last = result;
    $('resultPanel').hidden = false;
    $('resultMeta').textContent = `${result.bytes} bytes · ${result.sections.join(' · ')} · ${result.palette} palette`;
    $('preview').srcdoc = result.html;
    $('code').textContent = result.html;

    const audit = $('auditList');
    audit.replaceChildren();
    const headline = document.createElement('li');
    headline.textContent = result.audit.findings.length
      ? `Self-audit: ${result.audit.findings.length} finding(s) from ${result.audit.checked} checks${result.audit.passing ? ' — no high-severity findings.' : ' — HIGH severity findings remain.'}`
      : `Self-audit: no finding from ${result.audit.checked} checks — that is not proof the page is correct.`;
    audit.appendChild(headline);
    for (const finding of result.audit.findings) {
      const li = document.createElement('li');
      li.textContent = `[${finding.severity}] ${finding.message}`;
      audit.appendChild(li);
    }
    for (const line of result.limits) {
      const li = document.createElement('li');
      li.textContent = line;
      audit.appendChild(li);
    }
    update();
  }

  function setTab(next) {
    tab = next;
    $('tabPreview').setAttribute('aria-pressed', String(next === 'preview'));
    $('tabCode').setAttribute('aria-pressed', String(next === 'code'));
    $('previewWrap').hidden = next !== 'preview';
    $('codeWrap').hidden = next !== 'code';
  }

  async function build(event) {
    event?.preventDefault();
    const brief = $('brief').value.trim();
    if (!user) { setStatus('Sign in first (or open the local preview).', 'warn'); return; }
    if (busy || brief.length < 3) return;
    busy = true; update();
    setStatus('Building a single-file page…');
    try {
      const body = { brief };
      if ($('palette').value) body.palette = $('palette').value;
      const result = await api('/assistant/pagebuilder', { method: 'POST', body: JSON.stringify(body) });
      renderParse(result.spec);
      renderSections(result.sections);
      paint(result);
      setStatus(`Built ${result.bytes} bytes. Preview, source and audit all describe the same file.`);
      setTab('preview');
    } catch (error) {
      setStatus(error.status === 429 ? 'That is a lot of builds — wait a minute.' : error.message, 'fail');
    } finally {
      busy = false; update();
    }
  }

  function download() {
    if (!last) return;
    const blob = new Blob([last.html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = (last.spec.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '.html';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    setStatus(`Downloaded ${link.download} — the exact file shown in the preview.`);
  }

  // GitHub Pages has no API. Say that once, clearly, and never show a raw 404.
  function staticHostStop() {
    if (!window.AJ_STATIC_HOST) return false;
    $('connectionStatus').textContent = 'Static preview · backend not connected';
    $('loginBanner').hidden = true;
    $('buildBtn').disabled = true;
    setStatus('This is the static GitHub Pages copy: building a page needs the application server. Open the secure app, or run the local preview with npm ci && npm run dev. Nothing is simulated here.');
    return true;
  }

  async function boot() {
    const examples = $('examples');
    for (const example of EXAMPLES) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn small';
      button.textContent = example.split(',')[0].replace(/^(build|make|create|a) /i, '').slice(0, 38);
      button.onclick = () => { $('brief').value = example; update(); $('brief').focus(); };
      examples.appendChild(button);
    }
    $('buildForm').addEventListener('submit', build);
    $('brief').addEventListener('input', update);
    $('downloadBtn').addEventListener('click', download);
    if (staticHostStop()) return;
    $('tabPreview').addEventListener('click', () => setTab('preview'));
    $('tabCode').addEventListener('click', () => setTab('code'));
    $('copyBtn').addEventListener('click', async () => {
      if (!last) return;
      try { await navigator.clipboard.writeText(last.html); $('copyBtn').textContent = 'Copied'; setTimeout(() => { $('copyBtn').textContent = 'Copy HTML'; }, 1200); }
      catch { $('copyBtn').textContent = 'Copy failed'; }
    });

    try {
      const health = await api('/health');
      $('connectionStatus').textContent = health.localPreview ? 'Local preview · not production' : 'Secure account required';
      const session = await api('/me');
      csrf = session.csrfToken;
      if (session.authenticated) {
        user = session.user;
        $('loginBanner').hidden = true;
        const catalogue = await api('/assistant/pagebuilder');
        for (const item of catalogue.palettes) {
          const option = document.createElement('option');
          option.value = item.id; option.textContent = item.name;
          $('palette').appendChild(option);
        }
        setStatus(`Signed in as ${user.username}. Describe the page you want.`);
      } else {
        $('loginBanner').hidden = false;
        $('demoBtn').hidden = !health.localPreview;
        $('loginMessage').textContent = health.localPreview ? 'Disposable preview: use test data only.' : 'Sign in to build a page.';
        setStatus(health.localPreview ? 'Choose “Try the local preview” to start.' : 'Sign in to begin.');
      }
      $('demoBtn').addEventListener('click', async () => {
        try { await api('/demo', { method: 'POST' }); location.reload(); }
        catch (error) { setStatus(error.message, 'fail'); }
      });
    } catch (error) {
      $('connectionStatus').textContent = 'Backend not reachable';
      setStatus('The application server is not reachable from this copy. Open the secure app, or run the local preview with npm ci && npm run dev.', 'fail');
    }
    update();
  }

  boot();
})();
