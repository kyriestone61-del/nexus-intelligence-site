import {defineConfig,devices} from '../playwright/node_modules/@playwright/test/index.mjs';
export default defineConfig({
 testDir:'.',testMatch:'*.spec.mjs',workers:1,timeout:60000,retries:0,
 reporter:[['list'],['html',{outputFolder:'report',open:'never'}]],
 projects:[{name:'desktop-chrome',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'android-chrome',use:{...devices['Pixel 7']}},{name:'iphone-safari',use:{...devices['iPhone 15 Pro']}}],
 use:{baseURL:'http://127.0.0.1:4179',screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'node qa/delivery-browser/server.mjs',cwd:'../..',url:'http://127.0.0.1:4179/qa-fixture-info',reuseExistingServer:!process.env.CI,timeout:30000}
});
