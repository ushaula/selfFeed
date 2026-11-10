// IndexedDB katmanı. Kayıtlar için bilinçli olarak güncelleme/silme fonksiyonu YOK.
import { LEVEL_BY_ID, isDay, todayKey, validateEntry } from './rules.js';

const DB_NAME = 'duygu-gunlugu';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('topics', { keyPath: 'id' });
      const entries = db.createObjectStore('entries', { keyPath: ['topicId', 'day'] });
      entries.createIndex('byTopic', 'topicId');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

const wrap = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function listTopics() {
  const topics = await wrap((await store('topics')).getAll());
  return topics.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getTopic(id) {
  return wrap((await store('topics')).get(id));
}

export async function addTopic(title) {
  const clean = String(title ?? '').trim();
  if (!clean) throw new Error('Bir başlık yaz.');
  const topic = {
    id: crypto.randomUUID(),
    title: clean,
    startDay: todayKey(),
    archived: false,
    createdAt: new Date().toISOString(),
  };
  await wrap((await store('topics', 'readwrite')).add(topic));
  return topic;
}

export async function setArchived(id, archived) {
  const s = await store('topics', 'readwrite');
  const topic = await wrap(s.get(id));
  if (!topic) return;
  topic.archived = archived;
  await wrap(s.put(topic));
}

export async function listEntries(topicId) {
  const s = await store('entries');
  const list = await wrap(s.index('byTopic').getAll(topicId));
  return list.sort((a, b) => a.day.localeCompare(b.day));
}

export async function listAllEntries() {
  return wrap((await store('entries')).getAll());
}

export async function addEntry({ topicId, day, level, note }) {
  const topic = await getTopic(topicId);
  const cleanNote = String(note ?? '').trim();
  const check = validateEntry({ topic, day, level, note: cleanNote, today: todayKey(), exists: false });
  if (!check.ok) throw new Error(check.error);
  const entry = {
    topicId,
    day,
    level,
    note: cleanNote,
    backfilled: check.backfilled,
    enteredAt: new Date().toISOString(),
  };
  try {
    await wrap((await store('entries', 'readwrite')).add(entry)); // add: aynı gün varsa reddedilir
  } catch (err) {
    if (err?.name === 'ConstraintError') throw new Error('Bu gün için kayıt zaten var, değiştirilemez.');
    throw err;
  }
  return entry;
}

export async function getMeta(key) {
  const row = await wrap((await store('meta')).get(key));
  return row?.value;
}

export async function setMeta(key, value) {
  await wrap((await store('meta', 'readwrite')).put({ key, value }));
}

export async function exportAll() {
  return {
    app: 'duygu-gunlugu',
    version: 1,
    exportedAt: new Date().toISOString(),
    topics: await listTopics(),
    entries: await listAllEntries(),
  };
}

function validTopic(t) {
  return t && typeof t.id === 'string' && typeof t.title === 'string' && t.title.trim() && isDay(t.startDay);
}

function validEntry(e) {
  return (
    e &&
    typeof e.topicId === 'string' &&
    isDay(e.day) &&
    LEVEL_BY_ID[e.level] &&
    typeof e.note === 'string' &&
    typeof e.backfilled === 'boolean' &&
    typeof e.enteredAt === 'string' &&
    (!e.backfilled || e.note.trim())
  );
}

// Birleştirme: var olan kayıtların üzerine ASLA yazmaz; yalnızca eksikleri ekler.
export async function importData(data) {
  if (data?.app !== 'duygu-gunlugu' || !Array.isArray(data.topics) || !Array.isArray(data.entries)) {
    throw new Error('Bu dosya Duygu Günlüğü yedeği gibi görünmüyor.');
  }
  // İşlem açıkken başka async iş yapılmamalı; bu yüzden önce okuyoruz.
  const existingTopics = new Set((await listTopics()).map((t) => t.id));
  const db = await open();
  const tx = db.transaction(['topics', 'entries'], 'readwrite');
  const result = { topics: 0, entries: 0, skipped: 0 };

  const addOne = (storeName, value, counter) =>
    new Promise((resolve) => {
      const req = tx.objectStore(storeName).add(value);
      req.onsuccess = () => {
        result[counter] += 1;
        resolve();
      };
      req.onerror = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        result.skipped += 1;
        resolve();
      };
    });

  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  const knownTopics = new Set(existingTopics);
  for (const t of data.topics) {
    if (!validTopic(t)) {
      result.skipped += 1;
      continue;
    }
    knownTopics.add(t.id);
    await addOne(
      'topics',
      {
        id: t.id,
        title: t.title.trim(),
        startDay: t.startDay,
        archived: !!t.archived,
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      },
      'topics',
    );
  }
  for (const e of data.entries) {
    if (!validEntry(e) || !knownTopics.has(e.topicId)) {
      result.skipped += 1;
      continue;
    }
    await addOne(
      'entries',
      {
        topicId: e.topicId,
        day: e.day,
        level: e.level,
        note: e.note.trim(),
        backfilled: e.backfilled,
        enteredAt: e.enteredAt,
      },
      'entries',
    );
  }
  await done;
  return result;
}
