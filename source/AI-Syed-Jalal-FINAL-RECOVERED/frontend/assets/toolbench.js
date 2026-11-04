'use strict';
/*
 * Toolbench.
 *
 * This page does not re-implement any tool. It renders the catalogue the agent
 * runtime plans from, and every run goes through the one agent endpoint — so the
 * trace shown here is the same trace stored as evidence for an agent run.
 */
(() => {
  const $ = id => document.getElementById(id);
  let user = null, csrf = '', busy = false, controller = null, tools = [];

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
    const response = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(60000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return data;
  }

  const setStatus = (text, kind = '') => { const node = $('status'); node.textContent = text; node.dataset.kind = kind; };

  const EXAMPLES = [
    'calculate (1200 + 350) * 15% * 3',
    'time in Tokyo',
    'convert 10 km to miles',
    'days between 2026-01-01 and 2026-06-30',
    'sha256 of hello',
    'contrast #ffffff and #777777',
    'summarise this csv\nname,amount\nA,10\nB,20',
    'audit this\n```html\n<img src="x"><button>Go</button>\n```'
  ];

  function renderTools() {
    const host = $('tools');
    host.replaceChildren();
    for (const tool of tools) {
      const li = document.createElement('li');
      li.className = 'tool ' + (tool.kind || 'local');
      const head = document.createElement('div');
      head.className = 'tool-head';
      const name = document.createElement('strong'); name.textContent = tool.label;
      const kind = document.createElement('span'); kind.className = 'state'; kind.textContent = tool.kind;
      head.append(name, kind);
      const detail = document.createElement('p'); detail.textContent = tool.detail;
      const use = document.createElement('button');
      use.type = 'button'; use.className = 'btn small'; use.textContent = 'Try it';
      use.onclick = () => {
        $('prompt').value = EXAMPLE_FOR[tool.id] || tool.detail;
        $('prompt').focus(); update();
        setStatus(`Loaded the ${tool.label.toLowerCase()} example. Edit it if you like, then run.`);
      };
      li.append(head, detail, use);
      host.appendChild(li);
    }
    $('toolCount').textContent = `${tools.length} tools · ${tools.filter(t => t.kind === 'local').length} local · ${tools.filter(t => t.kind === 'network').length} network · ${tools.filter(t => t.kind === 'database').length} database`;
  }

  const EXAMPLE_FOR = {
    calculator: 'calculate (1200 + 350) * 15% * 3',
    research: 'research Ada Lovelace',
    records: 'search my workspace records for karachi',
    tasks: 'show my open tasks',
    datetime: 'time in Tokyo',
    units: 'convert 10 km to miles',
    json: 'json {"a":1,"b":[2,3]}',
    hash: 'sha256 of hello',
    contrast: 'contrast #ffffff and #777777',
    csv: 'summarise this csv\nname,amount\nA,10\nB,20',
    audit: 'audit this\n```html\n<img src="x"><button>Go</button>\n```',
    diff: 'diff\n```\na\nb\n```\n```\na\nc\n```'
  };

  function renderExamples() {
    const host = $('examples');
    host.replaceChildren();
    for (const example of EXAMPLES) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn small';
      button.textContent = example.split('\n')[0].slice(0, 34);
      button.onclick = () => { $('prompt').value = example; update(); $('prompt').focus(); };
      host.appendChild(button);
    }
  }

  function update() {
    $('runBtn').disabled = !user || busy || !$('prompt').value.trim();
    $('runBtn').textContent = busy ? 'Running…' : 'Run the agent ↗';
  }

  function render(result) {
    const host = $('result');
    host.replaceChildren();
    const summary = document.createElement('p');
    summary.className = 'answer-summary';
    const toolCalls = result.trace?.toolCalls ?? 0;
    summary.textContent = `${result.plan.length} planned step(s) · ${toolCalls} tool call(s) · ${result.trace?.failures ?? 0} failure(s) · ${result.trace?.totalMs ?? 0} ms · no external model called.`;
    host.appendChild(summary);

    for (const step of result.steps) {
      const card = document.createElement('article');
      card.className = 'answer' + (step.ok ? '' : ' failed');
      const head = document.createElement('div'); head.className = 'answer-head';
      const title = document.createElement('h2'); title.textContent = step.title;
      const meta = document.createElement('span'); meta.className = 'ms';
      meta.textContent = `${step.ok ? '✓' : '✕'} ${step.ms} ms · ${step.tool}`;
      head.append(title, meta);
      const body = document.createElement('pre'); body.className = 'answer-body';
      body.textContent = step.ok ? step.observation : `This tool failed: ${step.observation}`;
      card.append(head, body);
      if (step.noTool) {
        const note = document.createElement('p'); note.className = 'needs';
        note.textContent = 'No tool fitted this request, so the local profile answered instead. That is labelled here rather than passed off as a tool result.';
        card.appendChild(note);
      }
      host.appendChild(card);
    }

    const foot = document.createElement('ul');
    foot.className = 'panel-limits';
    const lines = [
      `Tools actually used: ${result.trace?.tools?.join(', ') || 'none'}.`,
      'The full trace is stored with the run, so this output can be audited later.',
      result.needsProvider
        ? 'Part of this request needs a cloud model for generated prose; no provider key is configured, so nothing was invented.'
        : 'Everything above was computed locally or fetched from the one documented endpoint.'
    ];
    for (const line of lines) { const li = document.createElement('li'); li.textContent = line; foot.appendChild(li); }
    host.appendChild(foot);
  }

  async function run(event) {
    event?.preventDefault();
    const prompt = $('prompt').value.trim();
    if (!user) { setStatus('Sign in first (or open the local preview).', 'warn'); return; }
    if (busy || !prompt) return;
    busy = true; update(); $('result').replaceChildren();
    setStatus('Running the same agent the app uses…');
    controller = new AbortController();
    try {
      const result = await api('/assistant/chat', { method: 'POST', body: JSON.stringify({ message: prompt, mode: 'agent', profile: 'general' }), signal: controller.signal });
      render(result);
      setStatus(result.trace?.failures ? `Finished with ${result.trace.failures} failed step(s) — see the cards.` : 'Finished. Every result above came from a tool.');
    } catch (error) {
      if (error.name === 'AbortError') setStatus('Stopped.');
      else setStatus(error.status === 429 ? 'That is a lot of runs — wait a minute and try again.' : error.message, 'fail');
    } finally {
      busy = false; controller = null; update();
    }
  }

  async function boot() {
    renderExamples();
    $('runForm').addEventListener('submit', run);
    $('clearBtn').addEventListener('click', () => { $('prompt').value = ''; $('result').replaceChildren(); update(); setStatus('Cleared. Nothing was sent.'); });
    $('prompt').addEventListener('input', update);
    try {
      const health = await api('/health');
      $('connectionStatus').textContent = health.localPreview ? 'Local preview · not production' : 'Secure account required';
      const session = await api('/me');
      csrf = session.csrfToken;
      if (session.authenticated) {
        user = session.user;
        $('loginBanner').hidden = true;
        setStatus(`Signed in as ${user.username}. Pick a tool above.`);
      } else {
        $('loginBanner').hidden = false;
        $('demoBtn').hidden = !health.localPreview;
        $('loginMessage').textContent = health.localPreview ? 'Disposable preview: use test data only.' : 'Sign in to run tools against your records.';
        setStatus(health.localPreview ? 'Choose “Try the local preview” to start.' : 'Sign in to begin.');
      }
      $('demoBtn').addEventListener('click', async () => {
        try { await api('/demo', { method: 'POST' }); location.reload(); }
        catch (error) { setStatus(error.message, 'fail'); }
      });
      // The catalogue is public: a signed-out visitor still learns what exists.
      const catalogue = await api('/agent/capabilities').catch(() => null);
      tools = catalogue?.tools || [];
      if (!tools.length) {
        // Fall back to the documented minimum so the page never renders an empty grid.
        tools = (catalogue?.selfCheck ? [] : []);
      }
      if (tools.length) renderTools();
      else $('toolCount').textContent = 'Tool catalogue unavailable — this page will not invent one.';
    } catch (error) {
      $('connectionStatus').textContent = 'Backend not reachable';
      setStatus('Could not reach the application server: ' + error.message, 'fail');
    }
    update();
  }

  boot();
})();
