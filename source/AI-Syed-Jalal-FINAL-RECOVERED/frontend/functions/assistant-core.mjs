// Deterministic, permission-bounded local tools. No eval, shell, OS control or invented AI.
import { extractArithmetic, isArithmeticRequest } from './spoken-arithmetic.mjs';
import { timeIn } from './toolbox.mjs';
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
// These patterns only prepare a proposal. The separate authenticated confirmation
// endpoint is the only place that saves it, irrespective of the selected mode.
export function proposedAssistantAction(message) {
  const text = String(message || '').trim();
  const task = text.match(/^(?:please\s+)?(?:add|create|remember)(?: a)? task(?:\s*:\s*|\s+)([^\s:][\s\S]*)$/i);
  if (task && task[1].trim()) return { type: 'create_task', title: task[1].trim() };
  const note = text.match(/^(?:please\s+)?(?:save|add|take)(?: a)? note(?:\s*:\s*|\s+)([^\s:][\s\S]*)$/i);
  if (note && note[1].trim()) return { type: 'create_note', content: note[1].trim() };
  return null;
}
const NAMED_CLOCK = /\b(?:time|clock)\s+(?:is it\s+|is\s+|it is\s+)?(?:in|at)\s+([a-z][a-z .'-]{1,28}?)(?=$|\s+(?:and|then|also|plus|but)\b|[,;.!?])/i;
export function isClockQuestion(message) {
  const text = String(message || '').trim();
  return NAMED_CLOCK.test(text) || /^(?:(?:what(?:'s| is)?|tell me|show me)\s+(?:the\s+)?(?:current\s+)?(?:time|date|today(?:'s date)?)|what time is it)(?:\s+(?:now|today|and date))?[?.!]*$/i.test(text);
}
export function isSimpleGreeting(message) {
  return /^(?:hi|hello|hey|salam|assalam(?:[-\s]+o[-\s]+alaikum)?)[\s!.?]*$/i.test(String(message || '').trim());
}

// This is a conservative recognizer, not general language understanding or a
// guarantee for every language. A mention of saved data plus an exclusion asks
// for clarification instead of running tools or forwarding the request. Include
// common Roman Urdu and Urdu negations as well as English; unmatched phrasing may
// still reach a cloud provider if the user explicitly selects cloud mode.
const DATA_WORDS = /\b(?:tasks?|notes?|records?|workspaces?|customers?|entries|databases?|to-?do(?:s|\s+list)?|to do(?:s|\s+list)|(?:my|our|the|saved|personal)\s+to do)\b/i;
const URDU_DATA_WORDS = /(?:^|[^\p{L}\p{M}])(?:نوٹس?|ٹاسک(?:س)?|ریکارڈ(?:ز)?|کام)(?=$|[^\p{L}\p{M}])/u;
const EXCLUSION_WORDS = /\b(?:do\s+not|don['’]?t|never|not|no|without|except|exclud(?:e|es|ed|ing)|avoid(?:ing)?|skip(?:ping)?|omit(?:ting)?|hide|hiding|conceal(?:ing)?|withhold(?:ing)?|neither|nor|shouldn['’]t|mustn['’]t|mat|nahin|nahi|nhi|naheen|nhein|na|bina|baghair|chupao|chhupao)\b/i;
const URDU_EXCLUSION_WORDS = /(?:^|[^\p{L}\p{M}])(?:مت|نہیں|نہ|بغیر)(?=$|[^\p{L}\p{M}])/u;
const PRIVATE_INSTRUCTION = /\b(?:keep|leave|remain|stay)\b[\s\S]{0,120}\b(?:private|hidden|confidential|secret|out)\b/i;

export function mentionsSavedData(message) {
  const text = String(message || '');
  return DATA_WORDS.test(text) || URDU_DATA_WORDS.test(text);
}
export function requiresReadClarification(message) {
  const text = String(message || '').trim();
  return mentionsSavedData(text) && (EXCLUSION_WORDS.test(text) || URDU_EXCLUSION_WORDS.test(text) || PRIVATE_INSTRUCTION.test(text));
}

const PERSONAL_READ_COMMAND = /^(?:(?:please|kindly)\s+)?(?:(?:show|display|list|read|open)(?:\s+me)?(?:\s+aloud)?|what\s+(?:are|is)|what['’]s)\s+(?:(?:only|my|our|the|all|saved|private|personal)\s+){0,5}((?:(?:open|pending|done|completed)\s+)?(?:tasks?|to[ -]?do(?:s|\s+list)?)|notes?)(?:\s*(?:and|&)\s*(?:(?:show|display|list|read|open(?!\s+(?:tasks?|to[ -]?do(?:s|\s+list)?)\b))(?:\s+me)?(?:\s+aloud)?\s+)?(?:(?:only|my|our|the|all|saved|private|personal)\s+){0,5}((?:(?:open|pending|done|completed)\s+)?(?:tasks?|to[ -]?do(?:s|\s+list)?)|notes?))?(?:\s+aloud)?(?:\s*,?\s*please)?[.!?]*$/i;
const BARE_PERSONAL_READ = /^(?=(?:(?:only|my|our|the|all|saved|private|personal)\s+){0,4}(?:my|our|saved|private|personal)\s+)(?:(?:only|my|our|the|all|saved|private|personal)\s+){1,5}((?:(?:open|pending|done|completed)\s+)?(?:tasks?|to[ -]?do(?:s|\s+list)?)|notes?)(?:\s*(?:and|&)\s*(?:(?:only|my|our|the|all|saved|private|personal)\s+){0,5}((?:(?:open|pending|done|completed)\s+)?(?:tasks?|to[ -]?do(?:s|\s+list)?)|notes?))?[.!?]*$/i;

// Split only on clear command starts, not on the "and" joining two categories.
export function splitAssistantClauses(message) {
  return String(message || '').trim().split(/\s+(?:and\s+then|and|then)\s+(?=(?:(?:please|kindly)\s+)?(?:show|display|list|read|open|calculate|calc|compute|search|find)\b)/i);
}

// A phrase such as "how do I find and show my notes?" asks for instructions,
// not permission to execute the quoted or embedded operation.
export function isInstructionalRequest(message) {
  const text = String(message || '').trim().replace(/^(?:research|look up|search the web(?: for)?|find out about)\s*:?\s*/i, '');
  return /^(?:(?:please|kindly)\s+)?(?:how|why|when|where|who|what|explain|describe|teach|tell\s+me|show\s+me\s+how|(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:explain|describe|teach|tell\s+me\s+how|show\s+me\s+how))\b/i.test(text)
    || /\bhow\s+(?:to|do|can|should|would)\b/i.test(text);
}

const RECORD_READ_PREFIX = /^(?:(?:please|kindly)\s+)?(?:search|find|list|show)\s+(?:(?:me|my|our|the|all)\s+){0,4}(?:workspace\s+)?(?:records?|customers?|entries|database|workspace)\b/i;

// A saved-data read in a compound agent request is only safe to infer when
// every clause is a complete supported read, record search or calculation.
// Otherwise an embedded example such as "explain how to find and show my
// notes" could be mistaken for an instruction to actually open them.
export function isSafeSavedDataCompound(message) {
  const text = String(message || '').trim();
  if (PERSONAL_READ_COMMAND.test(text) || BARE_PERSONAL_READ.test(text)) return true;
  return splitAssistantClauses(text).every(part => {
    const clause = part.trim();
    if (PERSONAL_READ_COMMAND.test(clause) || BARE_PERSONAL_READ.test(clause)) return true;
    const record = clause.match(RECORD_READ_PREFIX);
    if (record && !isInstructionalRequest(clause) && !/\b(?:and|then)\b/i.test(clause.slice(record[0].length))) return true;
    if (isArithmeticRequest(clause)) {
      const math = extractArithmetic(clause);
      return Boolean(math && !math.remainder);
    }
    return false;
  });
}

export function personalReadIntent(message, { allowCompound = false } = {}) {
  const text = String(message || '').trim();
  if (!text || requiresReadClarification(text)) return null;
  // "What are notes?" can ask for a definition. A question is only treated as
  // a saved-data request when it names my/our/saved/private/personal items.
  if (/^(?:(?:please|kindly)\s+)?(?:what\s+(?:are|is)|what['’]s)\s+/i.test(text)
    && !isArithmeticRequest(text)
    && !/^(?:(?:please|kindly)\s+)?(?:what\s+(?:are|is)|what['’]s)\s+(?:(?:the|all|only)\s+){0,2}(?:my|our|saved|private|personal)\b/i.test(text)) return null;
  // Prefer an entire read command, so "notes and open tasks" keeps "open"
  // as a task status. Otherwise every local clause must be a complete read;
  // agent runs may combine a read with a separate calculator command.
  const fullRead = PERSONAL_READ_COMMAND.test(text) || BARE_PERSONAL_READ.test(text);
  if (allowCompound && !isSafeSavedDataCompound(text)) return null;
  const clauses = fullRead ? [text] : splitAssistantClauses(text);
  const intent = { tasks: false, notes: false }, taskStatuses = new Set();
  for (const clause of clauses) {
    const match = clause.trim().match(PERSONAL_READ_COMMAND) || clause.trim().match(BARE_PERSONAL_READ);
    if (!match) { if (!allowCompound) return null; continue; }
    for (const item of match.slice(1, 3).filter(Boolean)) {
      if (/^notes?/i.test(item)) intent.notes = true;
      else {
        intent.tasks = true;
        taskStatuses.add(/^(?:open|pending)\s/i.test(item) ? 'open' : /^(?:done|completed)\s/i.test(item) ? 'done' : 'all');
      }
    }
  }
  if (taskStatuses.size === 1 && !taskStatuses.has('all')) intent.taskStatus = [...taskStatuses][0];
  return intent.tasks || intent.notes ? intent : null;
}

export function localAssistant(message, profile = 'general', now = new Date(), { supportsCombinedReads = false, supportsTaskStatusFilter = false } = {}) {
  const text = String(message || '').trim(), lower = text.toLowerCase();
  const base = { ok: true, mode: 'local', simulated: false, provider: 'local-tools', agentId: profile };
  const action = proposedAssistantAction(text);
  if (action?.type === 'create_task') return { ...base, output: `Ready to add “${action.title}” to your tasks. Confirm below; nothing has been saved yet.`, action };
  if (action?.type === 'create_note') return { ...base, output: 'I prepared this note. Confirm below to save it to your private workspace.', action };
  if (requiresReadClarification(text)) return { ...base, readAccessBlocked: true, localOnly: true, output: 'I did not read saved tasks, notes or records for this request. Please ask separately and clearly for any items you do want. Earlier messages or items already on screen may still be visible.' };
  if (isSimpleGreeting(text)) return { ...base, output: 'Assalam-o-alaikum! I’m JalalAi. I can calculate, plan, review a proposal, manage your tasks and notes, and search your workspace. Cloud AI is optional. What would you like to work on?' };
  if (isClockQuestion(text)) {
    const place = text.match(NAMED_CLOCK)?.[1];
    if (place) {
      try { return { ...base, output: timeIn(place, now), tool: 'clock' }; }
      catch (error) { return { ...base, output: error.message, tool: 'clock' }; }
    }
    return { ...base, output: `Pakistan time: ${new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'full', timeStyle: 'long' }).format(now)}.`, tool: 'clock' };
  }
  const explicitCalculation = isArithmeticRequest(text);
  const parsed = explicitCalculation ? extractArithmetic(text) : null;
  // Keep a specialist's frame for a compound request, but answer a standalone
  // calculation in every profile. A question merely mentioning calculation is
  // not hijacked from the cloud conversational engine.
  const profileHasFrame = ['planner', 'critic', 'coding', 'analysis', 'architect', 'reviewer', 'writer'].includes(profile);
  if (explicitCalculation && (!profileHasFrame || !parsed?.remainder)) {
    if (parsed) {
      try {
        const answer = calculate(parsed.expression);
        return { ...base, output: parsed.remainder ? `${answer}\n\n(Calculated the expression; the rest of the request was not evaluated.)` : answer, tool: 'calculator' };
      } catch (error) {
        return { ...base, output: `Calculation failed: ${error.message}`, tool: 'calculator' };
      }
    }
    return { ...base, output: 'I could not understand that arithmetic. Try “calculate six times seven” or “calculate (1200 + 350) * 15%”.', tool: 'calculator', needsProvider: true };
  }
  const read = personalReadIntent(text);
  // Older cached clients ignore status filters and don't understand a combined
  // tool ID. Ask them to refresh rather than displaying the wrong saved items.
  if (read?.taskStatus && !supportsTaskStatusFilter) return { ...base, localOnly: true, output: 'Please refresh to view tasks by status, or ask separately for all your tasks.' };
  if (read?.tasks && read.notes) {
    if (!supportsCombinedReads) return { ...base, localOnly: true, output: 'Please ask to show your tasks or notes separately, or refresh to use the updated assistant.' };
    return { ...base, output: 'Opening the tasks and notes you requested.', tool: 'list_tasks_and_notes', ...(read.taskStatus ? { taskStatus: read.taskStatus } : {}) };
  }
  if (read?.tasks) return { ...base, output: read.taskStatus ? `Opening your ${read.taskStatus === 'done' ? 'completed' : 'open'} tasks.` : 'Opening your current tasks.', tool: 'list_tasks', ...(read.taskStatus ? { taskStatus: read.taskStatus } : {}) };
  if (read?.notes) return { ...base, output: 'Opening your saved notes.', tool: 'list_notes' };
  const search = text.match(/^search (?:records|workspace)(?: for)?\s*:?\s*(.+)$/i);
  if (search) return { ...base, output: `Search your workspace for “${search[1].trim()}”.`, tool: 'search_records', query: search[1].trim() };
  if (/\b(help|what can you do|capabilities|commands)\b/.test(lower)) return { ...base, output: 'Available without an AI key:\n• calculate (1200 + 350) * 15%\n• add task: Review the project proposal\n• save note: Your private note\n• show tasks / show notes\n• search records: project name\n• plan: Launch a professional website\n• critic: Review this proposal…\n\nVoice input uses your browser’s speech service when supported. “Read reply” uses a browser voice, which may be provided online. Cloud AI, Gmail, WhatsApp and computer control are not silently connected.' };
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
  return { ...base, output: 'I cannot answer that open-ended question with local tools alone. I can still calculate, create a plan or critical review, and manage tasks and notes. Type “help” for commands, or select Cloud AI with a configured server-side provider. I have not invented a cloud response.', needsProvider: true };
}

