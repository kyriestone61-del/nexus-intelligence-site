import {defineConfig,devices} from '@playwright/test';

const baseURL=process.env.NEXUS_QA_BASE_URL||'https://nexus-intelligence-site.pages.dev';

export default defineConfig({
  testDir:'./tests',
  testMatch:['control-room-reconcile.spec.mjs','baseline-workflow.spec.mjs'],
  timeout:35_000,
  expect:{timeout:10_000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['list'],['html',{outputFolder:'control-room-report',open:'never'}]]:'list',
  use:{baseURL,trace:'on-first-retry',screenshot:'only-on-failure',video:'retain-on-failure',actionTimeout:10_000},
  projects:[
    {name:'desktop-chrome',use:{...devices['Desktop Chrome']}},
    {name:'android-chrome',use:{...devices['Pixel 7']}},
    {name:'ios-safari',use:{...devices['iPhone 15 Pro']}}
  ]
});
