// Translate a deliberately small, unambiguous English arithmetic vocabulary.
// This is not a general language model: unknown words are rejected rather than
// silently producing a partial calculation. The existing calculator evaluates
// the resulting expression; this module never evaluates code.
const SMALL = Object.freeze({ zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 });
const TENS = Object.freeze({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });
const SCALE = Object.freeze({ thousand: 1000, million: 1000000 });
const isWordNumber = word => Object.hasOwn(SMALL, word) || Object.hasOwn(TENS, word) || word === 'hundred' || Object.hasOwn(SCALE, word) || word === 'point';

function readWordNumber(tokens, start) {
  let i = start, total = 0, group = 0, last = 'start', lastScale = Infinity, seen = false;
  while (i < tokens.length) {
    const word = tokens[i];
    if (word === 'and' && (last === 'hundred' || last === 'scale') && isWordNumber(tokens[i + 1])) { last = 'and'; i++; continue; }
    if (Object.hasOwn(SMALL, word)) {
      const n = SMALL[word];
      if (last === 'unit' || last === 'teen' || (last === 'tens' && (n === 0 || n >= 10))) return null;
      group += n; seen = true; last = n < 10 ? 'unit' : 'teen'; i++; continue;
    }
    if (Object.hasOwn(TENS, word)) {
      if (!['start', 'hundred', 'scale', 'and'].includes(last)) return null;
      group += TENS[word]; seen = true; last = 'tens'; i++; continue;
    }
    if (word === 'hundred') {
      if (last !== 'unit' || group < 1 || group > 9) return null;
      group *= 100; last = 'hundred'; i++; continue;
    }
    if (Object.hasOwn(SCALE, word)) {
      const scale = SCALE[word];
      if (!seen || group < 1 || scale >= lastScale) return null;
      total += group * scale; group = 0; lastScale = scale; last = 'scale'; i++; continue;
    }
    if (word === 'point') {
      if (!seen) return null;
      i++;
      let decimals = '';
      while (i < tokens.length && Object.hasOwn(SMALL, tokens[i]) && SMALL[tokens[i]] < 10) decimals += String(SMALL[tokens[i++]]);
      if (!decimals) return null;
      return { value: `${total + group}.${decimals}`, next: i };
    }
    break;
  }
  return seen ? { value: String(total + group), next: i } : null;
}

export function isArithmeticRequest(input) {
  const text = String(input || '').trim();
  return /^(?:please\s+)?(?:calculate|calc|compute)\b/i.test(text)
    || /^(?:please\s+)?what(?: is|'s)\s+(?:[\d(]|zero\b|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|thirteen\b|fourteen\b|fifteen\b|sixteen\b|seventeen\b|eighteen\b|nineteen\b|twenty\b|thirty\b|forty\b|fifty\b|sixty\b|seventy\b|eighty\b|ninety\b)/i.test(text)
    || (/^[\s\d().+\-*/%]+$/.test(text) && /\d/.test(text) && /[+\-*/%]/.test(text));
}

/** Return an expression only if all its words are understood. */
export function extractArithmetic(input) {
  let text = String(input || '').trim().replace(/^(?:please\s+)?(?:calculate|calc|compute|what is|what's)\s*:?\s*/i, '');
  // A separate request can follow the math; callers must disclose or handle it.
  const split = text.match(/\s+and\s+(?=(?:show|list|search|find|open|critic|critique|review|analyze|analyse|plan|write|draft|build)\b)/i);
  const remainder = split ? text.slice(split.index).trim() : '';
  if (split) text = text.slice(0, split.index);
  text = text.replace(/[?!]+$/g, '').replace(/\.$/, '').replace(/(?<=\d),(?=\d{3}\b)/g, '').toLowerCase();
  text = text.replace(/\b(?:open|left) (?:parenthesis|bracket)\b/g, '(').replace(/\b(?:close|right) (?:parenthesis|bracket)\b/g, ')');
  const tokens = text.match(/\d*\.?\d+|[()+\-*/%×÷]|[a-z]+|[^\s]/g) || [];
  const parts = [];
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (isWordNumber(token)) {
      const number = readWordNumber(tokens, i);
      if (!number) return null;
      parts.push(number.value); i = number.next; continue;
    }
    if (/^\d*\.?\d+$/.test(token) || /^[()+\-*/%]$/.test(token)) { parts.push(token); i++; continue; }
    if (token === 'plus') parts.push('+');
    else if (token === 'minus' || token === 'negative') parts.push('-');
    else if (token === 'times' || token === 'x' || token === '×') parts.push('*');
    else if (token === '÷') parts.push('/');
    else if (token === 'percent' || token === 'percentage') parts.push('%');
    else if (token === 'per' && tokens[i + 1] === 'cent') { parts.push('%'); i++; }
    else if (['multiply', 'multiplied', 'divide', 'divided'].includes(token) && tokens[i + 1] === 'by') { parts.push(token.startsWith('multip') ? '*' : '/'); i++; }
    else return null;
    i++;
  }
  // Preserve the familiar formatting of already-valid typed expressions.
  const expression = /^[\s\d().+\-*/%]+$/.test(text) ? text.trim() : parts.join(' ').trim();
  return expression && /\d/.test(expression) ? { expression, remainder } : null;
}
