import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',workers:1,timeout:15000,globalTimeout:120000,use:{baseURL:'http://127.0.0.1:4173',headless:true},webServer:{command:'python3 -m http.server 4173 --directory frontend',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30000}});
