import { LEVELS, addDays, diffDays, weekStart } from './rules.js';

export function distribution(entries) {
  const counts = Object.fromEntries(LEVELS.map((l) => [l.id, 0]));
  for (const e of entries) counts[e.level] += 1;
  return counts;
}

// Haftalık/aylık gruplar (eskiden yeniye), son `limit` dilim.
export function buckets(entries, kind, limit = 12) {
  const map = new Map();
  for (const e of entries) {
    const key = kind === 'month' ? e.day.slice(0, 7) : weekStart(e.day);
    if (!map.has(key)) map.set(key, { key, counts: distribution([]), total: 0 });
    const b = map.get(key);
    b.counts[e.level] += 1;
    b.total += 1;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-limit);
}

// Başlangıçtan dünün sonuna kadar kaydı olmayan günler (yeniden eskiye).
export function missingDays(topic, entries, today) {
  const have = new Set(entries.map((e) => e.day));
  const out = [];
  for (let d = addDays(today, -1); d >= topic.startDay; d = addDays(d, -1)) {
    if (!have.has(d)) out.push(d);
  }
  return out;
}

export function coverage(topic, entries, today) {
  return {
    entered: entries.length,
    elapsed: diffDays(topic.startDay, today) + 1,
    backfilled: entries.filter((e) => e.backfilled).length,
  };
}
