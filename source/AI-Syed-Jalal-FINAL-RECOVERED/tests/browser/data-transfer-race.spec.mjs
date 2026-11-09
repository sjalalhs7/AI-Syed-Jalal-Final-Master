import { test, expect } from '@playwright/test';

test('a slow edit read cannot replace a newer editor or reopen after Add', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/jalalai.html');await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#data');
  await expect(page.locator('#settingsUser')).toContainText('Admin');
  const first='SLOW-'+crypto.randomUUID(),second='FAST-'+crypto.randomUUID();
  await page.evaluate(async ({first,second})=>{
    const me=await fetch('/api/me').then(r=>r.json());
    for(const [id,name] of [[first,'Slow record'],[second,'Newer record']]){
      const r=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken},body:JSON.stringify({id,name})});
      if(!r.ok)throw new Error('Test record creation failed');
    }
  },{first,second});
  await page.reload();
  const gates=Array.from({length:2},()=>{let start,release,done;return {started:new Promise(r=>start=r),hold:new Promise(r=>release=r),finished:new Promise(r=>done=r),start:()=>start(),release:()=>release(),done:()=>done()}});
  let calls=0;
  await page.route(url=>url.pathname==='/api/records/'+first,async route=>{
    const gate=gates[calls++];const response=await route.fetch();gate.start();await gate.hold;
    try{await route.fulfill({response})}finally{gate.done()}
  });
  try{
    const slow=page.locator('#dataBody tr').filter({hasText:first}).getByRole('button',{name:'Edit'});
    const fast=page.locator('#dataBody tr').filter({hasText:second}).getByRole('button',{name:'Edit'});
    await slow.click();await gates[0].started;
    await fast.click();await expect(page.locator('#fName')).toHaveValue('Newer record');
    gates[0].release();await gates[0].finished;
    await expect(page.locator('#fName')).toHaveValue('Newer record');
    await page.locator('#closeModal').click();
    await slow.click();await gates[1].started;
    await page.locator('#addBtn').click();await expect(page.locator('#modalTitle')).toHaveText('Add record');
    gates[1].release();await gates[1].finished;
    await expect(page.locator('#modalTitle')).toHaveText('Add record');
    await expect(page.locator('#fName')).toHaveValue('');
  }finally{gates.forEach(gate=>gate.release())}
});

test('a stale records response cannot replace the latest unavailable state', async ({ page }) => {
  await page.goto('/jalalai.html'); await page.locator('#demoBtn').click();
  await expect(page.locator('#connectionStatus')).toContainText('Connected');
  await page.goto('/workspace.html#data');
  await expect(page.locator('#settingsUser')).toContainText('Admin');
  let release, signalFirst, signalDone;
  const first = new Promise(resolve => {signalFirst=resolve});
  const held = new Promise(resolve => {release=resolve});
  const done = new Promise(resolve => {signalDone=resolve});
  await page.route(url => url.pathname==='/api/records', async route => {
    const query=new URL(route.request().url()).searchParams.get('q');
    if(query==='old'){
      signalFirst(); await held;
      try{return await route.fulfill({json:{records:[{id:'OLD',name:'Old response',region:'',sector:'',status:'Active'}],total:1,page:1,pages:1}})}finally{signalDone()}
    }
    if(query==='new')return route.fulfill({status:503,json:{error:'Temporary outage'}});
    return route.continue();
  });
  try{
    await page.locator('#search').fill('old');await first;
    await page.locator('#search').fill('new');
    await expect(page.locator('#dataBody')).toContainText('Central records are unavailable');
  }finally{release()}
  await done;
  await expect(page.locator('#dataBody')).toContainText('Central records are unavailable');
  await expect(page.locator('#dataBody')).not.toContainText('Old response');
  await expect(page.locator('#pageInfo')).toHaveText('Central records unavailable');
});
