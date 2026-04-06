// === IndexedDB — хранение плана и ежедневных записей ===

const DB_NAME = 'daily-planner';
const DB_VERSION = 2;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('plan')) {
        db.createObjectStore('plan', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        db.createObjectStore('logs', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

// === План ===

async function getPlan() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plan', 'readonly');
    const store = tx.objectStore('plan');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function addPlanItem(text, schedule) {
  const db = await openDB();
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    text,
    schedule,
    addedDate: getTodayStr(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plan', 'readwrite');
    const store = tx.objectStore('plan');
    const req = store.add(item);
    req.onsuccess = () => resolve(item);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deletePlanItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('plan', 'readwrite');
    const store = tx.objectStore('plan');
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (!item) return resolve();
      item.deletedDate = getTodayStr();
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// === Дневные записи ===

async function getDayLog(date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('logs', 'readonly');
    const store = tx.objectStore('logs');
    const req = store.get(date);
    req.onsuccess = () => resolve(req.result ? req.result.items : {});
    req.onerror = (e) => reject(e.target.error);
  });
}

async function setItemProgress(date, itemId, percent) {
  const db = await openDB();
  const log = await getDayLog(date);
  log[itemId] = percent;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');
    const req = store.put({ date, items: log });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('logs', 'readonly');
    const store = tx.objectStore('logs');
    const req = store.getAll();
    req.onsuccess = () => {
      const map = {};
      for (const entry of req.result || []) {
        map[entry.date] = entry.items;
      }
      resolve(map);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// === Настройки выходных дней ===

const DEFAULT_DAYS_OFF = [0, 6]; // Вс, Сб

async function getDaysOffHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('daysoff');
    req.onsuccess = () => {
      const record = req.result;
      resolve(record ? record.history : []);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getDaysOffForDate(dateStr) {
  const history = await getDaysOffHistory();
  if (history.length === 0) return DEFAULT_DAYS_OFF;
  // Ищем последнюю запись с effectiveFrom <= dateStr
  let result = DEFAULT_DAYS_OFF;
  for (const entry of history) {
    if (entry.effectiveFrom <= dateStr) {
      result = entry.days;
    }
  }
  return result;
}

async function getCurrentDaysOff() {
  const history = await getDaysOffHistory();
  if (history.length === 0) return DEFAULT_DAYS_OFF;
  return history[history.length - 1].days;
}

async function setDaysOff(days) {
  const db = await openDB();
  const history = await getDaysOffHistory();
  const today = getTodayStr();

  // Если последняя запись на сегодня — обновляем её
  if (history.length > 0 && history[history.length - 1].effectiveFrom === today) {
    history[history.length - 1].days = days;
  } else {
    history.push({ effectiveFrom: today, days });
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ id: 'daysoff', history });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// === Экспорт / Импорт ===

async function exportData() {
  const plan = await getPlan();
  const logs = await getAllLogs();
  const daysOffHistory = await getDaysOffHistory();
  return JSON.stringify({ plan, logs, daysOffHistory }, null, 2);
}

async function importData(jsonStr) {
  const data = JSON.parse(jsonStr);
  const db = await openDB();

  // Импорт плана
  const txPlan = db.transaction('plan', 'readwrite');
  const storePlan = txPlan.objectStore('plan');
  storePlan.clear();
  for (const item of data.plan) {
    storePlan.add(item);
  }

  // Импорт логов
  const txLogs = db.transaction('logs', 'readwrite');
  const storeLogs = txLogs.objectStore('logs');
  storeLogs.clear();
  for (const [date, items] of Object.entries(data.logs)) {
    storeLogs.add({ date, items });
  }

  // Импорт настроек выходных
  if (data.daysOffHistory) {
    const txSettings = db.transaction('settings', 'readwrite');
    const storeSettings = txSettings.objectStore('settings');
    storeSettings.put({ id: 'daysoff', history: data.daysOffHistory });
  }
}

// === Утилита ===

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
