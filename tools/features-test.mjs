// Проверка линии тренда, сил, режима «Эксперимент» и истории.
//   python3 -m http.server 8765
//   for v in 1.4 1.6 1.8 2.0; do python3 tools/make_slide_video.py /tmp/slide/s$v.mp4 --v0 $v; done
//   node tools/features-test.mjs /tmp/slide [папка-для-скриншотов]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PUPPETEER_PATH || import.meta.url);
const puppeteer = require('puppeteer-core');
const URL_ = process.env.APP_URL || 'http://localhost:8765/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const slideDir = process.argv[2];
const shots = process.argv[3];

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const parse = s => parseFloat(String(s).replace('−', '-').replace(',', '.'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
await page.goto(URL_, { waitUntil: 'networkidle0' });
// Чистое состояние: пустые эксперимент и история.
await page.evaluate(async () => {
  localStorage.removeItem('experiment');
  localStorage.setItem('lang', 'en');
  await new Promise(r => { const q = indexedDB.deleteDatabase('tracker11a'); q.onsuccess = q.onerror = q.onblocked = r; });
});
await page.reload({ waitUntil: 'networkidle0' });

async function shot(name) {
  if (!shots) return;
  await sleep(200);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function noHScroll(name) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check(r.sw <= r.w, `${name}: нет горизонтальной прокрутки (${r.sw} ≤ ${r.w})`);
}
// Клик с прокруткой к центру экрана — иначе нижняя панель может перекрыть кнопку.
async function click(sel) {
  await page.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  await page.click(sel);
}
const text = sel => page.$eval(sel, e => e.textContent);
const visible = sel => page.$eval(sel, e => !e.closest('.hidden') && e.offsetParent !== null);
const waitLoaded = () => page.waitForFunction(() => /\d+ frames/.test(document.querySelector('#videoInfo').textContent), { timeout: 20000 });

async function typeMass(v) {
  await page.click('#steps [data-step="2"]');
  await page.click('#calTabs [data-tab="scale"]');
  await page.click('#massInput', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#massInput', v);
  await page.keyboard.press('Tab');
}

async function tapAt(p) {
  const s = await page.evaluate(p => {
    const a = window.__app, r = a.viewer.canvas.getBoundingClientRect(), q = a.viewer.toScreen(p);
    return { x: r.left + q.x, y: r.top + q.y };
  }, p);
  await page.touchscreen.tap(s.x, s.y);
}

// Авто-трекинг от текущего кадра; при остановке — тап по истинному положению и «Продолжить».
async function autoTrack(truth) {
  let stops = 0;
  for (;;) {
    await page.click('#autoRun');
    await page.waitForFunction(() => /good|bad/.test(document.querySelector('#autoStatus').className) &&
      !/Tracking/.test(document.querySelector('#autoStatus').textContent), { timeout: 60000 });
    if ((await text('#autoStatus')).startsWith('Done')) return stops;
    stops++;
    const cur = await page.evaluate(() => window.__app.video.current);
    if (!truth || stops > 10) return stops;
    await tapAt(truth.frames[cur]);
  }
}

// ---------- 1. Бросок мяча: квадратичный тренд y(t) и сила ----------
console.log('\n— Бросок мяча (пример) —');
await page.click('#demoBtn');
await waitLoaded();
await typeMass('0,5');
check(await page.evaluate(() => window.__app.state.mass) === 0.5, 'Масса 0,5 кг принята (с запятой)');
await shot('2-mass');
await noHScroll('Калибровка с полем массы');
await page.click('#nextBtn');
await sleep(300);
await page.click('#modeTabs [data-mode="auto"]');
await page.evaluate(() => window.__app.goto(6));
await page.waitForFunction(() => !window.__app.video.busy);
await tapAt({ x: 140, y: 600 });
const demoStops = await autoTrack(null);
check(demoStops === 0, `Пример отслежен без остановок (${demoStops})`);
await page.click('#nextBtn');
await sleep(600);
const dis = await page.$$eval('#qTabs button.dis', b => b.map(x => x.dataset.q));
check(dis.length === 0, `Вкладки Fx, Fy, F активны при указанной массе${dis.length ? ' — неактивны: ' + dis + ', m = ' + await page.evaluate(() => window.__app.mass()) : ''}`);
await page.click('#trendOn');
await page.click('#qTabs [data-q="y"]');
await sleep(100);
const ay = parse(await text('#statTrend'));
const info = await text('#trendInfo');
check(near(ay, -9.8, 0.15), `Квадратичный тренд y(t): a = 2A = ${ay} м/с² (ожидается −9.8)`);
check(/R² = (0\.99|1\.000)/.test(info), `Уравнение и R²: «${info}»`);
await shot('4-trend-y');
await noHScroll('Результаты с трендом');
await page.click('#qTabs [data-q="Fy"]');
await sleep(100);
const fyTrend = parse(await text('#statTrend'));
const fyMean = parse(await text('#statMean'));
check(near(fyTrend, -4.9, 0.08), `Fy из тренда = ${fyTrend} Н (m·g = 4.9)`);
check(near(fyMean, -4.9, 0.25), `Среднее Fy = ${fyMean} Н`);
check((await page.$eval('#trendType .on', b => b.dataset.deg)) === '1', 'Для Fy по умолчанию линейный тренд');
await shot('4-trend-Fy');
await page.click('#qTabs [data-q="ay"]');
const ayTrendStat = await text('#statTrendLabel');
check(ayTrendStat === 'Trend ay', `Для ay показан «${ayTrendStat}»`);
const exp = await page.evaluate(() => window.__app.exportText('\t', false));
check(/Fx \(N\)\tFy \(N\)\tF \(N\)/.test(exp), 'В экспорте есть колонки Fx, Fy, F');
check(/\ny \(m\)\tQuadratic\ty = -4\.9\d*t² \+ /.test(exp) && /R²/.test(exp), 'В экспорте есть уравнение и R² для y');
check((await page.$$eval('#table th', t => t.map(x => x.textContent))).includes('F (N)'), 'Колонка F в таблице');
// Без массы вкладки силы неактивны.
await typeMass('');
await page.click('#steps [data-step="4"]');
await sleep(300);
check((await page.$$eval('#qTabs button.dis', b => b.length)) === 3, 'Без массы вкладки силы неактивны');
await page.click('#qTabs [data-q="F"]');
await sleep(100);
check(/Calibrate/.test(await text('#toast')), `Подсказка: «${await text('#toast')}»`);

// ---------- 2. Брусок с трением: несколько масс ----------
console.log('\n— Трение: брусок с разными массами —');
const MASSES = ['0.2', '0,35', '0.5', '0.8'];
const vids = fs.readdirSync(slideDir).filter(f => f.endsWith('.mp4')).sort();
for (let i = 0; i < vids.length; i++) {
  const file = path.join(slideDir, vids[i]);
  const truth = JSON.parse(fs.readFileSync(file + '.json', 'utf8'));
  await (await page.$('#fileInput')).uploadFile(file);
  await waitLoaded();
  const f0 = Math.round(0.3 * truth.fps); // начало толчка
  await page.evaluate(f0 => {
    const s = window.__app.state;
    s.start = f0; s.end = window.__app.video.frameCount - 1;
    s.cal.scale = { a: { x: 140, y: 660 }, b: { x: 640, y: 660 }, length: 1 };
    s.cal.axes = { origin: { x: 150, y: 600 }, angle: 0, flipY: false };
  }, f0);
  await typeMass(MASSES[i]);
  await page.click('#nextBtn');
  await sleep(300);
  await page.click('#modeTabs [data-mode="auto"]');
  await page.evaluate(() => {
    const b = document.querySelector('#boxSize');
    b.value = 80;
    b.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(f => window.__app.goto(f), f0);
  await page.waitForFunction(() => !window.__app.video.busy);
  await tapAt(truth.frames[f0]);
  const stops = await autoTrack(truth);
  await page.click('#nextBtn');
  await sleep(500);
  // Участок торможения: от первого кадра после толчка до остановки.
  await click('#addBtn');
  await sleep(200);
  const r = await page.evaluate((t1, t2) => {
    const s = window.__app.resultsSeries(), t0 = window.__app.video.timeOf(window.__app.state.start);
    const tt = s.t.map(t => t + t0);
    const from = tt.findIndex(t => t > t1 + 0.02);
    let to = tt.length - 1;
    while (to > 0 && tt[to] > t2) to--;
    for (const [id, v] of [['#expFrom', from], ['#expTo', to]]) {
      const el = document.querySelector(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { from, to, n: s.t.length };
  }, truth.push_end, truth.stop);
  const prev = await text('#expPreview');
  if (i === 0) { await shot('4-add-panel'); await noHScroll('Панель «Добавить в эксперимент»'); }
  await click('#expAdd');
  await sleep(300);
  console.log(`  ${vids[i]}: остановок ${stops}, участок ${r.from}…${r.to} из ${r.n}; ${prev}`);
  const a = parse(prev.match(/a = (\S+)/)[1]);
  check(near(a, -truth.mu * truth.g, 0.12), `${vids[i]}: a = ${a} м/с² (истинное ${(-truth.mu * truth.g).toFixed(3)})`);
}

await page.click('#steps [data-step="5"]');
await sleep(400);
const rows = await page.$$eval('#expTable .exprow:not(.head)', r => r.length);
check(rows === vids.length, `В таблице эксперимента ${rows} строк`);
const mu = parse(await text('#expMu'));
check(near(mu, 0.31, 0.015), `μ = ${mu} (истинное 0.31)`);
const concl = await text('#expConclusion');
check(/linearly/.test(concl) && /0\.31/.test(concl), `Вывод: «${concl}»`);
await shot('5-experiment');
await noHScroll('Эксперимент');
await click('#expFit [data-fit="free"]');
await sleep(150);
check(/·m [+−] /.test(await text('#expEq')), `Свободный член в уравнении: «${await text('#expEq')}»`);
await click('#expFit [data-fit="origin"]');
// Редактирование массы в строке.
await page.click('#expTable .exprow:nth-child(2) [data-f="m"]', { clickCount: 3 });
await page.type('#expTable .exprow:nth-child(2) [data-f="m"]', '0.25');
await page.keyboard.press('Tab');
await sleep(150);
const fa1 = await page.$eval('#expTable .exprow:nth-child(2) .fa', e => e.textContent);
check(fa1 !== '—' && parse(fa1) > 0.7, `Правка массы пересчитала Fa: ${fa1}`);
await page.click('#expTable .exprow:nth-child(2) [data-f="m"]', { clickCount: 3 });
await page.type('#expTable .exprow:nth-child(2) [data-f="m"]', '0.2');
await page.keyboard.press('Tab');
// Удаление строки.
await page.click('#expTable .exprow:last-child .del');
check((await page.$$eval('#expTable .exprow:not(.head)', r => r.length)) === vids.length - 1, 'Строка удалена');
const xl = await page.evaluate(() => {
  // Текст для Excel — через перехват буфера обмена.
  return new Promise(res => {
    navigator.clipboard.writeText = async s => { res(s); };
    document.querySelector('#expCopy').click();
  });
});
check(/μ = k \/ 9\.8\t0\.3/.test(xl) && /Fa = /.test(xl) && /R²/.test(xl), 'Копирование эксперимента: таблица, уравнение, μ');
// Данные переживают перезагрузку.
await page.reload({ waitUntil: 'networkidle0' });
await page.click('#steps [data-step="5"]');
await sleep(300);
check((await page.$$eval('#expTable .exprow:not(.head)', r => r.length)) === vids.length - 1, 'Эксперимент сохранился после перезагрузки');

// ---------- 3. История ----------
console.log('\n— История —');
await page.click('#steps [data-step="6"]');
await sleep(400);
const hist = await page.$$eval('#histList .histrow', r => r.length);
check(hist === vids.length + 1, `В истории ${hist} записей (пример + ${vids.length})`);
check(await page.$$eval('#histList .thumb img', i => i.length) === hist, 'У каждой записи есть миниатюра');
await shot('6-history');
await noHScroll('История');
// Переименование.
const last = '#histList .histrow:last-child .histname';
await page.click(last, { clickCount: 3 });
await page.type(last, 'Projectile test');
await page.keyboard.press('Tab');
await sleep(200);
// Открыть результаты без видео.
await click('#histList .histrow:last-child [data-act="open"].btn');
await sleep(500);
check(await visible('#archBanner') && (await text('#archName')) === 'Projectile test', 'Открыт сохранённый трекинг (переименованный)');
await page.click('#qTabs [data-q="y"]');
await page.$eval('#trendOn', e => { if (!e.checked) e.click(); });
await sleep(100);
check(near(parse(await text('#statTrend')), -9.8, 0.15), `Сохранённый трекинг: тренд y даёт ${await text('#statTrend')}`);
await shot('4-archived');
await click('#archClose');
await sleep(300);
// Экспорт/импорт: выгружаем, очищаем базу, загружаем файл обратно.
const dump = await page.evaluate(async () => {
  const src = [...document.scripts].find(s => s.src.includes('app.js')).src;
  const h = await import(new URL('history.js' + new URL(src).search, src).href);
  const all = await h.listTracks();
  for (const r of all) await h.deleteTrack(r.id);
  return JSON.stringify({ app: 'Tracker11A', version: 1, tracks: all });
});
const tmp = path.join(os.tmpdir(), 'tracker11a-history.json');
fs.writeFileSync(tmp, dump);
await page.click('#steps [data-step="6"]');
await sleep(200);
check(await visible('#histEmpty'), 'После очистки история пуста');
await (await page.$('#histImport')).uploadFile(tmp);
await sleep(800);
check((await page.$$eval('#histList .histrow', r => r.length)) === hist, `Импорт вернул ${hist} записей`);
// Добавить из истории: очищаем эксперимент и набираем его заново галочками.
await page.click('#steps [data-step="5"]');
await click('#expClear');
await sleep(200);
await click('#expFromHist');
await sleep(300);
const boxes = await page.$$eval('#histPickList input.check', b => b.map(x => ({ dis: x.disabled })));
check(boxes.length === hist && boxes.filter(b => !b.dis).length === vids.length, `В выборе ${boxes.length} записей, без массы неактивна 1`);
await shot('5-pick');
await page.$$eval('#histPickList input.check:not(:disabled)', b => b.forEach(x => x.click()));
await click('#histPickAdd');
await sleep(300);
const mu2 = parse(await text('#expMu'));
check((await page.$$eval('#expTable .exprow:not(.head)', r => r.length)) === vids.length && near(mu2, mu, 0.002), `Из истории: ${vids.length} строк, μ = ${mu2}`);

// ---------- 4. Узкие экраны, оба языка ----------
await page.click('#steps [data-step="1"]');
await page.click('#demoBtn');
await waitLoaded();
for (const lang of ['en', 'pt']) {
  if (lang === 'pt') await page.click('#langBtn');
  for (const w of [390, 360, 320]) {
    await page.setViewport({ width: w, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    for (const step of [2, 4, 5, 6]) {
      if (step === 4) await page.evaluate(async () => {
        const src = [...document.scripts].find(s => s.src.includes('app.js')).src;
        const h = await import(new URL('history.js' + new URL(src).search, src).href);
        const all = await h.listTracks();
        window.__app.openArchived(all[0]);
      });
      else await page.click(`#steps [data-step="${step}"]`);
      await sleep(250);
      if (step === 2) await click('#calTabs [data-tab="scale"]');
      if (step === 4) { await page.$eval('#trendOn', e => { if (!e.checked) e.click(); }); await click('#qTabs [data-q="ay"]'); }
      await noHScroll(`${lang} ${w}px, шаг ${step}`);
      const hdr = await page.evaluate(() => {
        const r = document.querySelector('#langBtn').getBoundingClientRect();
        const cut = [...document.querySelectorAll('.stepbtn')].filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim());
        return { right: r.right, cut };
      });
      check(hdr.right <= w, `${lang} ${w}px: кнопка языка в кадре`);
      if (hdr.cut.length) console.log(`    (обрезаны: ${hdr.cut.join(', ')})`);
      if (w === 360) await shot(`w${w}-${lang}-step${step}`);
    }
  }
}

check(errors.length === 0, `Ошибок JS: ${errors.length}${errors.length ? ' — ' + errors.join('; ') : ''}`);
await browser.close();
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nНовые функции: все проверки пройдены');
process.exit(failed ? 1 : 0);
