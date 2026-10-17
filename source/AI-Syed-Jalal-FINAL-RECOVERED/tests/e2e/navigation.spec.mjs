import {test,expect} from '@playwright/test';
test('V38 frontend loads and primary navigation is reachable',async({page})=>{
  await page.goto('/');
  await expect(page).toHaveTitle(/Mission Command Center/);
  await expect(page.locator('#login')).toBeVisible();
  await page.locator('#demoBtn').click();
  await expect(page.locator('#app')).toBeVisible();
  for(const view of ['home','missions','agents','data','documents','operations']){
    await page.locator(`[data-nav="${view}"]`).first().click();
    await expect(page.locator(`#view-${view}`)).toHaveClass(/active/);
  }
});
