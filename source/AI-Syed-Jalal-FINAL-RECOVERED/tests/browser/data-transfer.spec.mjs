import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRecordsCsv } from '../../frontend/assets/records-transfer.js';

async function workspace(page, view = 'data') {
  await page.goto('/jalalai.html');
  await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#' + view);
  await expect(page.locator('#view-' + view)).toHaveClass(/active/);
  await expect(page.locator('#settingsUser')).toContainText('Admin');
}
async function api(page, path, method='GET', body) {
  return page.evaluate(async ({ path, method, body }) => {
    const me = await fetch('/api/me').then(r => r.json());
    const response = await fetch('/api' + path, { method, credentials:'include',
      headers:{ 'Content-Type':'application/json', ...(method === 'GET' ? {} : { 'X-CSRF-Token':me.csrfToken }) },
      ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    return { status:response.status, data:await response.json() };
  }, { path, method, body });
}
const file = (name, text) => ({ name, mimeType:name.endsWith('.csv') ? 'text/csv' : 'application/json', buffer:Buffer.from(text) });

test('CSV import preserves multiline values, reports overwrites and skips deleted IDs', async ({ page }) => {
  test.setTimeout(90000);
  await workspace(page);
  const prefix = 'CSV-' + crypto.randomUUID();
  for (const [id, name] of [[prefix+'-active', 'Before'], [prefix+'-deleted', 'Deleted']]) {
    expect((await api(page, '/records', 'POST', { id, name })).status).toBe(201);
  }
  expect((await api(page, '/records/'+prefix+'-deleted', 'DELETE', {})).status).toBe(200);
  const csv = `id,name,region,sector,status,notes\r\n${prefix}-active,"Updated, \"\"person\"\"",Punjab,R&D,Active,"first line\r\nsecond line"\r\n${prefix}-deleted,Should not return,,,,\r\n${prefix}-new,New,,,,"last line\nnext line"\r\n`;
  let confirmation=''; page.on('dialog', async dialog => { confirmation=dialog.message(); await dialog.accept(); });
  await page.locator('#fileInput').setInputFiles(file('records.csv', csv));
  await expect(page.locator('#dataImportStatus')).toContainText('1 new, 1 updated, 1 deleted ID(s) skipped', { timeout:30000 });
  expect(confirmation).toMatch(/overwritten.*deleted IDs are skipped/i);
  expect(confirmation).toMatch(/not a single transaction/i);
  const active = await api(page, '/records/'+prefix+'-active');
  expect(active.status).toBe(200); expect(active.data.record.name).toBe('Updated, "person"');
  expect(active.data.record.notes).toBe('first line\r\nsecond line');
  expect((await api(page, '/records/'+prefix+'-deleted')).status).toBe(404);
  expect((await api(page, '/records/'+prefix+'-new')).data.record.notes).toBe('last line\nnext line');
});

test('JSON exports exact values and CSV neutralizes spreadsheet formulas', async ({ page }) => {
  test.setTimeout(90000);
  await workspace(page);
  const id='EXPORT-'+crypto.randomUUID(), name='=SUM(1,2)', notes='first line\r\nsecond line';
  expect((await api(page, '/records', 'POST', { id, name, notes })).status).toBe(201);
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
  const json = JSON.parse(await readFile(await jsonDownload.path(), 'utf8'));
  expect(json.find(row => row.id===id)).toMatchObject({ name, notes });
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#csvBtn').click()]);
  expect(csvDownload.suggestedFilename()).toBe('al-syed-jalal-formula-guarded.csv');
  const csv = parseRecordsCsv(await readFile(await csvDownload.path(), 'utf8'));
  expect(csv.find(row => row.id===id)).toMatchObject({ name:"'=SUM(1,2)", notes });
  await expect(page.locator('#view-data')).toContainText('CSV prefixes formula-like cells');
});

test('records export refuses an unverifiable total instead of downloading an empty file', async ({ page }) => {
  await workspace(page);
  let downloads=0;page.on('download',()=>downloads++);
  await page.route('**/api/records?**',route=>route.fulfill({json:{records:[],total:null,page:1,pages:1}}));
  await page.locator('#exportBtn').click();
  await expect(page.locator('#toast')).toContainText('could not be verified');
  expect(downloads).toBe(0);
});

test('records backup refuses malformed responses and warns about unmergeable values', async ({ page }) => {
  await workspace(page);
  let requests=0,downloads=0;
  page.on('download',()=>downloads++);
  await page.route('**/api/backup',route=>{
    requests++;
    return route.fulfill({json:requests===1?{records:'unavailable'}:{format:'alsyed-jalal-backup',version:1,exportedAt:'2026-01-01T00:00:00Z',records:[{id:'INVALID',name:''}]}});
  });
  await page.locator('#backupBtn').click();
  await expect(page.locator('#dataImportStatus')).toContainText('No file was downloaded');
  expect(downloads).toBe(0);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#backupBtn').click()]);
  expect(JSON.parse(await readFile(await download.path(),'utf8')).records[0].id).toBe('INVALID');
  await expect(page.locator('#dataImportStatus')).toContainText('cannot be merged');
  await expect(page.locator('#dataImportStatus')).toContainText('not a full database backup');
});

test('malformed files and a cancelled import do not send record changes', async ({ page }) => {
  await workspace(page);
  let posts=0; page.on('request', request => { if(request.method()==='POST' && request.url().includes('/api/records/bulk'))posts++; });
  await page.locator('#fileInput').setInputFiles(file('broken.csv', 'id,name,notes\nA,"unclosed'));
  await expect(page.locator('#dataImportStatus')).toContainText('Import not started');
  await expect(page.locator('#dataImportStatus')).toContainText('unclosed');
  expect(posts).toBe(0);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#fileInput').setInputFiles(file('cancel.csv', 'id,name\nCANCEL,Example'));
  await expect(page.locator('#dataImportStatus')).toContainText('cancelled; no records were changed');
  expect(posts).toBe(0);
  await expect(page.locator('#importBtn')).toBeEnabled();
});

test('a lost second batch is reported as uncertain and is never automatically retried', async ({ page }) => {
  test.setTimeout(90000);
  await workspace(page);
  let calls=0,firstCount=0;
  await page.route('**/api/records/bulk', route => {
    calls++;
    if(calls===1){ firstCount=route.request().postDataJSON().records.length; return route.fulfill({json:{inserted:firstCount,updated:0,skipped:0,skippedDeleted:0}}); }
    return route.abort('failed');
  });
  page.once('dialog', dialog => dialog.accept());
  const records=Array.from({length:100},(_,i)=>({id:'MOCK-'+i,name:'Test',notes:'a'.repeat(10000)}));
  await page.locator('#fileInput').setInputFiles(file('large.json',JSON.stringify(records)));
  await expect(page.locator('#dataImportStatus')).toContainText('current batch may have been applied', {timeout:30000});
  await expect(page.locator('#dataImportStatus')).toContainText(`after ${firstCount} confirmed input(s)`);
  expect(firstCount).toBeGreaterThan(0); expect(firstCount).toBeLessThan(100); expect(calls).toBe(2);
  await expect(page.locator('#importBtn')).toBeEnabled();
});

test('record merge skips deletions by default and requires an explicit choice to reactivate them', async ({ page }) => {
  test.setTimeout(90000);
  await workspace(page, 'operations');
  const id='RESTORE-'+crypto.randomUUID();
  expect((await api(page, '/records', 'POST', { id, name:'Original' })).status).toBe(201);
  expect((await api(page, '/records/'+id, 'DELETE', {})).status).toBe(200);
  const backup={ format:'alsyed-jalal-backup',version:1,records:[{ id,name:'From export' }] };
  let message=''; page.on('dialog', async dialog => { message=dialog.message(); await dialog.accept(); });
  await page.locator('#opsRestoreFile').setInputFiles(file('backup.json',JSON.stringify(backup)));
  await expect(page.locator('#opsRestoreStatus')).toContainText('0 applied, 1 deleted ID(s) skipped', {timeout:30000});
  expect(message).toContain('deleted records will be skipped');
  expect((await api(page, '/records/'+id)).status).toBe(404);
  await page.locator('#opsRestoreDeleted').check();
  await page.locator('#opsRestoreFile').setInputFiles(file('backup.json',JSON.stringify(backup)));
  await expect(page.locator('#opsRestoreStatus')).toContainText('1 applied, 0 deleted ID(s) skipped', {timeout:30000});
  expect(message).toContain('WILL be reactivated');
  expect((await api(page, '/records/'+id)).data.record.name).toBe('From export');
  await expect(page.locator('#opsRestoreDeleted')).not.toBeChecked();
});

test('Data Vault paginates 201 matching records and exports all pages', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  const prefix='PAGE-'+crypto.randomUUID();
  const records=Array.from({length:201},(_,i)=>({id:prefix+'-'+String(i).padStart(3,'0'),name:'Pagination example'}));
  const inserted=await api(page,'/records/bulk','POST',{records});
  expect(inserted.status).toBe(200);expect(inserted.data.inserted).toBe(201);
  await page.locator('#search').fill(prefix);
  await expect(page.locator('#pageInfo')).toHaveText('201 records · page 1/3');
  await expect(page.locator('#dataBody tr')).toHaveCount(100);
  await expect(page.locator('#prevPage')).toBeDisabled();
  await page.locator('#nextPage').click();
  await expect(page.locator('#pageInfo')).toHaveText('201 records · page 2/3');
  await expect(page.locator('#dataBody tr')).toHaveCount(100);
  await page.locator('#nextPage').click();
  await expect(page.locator('#pageInfo')).toHaveText('201 records · page 3/3');
  await expect(page.locator('#dataBody tr')).toHaveCount(1);
  await expect(page.locator('#dataBody')).toContainText(prefix+'-200');
  await expect(page.locator('#nextPage')).toBeDisabled();
  await page.locator('#prevPage').click();
  await expect(page.locator('#pageInfo')).toHaveText('201 records · page 2/3');
  // The open floating chat must not hide page controls on a phone-sized screen.
  await page.setViewportSize({width:390,height:844});
  await page.locator('#nextPage').click();
  await expect(page.locator('#pageInfo')).toHaveText('201 records · page 3/3');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportBtn').click()]);
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(exported.filter(row=>row.id.startsWith(prefix))).toHaveLength(201);
});

test.describe('Data Operator permissions', () => {
  // Include browser-context setup, which can be slow after rendering 201 rows
  // in a cold PGlite/Chromium sandbox.
  test.describe.configure({ timeout:150000 });
  test('Data Operators see edit without delete, and record text cannot inject markup', async ({ page }) => {
    await workspace(page);
    const username='operator-'+crypto.randomUUID().slice(0,8),password='Local-Only-Password123';
    expect((await api(page,'/admin/users','POST',{username,password,role:'Data Operator'})).status).toBe(201);
    expect((await api(page,'/auth/logout','POST',{})).status).toBe(200);
    const login=await api(page,'/auth/login','POST',{username,password});
    expect(login.status).toBe(200);expect(login.data.user.role).toBe('Data Operator');
    expect((await api(page,'/me')).data.user.role).toBe('Data Operator');
    const id='ROLE-'+crypto.randomUUID(),name='<img src=x onerror="window.transferInjection=true">';
    expect((await api(page,'/records','POST',{id,name})).status).toBe(201);
    await page.reload();
    await expect(page.locator('#settingsUser')).toContainText('Data Operator');
    const row=page.locator('#dataBody tr').filter({hasText:id});
    await expect(row).toContainText(name);
    await expect(row.locator('img')).toHaveCount(0);
    await expect(row.getByRole('button',{name:'Edit'})).toBeVisible();
    await expect(row.getByRole('button',{name:'Delete'})).toHaveCount(0);
    expect(await page.evaluate(()=>window.transferInjection)).toBeUndefined();
  });
});

test('editing another field preserves custom statuses and unchanged CRLF values', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  const original={id:'EDIT-'+crypto.randomUUID(),name:'  Preserve name  ',region:'',sector:'',status:'Special review',notes:'  first\r\nsecond  '};
  expect((await api(page,'/records','POST',original)).status).toBe(201);
  await page.reload();
  const row=page.locator('#dataBody tr').filter({hasText:original.id});
  await row.getByRole('button',{name:'Edit'}).click();
  await expect(page.locator('#fStatus')).toHaveValue(original.status);
  await expect(page.locator('#fNotes')).toHaveValue('  first\nsecond  ');
  await page.locator('#fRegion').fill('North');
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#dataImportStatus')).toContainText('Record save confirmed');
  const result=await api(page,'/records/'+original.id);
  expect(result.data.record).toMatchObject({...original,region:'North'});
});

test('an installed worker with an old transfer helper still loads the new editor helper', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:20000}).toBe(true);
  await page.evaluate(async()=>{
    // Simulate a previously installed v164 module without normalizeRecordPatch.
    const cache=await caches.open('aj-v163-media-studio');
    await cache.put('/assets/records-transfer.js?v=164',new Response('export function normalizeRecords() {}',{headers:{'Content-Type':'text/javascript'}}));
  });
  await workspace(page);
  const id='CACHE-'+crypto.randomUUID();
  expect((await api(page,'/records','POST',{id,name:'Cached helper test',region:'Old'})).status).toBe(201);
  await page.reload();
  await page.locator('#dataBody tr').filter({hasText:id}).getByRole('button',{name:'Edit'}).click();
  await page.locator('#fRegion').fill('New');
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#dataImportStatus')).toContainText('Record save confirmed');
  expect((await api(page,'/records/'+id)).data.record.region).toBe('New');
});

test('individual edits reject concurrent changes and submit only changed fields', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  const original={id:'CONCURRENT-'+crypto.randomUUID(),name:'Local test',region:'Old',notes:'Original'};
  expect((await api(page,'/records','POST',original)).status).toBe(201);
  await page.reload();
  const row=page.locator('#dataBody tr').filter({hasText:original.id});
  await row.getByRole('button',{name:'Edit'}).click();
  expect((await api(page,'/records/'+original.id,'PUT',{notes:'Updated concurrently'})).status).toBe(200);
  const payloads=[];
  page.on('request',request=>{if(request.method()==='PUT'&&request.url().endsWith('/api/records/'+original.id))payloads.push(request.postDataJSON())});
  await page.locator('#fRegion').fill('New');
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#recordFormStatus')).toContainText('your edit was not saved');
  expect((await api(page,'/records/'+original.id)).data.record).toMatchObject({region:'Old',notes:'Updated concurrently'});
  expect(payloads).toHaveLength(1);expect(payloads[0]).toMatchObject({region:'New'});
  expect(Object.keys(payloads[0]).sort()).toEqual(['expectedVersion','region']);
  expect(payloads[0].expectedVersion).toMatch(/^\d+$/);
  await page.locator('#closeModal').click();
  await row.getByRole('button',{name:'Edit'}).click();
  await expect(page.locator('#fNotes')).toHaveValue('Updated concurrently');
  await page.locator('#fRegion').fill('New');
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#dataImportStatus')).toContainText('Record save confirmed');
  expect((await api(page,'/records/'+original.id)).data.record).toMatchObject({region:'New',notes:'Updated concurrently'});
  expect(payloads).toHaveLength(2);expect(payloads[1].expectedVersion).not.toBe(payloads[0].expectedVersion);
  await page.locator('#dataBody tr').filter({hasText:original.id}).getByRole('button',{name:'Edit'}).click();
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#dataImportStatus')).toHaveText('No changes to save.');
  expect(payloads).toHaveLength(2);
});

test('central edit does not open when its row version cannot be verified', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  const id='NO-VERSION-'+crypto.randomUUID();
  expect((await api(page,'/records','POST',{id,name:'Version check'})).status).toBe(201);
  await page.reload();
  let writes=0;
  page.on('request',request=>{if(request.method()==='PUT'&&request.url().endsWith('/api/records/'+id))writes++});
  await page.route('**/api/records/'+id,route=>route.fulfill({json:{record:{id,name:'Version check',region:'',sector:'',status:'Active',notes:''}}}));
  await page.locator('#dataBody tr').filter({hasText:id}).getByRole('button',{name:'Edit'}).click();
  await expect(page.locator('#toast')).toContainText('Cannot verify this record version');
  await expect(page.locator('#modal')).toHaveClass(/hidden/);
  expect(writes).toBe(0);
});

test('local individual edits preserve newer untouched fields in one transaction', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  const id='LOCAL-'+crypto.randomUUID();
  await page.evaluate(async id=>{
    state.apiUrl='';
    const transaction=db.transaction(STORE,'readwrite');
    transaction.objectStore(STORE).add({id,name:'Local record',region:'Old',sector:'',status:'Custom',notes:'first\r\nsecond'});
    await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});
    nav('data');
  },id);
  const row=page.locator('#dataBody tr').filter({hasText:id});
  await row.getByRole('button',{name:'Edit'}).click();
  await expect(page.locator('#fNotes')).toHaveValue('first\nsecond');
  await page.evaluate(async id=>{
    const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE),get=store.get(id);
    get.onsuccess=()=>store.put({...get.result,notes:'Changed in another tab'});
    await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});
  },id);
  await page.locator('#fRegion').fill('New');
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#dataImportStatus')).toContainText('Record save confirmed');
  const saved=await page.evaluate(id=>new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}),id);
  expect(saved).toMatchObject({id,region:'New',status:'Custom',notes:'Changed in another tab'});
});

test('a lost single-record save response is uncertain and not retried automatically', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  let calls=0;
  await page.route('**/api/records',route=>{
    if(route.request().method()==='POST'){calls++;return route.abort('failed')}
    return route.continue();
  });
  await page.locator('#addBtn').click();
  await page.locator('#fName').fill('Local test name');
  await page.locator('#recordForm button[type="submit"]').click();
  await expect(page.locator('#recordFormStatus')).toContainText('Save could not be confirmed');
  await expect(page.locator('#recordFormStatus')).toContainText('before retrying');
  expect(calls).toBe(1);
  await expect(page.locator('#recordForm button[type="submit"]')).toBeEnabled();
});

test('a lost single-record deletion response is uncertain and not retried automatically', async ({ page }) => {
  test.setTimeout(120000);
  await workspace(page);
  const id='DELETE-'+crypto.randomUUID();
  expect((await api(page,'/records','POST',{id,name:'Local test'})).status).toBe(201);
  await page.reload();
  let calls=0;
  await page.route('**/api/records/**',route=>{
    if(route.request().method()==='DELETE'){calls++;return route.abort('failed')}
    return route.continue();
  });
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#dataBody tr').filter({hasText:id}).getByRole('button',{name:'Delete'}).click();
  await expect(page.locator('#dataImportStatus')).toContainText('Deletion could not be confirmed');
  await expect(page.locator('#dataImportStatus')).toContainText('before retrying');
  expect(calls).toBe(1);
  expect((await api(page,'/records/'+id)).status).toBe(200);
});

test('a lost merge response is reported as uncertain and is not retried', async ({ page }) => {
  await workspace(page, 'operations');
  let calls=0;await page.route('**/api/restore', route => {calls++;return route.abort('failed')});
  page.once('dialog',dialog=>dialog.accept());
  const backup={format:'alsyed-jalal-backup',version:1,records:[{id:'MOCK-MERGE',name:'Example'}]};
  await page.locator('#opsRestoreFile').setInputFiles(file('backup.json',JSON.stringify(backup)));
  await expect(page.locator('#opsRestoreStatus')).toContainText('current batch may have been applied');
  expect(calls).toBe(1);
  await expect(page.locator('#opsRestoreBtn')).toBeEnabled();
});

test('unavailable central records never fall back to local example records', async ({ page }) => {
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.route('**/api/records?**', route => route.fulfill({status:503,json:{error:'Temporary outage'}}));
  await page.goto('/workspace.html#data');
  await expect(page.locator('#dataBody')).toContainText('Central records are unavailable');
  await expect(page.locator('#pageInfo')).toHaveText('Central records unavailable');
  await expect(page.locator('#dataBody')).not.toContainText('Seed record');
});
