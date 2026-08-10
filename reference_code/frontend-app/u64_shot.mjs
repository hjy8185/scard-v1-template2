import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1500,height:1000} });
p.on('pageerror', e=>console.log('PAGEERROR', e.message.slice(0,120)));
await p.goto('https://d4hcbju0vp58p.cloudfront.net/v2', { waitUntil:'load', timeout:60000 });
await p.waitForTimeout(4000);
await p.getByTestId('x2-sample').first().click();
for (let i=0;i<120;i++){ await p.waitForTimeout(1000);
  if (await p.getByTestId('x2-trace').count()) break; }
await p.waitForTimeout(1500);
const s = await p.evaluate(()=>({
  summary: document.querySelector('[data-testid="x2-summary"]')?.innerText,
  ctx: document.querySelector('[data-testid="x2-context-bar"]')?.innerText?.slice(0,200),
  queries: document.querySelectorAll('[data-testid^="x2-query-"]').length,
  answer: (document.querySelector('[data-testid="x2-answer"]')?.innerText??'').slice(0,200),
}));
console.log(JSON.stringify(s, null, 1));
await p.screenshot({ path:'/tmp/u64-v2.png', fullPage:false });
await b.close();
