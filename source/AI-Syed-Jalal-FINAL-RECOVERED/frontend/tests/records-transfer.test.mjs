import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecordsCsv, normalizeRecords, normalizeRecordPatch, prepareRecordsExport, recordsToCsv, recordBatches, MAX_BATCH_BYTES, MAX_TRANSFER_FILE_BYTES } from '../assets/records-transfer.js';

test('CSV preserves commas, quotes, CRLF and embedded newlines through an export/import', () => {
  const source = [{ id:'AJ-1', name:'Jalal, "Ali"', region:'Punjab', sector:'R&D', status:'Active', notes:'first line\r\nsecond, "quoted"\nlast line' }];
  const csv = recordsToCsv(source);
  assert.ok(csv.startsWith('\uFEFFid,name,region,sector,status,notes'));
  assert.deepEqual(normalizeRecords(parseRecordsCsv(csv)), source);
  assert.deepEqual(parseRecordsCsv('\uFEFFname,notes\r\n"Someone","line 1\r\nline 2"\r\n\r\n'), [{ name:'Someone', notes:'line 1\r\nline 2' }]);
});

test('CSV parser rejects malformed or lossy input before any record can be sent', () => {
  for (const text of [
    'name,notes\n"Unclosed,note', 'name,notes\n"Closed"x,note', 'name,notes\nBad"quote,note',
    'name,notes\nToo,many,fields', 'name,notes\nToo few', 'name,name\nOne,Two',
    'name,unexpected\nOne,Two', 'region\nNorth'
  ]) assert.throws(() => parseRecordsCsv(text));
  assert.throws(() => normalizeRecords(parseRecordsCsv('name\n""\n')), /requires a name/);
  assert.deepEqual(parseRecordsCsv('name,notes\nName,\n'), [{ name:'Name', notes:'' }]);
});

test('CSV prefixes formula-like fields; JSON retains exact exported values', () => {
  const rows = [
    { id:'AJ-1', name:'=HYPERLINK("https://example.invalid")', notes:' +2+2', region:'\t=1+1', status:'-1', sector:'@test' },
    { id:'AJ-2', name:"'=already literal", notes:'ordinary\nvalue' }
  ];
  const parsed = parseRecordsCsv(recordsToCsv(rows));
  assert.equal(parsed[0].name, "'=HYPERLINK(\"https://example.invalid\")");
  assert.equal(parsed[0].notes, "' +2+2");
  assert.equal(parsed[0].region, "'\t=1+1");
  assert.equal(parsed[0].status, "'-1");
  assert.equal(parsed[0].sector, "'@test");
  assert.equal(parsed[1].name, "'=already literal");
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), rows);
});

test('normalization rejects duplicate IDs, overlong fields and invalid text rather than truncating', () => {
  assert.throws(() => normalizeRecords([{ id:'one', name:'A' }, { id:'one', name:'B' }]), /repeats an id/);
  assert.throws(() => normalizeRecords([{ name:'Name', notes:'x'.repeat(10001) }]), /notes exceeds/);
  assert.throws(() => normalizeRecords([{ id:'', name:'A' }], { requireId:true }), /requires an id/);
  assert.throws(() => normalizeRecords([{ name:'A\0B' }]), /invalid text/);
  assert.throws(() => normalizeRecords([{ name:'A', region:{ private:'data' } }]), /must be text/);
  assert.throws(() => normalizeRecords([{ id:'   ', name:'A' }]), /requires an id/);
  assert.deepEqual(normalizeRecords([{ name:'  A  ', id:' id ', status:'', notes:'  keep  ' }]), [{ id:' id ', name:'  A  ', region:'', sector:'', status:'', notes:'  keep  ' }]);
});

test('record patches validate changed fields while leaving omitted or null fields untouched', () => {
  assert.deepEqual(normalizeRecordPatch({ notes:'  line\nnext  ', status:'' }), { name:null, region:null, sector:null, status:'', notes:'  line\nnext  ' });
  assert.deepEqual(normalizeRecordPatch({ name:null, region:'North' }), { name:null, region:'North', sector:null, status:null, notes:null });
  assert.throws(() => normalizeRecordPatch({ name:'   ' }), /requires a name/);
  assert.throws(() => normalizeRecordPatch({ notes:'x'.repeat(10001) }), /notes exceeds/);
  assert.throws(() => normalizeRecordPatch({ region:{ nested:'invalid' } }), /must be text/);
});

test('records exports reject invalid envelopes and warn when they cannot be merged here', () => {
  const payload = { format:'alsyed-jalal-backup', version:1, exportedAt:'2026-01-01T00:00:00Z', records:[{id:'one', name:'Name'}] };
  const prepared = prepareRecordsExport(payload);
  assert.equal(prepared.warning, '');
  assert.deepEqual(JSON.parse(prepared.raw), payload);
  assert.throws(() => prepareRecordsExport({ ...payload, records:'unavailable' }), /No file was downloaded/);
  assert.throws(() => prepareRecordsExport({ ...payload, exportedAt:'invalid' }), /No file was downloaded/);
  assert.match(prepareRecordsExport({ ...payload, records:[{id:'one',name:''}] }).warning, /cannot be merged/);
  assert.match(prepareRecordsExport({ ...payload, records:[{id:'one',name:'Name',notes:'x'.repeat(MAX_TRANSFER_FILE_BYTES)}] }).warning, /exceeds 20 MiB/);
});

test('batch planning counts UTF-8 bytes and never exceeds either server bound', () => {
  const records = Array.from({ length: 23 }, (_, i) => ({ id:String(i), name:'🚀'.repeat(20) }));
  const extra = { format:'alsyed-jalal-backup', version:1, restoreDeleted:false };
  const batches = recordBatches(records, extra, { maxRows:7, maxBytes:700 });
  assert.deepEqual(batches.flat(), records);
  assert.ok(batches.length > 1);
  for (const batch of batches) {
    assert.ok(batch.length <= 7);
    assert.ok(new TextEncoder().encode(JSON.stringify({ ...extra, records:batch })).length <= 700);
  }
  assert.throws(() => recordBatches([{ name:'too big' }], {}, { maxBytes:10 }), /too large/);
  assert.ok(MAX_BATCH_BYTES < 1024 * 1024);
});
