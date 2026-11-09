import { test, expect } from '@playwright/test';

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
