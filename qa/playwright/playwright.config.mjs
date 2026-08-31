import {defineConfig,devices} from '@playwright/test';

const baseURL=process.env.NEXUS_QA_BASE_URL||'https://nexusintelligence.live';

export default defineConfig({
  testDir:'./tests',
  timeout:30_000,
  expect:{timeout:7_500},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['list'],['html',{outputFolder:'playwright-report',open:'never'}]]:'list',
  use:{
    baseURL,
    trace:'on-first-retry',
    screenshot:'only-on-failure',
    video:'retain-on-failure',
    actionTimeout:10_000
  },
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}}
  ]
});
