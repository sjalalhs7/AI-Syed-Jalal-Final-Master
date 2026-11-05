/**
 * V140 — Agent toolbox.
 *
 * Eight more deterministic tools, added to the four the agent runtime already
 * had. The rule from V136 still holds: **a tool only exists if it returns a real
 * result**. Nothing here guesses, and nothing here touches the filesystem, the
 * shell, `eval`, or an arbitrary network address.
 *
 * Why these eight: they are the questions people actually bring to a build —
 * "what time is it there", "convert this", "is this JSON valid", "audit this
 * markup", "what changed between these two versions", "does this contrast pass",
 * "summarise this CSV", "hash this". Each one replaces a browser tab and each
 * answer is reproducible from the input alone.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(text) {
  return String(text ?? '').trim();
}

function num(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`“${value}” is not a number.`);
  return n;
}

function round(value, places = 6) {
  return Number(value.toFixed(places));
}

/* ------------------------------------------------------------------ 1. dates */

export const TIME_ZONES = Object.freeze({
  karachi: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi', rawalpindi: 'Asia/Karachi',
  dubai: 'Asia/Dubai', riyadh: 'Asia/Riyadh', doha: 'Asia/Qatar', tehran: 'Asia/Tehran',
  delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', dhaka: 'Asia/Dhaka', kathmandu: 'Asia/Kathmandu',
  singapore: 'Asia/Singapore', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', tokyo: 'Asia/Tokyo',
  seoul: 'Asia/Seoul', jakarta: 'Asia/Jakarta', bangkok: 'Asia/Bangkok', manila: 'Asia/Manila',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland',
  london: 'Europe/London', dublin: 'Europe/Dublin', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid', rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', zurich: 'Europe/Zurich',
  stockholm: 'Europe/Stockholm', moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul', cairo: 'Africa/Cairo',
  lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg',
  'new york': 'America/New_York', 'newyork': 'America/New_York', boston: 'America/New_York',
  washington: 'America/New_York', toronto: 'America/Toronto', chicago: 'America/Chicago',
  denver: 'America/Denver', 'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver', mexico: 'America/Mexico_City',
  'sao paulo': 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires', utc: 'UTC', gmt: 'UTC'
});

function zoneFor(name) {
  const key = clean(name).toLowerCase();
  return TIME_ZONES[key] || null;
}

export function timeIn(city, now = new Date()) {
  const zone = zoneFor(city);
  if (!zone) throw new Error(`I do not have a time zone for “${city}”. Known places: ${Object.keys(TIME_ZONES).slice(0, 8).join(', ')}…`);
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, dateStyle: 'full', timeStyle: 'short'
  }).format(now);
  const offset = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(now).find(part => part.type === 'timeZoneName')?.value || '';
  return `${city.trim()} (${zone}) — ${formatted} ${offset}`.replace(/\s+/g, ' ').trim();
}

export function daysBetween(from, to) {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new Error('Use ISO dates (YYYY-MM-DD) for the date maths.');
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('One of those dates does not exist in the calendar.');
  const days = Math.round((b - a) / 86400000);
  const direction = days === 0 ? 'the same day' : days > 0 ? `${days} day(s) after` : `${Math.abs(days)} day(s) before`;
  return `${from} → ${to} is ${direction} (${Math.abs(days)} calendar day(s)).`;
}

export function addToDate(from, amount, unit) {
  if (!ISO_DATE.test(from)) throw new Error('Use an ISO date (YYYY-MM-DD) as the starting point.');
  const n = num(amount);
  const map = { day: 1, days: 1, week: 7, weeks: 7, month: 0, months: 0, year: 0, years: 0 };
  const key = clean(unit).toLowerCase();
  if (!(key in map)) throw new Error('Supported units: days, weeks, months, years.');
  const start = new Date(`${from}T00:00:00Z`);
  let result;
  if (key.startsWith('day')) result = new Date(start.getTime() + n * 86400000);
  else if (key.startsWith('week')) result = new Date(start.getTime() + n * 7 * 86400000);
  else if (key.startsWith('month')) {
    result = new Date(start.getTime());
    const target = result.getUTCDate();
    result.setUTCMonth(result.getUTCMonth() + n);
    // 31 Jan + 1 month must not silently become 3 March.
    if (result.getUTCDate() !== target) result.setUTCDate(0);
  } else {
    result = new Date(start.getTime());
    const target = result.getUTCDate();
    result.setUTCFullYear(result.getUTCFullYear() + n);
    if (result.getUTCDate() !== target) result.setUTCDate(0);
  }
  const iso = result.toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(result);
  return `${from} ${n >= 0 ? '+' : '−'} ${Math.abs(n)} ${key} = ${iso} (${weekday}).`;
}

/* ------------------------------------------------------------------ 2. units */

const UNITS = Object.freeze({
  // length (metres)
  mm: { dim: 'length', factor: 0.001 }, cm: { dim: 'length', factor: 0.01 }, m: { dim: 'length', factor: 1 },
  km: { dim: 'length', factor: 1000 }, in: { dim: 'length', factor: 0.0254 }, ft: { dim: 'length', factor: 0.3048 },
  yd: { dim: 'length', factor: 0.9144 }, mi: { dim: 'length', factor: 1609.344 }, nmi: { dim: 'length', factor: 1852 },
  // mass (kilograms)
  mg: { dim: 'mass', factor: 0.000001 }, g: { dim: 'mass', factor: 0.001 }, kg: { dim: 'mass', factor: 1 },
  t: { dim: 'mass', factor: 1000 }, oz: { dim: 'mass', factor: 0.028349523125 }, lb: { dim: 'mass', factor: 0.45359237 },
  // volume (litres)
  ml: { dim: 'volume', factor: 0.001 }, l: { dim: 'volume', factor: 1 }, cup: { dim: 'volume', factor: 0.24 },
  pt: { dim: 'volume', factor: 0.473176473 }, qt: { dim: 'volume', factor: 0.946352946 }, gal: { dim: 'volume', factor: 3.785411784 },
  // data (bytes)
  b: { dim: 'data', factor: 1 }, kb: { dim: 'data', factor: 1000 }, mb: { dim: 'data', factor: 1e6 },
  gb: { dim: 'data', factor: 1e9 }, tb: { dim: 'data', factor: 1e12 },
  kib: { dim: 'data', factor: 1024 }, mib: { dim: 'data', factor: 1048576 }, gib: { dim: 'data', factor: 1073741824 },
  // speed (metres per second)
  ms: { dim: 'speed', factor: 1 }, kmh: { dim: 'speed', factor: 0.2777777777777778 }, mph: { dim: 'speed', factor: 0.44704 }
});

const UNIT_ALIASES = Object.freeze({
  millimetre: 'mm', millimeter: 'mm', centimetre: 'cm', centimeter: 'cm', metre: 'm', meter: 'm', metres: 'm', meters: 'm',
  kilometre: 'km', kilometer: 'km', kilometres: 'km', kilometers: 'km', inch: 'in', inches: 'in', foot: 'ft', feet: 'ft',
  yard: 'yd', yards: 'yd', mile: 'mi', miles: 'mi', gram: 'g', grams: 'g', gramme: 'g', kilogram: 'kg', kilograms: 'kg',
  kilo: 'kg', kilos: 'kg', tonne: 't', tonnes: 't', ton: 't', tons: 't', ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb',
  lbs: 'lb', litre: 'l', litres: 'l', liter: 'l', liters: 'l', millilitre: 'ml', milliliter: 'ml', cups: 'cup',
  pint: 'pt', pints: 'pt', quart: 'qt', quarts: 'qt', gallon: 'gal', gallons: 'gal', byte: 'b', bytes: 'b',
  kilobyte: 'kb', kilobytes: 'kb', megabyte: 'mb', megabytes: 'mb', gigabyte: 'gb', gigabytes: 'gb', terabyte: 'tb',
  terabytes: 'tb', kmh: 'kmh', kph: 'kmh', 'km/h': 'kmh', mph: 'mph', 'm/s': 'ms'
});

function canonicalUnit(word) {
  const key = clean(word).toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[key] || (key in UNITS ? key : null);
}

export function convertUnits(amount, fromWord, toWord) {
  const from = canonicalUnit(fromWord), to = canonicalUnit(toWord);
  if (!from || !to) throw new Error(`I do not know “${from ? toWord : fromWord}”. Supported: ${Object.keys(UNITS).join(', ')}.`);
  const value = num(amount);
  if (from === to) return `${value} ${from} = ${value} ${to}`;
  const a = UNITS[from], b = UNITS[to];
  if (a.dim !== b.dim) throw new Error(`${from} is a ${a.dim} unit and ${to} is a ${b.dim} unit — that conversion is not defined.`);
  const result = value * a.factor / b.factor;
  return `${value} ${from} = ${round(result)} ${to}`;
}

export function convertTemperature(amount, fromUnit, toUnit) {
  const value = num(amount);
  const from = clean(fromUnit).toLowerCase(), to = clean(toUnit).toLowerCase();
  const key = { c: 'c', celsius: 'c', '°c': 'c', f: 'f', fahrenheit: 'f', '°f': 'f', k: 'k', kelvin: 'k' };
  const a = key[from], b = key[to];
  if (!a || !b) throw new Error('Temperature units: c, f, k.');
  const celsius = a === 'c' ? value : a === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
  const out = b === 'c' ? celsius : b === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
  return `${value}°${a.toUpperCase()} = ${round(out, 4)}°${b.toUpperCase()}`;
}

/* --------------------------------------------------------------- 3. hashing */

export async function hashText(algorithm, text) {
  const allowed = { sha256: 'SHA-256', sha1: 'SHA-1', sha384: 'SHA-384', sha512: 'SHA-512' };
  const name = allowed[clean(algorithm).toLowerCase()];
  if (!name) throw new Error('Supported hashes: sha256, sha1, sha384, sha512.');
  const digest = await crypto.subtle.digest(name, new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function uuid() {
  return crypto.randomUUID();
}

export function base64(text, direction = 'encode') {
  const source = String(text);
  try {
    return clean(direction).toLowerCase() === 'decode'
      ? `Decoded: ${decodeURIComponent(escape(atob(source.trim())))}`
      : `Encoded: ${btoa(unescape(encodeURIComponent(source)))}`;
  } catch {
    throw new Error('That is not valid Base64 (or the decoded text is not UTF-8).');
  }
}

/* ------------------------------------------------------------------ 4. JSON */

export function inspectJson(source) {
  const text = String(source || '').trim();
  if (!text) throw new Error('There is no JSON in that message.');
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const position = /position (\d+)/.exec(error.message)?.[1];
    throw new Error(`Invalid JSON: ${error.message}${position ? ` (character ${position})` : ''}. Nothing was reformatted.`);
  }
  const shape = Array.isArray(value) ? `array of ${value.length} item(s)` : value && typeof value === 'object'
    ? `object with ${Object.keys(value).length} key(s): ${Object.keys(value).slice(0, 12).join(', ')}` : `a single ${typeof value}`;
  const formatted = JSON.stringify(value, null, 2);
  return { valid: true, shape, keys: value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [], formatted, bytes: new TextEncoder().encode(text).length };
}

/* ------------------------------------------------------------------ 5. diff */

export function diffLines(before, after) {
  const a = String(before ?? '').replace(/\r\n/g, '\n').split('\n');
  const b = String(after ?? '').replace(/\r\n/g, '\n').split('\n');
  // Longest-common-subsequence diff. Inputs are capped by the caller, so an
  // O(n·m) table stays small and the result is exact rather than a heuristic.
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0, j = 0, added = 0, removed = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lines.push(`  ${a[i]}`); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) { lines.push(`− ${a[i]}`); removed += 1; i += 1; }
    else { lines.push(`+ ${b[j]}`); added += 1; j += 1; }
  }
  while (i < a.length) { lines.push(`− ${a[i]}`); removed += 1; i += 1; }
  while (j < b.length) { lines.push(`+ ${b[j]}`); added += 1; j += 1; }
  return { lines, added, removed, unchanged: lines.length - added - removed };
}

/* ------------------------------------------------------------------- 6. CSV */

export function summariseCsv(source) {
  const rows = String(source || '').trim().split(/\r?\n/).filter(line => line.trim()).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
  if (rows.length < 2) throw new Error('A CSV needs a header row and at least one data row.');
  const header = rows[0];
  const body = rows.slice(1);
  const columns = header.map((name, index) => {
    const values = body.map(row => row[index] ?? '');
    const numeric = values.map(value => Number(value.replace(/[%$,]/g, ''))).filter(value => Number.isFinite(value) && value !== '' && value !== 0 || value === 0);
    const isNumeric = numeric.length === values.length && values.length > 0;
    return {
      name,
      index,
      numeric: isNumeric,
      ...(isNumeric ? {
        sum: round(numeric.reduce((total, value) => total + value, 0), 4),
        min: round(Math.min(...numeric), 4),
        max: round(Math.max(...numeric), 4),
        mean: round(numeric.reduce((total, value) => total + value, 0) / numeric.length, 4)
      } : { distinct: new Set(values).size })
    };
  });
  return { rows: body.length, columns, header, sample: body.slice(0, 3) };
}

/* -------------------------------------------------------------- 7. contrast */

function hexToRgb(hex) {
  const value = clean(hex).replace(/^#/, '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`“${hex}” is not a hex colour like #1a2b3c.`);
  return [0, 2, 4].map(offset => parseInt(full.slice(offset, offset + 2), 16));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(channel => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const a = luminance(hexToRgb(hexA)), b = luminance(hexToRgb(hexB));
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const rounded = round(ratio, 2);
  const verdict = ratio >= 7 ? 'passes AAA for normal text'
    : ratio >= 4.5 ? 'passes AA for normal text'
      : ratio >= 3 ? 'passes AA only for large text (18.66px bold or 24px+)'
        : 'fails AA — do not use this pair for body text';
  return { ratio: rounded, verdict, summary: `Contrast ${hexA} on ${hexB} = ${rounded}:1 — ${verdict}.` };
}

/* ------------------------------------------------------------- 8. code audit */

const AUDIT_RULES = [
  { id: 'html-lang', languages: ['html'], severity: 'high', test: text => /<html(?![^>]*\blang=)/i.test(text), message: 'The <html> element has no lang attribute, so screen readers guess the pronunciation.' },
  { id: 'viewport', languages: ['html'], severity: 'medium', test: text => /<meta/i.test(text) && !/name=["']viewport["']/i.test(text), message: 'No viewport meta tag: the page will render at desktop width on phones.' },
  { id: 'img-alt', languages: ['html'], severity: 'high', test: text => /<img\b(?![^>]*\balt=)/i.test(text), message: 'An <img> has no alt attribute. Decorative images need alt="" explicitly.' },
  { id: 'button-type', languages: ['html'], severity: 'medium', test: text => /<button\b(?![^>]*\btype=)/i.test(text), message: 'A <button> without type="button" submits the nearest form by default.' },
  { id: 'target-blank', languages: ['html'], severity: 'high', test: text => /target=["']_blank["']/i.test(text) && !/rel=["'][^"']*noopener/i.test(text), message: 'target="_blank" without rel="noopener" gives the opened page window.opener access.' },
  { id: 'inline-handler', languages: ['html'], severity: 'medium', test: text => /\son[a-z]+\s*=/i.test(text), message: 'Inline on* handlers cannot be restricted by CSP. Move them into a module.' },
  { id: 'inline-style', languages: ['html'], severity: 'low', test: text => /<style\b/i.test(text), message: 'A <style> block bypasses an external stylesheet policy and cannot be cached separately.' },
  { id: 'no-doctype', languages: ['html'], severity: 'medium', test: text => !/^\s*<!doctype html>/i.test(text), message: 'No <!doctype html> at the top: the browser falls back to quirks mode.' },
  { id: 'important', languages: ['css'], severity: 'medium', test: text => (text.match(/!important/g) || []).length > 2, message: 'More than two !important declarations usually means a specificity problem being papered over.' },
  { id: 'fixed-width', languages: ['css'], severity: 'low', test: text => /\bwidth:\s*\d{4,}px/i.test(text), message: 'A four-digit fixed pixel width will overflow small screens.' },
  { id: 'outline-none', languages: ['css'], severity: 'high', test: text => /outline:\s*none/i.test(text) && !/:focus-visible/i.test(text), message: 'outline: none with no :focus-visible replacement removes the keyboard focus indicator.' },
  { id: 'eval', languages: ['javascript'], severity: 'high', test: text => /\beval\s*\(|\bnew Function\s*\(/.test(text), message: 'eval/new Function execute arbitrary text and break CSP.' },
  { id: 'innerhtml', languages: ['javascript'], severity: 'medium', test: text => /\.innerHTML\s*=/.test(text), message: 'Assigning innerHTML with user data is the classic XSS sink. Use textContent or a builder.' },
  { id: 'console', languages: ['javascript'], severity: 'low', test: text => /\bconsole\.(log|debug)\s*\(/.test(text), message: 'console.log left in shipped code leaks internal state and noise.' },
  { id: 'http-url', languages: ['javascript', 'html', 'css'], severity: 'high', test: text => /(?:src|href|url|fetch\()\s*\(?\s*["']http:\/\//i.test(text), message: 'A plain http:// resource is blocked or downgraded by mixed-content rules. Use https.' },
  { id: 'await-loop', languages: ['javascript'], severity: 'low', test: text => /for\s*\([^)]*\)\s*\{[^}]*\bawait\b/.test(text), message: 'Awaiting inside a loop serialises requests. Promise.all is usually what was meant.' },
  { id: 'sql-concat', languages: ['javascript'], severity: 'high', test: text => /(?:query|execute)\s*\(\s*["'`][^"'`]*\$\{|(?:query|execute)\s*\(\s*["'`][^"'`]*["'`]\s*\+/i.test(text), message: 'SQL built by string interpolation is an injection risk. Use parameters.' }
];

export function detectLanguage(code) {
  const text = String(code || '');
  if (/^\s*<!doctype html>|<\/html>/i.test(text)) return 'html';
  if (/^\s*[.#@][\w-]+\s*\{|:\s*[a-z-]+\s*;/.test(text) && !/\bfunction\b|\bconst\b/.test(text)) return 'css';
  if (/\b(function|const|let|=>|import|export)\b/.test(text)) return 'javascript';
  return 'text';
}

export function auditCode(code, language) {
  const text = String(code || '');
  const lang = clean(language).toLowerCase() === 'text' ? detectLanguage(text) : clean(language).toLowerCase();
  const rules = AUDIT_RULES.filter(rule => rule.languages.includes(lang));
  if (!rules.length) throw new Error(`I audit html, css and javascript snippets. “${lang}” is not one of them.`);
  const findings = rules.filter(rule => rule.test(text)).map(rule => ({ id: rule.id, severity: rule.severity, message: rule.message }));
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    language: lang,
    checked: rules.length,
    findings,
    note: findings.length
      ? `${findings.length} of ${rules.length} checks matched. These are deterministic pattern checks, not a security review: they cannot see your data flow.`
      : `No pattern matched in ${rules.length} checks. That is not proof the ${lang} is correct — only that these specific patterns are absent.`
  };
}

/* ------------------------------------------------- plan integration (agent) */

const TOOL_STEPS = [
  {
    id: 'datetime', label: 'Clock and date maths', kind: 'local',
    detail: 'Current time in a named place, day counts between ISO dates, and adding days/weeks/months.',
    match: text => /\b(?:time|clock)\s+in\s+[a-z ]{2,20}$/i.test(text) || /\bdays?\s+between\b/i.test(text) || /\badd\s+\d+\s+(?:days?|weeks?|months?|years?)\s+to\b/i.test(text),
    async run(text) {
      const city = /(?:time|clock)\s+in\s+([a-z ]{2,20})$/i.exec(text);
      if (city) return { observation: timeIn(city[1]) };
      const span = /(\d{4}-\d{2}-\d{2})\s+(?:and|to|-)\s+(\d{4}-\d{2}-\d{2})/i.exec(text);
      if (/\bdays?\s+between\b/i.test(text) && span) return { observation: daysBetween(span[1], span[2]) };
      const add = /add\s+(\d+)\s+(days?|weeks?|months?|years?)\s+to\s+(\d{4}-\d{2}-\d{2})/i.exec(text);
      if (add) return { observation: addToDate(add[3], add[1], add[2]) };
      throw new Error('Say it as “time in Tokyo”, “days between 2026-01-01 and 2026-03-01” or “add 30 days to 2026-01-31”.');
    }
  },
  {
    id: 'units', label: 'Unit conversion', kind: 'local',
    detail: 'Length, mass, volume, data size and speed, plus Celsius/Fahrenheit/Kelvin.',
    match: text => /\bconvert\s+/i.test(text) || /\bhow many\b[^?]*\b(?:in|is)\b/i.test(text),
    async run(text) {
      const pattern = /(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*(°?[a-z/]{1,12})\s+(?:in|to|into|as)\s+(°?[a-z/]{1,12})\b/i;
      const match = pattern.exec(text);
      if (!match) throw new Error('Say it as “convert 10 km to miles” or “convert 98.6 f to c”.');
      const [, amount, from, to] = match;
      if (/^°?[cfk]$|celsius|fahrenheit|kelvin/i.test(from.replace('°', '')) || /^°?[cfk]$|celsius|fahrenheit|kelvin/i.test(to.replace('°', ''))) {
        return { observation: convertTemperature(amount, from.replace('°', ''), to.replace('°', '')) };
      }
      return { observation: convertUnits(amount, from, to) };
    }
  },
  {
    id: 'json', label: 'JSON inspector', kind: 'local',
    detail: 'Validates a JSON document, reports its shape and returns it formatted.',
    match: text => /\bjson\b/i.test(text) && /[{[]/.test(text),
    async run(text) {
      const start = Math.min(...[text.indexOf('{'), text.indexOf('[')].filter(index => index >= 0));
      const source = text.slice(start);
      const report = inspectJson(source);
      return { observation: `Valid JSON — ${report.shape} (${report.bytes} bytes).\n${report.formatted.slice(0, 1200)}` };
    }
  },
  {
    id: 'hash', label: 'Hashes and IDs', kind: 'local',
    detail: 'SHA-256/1/384/512 of a string, random UUIDs and Base64 encode/decode.',
    match: text => /\b(sha-?(?:1|256|384|512)|uuid|base64)\b/i.test(text),
    async run(text) {
      if (/\buuid\b/i.test(text)) return { observation: `New UUID v4: ${uuid()} (generated locally, not stored).` };
      const b64 = /base64\s*(encode|decode)?\s*(?:of|:)?\s*["']?(.+?)["']?$/i.exec(text);
      if (b64 && !/sha-?/i.test(text)) return { observation: base64(b64[2].trim(), b64[1] || 'encode') };
      const sha = /(sha-?(?:1|256|384|512))\s*(?:of|for|:)?\s*["']?(.+?)["']?$/i.exec(text);
      if (!sha) throw new Error('Say it as “sha256 of hello” or “uuid”.');
      const value = await hashText(sha[1].replace('-', ''), sha[2].trim());
      return { observation: `${sha[1].toUpperCase()}("${sha[2].trim()}")\n${value}` };
    }
  },
  {
    id: 'contrast', label: 'Colour contrast', kind: 'local',
    detail: 'WCAG contrast ratio and AA/AAA verdict for two hex colours.',
    match: text => /contrast|wcag/i.test(text) && (text.match(/#[0-9a-f]{3,6}\b/gi) || []).length >= 2,
    async run(text) {
      const colours = text.match(/#[0-9a-f]{3,6}\b/gi) || [];
      const result = contrastRatio(colours[0], colours[1]);
      return { observation: `${result.summary}\nWCAG 2.2: normal text needs 4.5:1 (AA) or 7:1 (AAA); large text needs 3:1 (AA).` };
    }
  },
  {
    id: 'csv', label: 'CSV summariser', kind: 'local',
    detail: 'Parses a CSV, names the columns and sums/min/maxes the numeric ones.',
    match: text => /\bcsv\b/i.test(text) && text.includes(','),
    async run(text) {
      const start = text.search(/\n|\r/);
      const source = start >= 0 ? text.slice(start + 1) : '';
      const report = summariseCsv(source);
      const lines = report.columns.map(column => column.numeric
        ? `• ${column.name}: numeric — sum ${column.sum}, min ${column.min}, max ${column.max}, mean ${column.mean}`
        : `• ${column.name}: text — ${column.distinct} distinct value(s)`);
      return { observation: `${report.rows} data row(s), ${report.columns.length} column(s).\n${lines.join('\n')}` };
    }
  },
  {
    id: 'audit', label: 'Web code audit', kind: 'local',
    detail: 'Deterministic HTML/CSS/JS pattern checks: accessibility, XSS sinks, CSP breaks, injection.',
    match: text => /\b(audit|review|lint|check)\b/i.test(text) && /```/.test(text),
    async run(text) {
      const fence = /```([A-Za-z0-9+#-]*)\r?\n([\s\S]*?)```/.exec(text);
      if (!fence) throw new Error('Paste the code in a fenced ``` block so I know what to audit.');
      const language = (fence[1] || '').toLowerCase();
      const result = auditCode(fence[2], ['html', 'css', 'js', 'javascript'].includes(language) ? language : 'text');
      const lines = result.findings.length
        ? result.findings.map(finding => `• [${finding.severity}] ${finding.message} (${finding.id})`).join('\n')
        : '• no rule matched';
      return { observation: `Audited ${result.language}: ${result.findings.length} finding(s) from ${result.checked} checks.\n${lines}\n${result.note}` };
    }
  },
  {
    id: 'diff', label: 'Text diff', kind: 'local',
    detail: 'Line-by-line comparison of two versions with added/removed counts.',
    match: text => /\bdiff\b/i.test(text) && /```[\s\S]*```[\s\S]*```/.test(text),
    async run(text) {
      const blocks = [...text.matchAll(/```[A-Za-z0-9+#-]*\r?\n([\s\S]*?)```/g)].map(match => match[1]);
      if (blocks.length < 2) throw new Error('Give me two fenced ``` blocks: the old version first, the new one second.');
      const result = diffLines(blocks[0], blocks[1]);
      const shown = result.lines.slice(0, 60).join('\n');
      return { observation: `${result.added} line(s) added, ${result.removed} removed, ${result.unchanged} unchanged.\n${shown}${result.lines.length > 60 ? '\n… (truncated at 60 lines)' : ''}` };
    }
  }
];

/**
 * V141: web-page generation, wired in as a tool so a chat request and the Page
 * Builder page run the identical code path. Imported lazily to avoid a cycle
 * (page-builder imports auditCode from this module).
 */
const PAGE_BUILD_HINT = /\b(?:build|make|create|generate|design)\b[^.]{0,40}\b(?:page|site|website|landing)\b/i;

async function buildPageStep(text) {
  const { buildPage, describePage } = await import('./page-builder.mjs');
  const result = buildPage(text);
  return {
    observation: `${describePage(result)}\n\nThe full HTML (${result.bytes} bytes) is available from Page Builder → Download, and in this answer's artifact.`,
    data: {
      html: result.html, bytes: result.bytes, sections: result.sections, palette: result.palette, audit: result.audit,
      artifacts: [{ language: 'html', kind: 'preview', code: result.html, bytes: result.bytes }]
    }
  };
}

TOOL_STEPS.push({
  id: 'pagebuild', label: 'Web page builder', kind: 'local',
  detail: 'Generates a complete single-file HTML page from a one-sentence brief, then audits it.',
  match: text => PAGE_BUILD_HINT.test(text) && !/```/.test(text),
  async run(text) {
    const outcome = await buildPageStep(text);
    return { observation: outcome.observation, data: outcome.data };
  }
});

/** Public catalogue — the same list the runtime plans from and the UI renders. */
export const TOOLBOX_TOOLS = TOOL_STEPS.map(({ match, run, ...meta }) => meta);

/** Returns a plan step when a toolbox tool matches, so agent-runtime can append it. */
export function planFromToolbox(text) {
  const prompt = String(text || '');
  return TOOL_STEPS
    .filter(tool => {
      try { return Boolean(tool.match(prompt)); } catch { return false; }
    })
    .slice(0, 3)
    .map(tool => ({
      id: tool.id,
      title: `Run the ${tool.label.toLowerCase()}`,
      tool: tool.id,
      run: () => tool.run(prompt)
    }));
}
