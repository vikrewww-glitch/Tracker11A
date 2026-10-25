// Проверка перевода: в режиме PT на экране не должно остаться английского текста (и наоборот).
//   node tools/i18n-test.mjs [папка-для-скриншотов]
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PUPPETEER_PATH || import.meta.url);
const puppeteer = require('puppeteer-core');
const URL_ = process.env.APP_URL || 'http://localhost:8765/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shots = process.argv[2];

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Ключи в HTML.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const htmlKeys = [...html.matchAll(/data-i18n(?:-html|-aria)?="([^"]+)"/g)].map(m => m[1]);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
const dialogs = [];
await page.goto(URL_, { waitUntil: 'networkidle0' });

const dict = await page.evaluate(async () => {
  const src = [...document.scripts].find(s => s.src.includes('app.js')).src;
  const v = new URL(src).search;
  const m = await import(new URL('i18n.js' + v, src).href);
  return m.DICT;
});
const en = Object.keys(dict.en), pt = Object.keys(dict.pt);
check(en.length === pt.length && en.every(k => k in dict.pt), `Одинаковые ключи EN/PT (${en.length})`);
const missing = htmlKeys.filter(k => !(k in dict.en) || !(k in dict.pt));
check(missing.length === 0, `Все ключи из HTML переведены${missing.length ? ': ' + missing.join(', ') : ''}`);

// Фрагменты фраз одного языка, которых не должно быть на экране в другом.
function fragments(lang, other) {
  const out = new Set();
  for (const k of Object.keys(dict[lang])) {
    if (dict[lang][k] === dict[other][k]) continue;
    const plain = dict[lang][k].replace(/<[^>]+>/g, ' ');
    for (const part of plain.split(/\{\w+\}|[·—–()«»“”"]/)) {
      const p = part.trim().replace(/[.,:;!?…]+$/, '');
      if (p.length >= 5 && !/^[\d\s.,×≈%]+$/.test(p)) out.add(p);
    }
  }
  return [...out];
}
const EN_WORDS = /\b(the|and|frame|frames|video|tap|start|end|point|points|results?|scale|axes|copy|download|save|chart|smoothing|back|continue|mean|track|tracking|choose|record|sample|length|rotation|reset|stop|resume|lost|done|delete|clear|every|data|light|strong|off|up|down|box|size|loading|opening|marked|automatic)\b/i;

async function visibleText() {
  return page.evaluate(() => {
    const parts = [document.body.innerText, document.title];
    document.querySelectorAll('[aria-label]').forEach(e => parts.push(e.getAttribute('aria-label')));
    document.querySelectorAll('option').forEach(e => parts.push(e.textContent));
    return parts.join('\n');
  });
}

async function scan(label, lang) {
  const other = lang === 'pt' ? 'en' : 'pt';
  const text = (await visibleText()).replace(/Tracker11A/g, '');
  const bad = fragments(other, lang).filter(f => text.includes(f));
  let words = [];
  if (lang === 'pt') {
    // Разрешены имена собственные и обозначения.
    const cleaned = text.replace(/Google Sheets|Excel|CSV|Tracker11A|fps|px/g, '');
    words = [...new Set((cleaned.match(new RegExp(EN_WORDS.source, 'gi')) || []))];
  }
  check(bad.length === 0 && words.length === 0, `${label}: нет текста на другом языке${bad.length ? ' — ' + bad.slice(0, 5).join(' | ') : ''}${words.length ? ' — слова: ' + words.join(', ') : ''}`);
  if (shots) await page.screenshot({ path: `${shots}/${lang}-${label.replace(/\W+/g, '_')}.png`, fullPage: true });
}

async function walk(lang) {
  await scan('Шаг 1', lang);
  await page.click('#demoBtn');
  await page.waitForFunction(() => /\d+ (frames|fotogramas)/.test(document.querySelector('#videoInfo').textContent));
  await scan('Шаг 1 — видео загружено', lang);
  await page.click('#nextBtn');
  await sleep(300);
  await page.click('#calTabs [data-tab="frames"]');
  await scan('Шаг 2 — кадры', lang);
  await page.click('#setEnd'); // вызывает подсказку
  await sleep(100);
  await scan('Шаг 2 — подсказка', lang);
  await page.click('#calTabs [data-tab="scale"]');
  await scan('Шаг 2 — масштаб', lang);
  await page.click('#calTabs [data-tab="axes"]');
  await scan('Шаг 2 — оси', lang);
  await page.click('#nextBtn');
  await sleep(400);
  await scan('Шаг 3 — вручную', lang);
  await page.click('#modeTabs [data-mode="auto"]');
  await page.evaluate(() => { window.__app.state.points.clear(); return window.__app.goto(6); });
  await page.waitForFunction(() => !window.__app.video.busy);
  const s = await page.evaluate(() => {
    const a = window.__app, r = a.viewer.canvas.getBoundingClientRect(), q = a.viewer.toScreen({ x: 140, y: 600 });
    return { x: r.left + q.x, y: r.top + q.y };
  });
  await page.touchscreen.tap(s.x, s.y);
  await scan('Шаг 3 — объект выбран', lang);
  await page.click('#autoRun');
  await page.waitForFunction(() => document.querySelector('#autoStatus').className.includes('good') ||
    document.querySelector('#autoStatus').className.includes('bad'), { timeout: 30000 });
  await scan('Шаг 3 — трекинг завершён', lang);
  // Потеря объекта: точка в пустом месте кадра.
  await page.evaluate(() => { window.__app.state.points.clear(); return window.__app.goto(10); });
  await page.waitForFunction(() => !window.__app.video.busy);
  await page.evaluate(() => window.__app.state.points.set(10, { x: 1000, y: 100 }));
  await page.click('#autoRun');
  await page.waitForFunction(() => /bad|good/.test(document.querySelector('#autoStatus').className), { timeout: 30000 });
  await scan('Шаг 3 — объект потерян', lang);
  // Восстанавливаем трек для результатов.
  await page.evaluate(() => {
    const a = window.__app;
    a.state.points.clear();
    for (let f = 6; f <= 31; f++) {
      const tt = (f - 6) / 30;
      a.state.points.set(f, { x: 140 + 1.5 * tt * 500, y: 600 - (4.2 * tt - 4.9 * tt * tt) * 500 });
    }
    a.state.end = 31;
  });
  await page.click('#modeTabs [data-mode="manual"]');
  await page.click('#nextBtn');
  await sleep(500);
  await scan('Шаг 4 — результаты', lang);
  await page.click('#copyBtn');
  await sleep(100);
  await scan('Шаг 4 — тост копирования', lang);
  await page.click('#steps [data-step="1"]');
  await sleep(200);
}

// Переключение на португальский кнопкой в углу.
await page.click('#langBtn');
await sleep(100);
check(await page.evaluate(() => document.documentElement.lang) === 'pt-PT', 'Кнопка переключает на pt-PT');
await walk('pt');
const ptDialogs = dialogs.splice(0);
await page.evaluate(() => { window.__app.state.points.set(3, { x: 1, y: 1 }); });
// Новое видео при поставленных точках → диалог подтверждения на текущем языке.
await page.click('#demoBtn');
await sleep(800);
const confirmText = dialogs.splice(0).join(' ');
check(/Abrir um novo vídeo/.test(confirmText), `Диалог подтверждения на PT: «${confirmText}»`);

// Обратно на английский: не должно остаться португальского.
await page.click('#langBtn');
await sleep(100);
await page.evaluate(() => window.__app.state.points.clear());
await walk('en');

// Язык запоминается после перезагрузки.
await page.click('#langBtn');
await page.reload({ waitUntil: 'networkidle0' });
check(await page.$eval('#nextBtn', b => b.textContent) === 'Continuar', 'Язык сохраняется после перезагрузки');

check(errors.length === 0, `Ошибок JS: ${errors.length}${errors.length ? ' — ' + errors.join('; ') : ''}`);
console.log(ptDialogs.length ? `(диалоги: ${ptDialogs.join(' | ')})` : '');
await browser.close();
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nПеревод: все проверки пройдены');
process.exit(failed ? 1 : 0);
