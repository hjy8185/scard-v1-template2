// glossary 보강이 v1 데모에 어떻게 보이는지 확인(회귀 여부 판정)
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; p.on('pageerror', e=>errs.push(e.message.slice(0,100)));
await p.goto('https://d4hcbju0vp58p.cloudfront.net/', { waitUntil:'load', timeout:60000 });
await p.waitForTimeout(2500);
const box = p.locator('textarea, input[type="text"]').first();
await box.click(); await box.fill('식음료 시장이 서울에서 얼마나 돼?'); await box.press('Enter');
for (let i=0;i<120;i++){ await p.waitForTimeout(1000);
  const s=await p.evaluate(()=>{const a=[...document.querySelectorAll('[data-role="assistant"]')];
    const t=a.map(x=>x.innerText||'').join('');
    return t.length>400 && document.querySelectorAll('.animate-pulse').length===0;});
  if (s) { await p.waitForTimeout(6000); break; } }
const r = await p.evaluate(()=>({
  u:document.querySelectorAll('[data-role="user"]').length,
  a:document.querySelectorAll('[data-role="assistant"]').length,
  len:[...document.querySelectorAll('[data-role="assistant"]')].map(x=>x.innerText||'').join('').length,
  terms:(document.body.innerText.match(/식음료|상위 혜택 카테고리/g)||[]).length,
}));
console.log('데모:', JSON.stringify(r), '| pageerror:', errs.length?errs:'none');
await p.screenshot({ path:'/tmp/v1-after-glossary.png' });
await b.close();
