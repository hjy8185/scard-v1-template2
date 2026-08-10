// U63 최종 라이브 검증 — ①재마운트 유발 조건에서 대화 유지 ②본문 말미 citations JSON 미노출
import { chromium } from '@playwright/test';
const URL = 'https://d4hcbju0vp58p.cloudfront.net/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.keyboard.press('Escape').catch(() => {});   // 하이드레이션 전 입력 = 재마운트 유발
const box = page.locator('textarea, input[type="text"]').first();
await box.click(); await box.fill('우리 음식점 혜택이 노리는 서울 외식 시장이 얼마나 커?');
await box.press('Enter');
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const a = [...document.querySelectorAll('[data-role="assistant"]')];
    return { u: document.querySelectorAll('[data-role="user"]').length, a: a.length,
             len: (a.at(-1)?.innerText ?? '').length, txt: (a.at(-1)?.innerText ?? '') };
  });
  if (i % 5 === 0 || (s.len > 400 && i > 12)) console.log(`t=${i}s u:${s.u} a:${s.a} len:${s.len}`);
  if (s.len > 400 && i > 20) {
    const bad = /"citations"\s*:/.test(s.txt) || /```json/.test(s.txt);
    console.log(bad ? `FAIL citations JSON 노출: ...${s.txt.slice(-160)}` : 'PASS citations JSON 미노출');
    break;
  }
}
const d = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cg-chat-diag') ?? '{}'));
console.log(`diag mount:${d.mounts} msgs:${d.lastLen}/${d.maxMsgs} drops:${JSON.stringify(d.drops)}`);
console.log('pageerrors:', errs.length ? errs : 'none');
await page.screenshot({ path: '/tmp/u63-final.png' });
await browser.close();
