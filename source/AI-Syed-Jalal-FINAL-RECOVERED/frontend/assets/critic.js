'use strict';
/*
 * Expert Critic page.
 *
 * The page renders what the reviewer returns and nothing more: it never invents a
 * dimension, a severity or a score. If the review cannot run (signed out, static
 * host, server unreachable) it says which of those is true.
 */
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', review = null, filter = 'all';

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(45000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  const setState = (text, tone = '') => { $('runState').textContent = text; $('runState').dataset.tone = tone; };
  const message = text => { $('runMessage').textContent = text; };

  const SEVERITY_ORDER = ['blocker', 'critical', 'major', 'minor', 'observation'];

  function renderVerdict(data) {
    $('verdict').hidden = false;
    $('scoreValue').textContent = String(data.score);
    $('verdictLabel').textContent = `Verdict · ${data.verdict.replace('-', ' ')} · engine ${data.engine}`;
    $('verdictTitle').textContent = data.verdict === 'ready' ? 'Ready to call production'
      : data.verdict === 'conditional' ? 'Conditional — fix the critical items first'
      : 'Not ready — do not claim production';
    $('verdictSummary').textContent = data.generated?.summary || '';
    const counts = data.counts || {};
    const list = $('counts');
    list.replaceChildren();
    for (const severity of SEVERITY_ORDER) {
      const item = document.createElement('li');
      item.className = 'count ' + severity;
      item.innerHTML = '';
      const strong = document.createElement('strong'); strong.textContent = String(counts[severity] ?? 0);
      const label = document.createElement('span'); label.textContent = severity + (severity === 'observation' ? '' : 's');
      item.append(strong, label);
      list.appendChild(item);
    }
    const weakest = document.createElement('li');
    weakest.className = 'count weakest';
    const strong = document.createElement('strong'); strong.textContent = data.weakest?.[0]?.score ?? '—';
    const label = document.createElement('span'); label.textContent = 'weakest: ' + (data.weakest?.[0]?.label || 'n/a');
    weakest.append(strong, label);
    list.appendChild(weakest);
  }

  function renderDimensions(data) {
    $('dimsPanel').hidden = false;
    const host = $('dimensions');
    host.replaceChildren();
    for (const dimension of data.dimensions) {
      const card = document.createElement('article');
      card.className = 'dim ' + dimension.status;
      const head = document.createElement('div'); head.className = 'dim-head';
      const name = document.createElement('h3'); name.textContent = dimension.label;
      const score = document.createElement('span'); score.className = 'dim-score'; score.textContent = `${dimension.score}`;
      head.append(name, score);
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = `${Math.max(2, dimension.score)}%`;
      bar.appendChild(fill);
      const meta = document.createElement('p'); meta.className = 'dim-meta';
      meta.textContent = `${dimension.status} · weight ${dimension.weight}%`;
      const observations = document.createElement('ul'); observations.className = 'dim-notes';
      for (const note of dimension.observations.slice(0, 4)) {
        const li = document.createElement('li'); li.textContent = note; observations.appendChild(li);
      }
      card.append(head, bar, meta, observations);
      host.appendChild(card);
    }
  }

  function renderFindings(data) {
    $('findingsPanel').hidden = false;
    const host = $('findings');
    host.replaceChildren();
    const visible = data.findings.filter(item => filter === 'all' || item.severity === filter);
    $('findingsEmpty').hidden = visible.length > 0;
    for (const item of visible) {
      const li = document.createElement('li');
      li.className = 'finding ' + item.severity;
      const head = document.createElement('div'); head.className = 'finding-head';
      const badge = document.createElement('span'); badge.className = 'severity'; badge.textContent = item.severity;
      const title = document.createElement('h3'); title.textContent = item.title;
      head.append(badge, title);
      const dimension = document.createElement('p'); dimension.className = 'finding-dim'; dimension.textContent = `Dimension: ${item.dimension}`;
      const evidence = document.createElement('p'); evidence.className = 'finding-evidence';
      evidence.textContent = 'Evidence: ' + item.evidence;
      const fix = document.createElement('p'); fix.className = 'finding-fix';
      fix.textContent = 'Fix: ' + item.fix;
      li.append(head, dimension, evidence, fix);
      host.appendChild(li);
    }
    for (const chip of document.querySelectorAll('[data-filter]')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
      chip.onclick = () => { filter = chip.dataset.filter; renderFindings(review); };
    }
  }

  function renderHistory(rows) {
    if (!rows?.length) return;
    $('historyPanel').hidden = false;
    const host = $('history');
    host.replaceChildren();
    for (const row of rows.slice(0, 8)) {
      const li = document.createElement('li');
      const when = new Date(row.createdAt);
      li.textContent = `${when.toLocaleString()} — ${row.verdict} (${row.score}/100)`;
      host.appendChild(li);
    }
  }

  function show(data) {
    review = data;
    renderVerdict(data);
    renderDimensions(data);
    renderFindings(data);
    $('verdict').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadHistory() {
    try { const data = await api('/assistant/critic/reviews'); renderHistory(data.reviews); } catch { /* history is optional */ }
  }

  async function runReview() {
    $('runBtn').disabled = true;
    setState('Reviewing…');
    const role = $('reviewRole').value;
    message('Reading stored evidence: audit events, agent runs, self-checks, Arena responses and shipped surfaces.' + (role === 'web-developer' ? ' Web-developer craft dimension included.' : ''));
    try {
      const data = await api('/assistant/critic/review', { method: 'POST', body: JSON.stringify({ reviewRole: role }) });
      setState(`Reviewed · ${data.findings.length} finding(s)`, data.verdict);
      message(`Review ${data.id ? 'stored as ' + data.id.slice(0, 8) : 'produced (not stored)'} in ${data.durationMs} ms. ${data.simulated === false ? 'Deterministic engine, no model call.' : ''}`);
      show(data);
      loadHistory();
    } catch (error) {
      setState('Review failed', 'bad');
      message(error.status === 401 ? 'Sign in to run a review: findings are stored on your account.'
        : error.status === 429 ? 'Reviews are rate limited. Wait a minute and run it again.'
        : error.message);
    } finally {
      $('runBtn').disabled = false;
    }
  }

  async function latest() {
    try {
      const data = await api('/assistant/critic/review');
      if (data.review) {
        setState(`Last review: ${data.review.verdict} (${data.review.score}/100)`);
        show({ ...data.review, generated: { summary: 'Latest stored review. Run the review again to refresh the evidence.' }, limits: [] });
      } else {
        setState('No review stored yet');
        message('Run the review once; the result is stored so this verdict can be audited later.');
      }
      loadHistory();
    } catch { /* fall through to sign-in state */ }
  }

  async function start() {
    if (window.AJ_STATIC_HOST) {
      setState('Needs the secure app', 'bad');
      message('Static website preview: the review needs the application server for sign-in and database evidence. Open the secure app or run npm run dev locally.');
      $('runBtn').disabled = true;
      $('accountBtn').textContent = 'Static preview';
      return;
    }
    try {
      const session = await api('/me');
      csrf = session.csrfToken || '';
      if (!session.authenticated) {
        setState('Sign in required', 'warn');
        message('Sign in with your account to run and store a review.');
        $('accountBtn').textContent = 'Sign in';
        $('accountBtn').onclick = () => { location.href = 'index.html?next=critic.html'; };
        await loadHistory().catch(() => {});
        return;
      }
      $('accountBtn').textContent = session.user.username;
      $('accountBtn').onclick = () => { location.href = 'jalalai.html'; };
      await latest();
    } catch (error) {
      setState('Server unreachable', 'bad');
      message('The application server could not be reached: ' + error.message);
      $('runBtn').disabled = true;
    }
  }

  $('runBtn').onclick = runReview;
  start();
})();
