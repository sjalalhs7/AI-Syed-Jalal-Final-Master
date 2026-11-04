// Deterministic, permission-bounded local tools. No eval, shell, OS control or invented AI.
export const PROFILE_IDS = ['general', 'coding', 'analysis', 'critic', 'planner', 'architect', 'reviewer', 'writer'];
export function calculate(expression) {
  const input = String(expression).replace(/^calculate\s*/i, '').trim();
  if (!input || input.length > 200 || !/^[\d\s.+\-*/()%]+$/.test(input)) throw new Error('Use a calculation such as “calculate (1200 + 350) * 15%”.');
  const tokens = input.match(/\d*\.?\d+|[()+\-*/%]/g) || [];
  if (tokens.join('') !== input.replace(/\s/g, '')) throw new Error('Unsupported calculation.');
  let index = 0;
  function primary() {
    const token = tokens[index++];
    if (token === '(') { const value = sum(); if (tokens[index++] !== ')') throw new Error('Close the parenthesis.'); return value; }
    if (token === '-') return -primary();
    if (token === '+') return primary();
    if (!token || !/^\d*\.?\d+$/.test(token)) throw new Error('Invalid calculation.');
    let value = Number(token);
    if (tokens[index] === '%') { index++; value /= 100; }
    return value;
  }
  function product() { let value = primary(); while (['*', '/'].includes(tokens[index])) { const op = tokens[index++], right = primary(); value = op === '*' ? value * right : value / right; } return value; }
  function sum() { let value = product(); while (['+', '-'].includes(tokens[index])) { const op = tokens[index++], right = product(); value = op === '+' ? value + right : value - right; } return value; }
  const result = sum();
  if (index !== tokens.length || !Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) throw new Error('The calculation is invalid or outside the supported range.');
  return `${input} = ${Number(result.toPrecision(12))}`;
}
export function localAssistant(message, profile = 'general', now = new Date()) {
  const text = String(message || '').trim(), lower = text.toLowerCase();
  const base = { ok: true, mode: 'local', simulated: false, provider: 'local-tools', agentId: profile };
  if (/^(hi|hello|salam|assalam|hey)\b/.test(lower)) return { ...base, output: 'Assalam-o-alaikum! I’m JalalAi. I can calculate, plan, review a proposal, manage your tasks and notes, and search your workspace. Cloud AI is optional. What would you like to work on?' };
  if (/\b(time|date|today)\b/.test(lower) && /\b(what|current|tell|show)\b/.test(lower)) return { ...base, output: `Pakistan time: ${new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'full', timeStyle: 'long' }).format(now)}.`, tool: 'clock' };
  const explicitCalculation = /^(calculate|calc|what is [\d(])/.test(lower);
  // A sentence that also says "calculate" is ambiguous; a specific profile must
  // still answer in its own frame, so only the general profile takes the bait.
  const calculationRequested = /\b(calculate|calc|compute)\b/i.test(text);
  // Only answer with arithmetic when it was actually asked for. A critic told to
  // "critique the risk of (1200+350)*15%" must critique, not silently compute.
  const profileHasFrame = ['planner', 'critic', 'coding', 'analysis', 'architect', 'reviewer', 'writer'].includes(profile);
  // ...but a message that asks for nothing except the sum is still a sum. Strip the
  // instruction, the expression and filler; if nothing else is left, compute it
  // whichever profile is active. Only a calculation *buried in* a real request
  // ("... and critique the launch risk") defers to the profile's own frame.
  const strippedExpression = text
    .replace(/^(?:please\s+)?(?:calculate|calc|compute|what is)\s*/i, '')
    .replace(/[?.,!]+$/g, '');
  const calcRuns = (strippedExpression.match(/[\d\s().+\-*/%]+/g) || []).map(run => run.trim()).filter(run => /\d/.test(run));
  const calcRemainder = calcRuns
    .reduce((rest, run) => rest.replace(run, ' '), strippedExpression)
    .replace(/\b(please|for me|now|the result|result|it|that|this)\b/gi, '')
    .replace(/[\s,]+/g, '');
  const calculationOnly = Boolean(calcRuns.length) && calcRemainder === '';
  if ((explicitCalculation || calculationRequested) && (!profileHasFrame || profile === 'general' || calculationOnly)) {
    // People write "calculate 40*12 and show my tasks". Evaluate the arithmetic
    // run inside the sentence instead of failing on the trailing words — the same
    // rule the agent runtime's calculator tool uses, so both agree.
    const cleaned = text.replace(/^(?:calculate|calc|what is)\s*/i, '').replace(/[?.,!]+$/g, '');
    const runs = (cleaned.match(/[\d\s().+\-*/%]+/g) || []).map(run => run.trim()).filter(run => /\d/.test(run));
    const expression = runs.sort((a, b) => b.length - a.length)[0];
    if (expression) {
      const answer = calculate(expression);
      const trailing = runs.length > 1 || cleaned.replace(expression, '').replace(/[\s,]+/g, '').length > 0;
      return { ...base, output: trailing ? `${answer}\n\n(Calculated “${expression.trim()}” from your message; the rest of the request was not evaluated.)` : answer, tool: 'calculator' };
    }
    return { ...base, output: 'I could not find an arithmetic expression in that message. Try “calculate (1200 + 350) * 15%”.', tool: 'calculator' };
  }
  const task = text.match(/^(?:add|create|remember)(?: a)? task\s*:?\s*(.+)$/i);
  if (task) return { ...base, output: `Ready to add “${task[1].trim()}” to your tasks. Confirm below; nothing has been saved yet.`, action: { type: 'create_task', title: task[1].trim() } };
  const note = text.match(/^(?:save|add|take)(?: a)? note\s*:?\s*([\s\S]+)$/i);
  if (note) return { ...base, output: 'I prepared this note. Confirm below to save it to your private workspace.', action: { type: 'create_note', content: note[1].trim() } };
  if (/\b(list|show|my)\b.*\btasks\b/.test(lower)) return { ...base, output: 'Opening your current tasks.', tool: 'list_tasks' };
  if (/\b(list|show|my)\b.*\bnotes\b/.test(lower)) return { ...base, output: 'Opening your saved notes.', tool: 'list_notes' };
  const search = text.match(/^search (?:records|workspace)(?: for)?\s*:?\s*(.+)$/i);
  if (search) return { ...base, output: `Search your workspace for “${search[1].trim()}”.`, tool: 'search_records', query: search[1].trim() };
  if (/\b(help|what can you do|capabilities|commands)\b/.test(lower)) return { ...base, output: 'Available without an AI key:\n• calculate (1200 + 350) * 15%\n• add task: Review the project proposal\n• save note: Your private note\n• show tasks / show notes\n• search records: project name\n• plan: Launch a professional website\n• critic: Review this proposal…\n\nVoice input uses your browser’s speech service when supported. “Read reply” uses an on-device browser voice. Cloud AI, Gmail, WhatsApp and computer control are not silently connected.' };
  const goal = text.replace(/^(plan|critic|review|analyze|analyse|code|architect|write|draft)\s*:?\s*/i, '').trim();
  // An explicitly selected profile always answers in its own frame; the keyword
  // shortcuts below only apply to the general profile.
  const specific = profile !== 'general';
  if (specific && !['planner','critic','coding','analysis','architect','reviewer','writer'].includes(profile)) {
    return { ...base, output: `This profile (${profile}) has no local frame. Choose general, planner, critic, coding, analysis, architect, reviewer or writer.` };
  }
  if (profile === 'planner' || (!specific && /^plan\b/i.test(text))) return { ...base, output: `Plan: ${goal}\n\n1. Define the outcome, audience and success criteria.\n2. Inventory the existing content, accounts and constraints.\n3. Build the smallest complete workflow first; keep the approved visual identity.\n4. Add authentication, validation, accessible errors and audit coverage.\n5. Test desktop/mobile, keyboard navigation, failure recovery and data persistence.\n6. Release to a staging environment, verify backups and rollback, then launch.\n\nThis is a structured planning template, not a claim that an external model or autonomous agent executed the work. Connect a cloud provider for analysis specific to your proposal.` };
  if (profile === 'critic' || (!specific && /^(critic|review)\b/i.test(text))) return { ...base, output: `Critical review: ${goal}\n\nCheck these before approval:\n• Evidence: Which claims are verified, and which are assumptions?\n• Security: Are authentication, authorization, input limits and secret handling explicit?\n• Reliability: What happens on timeout, partial failure and retry?\n• Usability: Are loading, empty, error and success states clear on mobile and keyboard?\n• Operations: Are monitoring, backup restoration and rollback tested?\n\nDecision: require evidence for each item before calling this production-ready. This local checklist does not replace an expert security or legal review.` };
  if (profile === 'coding' || (!specific && /^code\b/i.test(text))) return { ...base, output: `Implementation checklist for: ${goal}\n\nDefine the input/output contract → implement the smallest change → validate untrusted input → add success and failure tests → run the full suite → review the diff. Paste the actual code and error for a provider-backed code review. Local mode does not pretend to generate or execute code with an AI model.` };
  if (profile === 'analysis' || (!specific && /^analy[sz]e\b/i.test(text))) return { ...base, output: `Structured analysis: ${goal}\n\n1. Question: what decision does this analysis have to support?\n2. Known inputs: list the data you actually have, with its source and date.\n3. Unknowns: name the gaps that could change the conclusion.\n4. Options: compare at least two, with cost, risk and reversibility.\n5. Recommendation: state the choice, the evidence behind it and what would change your mind.\n\nThis is a structured analysis template produced by local tools; it is not an external model, a statistical result or a forecast. Supply the real data or connect a provider for a data-specific analysis.` };
  if (profile === 'architect' || (!specific && /^architect\b/i.test(text))) return { ...base, output: `Architecture review for: ${goal}\n\n1. Boundaries: which module owns this decision, and what does it expose?\n2. Data: what is stored, for how long, and who can read it?\n3. Contracts: what shape does the caller depend on, and what breaks it?\n4. Failure modes: timeout, partial write, duplicate request, empty state.\n5. Operations: how do you observe it, back it up and roll it back?\n6. Reversibility: the smallest change that can be undone in one deploy.\n\nThis is a structured architecture checklist from local tools, not an external design review. Attach the real diagram or schema for a provider-backed critique.` };
  if (profile === 'reviewer' || (!specific && /^review\b/i.test(text))) return { ...base, output: `Review checklist for: ${goal}\n\n• Correctness — does it do what the description says, including the failure path?\n• Security — untrusted input, authorisation on every read, secrets outside the repo.\n• Honesty — does the UI claim anything the code cannot do?\n• Accessibility — keyboard path, focus order, labels, contrast, reduced motion.\n• Tests — one test per claim, and a test that fails when the code is wrong.\n• Release — migration order, rollback, and what the user sees while it deploys.\n\nEscalate anything that touches money, identity or personal data to a human owner before shipping. This local checklist is not a substitute for that human review.` };
  if (profile === 'writer' || (!specific && /^write\b/i.test(text))) return { ...base, output: `Drafting frame for: ${goal}\n\n1. Reader: who is this for, and what do they already know?\n2. One sentence: the single point they must remember.\n3. Structure: claim → evidence → what it means for them.\n4. Cut: remove every adjective that no number supports.\n5. Proof: what can the reader verify themselves?\n6. Call to action: the one next step.\n\nI can structure the writing, but local mode does not produce provider-quality prose. Connect a cloud provider for a generated draft, and check every factual claim yourself.` };
  return { ...base, output: 'I understood your message, but general conversational AI is not connected yet. I can still calculate, create a plan or critical review, and manage tasks/notes. Type “help” for working commands, or configure a server-side AI provider for open-ended answers. I have not invented a cloud response.', needsProvider: true };
}

