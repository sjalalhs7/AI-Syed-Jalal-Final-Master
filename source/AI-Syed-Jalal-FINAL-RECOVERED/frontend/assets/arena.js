'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', user = null, running = false, current = null, attachments = [], catalogue = [], history = [];

  const setStatus = (text, kind = '') => { const node = $('status'); node.textContent = text; node.dataset.kind = kind; };

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(90000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; error.data = data; throw error; }
    return data;
  }

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  };

  /* ---------- engine catalogue ---------- */
  function renderEngines() {
    const grid = $('engineGrid'); grid.replaceChildren();
    for (const engine of catalogue) {
      const input = el('input', { type: 'checkbox', value: engine.id, checked: engine.id === 'local' || engine.id === 'local-critic' });
      input.addEventListener('change', enforceLimits);
      const name = el('div', { class: 'name' }, engine.label,
        el('span', { class: 'tag ' + (engine.kind === 'local' ? 'local' : engine.available ? 'ok' : 'warn'), text: engine.kind === 'local' ? 'Local · no key' : engine.configured ? 'Key ready' : 'Not configured' }));
      const blurb = el('div', { class: 'blurb', text: engine.family + ' · ' + (engine.strengths || engine.description || 'General purpose') });
      grid.append(el('label', { class: 'engine' }, input, el('div', {}, name, blurb)));
    }
    enforceLimits();
  }

  function selected() { return [...document.querySelectorAll('#engineGrid input:checked')].map(node => node.value); }

  function enforceLimits() {
    const max = catalogue.length ? 4 : 4;
    const chosen = selected();
    document.querySelectorAll('#engineGrid input').forEach(node => { node.disabled = !node.checked && chosen.length >= max; });
    $('engineHelp').textContent = `${chosen.length} of 2–${max} selected`;
    $('runBtn').disabled = running || !user || chosen.length < 2 || !$('prompt').value.trim();
  }

  /* ---------- attachments ---------- */
  function renderAttachments() {
    const box = $('attachments'); box.replaceChildren();
    attachments.forEach((file, index) => {
      const chip = el('span', { class: 'attachment-chip' }, `${file.name} (${file.size.toLocaleString()} chars)`,
        el('button', { type: 'button', 'aria-label': 'Remove ' + file.name, text: '✕', onclick: () => { attachments.splice(index, 1); renderAttachments(); } }));
      box.append(chip);
    });
  }

  async function addFiles(files) {
    for (const file of files) {
      if (attachments.length >= 3) { setStatus('Up to three files per battle.', 'warn'); break; }
      if (file.size > 140000) { setStatus(`${file.name} is too large (max ~140 KB of text).`, 'warn'); continue; }
      const text = await file.text();
      attachments.push({ name: file.name, text });
    }
    renderAttachments();
  }

  /* ---------- battle rendering ---------- */
  function bar(label, value, max) {
    const pct = Math.max(0, Math.min(100, Math.round((Number(value) / max) * 100)));
    const fill = el('span'); fill.style.width = pct + '%';
    return el('div', { class: 'bar' }, el('span', { text: label }), el('i', {}, fill), el('span', { text: String(Math.round(Number(value))) }));
  }

  function responseCard(item, judgeScore) {
    const winner = current?.judge?.winner === item.side;
    const head = el('div', { class: 'card-head' },
      el('strong', { text: item.label || `Engine ${String(item.side).toUpperCase()}` }),
      el('span', { class: 'tag', text: item.status === 'ok' ? `${item.latencyMs} ms` : item.status === 'not_configured' ? 'Not configured' : item.status === 'needs_provider' ? 'Needs cloud key' : item.status }),
      el('span', { class: 'score', text: item.status === 'ok' ? `${item.score}/100` : '—' }),
      winner ? el('span', { class: 'tag ok', text: 'Judge pick' }) : null);
    const bodyClass = item.status === 'ok' ? 'card-body' : 'card-body notice';
    const body = el('div', { class: bodyClass });
    if (item.status === 'ok') body.textContent = item.content;
    else body.textContent = item.status === 'not_configured'
      ? `No answer. ${item.content} The rubric counts this as a non-answer, never as a tie, and no credit is given on the leaderboard.`
      : item.status === 'needs_provider'
        ? `No answer. This local tool only runs deterministic commands; it refuses open-ended prompts instead of inventing one.\n\n${item.content}`
        : `Engine did not answer: ${item.content}`;
    const foot = el('div', { class: 'card-foot' });
    if (item.status === 'ok' && window.AJReport) foot.append(window.AJReport.button(item.content, 'arena'));
    if (judgeScore) {
      const bars = el('div', { class: 'bars' });
      for (const [key, value] of Object.entries(judgeScore.subscores || {})) bars.append(bar(key, value, key === 'code' ? 35 : key === 'safety' ? 15 : 25));
      foot.append(bars);
      for (const note of judgeScore.notes || []) foot.append(el('p', { class: 'hint', text: '• ' + note }));
    }
    return el('article', { class: 'card' + (winner ? ' winner' : '') }, head, body, foot);
  }

  function renderVote() {
    const bar = $('voteButtons'); bar.replaceChildren();
    const decided = Boolean(current?.battle?.vote);
    const sides = (current?.responses || []).map(item => item.side);
    for (const side of sides) {
      const answered = current.responses.find(item => item.side === side)?.status === 'ok';
      const btn = el('button', { class: 'btn small' + (current.battle.vote === side ? ' voted' : ''), type: 'button', disabled: decided || !answered, text: `Engine ${side.toUpperCase()}${current.battle.vote === side ? ' ✓' : ''}` });
      btn.addEventListener('click', () => vote(side));
      bar.append(btn);
    }
    const tie = el('button', { class: 'btn small' + (current.battle.vote === 'tie' ? ' voted' : ''), type: 'button', disabled: decided, text: 'Tie' + (current.battle.vote === 'tie' ? ' ✓' : '') });
    tie.addEventListener('click', () => vote('tie'));
    bar.append(tie);
    if (decided) bar.append(el('span', { class: 'hint', text: `Decided by ${current.battle.decidedBy === 'user' ? 'you' : current.battle.decidedBy}.` }));
    $('revealBtn').hidden = !current.battle.blind || decided;
  }

  function renderJudge() {
    const judge = current?.judge || {};
    const line = $('judgeLine');
    if (!judge.winner) {
      line.textContent = `No verdict: ${judge.reason || 'fewer than two engines produced an answer, so there is nothing to judge.'}`;
    } else if (judge.winner === 'tie') {
      line.textContent = `Rubric judge: ${judge.reason} No winner is declared for a tie — your vote decides the battle.`;
    } else {
      const side = String(judge.winner).toUpperCase();
      line.textContent = judge.winner === 'tie' ? judge.reason : `Rubric judge picks Engine ${side} (${judge.reason}). Your vote outranks this and is recorded separately.`;
    }
    const detail = $('judgeDetail'); detail.replaceChildren();
    detail.append(
      el('p', { text: `Judge: ${judge.label || 'SJ Rubric Judge'} (${judge.id || 'sj-rubric-v1'}) — deterministic tooling, not a human reviewer and not a second AI model.` }),
      el('p', { text: 'Scoring bands: structure, specificity, coverage, honesty, and code quality. Scores are reproducible for the same answer; they are not a measure of factual truth.' })
    );
    if (judge.disclaimer) detail.append(el('p', { class: 'hint', text: judge.disclaimer }));
    const list = el('ul');
    for (const score of judge.scores || []) list.append(el('li', { text: `Engine ${String(score.side).toUpperCase()}: ${score.nonAnswer ? 'no score (non-answer)' : score.score + '/100'}` }));
    detail.append(list);
    if (current?.disclosure) detail.append(el('p', { class: 'hint', text: current.disclosure }));
  }

  function renderArtifacts(payload) {
    const box = $('artifactBox');
    box.replaceChildren();
    const arts = payload.artifacts || [];
    if (!arts.length) { box.hidden = true; return; }
    box.hidden = false;
    box.append(el('h2', { id: 'artifactTitle', text: 'Artifacts extracted from the answers' }));
    box.append(el('p', { class: 'hint', text: payload.battle.blind && !payload.battle.vote
      ? 'Code blocks found in the answers. Engines stay anonymous until you vote, so these are not attributed yet.'
      : 'Code blocks found in each answer. HTML and SVG previews run in a sandboxed frame with scripts isolated from this page.' }));
    for (const art of arts) {
      const owner = art.engine ? (catalogue.find(item => item.id === art.engine)?.label || art.engine) : 'Unattributed';
      const head = el('header', {}, `${owner} · ${art.lang || 'code'} · ${art.kind} · ${Number(art.bytes).toLocaleString()} bytes`);
      const body = art.kind === 'preview' || art.kind === 'image'
        ? el('iframe', { sandbox: 'allow-scripts', referrerpolicy: 'no-referrer', title: 'Artifact preview', srcdoc: art.kind === 'image' ? `<body style="margin:0;background:#fff">${art.code}</body>` : art.code })
        : el('pre', {}, el('code', { text: art.code.slice(0, 20000) + (art.code.length > 20000 ? '\n… truncated preview' : '') }));
      box.append(el('div', { class: 'artifact' }, head, body));
    }
  }

  function showBattle(payload) {
    current = payload;
    $('battlePanel').hidden = false;
    $('battleMode').textContent = payload.battle.mode === 'code' ? 'Code / artifact' : 'Text';
    $('battlePrompt').textContent = payload.battle.prompt;
    const scores = new Map((payload.judge?.scores || []).map(score => [score.side, score]));
    const grid = $('responses'); grid.replaceChildren();
    for (const item of payload.responses) grid.append(responseCard(item, scores.get(item.side)));
    renderArtifacts(payload);
    renderJudge();
    renderVote();
    $('battlePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- actions ---------- */
  async function runBattle(event) {
    event.preventDefault();
    if (running) return;
    const prompt = $('prompt').value.trim();
    const contenders = selected();
    if (prompt.length < 1) { setStatus('Enter a prompt first.', 'warn'); return; }
    if (contenders.length < 2) { setStatus('Choose at least two engines.', 'warn'); return; }
    running = true; $('runBtn').disabled = true;
    setStatus(`Running ${contenders.length} engines on the same prompt…`, '');
    try {
      const payload = await api('/arena/battles', {
        method: 'POST',
        body: JSON.stringify({ prompt, mode: $('mode').value, contenders, blind: $('blind').checked, attachments: attachments.map(file => ({ name: file.name, text: file.text })) })
      });
      showBattle(payload);
      const answered = payload.responses.filter(item => item.status === 'ok').length;
      setStatus(answered === payload.responses.length ? `Battle ready — ${answered} engines answered. Vote to decide it.` : `Battle ready — ${answered} of ${payload.responses.length} engines answered; the rest are labelled and scored zero.`, answered ? 'ok' : 'warn');
      await loadHistory();
    } catch (error) {
      setStatus(error.message, 'fail');
    } finally {
      running = false; enforceLimits();
    }
  }

  async function vote(value) {
    if (!current) return;
    $('voteButtons').querySelectorAll('button').forEach(node => { node.disabled = true; });
    try {
      const payload = await api(`/arena/battles/${current.battle.id}/vote`, { method: 'POST', body: JSON.stringify({ vote: value }) });
      if (!payload.judge) payload.judge = current.judge;
      showBattle(payload);
      const agree = payload.agreements;
      const rating = (payload.ratings || []).map(item => `${item.engine} ${item.delta >= 0 ? '+' : ''}${item.delta} → ${item.rating}`).join(' · ');
      setStatus(`Vote recorded${agree ? ` (judge had picked ${agree.judge}; you ${agree.agree ? 'agreed' : 'disagreed'})` : ''}. ${rating}`, 'ok');
      await Promise.all([loadLeaderboard(), loadHistory()]);
    } catch (error) {
      setStatus(error.message, 'fail');
      renderVote();
    }
  }

  async function reveal() {
    if (!current) return;
    try {
      const payload = await api(`/arena/battles/${current.battle.id}/reveal`, { method: 'POST', body: '{}' });
      payload.judge = current.judge;
      showBattle(payload);
      setStatus(payload.note || 'Engines revealed.', 'warn');
    } catch (error) { setStatus(error.message, 'fail'); }
  }

  /* ---------- leaderboard + history ---------- */
  async function loadLeaderboard() {
    if (!user) return;
    try {
      const data = await api('/arena/leaderboard');
      $('statTotal').textContent = String(data.totalBattles);
      $('statHuman').textContent = String(data.humanDecided);
      $('statAgree').textContent = data.judgeAgreement == null ? '—' : data.judgeAgreement + '%';
      $('leaderNote').textContent = data.note;
      const body = $('leaderBody'); body.replaceChildren();
      data.entries.forEach((entry, index) => {
        body.append(el('tr', { class: index === 0 && entry.rated ? 'top' : '' },
          el('td', { class: 'num', text: String(index + 1) }),
          el('td', { class: 'engine-cell' }, el('span', { text: entry.label }), entry.kind === 'cloud' && !entry.configured ? el('span', { class: 'tag warn', text: 'not configured' }) : null),
          el('td', { class: 'num', text: entry.rated ? String(entry.rating) : '1200' }),
          el('td', { class: 'num', text: String(entry.wins) }),
          el('td', { class: 'num', text: String(entry.losses) }),
          el('td', { class: 'num', text: String(entry.ties) }),
          el('td', { class: 'num', text: String(entry.battles) }),
          el('td', {}, el('span', { class: 'tag ' + (entry.kind === 'local' ? 'local' : entry.available ? 'ok' : 'warn'), text: entry.kind === 'local' ? 'Local' : entry.available ? 'Key ready' : 'No key' }))));
      });
    } catch (error) {
      $('leaderBody').replaceChildren(el('tr', {}, el('td', { colspan: 8, class: 'hint', text: error.message })));
    }
  }

  async function loadHistory() {
    if (!user) return;
    try {
      const mode = $('historyMode').value;
      const data = await api('/arena/battles?limit=20' + (mode ? '&mode=' + mode : ''));
      history = data.battles;
      const box = $('history'); box.replaceChildren();
      if (!data.battles.length) { box.append(el('p', { class: 'hint', text: 'No battles yet. Run one above.' })); return; }
      for (const battle of data.battles) {
        const when = new Date(battle.createdAt).toLocaleString();
        const meta = `${battle.mode} · ${(battle.contenders || []).length} engines · ${battle.vote ? 'decided by ' + battle.decidedBy : 'undecided'} · ${when}`;
        const item = el('button', { class: 'history-item', type: 'button' },
          el('div', { class: 'text' }, el('strong', { text: battle.prompt }), el('span', { text: meta })),
          el('span', { class: 'tag', text: battle.vote ? battle.vote.toUpperCase() : 'Open' }));
        item.addEventListener('click', () => openBattle(battle.id));
        box.append(item);
      }
    } catch (error) { $('history').replaceChildren(el('p', { class: 'hint', text: error.message })); }
  }

  async function openBattle(id) {
    try {
      setStatus('Opening battle…');
      const payload = await api('/arena/battles/' + id);
      showBattle(payload);
      setStatus(payload.battle.blind && !payload.battle.vote ? 'This battle is still blind — vote to reveal the engines.' : 'Battle loaded.', '');
    } catch (error) { setStatus(error.message, 'fail'); }
  }

  /* ---------- account ---------- */
  async function signIn() {
    if (window.AJ_STATIC_HOST) {
      user = null; csrf = '';
      $('accountBtn').textContent = 'Sign in';
      $('demoBtn').hidden = true;
      $('runBtn').disabled = true;
      $('buildHint').textContent = 'Static preview · backend not connected. Battles need the secure application server or the local preview (npm ci && npm run dev). Nothing is simulated on this page.';
      $('runHint').textContent = 'This is the static GitHub Pages copy. Open the secure app or run npm run dev for real battles.';
      setStatus('Static preview · backend not connected', 'warn');
      return;
    }
    try {
      const session = await fetch('/api/me', { credentials: 'same-origin' }).then(r => r.json());
      csrf = session.csrfToken || '';
      user = session.user || null;
    } catch { user = null; }
    $('accountBtn').textContent = user ? `Sign out (${user.username})` : 'Sign in';
    $('demoBtn').hidden = Boolean(user);
    $('runHint').textContent = user ? 'Signed in. Battles, votes and the leaderboard are saved to this account.' : 'Signed out? Use “Try the local preview” to open a disposable sandbox account and battle the local engines with no key.';
    $('runBtn').disabled = !user;
    $('buildHint').textContent = user
      ? 'Signed in. Local engines work with no key; cloud engines run only where a server-side provider key exists, and say so when it does not.'
      : 'Sign in to run a battle and keep the results. Nothing is faked for signed-out visitors.';
    if (user) { await Promise.all([loadLeaderboard(), loadHistory()]); }
  }

  $('demoBtn').addEventListener('click', async () => {
    $('demoBtn').disabled = true;
    running = true; enforceLimits();
    setStatus('Starting a disposable preview account…');
    try {
      const response = await fetch('/api/demo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not start the preview account.');
      await signIn();
      if (user) setStatus(`Preview account ready (${user.username}). Battles here are test data only.`, 'ok');
    } catch (error) {
      setStatus(error.message, 'fail');
    } finally {
      $('demoBtn').disabled = false;
      running = false; enforceLimits();
    }
  });

  $('accountBtn').addEventListener('click', async () => {
    if (!user) { location.href = 'index.html?next=arena.html'; return; }
    if (!window.confirm('Sign out of this device?')) return;
    try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    user = null; csrf = ''; current = null;
    $('battlePanel').hidden = true;
    $('leaderBody').replaceChildren(el('tr', {}, el('td', { colspan: 8, class: 'hint', text: 'Sign in to see your leaderboard.' })));
    $('history').replaceChildren(el('p', { class: 'hint', text: 'No battles yet.' }));
    await signIn();
  });

  /* ---------- boot ---------- */
  $('battleForm').addEventListener('submit', runBattle);
  $('prompt').addEventListener('input', () => { $('charCount').textContent = `${$('prompt').value.length} / 10000`; enforceLimits(); });
  $('clearBtn').addEventListener('click', () => { $('prompt').value = ''; $('charCount').textContent = '0 / 10000'; attachments = []; renderAttachments(); setStatus('Cleared.'); enforceLimits(); });
  $('attachBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async event => { await addFiles([...event.target.files]); event.target.value = ''; });
  $('revealBtn').addEventListener('click', reveal);
  $('newBattleBtn').addEventListener('click', () => { current = null; $('battlePanel').hidden = true; $('prompt').focus(); });
  $('exportBtn').addEventListener('click', async () => {
    // The export carries the rubric scores, the judge's reason and every note, so
    // a battle stays evidence after it leaves this page.
    if (!current?.battle?.id) { setStatus('Run a battle first, then export it.'); return; }
    if (current.battle.blind && !current.battle.vote) {
      setStatus('This battle is still blind. Vote (or reveal) before exporting, otherwise the file would hide engine names.');
      return;
    }
    try {
      const data = await api(`/arena/battles/${current.battle.id}?format=markdown`);
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      setStatus(`Exported ${data.filename} — ${data.markdown.length} characters including the judge\u2019s rubric.`);
    } catch (error) { setStatus('Export failed: ' + error.message, 'fail'); }
  });
  $('refreshLeader').addEventListener('click', () => { loadLeaderboard(); loadHistory(); });
  $('historyMode').addEventListener('change', loadHistory);

  (async () => {
    loadFeatureMap();
    loadPromptLibrary();
    await signIn();
    try {
      const data = await api('/arena/catalogue');
      catalogue = data.engines;
      renderEngines();
      $('engineHelp').textContent = `${data.engines.filter(e => e.kind === 'local' || e.configured).length} of ${data.engines.length} engines usable right now · choose 2–${data.maxContenders}`;
    } catch (error) {
      setStatus('Could not load the engine catalogue: ' + error.message, 'fail');
    }
    renderAttachments();
    enforceLimits();
  })();

  async function loadPromptLibrary() {
    // Prompts are content, not machinery: served by the API so the same list is
    // testable and cannot rot in the HTML.
    const host = document.getElementById('promptList');
    if (!host) return;
    const summary = document.getElementById('promptSummary');
    const query = document.getElementById('promptQuery');
    const category = document.getElementById('promptCategory');
    let all = [];
    const paint = list => {
      host.replaceChildren();
      for (const item of list) {
        const li = document.createElement('li');
        li.className = 'prompt';
        const head = document.createElement('div'); head.className = 'prompt-head';
        const title = document.createElement('strong'); title.textContent = item.title;
        const tag = document.createElement('span'); tag.className = 'state'; tag.textContent = `${item.category} · ${item.mode}`;
        head.append(title, tag);
        const text = document.createElement('p'); text.className = 'prompt-text'; text.textContent = item.prompt;
        const tests = document.createElement('small'); tests.className = 'prompt-tests'; tests.textContent = 'What it tests: ' + item.tests;
        const use = document.createElement('button');
        use.type = 'button'; use.className = 'btn small'; use.textContent = 'Use this prompt →';
        use.onclick = () => {
          const box = document.getElementById('prompt');
          box.value = item.prompt;
          const mode = document.getElementById('mode');
          if (mode && [...mode.options].some(option => option.value === item.mode)) mode.value = item.mode;
          box.focus(); box.scrollIntoView({ block: 'center', behavior: 'smooth' });
          setStatus('Prompt loaded. Choose two or more engines, then run the battle.');
        };
        li.append(head, text, tests, use);
        host.appendChild(li);
      }
      if (!list.length) { const li = document.createElement('li'); li.className = 'prompt'; li.textContent = 'No prompt matches that search. Try a different word.'; host.appendChild(li); }
    };
    try {
      const data = await api('/arena/prompts');
      all = data.prompts;
      for (const name of data.categories) { const option = document.createElement('option'); option.value = name; option.textContent = name; category.appendChild(option); }
      summary.textContent = `${data.total} prompts · each one has a checkable property`;
      paint(all);
      query.addEventListener('input', () => {
        const term = query.value.trim().toLowerCase();
        paint(all.filter(item => !term || [item.title, item.prompt, item.tests, item.category].some(field => field.toLowerCase().includes(term))));
      });
      category.addEventListener('change', () => paint(category.value ? all.filter(item => item.category === category.value) : all));
    } catch {
      summary.textContent = 'Prompt library unavailable right now — this page will not invent prompts.';
    }
  }

  async function loadFeatureMap() {
    // Served by the API so the page cannot drift from the router or the tests.
    try {
      const data = await api('/arena/features');
      const host = document.getElementById('features');
      if (!host) return;
      host.replaceChildren();
      for (const feature of data.features) {
        const li = document.createElement('li');
        li.className = 'feature ' + feature.state;
        const badge = document.createElement('span'); badge.className = 'state'; badge.textContent = feature.state.replace('-', ' ');
        const title = document.createElement('strong'); title.textContent = feature.label;
        const detail = document.createElement('p'); detail.textContent = feature.detail;
        const evidence = document.createElement('small'); evidence.textContent = 'Evidence: ' + feature.evidence;
        li.append(badge, title, detail, evidence);
        host.appendChild(li);
      }
      const summary = document.getElementById('featureSummary');
      if (summary) summary.textContent = data.summary.headline;
      const positioning = document.getElementById('positioning');
      if (positioning) {
        positioning.replaceChildren();
        for (const line of data.positioning) { const li = document.createElement('li'); li.textContent = line; positioning.appendChild(li); }
      }
    } catch {
      const summary = document.getElementById('featureSummary');
      if (summary) summary.textContent = 'Feature map unavailable right now — this page will not guess what is shipped.';
    }
  }

})();
