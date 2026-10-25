// Сквозной тест в настоящем Chrome (headless) на эмуляции телефона.
//   python3 -m http.server 8765        (в корне проекта)
//   python3 tools/make_test_video.py /tmp/throw30.mp4 --fps 30
//   node tools/accuracy-test.mjs /tmp/throw30.mp4 [папка-для-скриншотов]
// Нужен puppeteer-core (npm i puppeteer-core) и Google Chrome.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PUPPETEER_PATH || import.meta.url);
const puppeteer = require('puppeteer-core');

const videoPath = process.argv[2];
const shots = process.argv[3];
const truth = JSON.parse(fs.readFileSync(videoPath + '.json', 'utf8'));
const URL_ = process.env.APP_URL || 'http://localhost:8765/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = +(process.env.WIDTH || 390);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
await page.goto(URL_, { waitUntil: 'networkidle0' });

async function shot(name) {
  if (!shots) return;
  await sleep(150);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function noHScroll(name) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check(r.sw <= r.w, `${name}: нет горизонтальной прокрутки (${r.sw} ≤ ${r.w})`);
}

await shot('1-start');
await noHScroll('Шаг 1');

// ---------- Загрузка ----------
const input = await page.$('#fileInput');
await input.uploadFile(videoPath);
await page.waitForFunction(() => document.querySelector('#videoInfo').textContent.includes('frames') ||
  document.querySelector('#videoInfo').classList.contains('error'), { timeout: 20000 });
const meta = await page.evaluate(() => {
  const v = window.__app.video;
  return { fps: v.fps, n: v.frameCount, src: v.fpsSource, w: v.width, h: v.height };
});
console.log('Видео:', meta);
check(Math.abs(meta.fps - truth.fps) < 0.01 && meta.src === 'file', `FPS определён из файла: ${meta.fps}`);
check(meta.n === truth.frames.length, `Число кадров: ${meta.n} (ожидается ${truth.frames.length})`);
await shot('1-loaded');

// ---------- Точность покадрового перехода ----------
// На каждом кадре ищем центр оранжевого мяча и сравниваем с истинным положением.
const seekErr = await page.evaluate(async frames => {
  const app = window.__app, v = app.video;
  const c = document.createElement('canvas');
  c.width = v.width; c.height = v.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  let maxErr = 0, worst = -1;
  const order = frames.map(f => f.frame);
  order.sort(() => Math.random() - 0.5); // случайный порядок — проверка перемотки назад и вперёд
  for (const n of order) {
    await v.goto(n);
    ctx.drawImage(v.el, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sx = 0, sy = 0, cnt = 0;
    for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
      const i = (y * c.width + x) * 4;
      if (d[i] > 180 && d[i + 1] < 150 && d[i + 2] < 110) { sx += x; sy += y; cnt++; }
    }
    const e = Math.hypot(sx / cnt - frames[n].x, sy / cnt - frames[n].y);
    if (e > maxErr) { maxErr = e; worst = n; }
  }
  return { maxErr, worst };
}, truth.frames);
check(seekErr.maxErr < 2, `Переход на кадр точный: макс. отклонение мяча ${seekErr.maxErr.toFixed(2)} пикс (кадр ${seekErr.worst})`);

// ---------- Калибровка ----------
const f0 = Math.ceil(truth.lead * truth.fps - 1e-9);
const f1 = Math.floor((truth.lead + truth.flight) * truth.fps - 1e-9);
await page.click('#nextBtn');
await sleep(300);
await shot('2-frames');
await noHScroll('Шаг 2');
await page.evaluate((f0, f1) => {
  const a = window.__app;
  a.state.start = f0;
  a.state.end = f1;
}, f0, f1);
// Масштаб и оси в демо-видео: линейка 140…640 пикс по y=660, старт мяча (140, 600).
await page.evaluate(() => {
  const s = window.__app.state;
  s.cal.scale = { a: { x: 140, y: 660 }, b: { x: 640, y: 660 }, length: 1 };
  s.cal.axes = { origin: { x: 140, y: 600 }, angle: 0, flipY: false };
});
await page.click('#calTabs [data-tab="scale"]');
await shot('2-scale');
await page.click('#calTabs [data-tab="axes"]');
await shot('2-axes');

// ---------- Ручной трекинг настоящими тапами ----------
await page.click('#nextBtn');
await sleep(400);
await noHScroll('Шаг 3');

async function tapVideoPoint(p) {
  const s = await page.evaluate(p => {
    const a = window.__app, r = a.viewer.canvas.getBoundingClientRect();
    const q = a.viewer.toScreen(p);
    return { x: r.left + q.x, y: r.top + q.y };
  }, p);
  await page.touchscreen.tap(s.x, s.y);
}

async function waitIdle() {
  await page.waitForFunction(() => !window.__app.video.busy);
  await sleep(30);
}

// Проход по кадрам с тапами. noise — «дрожание пальца» в пикселях видео (σ).
async function manualPass(zoom, noise) {
  await page.evaluate((f0, zoom) => {
    const a = window.__app;
    a.state.points.clear();
    a.viewer.resetView();
    a.viewer.zoomBy(zoom);
    return a.goto(f0);
  }, f0, zoom);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (let f = f0; f <= f1; f++) {
    await waitIdle();
    const cur = await page.evaluate(() => window.__app.video.current);
    if (cur !== f) throw new Error(`ожидался кадр ${f}, показан ${cur}`);
    const p = { x: truth.frames[f].x + noise * gauss(), y: truth.frames[f].y + noise * gauss() };
    if (zoom > 1) await page.evaluate(p => window.__app.viewer.centerOn(p), truth.frames[f]);
    await tapVideoPoint(p);
  }
  await waitIdle();
}

async function results() {
  return page.evaluate(() => {
    const out = {};
    for (const sm of ['none', 'light', 'strong']) {
      document.querySelector(`#smoothTabs [data-smooth="${sm}"]`).click();
      const s = window.__app.resultsSeries();
      const ay = s.ay.filter(v => v != null), ax = s.ax.filter(v => v != null);
      const mean = arr => arr.reduce((p, c) => p + c, 0) / arr.length;
      const sd = arr => Math.sqrt(mean(arr.map(v => (v - mean(arr)) ** 2)));
      out[sm] = { n: s.t.length, ay: +mean(ay).toFixed(3), ay_sd: +sd(ay).toFixed(3), ax: +mean(ax).toFixed(3) };
    }
    return out;
  });
}

const expectN = f1 - f0 + 1;

// 1) Аккуратные тапы с увеличением ×2.5.
await manualPass(2.5, 0);
await shot('3-manual');
await page.click('#nextBtn');
await sleep(400);
const manual = await results();
console.log('Ручной, точные тапы:', JSON.stringify(manual));
check(manual.none.n === expectN, `Точек: ${manual.none.n} (ожидается ${expectN})`);
check(Math.abs(manual.none.ay + truth.g) < 0.01 * truth.g, `Ручной, точные тапы: ay = ${manual.none.ay} (±${manual.none.ay_sd})`);
check(Math.abs(manual.none.ax) < 0.1, `ax ≈ 0: ${manual.none.ax}`);
await page.click('#smoothTabs [data-smooth="none"]');
for (const q of ['x', 'y', 'vy', 'ay']) {
  await page.click(`#qTabs [data-q="${q}"]`);
  await shot(`4-${q}`);
}
// Экспорт: текст для Excel.
const tsv = await page.evaluate(() => window.__app.exportText('\t', true));
const rows = tsv.split('\r\n');
check(rows[0] === 't (s)\tx (m)\ty (m)\tvx (m/s)\tvy (m/s)\tax (m/s²)\tay (m/s²)', 'Заголовок таблицы для Excel');
check(rows.length === expectN + 1, `Строк данных: ${rows.length - 1}`);
console.log('  ' + rows.slice(0, 4).join('\n  '));

// 2) Без увеличения, с дрожанием пальца σ = 2 пикс видео (≈4 мм).
await page.click('#backBtn');
await sleep(300);
await manualPass(1, 2);
await page.click('#nextBtn');
await sleep(400);
const noisy = await results();
console.log('Ручной, неточные тапы:', JSON.stringify(noisy));
check(Math.abs(noisy.strong.ay + truth.g) < 0.05 * truth.g, `Ручной, σ=2 пикс, сильное сглаживание: ay = ${noisy.strong.ay} (±${noisy.strong.ay_sd}); без сглаживания ±${noisy.none.ay_sd}`);
check(noisy.strong.ay_sd < noisy.none.ay_sd / 2, 'Сглаживание уменьшает разброс ускорения');
await noHScroll('Шаг 4');


// ---------- Авто-трекинг ----------
await page.click('#backBtn');
await sleep(300);
await page.evaluate(() => { window.__app.state.points.clear(); window.__app.viewer.resetView(); });
await page.click('#modeTabs [data-mode="auto"]');
await page.evaluate(f0 => window.__app.goto(f0), f0);
await waitIdle();
// Тап мимо центра на 3 пикселя видео — как неточный палец.
await tapVideoPoint({ x: truth.frames[f0].x + 3, y: truth.frames[f0].y - 2 });
await shot('3-auto-select');
// Точку старта уточняем как в настоящем Tracker: ставим её точно.
await page.evaluate((f, p) => window.__app.state.points.set(f, p), f0, { x: truth.frames[f0].x, y: truth.frames[f0].y });
const t0 = Date.now();
await page.click('#autoRun');
await page.waitForFunction(() => /Done|Lost/.test(document.querySelector('#autoStatus').textContent), { timeout: 60000 });
const status = await page.$eval('#autoStatus', e => e.textContent);
check(status.includes('Done'), `Авто-трекинг: «${status}» за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
await shot('3-auto-done');
const autoErr = await page.evaluate(frames => {
  const s = window.__app.state;
  let max = 0;
  for (const [f, p] of s.points) max = Math.max(max, Math.hypot(p.x - frames[f].x, p.y - frames[f].y));
  return { max, n: s.points.size };
}, truth.frames);
check(autoErr.max < 1.5, `Авто-трекинг: ${autoErr.n} точек, макс. ошибка ${autoErr.max.toFixed(2)} пикс`);
await page.click('#nextBtn');
await sleep(400);
const auto = await results('auto');
console.log('Авто-трекинг:', JSON.stringify(auto));
check(Math.abs(auto.none.ay + truth.g) < 0.05 * truth.g, `Авто, без сглаживания: ay = ${auto.none.ay.toFixed(3)} (±${auto.none.ay_sd.toFixed(2)})`);
check(Math.abs(auto.light.ay + truth.g) < 0.02 * truth.g, `Авто, слабое сглаживание: ay = ${auto.light.ay.toFixed(3)}`);

check(errors.length === 0, `Ошибок в консоли: ${errors.length}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
await browser.close();
console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
