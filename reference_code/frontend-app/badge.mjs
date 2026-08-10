import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; p.on('pageerror', e=>errs.push(e.message.slice(0,100)));
await p.goto('https://d4hcbju0vp58p.cloudfront.net/', { waitUntil:'load', timeout:60000 });
await p.waitForTimeout(6000);
const r = await p.evaluate(()=>{
  const txt = document.body.innerText;
  const nodes = [...document.querySelectorAll('.react-flow__node')].map(n=>n.innerText.replace(/\n/g,' | '));
  return { smusCount: (txt.match(/SMUS/g)||[]).length,
           market: nodes.filter(t=>/추정매출|생활인구|시계열/.test(t)) };
});
console.log('SMUS 문구 수:', r.smusCount);
console.log('시장 노드:'); r.market.forEach(t=>console.log('  ', t));
console.log('pageerror:', errs.length?errs:'none');
await p.screenshot({ path:'/tmp/u64-badge.png' });
await b.close();
