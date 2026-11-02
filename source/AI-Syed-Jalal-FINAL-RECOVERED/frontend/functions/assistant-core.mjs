// Deterministic, permission-bounded local tools. No eval, shell, OS control or invented AI.
export const PROFILE_IDS = ['general', 'coding', 'analysis', 'critic', 'planner'];
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
  if (/^(calculate|calc|what is [\d(])/.test(lower)) return { ...base, output: calculate(text.replace(/^what is\s*/i, '')), tool: 'calculator' };
  const task = text.match(/^(?:add|create|remember)(?: a)? task\s*:?\s*(.+)$/i);
  if (task) return { ...base, output: `Ready to add “${task[1].trim()}” to your tasks. Confirm below; nothing has been saved yet.`, action: { type: 'create_task', title: task[1].trim() } };
  const note = text.match(/^(?:save|add|take)(?: a)? note\s*:?\s*([\s\S]+)$/i);
  if (note) return { ...base, output: 'I prepared this note. Confirm below to save it to your private workspace.', action: { type: 'create_note', content: note[1].trim() } };
  if (/\b(list|show|my)\b.*\btasks\b/.test(lower)) return { ...base, output: 'Opening your current tasks.', tool: 'list_tasks' };
  if (/\b(list|show|my)\b.*\bnotes\b/.test(lower)) return { ...base, output: 'Opening your saved notes.', tool: 'list_notes' };
  const search = text.match(/^search (?:records|workspace)(?: for)?\s*:?\s*(.+)$/i);
  if (search) return { ...base, output: `Search your workspace for “${search[1].trim()}”.`, tool: 'search_records', query: search[1].trim() };
  if (/\b(help|what can you do|capabilities|commands)\b/.test(lower)) return { ...base, output: 'Available without an AI key:\n• calculate (1200 + 350) * 15%\n• add task: Review the project proposal\n• save note: Your private note\n• show tasks / show notes\n• search records: project name\n• plan: Launch a professional website\n• critic: Review this proposal…\n\nVoice input uses your browser’s speech service when supported. “Read reply” uses an on-device browser voice. Cloud AI, Gmail, WhatsApp and computer control are not silently connected.' };
  const goal = text.replace(/^(plan|critic|review|analyze|analyse|code)\s*:?\s*/i, '').trim();
  if (profile === 'planner' || /^plan\b/i.test(text)) return { ...base, output: `Plan: ${goal}\n\n1. Define the outcome, audience and success criteria.\n2. Inventory the existing content, accounts and constraints.\n3. Build the smallest complete workflow first; keep the approved visual identity.\n4. Add authentication, validation, accessible errors and audit coverage.\n5. Test desktop/mobile, keyboard navigation, failure recovery and data persistence.\n6. Release to a staging environment, verify backups and rollback, then launch.\n\nThis is a structured planning template, not a claim that an external model or autonomous agent executed the work. Connect a cloud provider for analysis specific to your proposal.` };
  if (profile === 'critic' || /^(critic|review)\b/i.test(text)) return { ...base, output: `Critical review: ${goal}\n\nCheck these before approval:\n• Evidence: Which claims are verified, and which are assumptions?\n• Security: Are authentication, authorization, input limits and secret handling explicit?\n• Reliability: What happens on timeout, partial failure and retry?\n• Usability: Are loading, empty, error and success states clear on mobile and keyboard?\n• Operations: Are monitoring, backup restoration and rollback tested?\n\nDecision: require evidence for each item before calling this production-ready. This local checklist does not replace an expert security or legal review.` };
  if (profile === 'coding' || /^code\b/i.test(text)) return { ...base, output: `Implementation checklist for: ${goal}\n\nDefine the input/output contract → implement the smallest change → validate untrusted input → add success and failure tests → run the full suite → review the diff. Paste the actual code and error for a provider-backed code review. Local mode does not pretend to generate or execute code with an AI model.` };
  return { ...base, output: 'I understood your message, but general conversational AI is not connected yet. I can still calculate, create a plan or critical review, and manage tasks/notes. Type “help” for working commands, or configure a server-side AI provider for open-ended answers. I have not invented a cloud response.', needsProvider: true };
}
