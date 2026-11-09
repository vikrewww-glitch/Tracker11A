// История трекингов: данные (без видео) в IndexedDB — калибровка, масса, точки, отсчёты и миниатюра.
// Экспорт/импорт в JSON-файл — для резервной копии и переноса на другое устройство.
import { polyfit } from './physics.js?v=20261109154903';
import { saveBlob } from './export.js?v=20261109154903';
import { t, num, getLang } from './i18n.js?v=20261109154903';

const DB = 'tracker11a', STORE = 'tracks';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const x = d.transaction(STORE, mode);
    const store = x.objectStore(STORE);
    const res = fn(store);
    x.oncomplete = () => resolve(res && 'result' in res ? res.result : undefined);
    x.onerror = () => reject(x.error);
    x.onabort = () => reject(x.error);
  });
}

export const listTracks = async () => ((await tx('readonly', s => s.getAll())) || []).sort((a, b) => b.date - a.date);
export const getTrack = id => tx('readonly', s => s.get(id));
export const putTrack = rec => tx('readwrite', s => { s.put(rec); });
export const deleteTrack = id => tx('readwrite', s => { s.delete(id); });

// Ускорение 2·A из квадратичного тренда координаты — на участке, выбранном при «Добавить в эксперимент»,
// а если его нет — по всем сохранённым отсчётам.
export function trackAcc(rec) {
  const e = rec.exp;
  const pts = e ? rec.samples.filter(s => s.frame >= e.from && s.frame <= e.to) : rec.samples;
  const axis = e ? e.axis : 'x';
  const f = polyfit(pts.map(s => s.t), pts.map(s => s[axis]), 2);
  return f ? 2 * f.coef[2] : null;
}

const validRecord = r => r && typeof r.id === 'string' && Array.isArray(r.samples) &&
  r.samples.every(s => isFinite(s.t) && isFinite(s.x) && isFinite(s.y));

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function initHistory(app) {
  const { state } = app;
  const $ = s => document.querySelector(s);
  let tracks = [];

  const date = ms => new Date(ms).toLocaleString(getLang() === 'pt' ? 'pt-PT' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function render() {
    try {
      tracks = await listTracks();
    } catch {
      tracks = [];
      $('#histEmpty').textContent = t('hist.unavailable');
    }
    $('#histEmpty').classList.toggle('hidden', tracks.length > 0);
    $('#histList').classList.toggle('hidden', !tracks.length);
    $('#histList').innerHTML = tracks.map(r => {
      const meta = [date(r.date), t('hist.points', { n: r.samples.length })];
      if (r.mass > 0) meta.push(`m = ${num(r.mass, 3).replace(/0+$/, '').replace(/[.,]$/, '')} kg`);
      return `<div class="histrow" data-id="${r.id}">
        <button class="thumb" data-act="open" aria-label="${t('hist.open')}">${r.thumb ? `<img src="${r.thumb}" alt="">` : ''}</button>
        <div class="histtext">
          <input type="text" class="histname" value="${escapeHtml(r.name)}" aria-label="${t('hist.rename')}" autocomplete="off" spellcheck="false">
          <small>${meta.join(' · ')}</small>
          <button class="btn tinted small" data-act="open">${t('hist.open')}</button>
        </div>
        <button class="del" data-act="delete" aria-label="${t('hist.delete')}"><svg class="i"><use href="#i-trash"/></svg></button>
      </div>`;
    }).join('');
  }

  $('#histList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('.histrow').dataset.id;
    if (b.dataset.act === 'open') {
      const rec = await getTrack(id);
      if (rec) app.openArchived(rec);
    } else if (b.dataset.act === 'delete') {
      const rec = tracks.find(r => r.id === id);
      if (!confirm(t('hist.confirmDelete', { name: rec ? rec.name : '' }))) return;
      await deleteTrack(id);
      if (state.historyId === id) state.historyId = null;
      render();
    }
  });

  $('#histList').addEventListener('change', async e => {
    const el = e.target.closest('.histname');
    if (!el) return;
    const rec = await getTrack(el.closest('.histrow').dataset.id);
    if (!rec) return;
    const name = el.value.trim();
    if (!name) { el.value = rec.name; return; }
    rec.name = name;
    await putTrack(rec);
    if (state.archived && state.archived.id === rec.id) state.archived.name = name;
  });

  $('#histExport').addEventListener('click', async () => {
    const all = await listTracks();
    if (!all.length) { app.toast(t('hist.nothing')); return; }
    const json = JSON.stringify({ app: 'Tracker11A', version: 1, exported: new Date().toISOString(), tracks: all });
    const day = new Date().toISOString().slice(0, 10);
    saveBlob(new Blob([json], { type: 'application/json' }), `Tracker11A_${t('hist.file')}_${day}.json`);
  });

  $('#histImportBtn').addEventListener('click', () => $('#histImport').click());
  $('#histImport').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const recs = (Array.isArray(d) ? d : d.tracks || []).filter(validRecord);
      if (!recs.length) throw new Error('empty');
      for (const r of recs) await putTrack(r);
      app.toast(t('hist.imported', { n: recs.length }));
      render();
    } catch {
      app.toast(t('hist.importFailed'));
    }
  });

  return {
    enter: render,
    leave() {},
    relabel: render,
  };
}
