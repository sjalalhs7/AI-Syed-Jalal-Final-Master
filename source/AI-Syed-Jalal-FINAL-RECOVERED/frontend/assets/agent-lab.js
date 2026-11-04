'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', user = null, running = false, skillsTimer = null, lastResult = null;

  const GROUPS = { application: 'Application', data: 'Data', reasoning: 'Reasoning', agents: 'Agents', honesty: 'Honesty', security: 'Security', catalog: 'Catalogue' };

  function setStatus(text, kind = '') {
    const node = $('runStatus');
    node.textContent = text;
    node.dataset.kind = kind;
  }

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(45000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; error.data = data; throw error; }
    return data;
  }

  function verdictLabel(verdict) {
    return verdict === 'pass' ? 'Passing' : verdict === 'warn' ? 'Needs attention' : verdict === 'fail' ? 'Failing' : 'Not run yet';
  }

  function paintScore(score, verdict, meta) {
    $('scoreValue').textContent = Number.isFinite(score) ? String(score) : '—';
    const badge = $('verdict');
    badge.textContent = verdictLabel(verdict);
    badge.className = 'verdict ' + (verdict || '');
    $('scoreMeta').textContent = meta;
  }

  function renderResults(data) {
    $('runSummary').hidden = false;
    $('runSummary').replaceChildren(...[
      ['Checks passed', `${data.checksPassed}/${data.checksTotal}`],
      ['Score', `${data.score}/100`],
      ['Verdict', verdictLabel(data.verdict)],
      ['Engine', data.engine === 'cloud' ? 'Cloud · ' + data.provider : 'Local · deterministic']
    ].map(([label, value]) => {
      const tile = document.createElement('div'); tile.className = 'summary-tile';
      const span = document.createElement('span'); span.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = value;
      tile.append(span, strong); return tile;
    }));
    const groups = $('groups'); groups.replaceChildren();
    for (const group of data.groups || []) {
      const chip = document.createElement('span');
      chip.className = 'group-chip ' + (group.passed === group.total ? 'good' : 'bad');
      chip.textContent = `${GROUPS[group.group] || group.group} ${group.passed}/${group.total}`;
      groups.appendChild(chip);
    }
    const list = $('results'); list.replaceChildren();
    for (const result of data.results || []) {
      const item = document.createElement('li'); item.className = 'result' + (result.ok ? '' : ' fail');
      const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = result.ok ? '✓' : '✕'; mark.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      const title = document.createElement('p'); title.className = 'title'; title.textContent = result.title;
      const detail = document.createElement('p'); detail.className = 'detail'; detail.textContent = (result.ok ? '' : 'Observed: ') + result.detail;
      body.append(title, detail);
      const meta = document.createElement('div'); meta.className = 'meta';
      const group = document.createElement('div'); group.textContent = GROUPS[result.group] || result.group;
      const weight = document.createElement('div'); weight.textContent = `weight ${result.weight} · ${result.ms} ms`;
      meta.append(group, weight);
      if (result.severity === 'critical') { const pill = document.createElement('span'); pill.className = 'pill critical'; pill.textContent = 'critical'; meta.appendChild(pill); }
      item.append(mark, body, meta); list.appendChild(item);
    }
    const compare = $('compare');
    if (data.comparison) {
      compare.hidden = false;
      compare.textContent = `Local ${data.comparison.localScore}/100 · Cloud-run ${data.comparison.cloudScore}/100 · Δ ${data.comparison.delta >= 0 ? '+' : ''}${data.comparison.delta}. ${data.comparison.note}`;
    } else compare.hidden = true;
  }

  function renderTrend(history) {
    const trend = $('trend');
    trend.replaceChildren();
    if (!history.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'No runs yet.'; trend.appendChild(p); return; }
    for (const row of history.slice().reverse()) {
      const bar = document.createElement('div'); bar.className = 'trend-bar';
      const fill = document.createElement('i');
      fill.style.height = Math.max(6, Math.round(Number(row.score) * 0.8)) + 'px';
      fill.style.opacity = row.verdict === 'pass' ? '1' : row.verdict === 'warn' ? '.75' : '.5';
      const value = document.createElement('b'); value.textContent = String(row.score);
      const when = document.createElement('em');
      const date = new Date(row.createdAt);
      when.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      bar.title = `${row.score}/100 · ${verdictLabel(row.verdict)}`;
      bar.append(value, fill, when); trend.appendChild(bar);
    }
  }

  async function loadHistory() {
    try {
      const data = await api('/agent/report');
      renderTrend(data.trend || []);
      if (data.latest) paintScore(data.latest.score, data.latest.verdict, `Last run ${new Date(data.latest.createdAt).toLocaleString()} · ${data.account.role} account`);
    } catch (error) {
      $('trend').replaceChildren(Object.assign(document.createElement('p'), { className: 'hint', textContent: error.message }));
    }
  }

  const SKILL_PROMPTS = {
    plan: skill => `plan: Apply the "${skill.name}" skill (${skill.domain} · ${skill.family}) to my next project`,
    critique: skill => `critic: Review how well I have applied the "${skill.name}" skill (${skill.domain})`
  };
  function skillCard(skill) {
    const card = document.createElement('article'); card.className = 'skill';
    const name = document.createElement('strong'); name.textContent = skill.name;
    const meta = document.createElement('span'); meta.textContent = `${skill.domain} · ${skill.family || 'general'}`;
    const code = document.createElement('code'); code.textContent = skill.id;
    const actions = document.createElement('div'); actions.className = 'skill-actions';
    for (const [label, build] of [['Use in Studio', SKILL_PROMPTS.plan], ['Critique with it', SKILL_PROMPTS.critique]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn small'; button.textContent = label;
      button.onclick = async () => {
        button.disabled = true;
        try {
          // Rare? no. Stage the prompt in the shared slot first so Studio can open with it.
          try { localStorage.setItem('aj-agent-draft', build(skill).slice(0, 10000)); } catch { /* private mode */ }
          await navigator.clipboard?.writeText(build(skill)).catch(() => {});
          $('skillsStatus').textContent = `Prompt copied. Opening Agent Studio with it staged for “${skill.name}”.`;
          location.href = 'agent.html?draft=1';
        } catch (error) { $('skillsStatus').textContent = error.message; button.disabled = false; }
      };
      actions.appendChild(button);
    }
    card.append(name, meta, code, actions);
    return card;
  }

  async function loadSkills() {
    const query = $('skillQuery').value.trim();
    const domain = $('skillDomain').value;
    $('skillsStatus').textContent = 'Loading skills…';
    try {
      const params = new URLSearchParams({ limit: '24' });
      if (query) params.set('q', query);
      if (domain && !query) params.set('domain', domain);
      const data = await api('/agent/skills?' + params.toString());
      const list = $('skills'); list.replaceChildren(...data.skills.map(skillCard));
      $('skillsHint').textContent = `${data.total} skills indexed across ${data.domains.length} domains. These are expert prompt profiles, not ${data.total} independent AI models.`;
      $('skillsStatus').textContent = `${data.returned} shown${query ? ` for “${query}”` : ''}${domain && !query ? ` in ${domain}` : ''}.`;
      const select = $('skillDomain');
      if (select.options.length <= 1) {
        for (const item of data.domains) {
          const option = new Option(`${item.name} (${item.count})`, item.name);
          select.add(option);
        }
      }
    } catch (error) {
      $('skillsStatus').textContent = error.message;
    }
  }

  function setRunning(next) {
    running = next;
    $('runBtn').disabled = next;
    $('runBtn').textContent = next ? 'Running…' : 'Run self-check';
    $('progress').hidden = !next;
    if (!next) $('progressBar').style.width = '100%';
  }

  async function runSelfCheck() {
    if (running) return;
    if (!user) { setStatus('Sign in first — use “Try the local preview” below or the homepage.', 'warn'); return; }
    setRunning(true);
    $('progressBar').style.width = '12%';
    setStatus('Running checks against this deployment…');
    const engine = $('engine').value;
    try {
      const ticker = setInterval(() => { const width = parseFloat($('progressBar').style.width) || 12; $('progressBar').style.width = Math.min(88, width + 6) + '%'; }, 300);
      try {
        const data = await api('/agent/self-check', { method: 'POST', body: JSON.stringify({ engine, provider: $('provider').value, timeoutMs: 4000 }) });
        setRunning(false);
        clearInterval(ticker);
        lastResult = data;
        $('downloadBtn').disabled = false;
        $('csvBtn').disabled = false;
        paintScore(data.score, data.verdict, `${data.checksPassed}/${data.checksTotal} checks · ${data.engine} engine · just now`);
        renderResults(data);
        setStatus(data.verdict === 'pass' ? 'All checks passed. Read each observation below — passing here is not a production certificate.' : data.verdict === 'warn' ? 'Some checks need attention. The observation shows exactly what failed.' : 'Critical checks failed. Fix the observed errors before trusting this deployment.', data.verdict);
        await loadHistory();
      } finally { clearInterval(ticker); }
    } catch (error) {
      setRunning(false);
      if (error.data?.code === 'PROVIDER_NOT_CONFIGURED') {
        setStatus(error.message, 'warn');
        $('engine').value = 'local'; $('provider').disabled = true;
      } else setStatus(error.message, 'fail');
    }
  }

  async function loadSession() {
    if (window.AJ_STATIC_HOST) {
      $('runHint').textContent = 'This is the static website copy. The self-check needs the application server: run npm ci && npm run dev locally, or use the secure Cloudflare Pages deployment.';
      $('runBtn').disabled = true;
      $('demoBtn').hidden = true;
      setStatus('Static preview · backend not connected', 'warn');
      $('skillsStatus').textContent = 'Skill search needs the application server.';
      paintScore(NaN, '', 'Static preview — self-check unavailable here.');
      return;
    }
    try {
      const session = await api('/me');
      csrf = session.csrfToken || '';
      user = session.user || null;
      $('accountBtn').textContent = user ? `Sign out (${user.username})` : 'Sign in';
      // Probe health first so the preview button is offered even while signed out.
      const health = await api('/health').catch(() => ({}));
      $('demoBtn').hidden = !health.localPreview;
      if (!user) {
        $('runBtn').disabled = false;
        setStatus('Not signed in. Use “Try the local preview” or sign in from the homepage.', 'warn');
        $('skillsStatus').textContent = 'Sign in to search the skill library.';
        return;
      }
      $('runHint').textContent = 'Runs 17 weighted checks against this deployment and stores the evidence on your account. Nothing is sent to a provider in local mode.';
      await Promise.all([loadHistory(), loadSkills()]);
      setStatus(`Ready · signed in as ${user.username} (${user.role}).`);
    } catch (error) {
      setStatus('The server could not be reached. Start the application server and reload. ' + error.message, 'fail');
    }
  }

  $('engine').onchange = () => { $('provider').disabled = $('engine').value !== 'cloud'; };
  $('runBtn').onclick = runSelfCheck;
  $('refreshHistory').onclick = loadHistory;
  $('csvBtn').onclick = () => {
    if (!lastResult) return;
    const cell = value => '"' + String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    const rows = [['check_id', 'title', 'group', 'weight', 'severity', 'passed', 'detail', 'duration_ms'], ...(lastResult.results || []).map(result => [result.id, result.title, result.group, result.weight, result.severity, result.ok ? 'yes' : 'no', result.detail, result.ms])];
    const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'sj-agent-lab-evidence.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Evidence CSV downloaded — one row per check, ready for a spreadsheet or audit trail.');
  };
  $('downloadBtn').onclick = () => {
    if (!lastResult) return;
    const evidence = {
      product: 'AI-Syed Jalal · Agent Lab',
      version: 'V135',
      exportedAt: new Date().toISOString(),
      account: user ? { username: user.username, role: user.role } : null,
      engine: lastResult.engine,
      provider: lastResult.provider,
      score: lastResult.score,
      verdict: lastResult.verdict,
      checksPassed: lastResult.checksPassed,
      checksTotal: lastResult.checksTotal,
      groups: lastResult.groups,
      comparison: lastResult.comparison || null,
      results: lastResult.results,
      disclaimer: 'Evidence about this deployment at run time. Not a production, security, load or compliance certificate. Cloud providers are reported as configured or not configured, never as live-verified.'
    };
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'sj-agent-lab-evidence.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Evidence JSON downloaded. It contains observations, not a production certificate.');
  };
  $('skillQuery').oninput = () => { clearTimeout(skillsTimer); skillsTimer = setTimeout(loadSkills, 250); };
  $('skillDomain').onchange = loadSkills;
  $('accountBtn').onclick = async () => {
    if (!user) { location.href = 'index.html?next=agent-lab.html'; return; }
    if (!window.confirm('Sign out of this device?')) return;
    try { await api('/auth/logout', { method: 'POST', body: '{}' }); user = null; csrf = ''; location.reload(); }
    catch (error) { setStatus(error.message, 'fail'); }
  };
  $('demoBtn').onclick = async () => {
    $('demoBtn').disabled = true;
    try { await api('/demo', { method: 'POST', body: '{}' }); location.reload(); }
    catch (error) { setStatus(error.message, 'fail'); $('demoBtn').disabled = false; }
  };
  loadSession();
})();
