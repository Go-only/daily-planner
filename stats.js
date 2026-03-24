// === Расчёт статистики ===

function calcDayPercent(dayLog, planItems, date) {
  const items = planItems.filter(p => p.addedDate <= date);
  if (items.length === 0) return 0;
  let total = 0;
  for (const item of items) {
    total += (dayLog[item.id] || 0);
  }
  return Math.round(total / items.length);
}

function calcItemStats(itemId, logs, startDate, endDate) {
  let sum = 0;
  let days = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = formatDate(current);
    const dayLog = logs[dateStr] || {};
    sum += (dayLog[itemId] || 0);
    days++;
    current.setDate(current.getDate() + 1);
  }

  return days > 0 ? Math.round(sum / days) : 0;
}

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}

function getMonthRange(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: formatDate(start), end: formatDate(end) };
}

function getDaysInRange(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    days.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function formatDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
