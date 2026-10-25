// Стресс-тест авто-трекинга: сколько раз трекер останавливается и просит поставить точку.
//   node tools/autotrack-stress.mjs /tmp/hard30.mp4      (видео из make_test_video.py)
// При каждой остановке тест «тапает» по истинному положению мяча и продолжает, как сделал бы ученик.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PUPPETEER_PATH || import.meta.url);
const puppeteer = require('puppeteer-core');

const videoPath = process.argv[2];
const truth = JSON.parse(fs.readFileSync(videoPath + '.json', 'utf8'));
const URL_ = process.env.APP_URL || 'http://localhost:8765/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(URL_, { waitUntil: 'networkidle0' });
await (await page.$('#fileInput')).uploadFile(videoPath);
await page.waitForFunction(() => /\d+ (frames|fotogramas)/.test(document.querySelector('#videoInfo').textContent), { timeout: 20000 });

const f0 = Math.ceil(truth.lead * truth.fps - 1e-9);
const f1 = Math.floor((truth.lead + truth.flight) * truth.fps - 1e-9);
await page.evaluate((f0, f1) => {
  const s = window.__app.state;
  s.start = f0; s.end = f1;
  s.cal.scale = { a: { x: 140, y: 660 }, b: { x: 640, y: 660 }, length: 1 };
  s.cal.axes = { origin: { x: 140, y: 600 }, angle: 0, flipY: false };
}, f0, f1);
await page.click('#nextBtn');
await page.click('#nextBtn');
await page.click('#modeTabs [data-mode="auto"]');
// Рамка — чуть больше мяча (диаметр 44 пикс видео), как подобрал бы ученик.
await page.evaluate(() => {
  const b = document.querySelector('#boxSize');
  b.value = 60;
  b.dispatchEvent(new Event('input', { bubbles: true }));
});

async function tapTruth(f) {
  await page.evaluate(f => window.__app.goto(f), f);
  await page.waitForFunction(() => !window.__app.video.busy);
  const s = await page.evaluate(p => {
    const a = window.__app, r = a.viewer.canvas.getBoundingClientRect(), q = a.viewer.toScreen(p);
    return { x: r.left + q.x, y: r.top + q.y };
  }, truth.frames[f]);
  // TAP_OFFSET=dx,dy — неточный тап (в пикселях видео); иначе точная стартовая точка, как после лупы.
  const off = (process.env.TAP_OFFSET || '').split(',').map(Number);
  if (off.length === 2) {
    await page.evaluate((f, p) => window.__app.state.points.set(f, p), f, { x: truth.frames[f].x + off[0], y: truth.frames[f].y + off[1] });
  } else {
    await page.touchscreen.tap(s.x, s.y);
    await page.evaluate((f, p) => window.__app.state.points.set(f, { x: p.x, y: p.y }), f, truth.frames[f]);
  }
}

await page.evaluate(() => { window.__trackLog = []; });
let stops = 0;
const t0 = Date.now();
await tapTruth(f0);
for (;;) {
  await page.click('#autoRun');
  await page.waitForFunction(() => /Done|Lost|Concluído|perdeu/.test(document.querySelector('#autoStatus').textContent), { timeout: 120000 });
  const st = await page.$eval('#autoStatus', e => e.textContent);
  if (/Done|Concluído/.test(st)) break;
  stops++;
  const cur = await page.evaluate(() => window.__app.video.current);
  console.log(`  остановка на кадре ${cur}`);
  if (stops > 30) break;
  await tapTruth(cur);
}
const secs = (Date.now() - t0) / 1000;
const res = await page.evaluate(frames => {
  const a = window.__app;
  let max = 0, sum = 0, n = 0;
  for (const [f, p] of a.state.points) {
    if (f < a.state.start || f > a.state.end) continue;
    const e = Math.hypot(p.x - frames[f].x, p.y - frames[f].y);
    max = Math.max(max, e); sum += e; n++;
  }
  return { n, max, mean: sum / n };
}, truth.frames);
await page.click('#nextBtn');
await new Promise(r => setTimeout(r, 400));
await page.click('#smoothTabs [data-smooth="light"]');
const ay = await page.evaluate(() => {
  const v = window.__app.resultsSeries().ay.filter(x => x != null);
  return v.reduce((a, b) => a + b, 0) / v.length;
});
console.log(`Остановок: ${stops}; точек ${res.n} из ${f1 - f0 + 1}; ошибка средн. ${res.mean.toFixed(2)} / макс. ${res.max.toFixed(1)} пикс; ay = ${ay.toFixed(2)} м/с²; ${secs.toFixed(1)} с`);
if (process.env.LOG) {
  const log = await page.evaluate(() => window.__trackLog);
  for (const e of log) {
    if (e.init) continue;
    const tr = truth.frames[e.f];
    console.log(`  f${e.f} ${e.how || "-"} col=${e.col} mo=${e.mo} score=${e.score} fx=${e.fx} R=${e.R} known=${e.known} miss=${e.miss} err=${e.x == null ? '-' : Math.hypot(e.x - tr.x, e.y - tr.y).toFixed(1)} predErr=${Math.hypot(e.px - tr.x, e.py - tr.y).toFixed(1)}`);
  }
}
await browser.close();
