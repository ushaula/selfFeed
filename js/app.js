import * as db from './db.js';
import { LEVELS, LEVEL_BY_ID, addDays, diffDays, formatDay, todayKey, validateEntry, weekStart } from './rules.js';
import { buckets, coverage, distribution, missingDays } from './stats.js';

const app = document.getElementById('app');
const ui = { selectedDay: null, bucket: 'week', showAllMissing: false };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lvClass = (id) => `lv-${id}`;
const badge = (id) => `<span class="badge ${lvClass(id)}">${esc(LEVEL_BY_ID[id].label)}</span>`;
const shortDay = (d) => formatDay(d, { day: 'numeric', month: 'short' });

function levelPicker() {
  return `<div class="levels" role="group" aria-label="Duygu durumu">${LEVELS.map(
    (l) => `<button type="button" class="lv ${lvClass(l.id)}" data-level="${l.id}" aria-pressed="false">${esc(l.label)}</button>`,
  ).join('')}</div>`;
}

function entryForm({ topicId, day, noteRequired, buttonText, warning }) {
  return `<div class="entry-form" data-topic="${esc(topicId)}" data-day="${day}" data-bf="${noteRequired ? 1 : 0}">
    ${levelPicker()}
    <textarea placeholder="${noteRequired ? 'Not (zorunlu)' : 'Not (isteğe bağlı)'}" aria-label="Not"></textarea>
    <div class="error" role="alert"></div>
    <button type="button" class="primary save" disabled>${esc(buttonText)}</button>
    <p class="muted">${esc(warning)}</p>
  </div>`;
}

// ---------- Görünümler ----------

async function viewToday() {
  const today = todayKey();
  const [topics, entries] = await Promise.all([db.listTopics(), db.listAllEntries()]);
  const active = topics.filter((t) => !t.archived);
  const archived = topics.filter((t) => t.archived);
  const byKey = new Map(entries.map((e) => [`${e.topicId}|${e.day}`, e]));

  const cards = active
    .map((t) => {
      const mine = entries.filter((e) => e.topicId === t.id);
      const e = byKey.get(`${t.id}|${today}`);
      const missing = missingDays(t, mine, today).length;
      const body = e
        ? `<div>${badge(e.level)} <span class="muted">bugün kaydedildi</span></div>${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}`
        : entryForm({
            topicId: t.id,
            day: today,
            noteRequired: false,
            buttonText: 'Kaydet',
            warning: 'Kaydettikten sonra değiştirilemez. Acele etme.',
          });
      const missingLink = missing
        ? `<p class="muted"><a href="#/topic/${esc(t.id)}">${missing} boş gün var →</a></p>`
        : '';
      return `<section class="card"><h2><a href="#/topic/${esc(t.id)}">${esc(t.title)}</a></h2>${body}${missingLink}</section>`;
    })
    .join('');

  const archivedHtml = archived.length
    ? `<h3>Arşivlenen konular</h3><div class="card">${archived
        .map((t) => `<div><a href="#/topic/${esc(t.id)}">${esc(t.title)}</a></div>`)
        .join('')}</div>`
    : '';

  return `<h1>Bugün</h1><p class="muted">${esc(formatDay(today))}</p>
    ${cards || `<div class="card empty"><p>Henüz bir konu yok.</p><a class="primary" style="display:inline-block;padding:11px 16px;border-radius:10px;background:var(--accent);color:#fff" href="#/new">İlk konunu başlat</a></div>`}
    ${archivedHtml}`;
}

function viewNew() {
  return `<h1>Yeni konu</h1>
    <p class="muted">Takip etmek istediğin bir soru ya da başlık yaz. Başlangıç tarihi bugündür ve sonradan değişmez.</p>
    <div class="card">
      <input type="text" id="new-title" maxlength="120" placeholder="Örn: İşim bana nasıl hissettiriyor?" aria-label="Başlık" />
      <div class="error" role="alert"></div>
      <button type="button" class="primary" id="create-topic">Başlat</button>
    </div>`;
}

function heatmap(topic, byDay, today) {
  const start = weekStart(topic.startDay);
  const weeks = diffDays(start, weekStart(today)) / 7 + 1;
  let cells = '';
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      const sel = ui.selectedDay === day ? ' sel' : '';
      const tod = day === today ? ' today' : '';
      const label = esc(shortDay(day));
      if (day < topic.startDay || day > today) {
        cells += `<span class="cell hidden"></span>`;
      } else {
        const e = byDay.get(day);
        cells += e
          ? `<button class="cell filled ${lvClass(e.level)}${e.backfilled ? ' bf' : ''}${sel}${tod}" data-day="${day}" aria-label="${label}: ${esc(LEVEL_BY_ID[e.level].label)}"></button>`
          : `<button class="cell empty${sel}${tod}" data-day="${day}" aria-label="${label}: boş"></button>`;
      }
    }
  }
  const dayNames = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((n) => `<span>${n}</span>`).join('');
  const legend = LEVELS.map((l) => `<span><i class="dot ${lvClass(l.id)}"></i>${esc(l.label)}</span>`).join('');
  return `<div class="heat-wrap"><div class="heat-days">${dayNames}</div><div class="heat-scroll"><div class="heat">${cells}</div></div></div>
    <div class="legend">${legend}<span>○ boş gün</span><span>● sonradan girildi</span></div>`;
}

function distributionHtml(entries) {
  const counts = distribution(entries);
  const total = entries.length || 1;
  const segs = LEVELS.map((l) => `<div class="seg ${lvClass(l.id)}" style="flex:${counts[l.id]}" title="${esc(l.label)}: ${counts[l.id]}"></div>`).join('');
  const rows = LEVELS.map(
    (l) => `<div class="row" style="justify-content:space-between"><span><i class="dot ${lvClass(l.id)}"></i>${esc(l.label)}</span><span>${counts[l.id]} <span class="muted">(%${Math.round((counts[l.id] / total) * 100)})</span></span></div>`,
  ).join('');
  return `<div class="stack">${segs}</div><div style="margin-top:8px">${rows}</div>`;
}

function trendHtml(entries) {
  const list = buckets(entries, ui.bucket, 12);
  const bars = [...list]
    .map((b) => {
      const segs = [...LEVELS]
        .reverse()
        .map((l) => `<div class="seg ${lvClass(l.id)}" style="flex:${b.counts[l.id]}" title="${esc(l.label)}: ${b.counts[l.id]}"></div>`)
        .join('');
      const label = ui.bucket === 'month' ? b.key.slice(5) + '/' + b.key.slice(2, 4) : shortDay(b.key);
      return `<div class="bar"><div class="col">${segs}</div><span>${esc(label)}</span><span>${b.total}</span></div>`;
    })
    .join('');
  return `<div class="row" style="justify-content:space-between;margin-bottom:8px">
      <span class="muted">Dilimdeki kayıtların dağılımı (altta kayıt sayısı)</span>
      <span class="seg-switch"><button data-bucket="week" aria-pressed="${ui.bucket === 'week'}">Hafta</button><button data-bucket="month" aria-pressed="${ui.bucket === 'month'}">Ay</button></span>
    </div>
    ${bars ? `<div class="bars">${bars}</div>` : '<p class="muted">Henüz veri yok.</p>'}`;
}

function dayDetail(topic, byDay, today) {
  const day = ui.selectedDay;
  if (!day) return '';
  const title = esc(formatDay(day));
  const e = byDay.get(day);
  if (e) {
    return `<div class="card"><strong>${title}</strong><div style="margin-top:6px">${badge(e.level)}${e.backfilled ? '<span class="tag">sonradan girildi</span>' : ''}</div>
      ${e.note ? `<p class="note">${esc(e.note)}</p>` : '<p class="muted">Not yok.</p>'}
      <p class="muted">Kayıt zamanı: ${esc(new Date(e.enteredAt).toLocaleString('tr-TR'))}</p></div>`;
  }
  if (day === today) {
    return `<div class="card"><strong>${title}</strong><p class="muted">Bugünü <a href="#/">Bugün</a> sekmesinden kaydedebilirsin.</p></div>`;
  }
  return `<div class="card"><strong>${title}</strong> <span class="tag">boş gün</span>
    ${entryForm({
      topicId: topic.id,
      day,
      noteRequired: true,
      buttonText: 'Sonradan ekle',
      warning: 'Not zorunlu. Kayıt "sonradan girildi" olarak işaretlenir ve değiştirilemez.',
    })}</div>`;
}

async function viewTopic(id) {
  const topic = await db.getTopic(id);
  if (!topic) return `<h1>Konu bulunamadı</h1><p><a href="#/">Geri dön</a></p>`;
  const today = todayKey();
  const entries = await db.listEntries(id);
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const cov = coverage(topic, entries, today);
  const missing = missingDays(topic, entries, today);
  const shownMissing = ui.showAllMissing ? missing : missing.slice(0, 14);

  const missingHtml = missing.length
    ? `<h3>Boş günler (${missing.length})</h3><div class="card"><div class="chips">${shownMissing
        .map((d) => `<button class="chip${ui.selectedDay === d ? ' sel' : ''}" data-day="${d}">${esc(shortDay(d))}</button>`)
        .join('')}</div>${
        missing.length > shownMissing.length
          ? `<p><button class="ghost" id="show-missing">Tümünü göster</button></p>`
          : ''
      }<p class="muted">Bir güne dokunup not yazarak doldurabilirsin.</p></div>`
    : '';

  const log = [...entries]
    .reverse()
    .filter((e) => e.note)
    .map(
      (e) => `<li><div>${esc(formatDay(e.day, { day: 'numeric', month: 'long', year: 'numeric' }))} ${badge(e.level)}${e.backfilled ? '<span class="tag">sonradan</span>' : ''}</div><p class="note">${esc(e.note)}</p></li>`,
    )
    .join('');

  return `<p><a href="#/">← Bugün</a></p>
    <h1>${esc(topic.title)}${topic.archived ? ' <span class="tag">arşivde</span>' : ''}</h1>
    <p class="muted">${esc(formatDay(topic.startDay, { day: 'numeric', month: 'long', year: 'numeric' }))} tarihinden beri · ${cov.entered}/${cov.elapsed} gün kayıtlı${cov.backfilled ? ` · ${cov.backfilled} sonradan girildi` : ''}</p>
    <h3>Takvim</h3><div class="card">${heatmap(topic, byDay, today)}</div>
    ${dayDetail(topic, byDay, today)}
    ${missingHtml}
    <h3>Dağılım</h3><div class="card">${distributionHtml(entries)}</div>
    <h3>Zaman içinde</h3><div class="card">${trendHtml(entries)}</div>
    ${log ? `<h3>Notlar</h3><div class="card"><ul class="log">${log}</ul></div>` : ''}
    <p><button class="ghost" id="toggle-archive" data-id="${esc(topic.id)}" data-archived="${topic.archived ? 1 : 0}">${topic.archived ? 'Arşivden çıkar' : 'Arşivle (Bugün listesinden kaldır)'}</button></p>`;
}

async function viewData() {
  const last = await db.getMeta('lastBackup');
  const stale = !last || diffDays(last.slice(0, 10), todayKey()) > 14;
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  return `<h1>Yedek ve aktarım</h1>
    <p class="muted">Veriler yalnızca bu cihazdaki tarayıcıda durur. Düzenli yedek al.</p>
    <div class="card">
      <h2>Dışa aktar</h2>
      <p class="muted">Son yedek: ${last ? esc(new Date(last).toLocaleString('tr-TR')) : 'hiç alınmadı'}</p>
      ${stale ? '<div class="notice">Uzun zamandır yedek almadın.</div>' : ''}
      <div class="row">
        <button class="primary" id="export-json">JSON (yedek)</button>
        <button class="primary" id="export-csv">CSV (Excel/analiz)</button>
      </div>
      <div class="error" id="export-msg" role="alert"></div>
    </div>
    <div class="card">
      <h2>İçe aktar</h2>
      <p class="muted">Var olan kayıtların üzerine yazmaz, yalnızca eksikleri ekler.</p>
      <label class="primary">JSON dosyası seç<input type="file" id="import-file" accept="application/json,.json" hidden /></label>
      <div class="error" id="import-msg" role="alert"></div>
    </div>
    <p class="muted">Kalıcı depolama: ${persisted ? 'verildi' : 'verilmedi (ana ekrana ekleyince iOS verini korur)'}.</p>`;
}

// ---------- Yönlendirme ----------

async function render() {
  const hash = location.hash || '#/';
  const [, route, arg] = hash.split('/');
  let html;
  try {
    if (route === 'new') html = viewNew();
    else if (route === 'data') html = await viewData();
    else if (route === 'topic' && arg) html = await viewTopic(decodeURIComponent(arg));
    else html = await viewToday();
  } catch (err) {
    html = `<div class="card"><h2>Bir şeyler ters gitti</h2><p class="muted">${esc(err.message)}</p></div>`;
  }
  app.innerHTML = html;
  const tab = route === 'new' ? 'new' : route === 'data' ? 'data' : 'today';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  const scroller = app.querySelector('.heat-scroll');
  if (scroller) scroller.scrollLeft = scroller.scrollWidth;
}

window.addEventListener('hashchange', () => {
  ui.selectedDay = null;
  ui.showAllMissing = false;
  render();
});
// Uygulama gece açık kalırsa yeni güne geçince yeniden çiz (yazılmakta olan bir şeyi bozmadan).
let renderedDay = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayKey() !== renderedDay) {
    renderedDay = todayKey();
    render();
  }
});

// ---------- Etkileşim ----------

function download(name, mime, text) {
  const blob = new Blob([text], { type: mime });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function shareOrDownload(name, mime, text) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }
  }
  download(name, mime, text);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function exportFile(kind) {
  const msg = document.getElementById('export-msg');
  msg.textContent = '';
  try {
    const data = await db.exportAll();
    const stamp = todayKey();
    if (kind === 'json') {
      await shareOrDownload(`duygu-gunlugu-${stamp}.json`, 'application/json', JSON.stringify(data, null, 2));
    } else {
      const titles = new Map(data.topics.map((t) => [t.id, t.title]));
      const rows = [['Konu', 'Gün', 'Duygu', 'Not', 'Sonradan girildi', 'Kayıt zamanı']];
      for (const e of [...data.entries].sort((a, b) => a.topicId.localeCompare(b.topicId) || a.day.localeCompare(b.day))) {
        rows.push([titles.get(e.topicId), e.day, LEVEL_BY_ID[e.level].label, e.note, e.backfilled ? 'evet' : 'hayır', e.enteredAt]);
      }
      const text = '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
      await shareOrDownload(`duygu-gunlugu-${stamp}.csv`, 'text/csv;charset=utf-8', text);
    }
    if (kind === 'json') await db.setMeta('lastBackup', new Date().toISOString());
    await render();
  } catch (err) {
    if (err.name !== 'AbortError') msg.textContent = err.message;
  }
}

async function saveEntry(form) {
  const err = form.querySelector('.error');
  err.textContent = '';
  const level = form.querySelector('.lv[aria-pressed="true"]')?.dataset.level;
  const note = form.querySelector('textarea').value;
  const backfill = form.dataset.bf === '1';
  const check = validateEntry({
    topic: { startDay: '0000-01-01' },
    day: form.dataset.day,
    level,
    note,
    today: todayKey(),
    exists: false,
  });
  if (!check.ok) {
    err.textContent = check.error;
    return;
  }
  const warn = backfill
    ? 'Bu kayıt "sonradan girildi" olarak işaretlenecek ve değiştirilemeyecek. Emin misin?'
    : 'Bu kayıt sonradan değiştirilemez. Emin misin?';
  if (!confirm(warn)) return;
  try {
    await db.addEntry({ topicId: form.dataset.topic, day: form.dataset.day, level, note });
    await render();
  } catch (e) {
    err.textContent = e.message;
  }
}

app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, label');
  if (!t) return;

  if (t.classList.contains('lv')) {
    const form = t.closest('.entry-form');
    form.querySelectorAll('.lv').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
    form.querySelector('.save').disabled = false;
  } else if (t.classList.contains('save')) {
    await saveEntry(t.closest('.entry-form'));
  } else if (t.id === 'create-topic') {
    const input = document.getElementById('new-title');
    try {
      const topic = await db.addTopic(input.value);
      location.hash = `#/topic/${encodeURIComponent(topic.id)}`;
    } catch (e) {
      app.querySelector('.error').textContent = e.message;
    }
  } else if (t.dataset.day && (t.classList.contains('cell') || t.classList.contains('chip'))) {
    ui.selectedDay = ui.selectedDay === t.dataset.day ? null : t.dataset.day;
    await render();
  } else if (t.dataset.bucket) {
    ui.bucket = t.dataset.bucket;
    await render();
  } else if (t.id === 'show-missing') {
    ui.showAllMissing = true;
    await render();
  } else if (t.id === 'toggle-archive') {
    await db.setArchived(t.dataset.id, t.dataset.archived !== '1');
    await render();
  } else if (t.id === 'export-json') {
    await exportFile('json');
  } else if (t.id === 'export-csv') {
    await exportFile('csv');
  }
});

app.addEventListener('change', async (ev) => {
  if (ev.target.id !== 'import-file') return;
  const msg = document.getElementById('import-msg');
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const res = await db.importData(JSON.parse(await file.text()));
    msg.style.color = 'var(--text)';
    msg.textContent = `Eklendi: ${res.topics} konu, ${res.entries} kayıt. Atlanan (zaten var/geçersiz): ${res.skipped}.`;
  } catch (e) {
    msg.style.color = '';
    msg.textContent = e instanceof SyntaxError ? 'Dosya geçerli bir JSON değil.' : e.message;
  }
});

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
