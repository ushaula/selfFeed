// Saf (yan etkisiz) kurallar ve tarih yardımcıları. Gün anahtarı: yerel saatle "YYYY-MM-DD".

export const LEVELS = [
  { id: 'starNeg', label: '★ Çok olumsuz' },
  { id: 'neg', label: 'Olumsuz' },
  { id: 'neutral', label: 'Nötr' },
  { id: 'mixed', label: 'Karışık' },
  { id: 'pos', label: 'Olumlu' },
  { id: 'starPos', label: '★ Çok olumlu' },
];
export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86400000;

export function isDay(s) {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function todayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function toUtc(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day, n) {
  const dt = new Date(toUtc(day) + n * MS_DAY);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / MS_DAY);
}

// Pazartesi başlangıçlı hafta
export function weekStart(day) {
  const dow = (new Date(toUtc(day)).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export function formatDay(day, opts = { day: 'numeric', month: 'long', weekday: 'long' }) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', opts);
}

/**
 * Yeni kayıt kuralları. Düzenleme/silme yoktur; yalnızca ekleme vardır.
 * Dönüş: { ok: true, backfilled } veya { ok: false, error }
 */
export function validateEntry({ topic, day, level, note, today, exists }) {
  const fail = (error) => ({ ok: false, error });
  if (!topic) return fail('Konu bulunamadı.');
  if (!LEVEL_BY_ID[level]) return fail('Bir duygu durumu seç.');
  if (!isDay(day)) return fail('Geçersiz gün.');
  if (day > today) return fail('Gelecek güne kayıt girilemez.');
  if (day < topic.startDay) return fail('Konunun başlangıcından önceki güne kayıt girilemez.');
  if (exists) return fail('Bu gün için kayıt zaten var, değiştirilemez.');
  const backfilled = day < today;
  if (backfilled && !String(note ?? '').trim()) {
    return fail('Geçmiş günü doldurmak için not yazman gerekiyor.');
  }
  return { ok: true, backfilled };
}
