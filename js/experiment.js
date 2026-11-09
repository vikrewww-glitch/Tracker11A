// Режим «Эксперимент»: сила трения Fa в зависимости от массы по нескольким видео.
// Каждое видео — строка { id, name, m, a }; Fa = m·|a|. Данные хранятся в localStorage,
// поэтому не пропадают при загрузке следующего видео.
import { polyfit } from './physics.js?v=20261109154903';
import { drawChart } from './chart.js?v=20261109154903';
import { fmt, sig, copyText, saveBlob, canvasToBlobSync } from './export.js?v=20261109154903';
import { listTracks, trackAcc } from './history.js?v=20261109154903';
import { t } from './i18n.js?v=20261109154903';

const KEY = 'experiment';
const G = 9.8;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.rows)) return { rows: d.rows, seq: d.seq || d.rows.length, origin: d.origin !== false };
  } catch { /* повреждённые данные или приватный режим */ }
  return { rows: [], seq: 0, origin: true };
}

let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* приватный режим */ }
}

export const nextName = () => t('exp.defaultName', { n: data.seq + 1 });

export function addRow({ name, m, a, track = null }) {
  data = load(); // могли изменить в другой вкладке
  data.seq++;
  data.rows.push({ id: Date.now().toString(36) + data.seq, name, m, a, track });
  save();
  return data.rows.length;
}

const fa = r => r.m * Math.abs(r.a);
const valid = r => r.m > 0 && isFinite(r.a);

function parseNum(str) {
  const v = parseFloat(String(str).trim().replace(/\s/g, '').replace(',', '.'));
  return isFinite(v) ? v : NaN;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return { bg: v('--surface'), grid: v('--sep'), zero: v('--text-3'), text: v('--text'), text2: v('--text-2'), accent: v('--accent'), trend: v('--orange') };
}

export function initExperiment(app) {
  const { state } = app;
  const $ = s => document.querySelector(s);
  const chart = $('#expChart');
  const num = (v, dec) => fmt(v, dec, state.comma).replace('-', '−');

  function fitRows() {
    const rows = data.rows.filter(valid);
    const f = polyfit(rows.map(r => r.m), rows.map(fa), 1, data.origin);
    return { rows, f };
  }

  function equation(f, comma) {
    const k = sig(f.coef[1], 4, comma);
    if (data.origin) return `Fa = ${k}·m`;
    const b = f.coef[0];
    return `Fa = ${k}·m ${b < 0 ? '−' : '+'} ${sig(Math.abs(b), 3, comma)}`;
  }

  function renderTable() {
    const head = `<div class="exprow head"><span>${t('exp.name')}</span><span>m (kg)</span><span>a (m/s²)</span><span>F<sub>a</sub> (N)</span><span></span></div>`;
    const rows = data.rows.map(r => `<div class="exprow" data-id="${r.id}">
      <input type="text" class="cell name" data-f="name" value="${escapeHtml(r.name)}" aria-label="${t('exp.name')}" autocomplete="off">
      <input type="text" class="cell" data-f="m" inputmode="decimal" value="${fmt(r.m, 3, state.comma)}" aria-label="m (kg)" autocomplete="off">
      <input type="text" class="cell" data-f="a" inputmode="decimal" value="${fmt(r.a, 3, state.comma)}" aria-label="a (m/s²)" autocomplete="off">
      <b class="fa">${valid(r) ? num(fa(r), 3) : '—'}</b>
      <button class="del" aria-label="${t('exp.delete')}"><svg class="i"><use href="#i-trash"/></svg></button>
    </div>`);
    $('#expTable').innerHTML = head + rows.join('');
  }

  function draw() {
    const empty = !data.rows.length;
    $('#expEmpty').classList.toggle('hidden', !empty);
    $('#expBody').classList.toggle('hidden', empty);
    document.querySelectorAll('#expFit button').forEach(b => b.classList.toggle('on', (b.dataset.fit === 'origin') === data.origin));
    if (empty) return;
    const { rows, f } = fitRows();
    const w = chart.parentElement.clientWidth - 16;
    if (w > 0) {
      const h = Math.round(Math.min(Math.max(w * 0.68, 240), 400));
      chart.style.height = h + 'px';
      const th = theme();
      drawChart(chart, {
        width: w, height: h, dpr: window.devicePixelRatio || 1,
        xs: rows.map(r => r.m), ys: rows.map(fa), color: th.accent, theme: th,
        xLabel: 'm (kg)', yLabel: 'Fa (N)', comma: state.comma, scatter: true, zero: true,
        trend: f ? f.f : null,
      });
    }
    const ok = f && rows.length >= 2;
    $('#expEq').innerHTML = ok ? `${equation(f, state.comma).replace('Fa', 'F<sub>a</sub>')} <span class="sep">·</span> R² = ${fmt(f.r2, 4, state.comma)}` : '';
    $('#expK').textContent = ok ? `${num(f.coef[1], 3)} N/kg` : '—';
    $('#expR2').textContent = ok ? fmt(f.r2, 4, state.comma) : '—';
    $('#expMu').textContent = ok ? num(f.coef[1] / G, 3) : '—';
    let text;
    if (!ok) text = t('exp.needMore');
    else {
      const mu = num(f.coef[1] / G, 2);
      if (rows.length < 3) text = t('exp.fewPoints', { mu });
      else if (f.r2 >= 0.95) text = t('exp.linear', { mu });
      else text = t('exp.notLinear', { mu, r2: fmt(f.r2, 2, state.comma) });
    }
    $('#expConclusion').innerHTML = text;
  }

  function render() {
    renderTable();
    draw();
  }

  // ---------- Добавление из истории ----------

  const pick = $('#histPick');
  let candidates = [];

  async function openPick() {
    try { candidates = await listTracks(); } catch { candidates = []; }
    if (!candidates.length) { app.toast(t('exp.noHistory')); return; }
    const used = new Set(data.rows.map(r => r.track).filter(Boolean));
    $('#histPickList').innerHTML = candidates.map(r => {
      const a = trackAcc(r);
      const ok = r.mass > 0 && a != null;
      const meta = ok ? `m = ${num(r.mass, 3)} kg · a = ${num(a, 3)} m/s²` : t('exp.noMass');
      return `<label class="row pickrow${ok ? '' : ' dis'}">
        <input type="checkbox" class="check" value="${r.id}" ${ok ? '' : 'disabled'}>
        ${r.thumb ? `<img src="${r.thumb}" alt="">` : '<span class="noimg"></span>'}
        <span class="row-text"><b>${escapeHtml(r.name)}</b><small>${meta}${used.has(r.id) ? ' · ' + t('exp.already') : ''}</small></span>
      </label>`;
    }).join('');
    pick.classList.remove('hidden');
    $('#expFromHist').classList.add('hidden');
    updatePick();
  }

  function updatePick() {
    const n = pick.querySelectorAll('input.check:checked').length;
    $('#histPickAdd').disabled = !n;
    $('#histPickAdd').textContent = n ? t('exp.addSelectedN', { n }) : t('exp.addSelected');
  }

  function closePick() {
    pick.classList.add('hidden');
    $('#expFromHist').classList.remove('hidden');
  }

  $('#expFromHist').addEventListener('click', openPick);
  $('#histPickCancel').addEventListener('click', closePick);
  pick.addEventListener('change', updatePick);
  $('#histPickAdd').addEventListener('click', () => {
    const ids = [...pick.querySelectorAll('input.check:checked')].map(c => c.value);
    for (const id of ids) {
      const r = candidates.find(c => c.id === id);
      addRow({ name: r.name, m: r.mass, a: trackAcc(r), track: r.id });
    }
    data = load();
    closePick();
    render();
    app.toast(t('exp.addedN', { n: ids.length }));
    app.changed();
  });

  $('#expTable').addEventListener('change', e => {
    const el = e.target.closest('input');
    if (!el) return;
    const row = data.rows.find(r => r.id === el.closest('.exprow').dataset.id);
    if (!row) return;
    if (el.dataset.f === 'name') row.name = el.value.trim() || row.name;
    else {
      const v = parseNum(el.value);
      if (el.dataset.f === 'm' && v > 0) row.m = v;
      if (el.dataset.f === 'a' && isFinite(v)) row.a = v;
    }
    save();
    render();
  });

  $('#expTable').addEventListener('click', e => {
    const b = e.target.closest('.del');
    if (!b) return;
    const id = b.closest('.exprow').dataset.id;
    data.rows = data.rows.filter(r => r.id !== id);
    save();
    render();
    app.changed();
  });

  document.querySelectorAll('#expFit button').forEach(b => b.addEventListener('click', () => {
    data.origin = b.dataset.fit === 'origin';
    save();
    draw();
  }));

  function exportText(sep, comma) {
    const lines = [[t('exp.name'), 'm (kg)', 'a (m/s²)', 'Fa (N)'].join(sep)];
    for (const r of data.rows) lines.push([r.name.replace(/[\t;,\r\n]+/g, ' '), fmt(r.m, 4, comma), fmt(r.a, 4, comma), valid(r) ? fmt(fa(r), 4, comma) : ''].join(sep));
    const { f } = fitRows();
    if (f) {
      lines.push('', [t('res.trendline'), equation(f, comma).replace(/−/g, '-')].join(sep));
      lines.push(['k (N/kg)', sig(f.coef[1], 6, comma)].join(sep));
      if (!data.origin) lines.push(['b (N)', sig(f.coef[0], 6, comma)].join(sep));
      lines.push(['R²', fmt(f.r2, 5, comma)].join(sep));
      lines.push(['μ = k / 9.8', fmt(f.coef[1] / G, 4, comma)].join(sep));
    }
    return lines.join('\r\n');
  }

  $('#expCopy').addEventListener('click', async () => {
    const ok = await copyText(exportText('\t', state.comma));
    app.toast(t(ok ? 'toast.copied' : 'toast.copyFailed'));
  });

  $('#expPng').addEventListener('click', () => {
    const { rows, f } = fitRows();
    const c = document.createElement('canvas');
    drawChart(c, {
      width: 1600, height: 1000, dpr: 1, font: 26,
      xs: rows.map(r => r.m), ys: rows.map(fa), color: '#0071e3',
      xLabel: 'm (kg)', yLabel: 'Fa (N)', comma: state.comma, scatter: true, zero: true,
      title: t('exp.chartTitle'),
      subtitle: f && rows.length >= 2 ? `${equation(f, state.comma)}   R² = ${fmt(f.r2, 4, state.comma)}   μ = ${num(f.coef[1] / G, 3)}` : '',
      trend: f ? f.f : null,
    });
    saveBlob(canvasToBlobSync(c), `${t('exp.file')}.png`).then(r => {
      if (r === 'downloaded') app.toast(t('toast.chartSaved'));
    });
  });

  $('#expClear').addEventListener('click', () => {
    if (!data.rows.length || !confirm(t('exp.confirmClear'))) return;
    data = { rows: [], seq: 0, origin: data.origin };
    save();
    render();
    app.changed();
  });

  window.addEventListener('resize', () => { if (state.step === 5) draw(); });
  window.addEventListener('storage', e => { if (e.key === KEY) { data = load(); if (state.step === 5) render(); } });

  return {
    enter() { data = load(); closePick(); render(); },
    leave() {},
    relabel() { closePick(); render(); },
    get count() { return data.rows.length; },
    exportText,
  };
}
