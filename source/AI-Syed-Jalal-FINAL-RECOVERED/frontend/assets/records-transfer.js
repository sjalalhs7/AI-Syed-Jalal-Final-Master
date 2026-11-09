// Shared, bounded records-transfer helpers. JSON retains exported values;
// CSV deliberately prefixes formula-like cells to reduce spreadsheet risk.
export const RECORD_FIELDS = Object.freeze(['id', 'name', 'region', 'sector', 'status', 'notes']);
export const MAX_TRANSFER_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_RECORDS = 5000;
export const MAX_BATCH_BYTES = 900 * 1024; // The API's body limit is 1 MiB.

/** Parse RFC-style CSV including escaped quotes and embedded CR/LF. */
export function parseRecordsCsv(input) {
  if (typeof input !== 'string') throw new Error('CSV content must be text.');
  const text = input.replace(/^\uFEFF/, '');
  const records = []; let row = [], field = '', state = 'start';
  const endField = () => { row.push(field); field = ''; state = 'start'; };
  const endRow = () => {
    const hasContent = row.length > 0 || state !== 'start' || field !== '';
    endField();
    // Completely empty physical lines are ignored; an explicitly empty quoted
    // field or a row with empty columns is still validated like any other row.
    if (hasContent) records.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') state = 'closed';
      else field += char;
      continue;
    }
    if (char === ',' ) { endField(); continue; }
    if (char === '\r' || char === '\n') {
      endRow(); if (char === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    if (state === 'closed') throw new Error('CSV has unexpected text after a closing quote.');
    if (char === '"') {
      if (state !== 'start') throw new Error('CSV has an unexpected quote inside a field.');
      state = 'quoted';
    } else { field += char; state = 'unquoted'; }
  }
  if (state === 'quoted') throw new Error('CSV has an unclosed quoted field.');
  if (field || row.length || state !== 'start') endRow();
  if (!records.length) throw new Error('CSV must contain a header row.');
  const headers = records.shift().map(value => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  if (!headers.includes('name')) throw new Error('CSV must contain a name column.');
  const unknown = headers.filter(header => !RECORD_FIELDS.includes(header));
  if (unknown.length) throw new Error('CSV has unsupported columns. Use id, name, region, sector, status and notes.');
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV record ${index + 1} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

/** Validate every row before an import begins; never truncate data silently. */
export function normalizeRecords(input, { requireId = false } = {}) {
  if (!Array.isArray(input)) throw new Error('Records must be an array.');
  const seen = new Set();
  return input.map((record, index) => {
    const position = index + 1;
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Record ${position} must be an object.`);
    const value = (key, limit, fallback = '') => {
      const raw = record[key];
      if (raw == null) return fallback;
      if (!['string', 'number', 'boolean'].includes(typeof raw) || (typeof raw === 'number' && !Number.isFinite(raw))) {
        throw new Error(`Record ${position}: ${key} must be text, a number or a boolean.`);
      }
      const result = String(raw);
      if (result.includes('\0') || (result.isWellFormed && !result.isWellFormed())) throw new Error(`Record ${position}: ${key} contains invalid text.`);
      if (result.length > limit) throw new Error(`Record ${position}: ${key} exceeds ${limit} characters.`);
      return result;
    };
    const id = value('id', 200), name = value('name', 500);
    if ((requireId && !id) || (id && !id.trim())) throw new Error(`Record ${position} requires an id.`);
    if (!name.trim()) throw new Error(`Record ${position} requires a name.`);
    if (id && seen.has(id)) throw new Error(`Record ${position} repeats an id. This batch was not applied.`);
    if (id) seen.add(id);
    return { id, name, region: value('region', 200), sector: value('sector', 200), status: value('status', 100, 'Active'), notes: value('notes', 10000) };
  });
}

/** Validate a partial record update without replacing omitted or null fields. */
export function normalizeRecordPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Record update must be an object.');
  const fields = RECORD_FIELDS.filter(key => key !== 'id');
  const supplied = Object.fromEntries(fields.filter(key => Object.hasOwn(patch, key) && patch[key] != null).map(key => [key, patch[key]]));
  // A name is mandatory only when it is being changed. The temporary name is
  // never returned or written for an update that leaves the name untouched.
  const row = normalizeRecords([{ name:'validation placeholder', ...supplied }])[0];
  return Object.fromEntries(fields.map(key => [key, Object.hasOwn(supplied, key) ? row[key] : null]));
}

/** Validate the export envelope and warn if this UI cannot merge its records. */
export function prepareRecordsExport(payload) {
  if (payload?.format !== 'alsyed-jalal-backup' || payload.version !== 1 || !Array.isArray(payload.records) ||
      typeof payload.exportedAt !== 'string' || !Number.isFinite(Date.parse(payload.exportedAt))) {
    throw new Error('The server did not return a valid records export. No file was downloaded.');
  }
  const raw = JSON.stringify(payload, null, 2);
  const bytes = new TextEncoder().encode(raw).byteLength;
  let warning = '';
  if (bytes > MAX_TRANSFER_FILE_BYTES) warning = 'This file exceeds 20 MiB and cannot be merged in this UI.';
  else {
    try { normalizeRecords(payload.records, { requireId: true }); }
    catch (error) { warning = 'This file contains values that cannot be merged in this UI. ' + error.message; }
  }
  return { raw, warning };
}

/** CSV changes formula-like values to reduce risk. No spreadsheet guarantee; use JSON for exact values. */
export function recordsToCsv(records) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\t\r\n]/.test(text) || /^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [RECORD_FIELDS.join(','), ...records.map(record => RECORD_FIELDS.map(key => cell(record?.[key])).join(','))].join('\r\n');
}

/** Split before writing so every JSON body is below the server's request limit. */
export function recordBatches(records, extra = {}, { maxRows = MAX_BATCH_RECORDS, maxBytes = MAX_BATCH_BYTES } = {}) {
  if (!Array.isArray(records) || !Number.isInteger(maxRows) || maxRows < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid records batch settings.');
  const encoder = new TextEncoder();
  const wrapper = encoder.encode(JSON.stringify({ ...extra, records: [] })).length;
  const batches = []; let current = [], size = wrapper;
  for (const record of records) {
    const bytes = encoder.encode(JSON.stringify(record)).length;
    if (wrapper + bytes > maxBytes) throw new Error('A record is too large to send safely.');
    if (current.length && (current.length >= maxRows || size + bytes + 1 > maxBytes)) {
      batches.push(current); current = []; size = wrapper;
    }
    size += bytes + (current.length ? 1 : 0); current.push(record);
  }
  if (current.length) batches.push(current);
  return batches;
}
