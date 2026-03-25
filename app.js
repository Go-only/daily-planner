// === Daily Planner — главная логика ===

let currentDate = new Date();
let currentPeriod = 'day';
let statsDate = new Date();

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  initNavigation();
  initAddTask();
  initStats();
  initDataActions();
  renderToday();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// === Навигация ===

function initNavigation() {
  // Нижняя навигация
  document.querySelectorAll('.bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('screen-' + screen).classList.add('active');
      if (screen === 'stats') renderStats();
    });
  });

  // Навигация по дням
  document.getElementById('prev-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    renderToday();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    renderToday();
  });
}

// === Экран «Сегодня» ===

async function renderToday() {
  const dateStr = formatDate(currentDate);
  const today = formatDate(new Date());

  // Обновляем заголовок
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  document.getElementById('current-date').textContent =
    days[currentDate.getDay()] + ', ' + currentDate.getDate() + ' ' + months[currentDate.getMonth()];
  document.getElementById('today-label').textContent = dateStr === today ? 'Сегодня' : '';

  // Получаем данные
  const plan = await getPlan();
  const dayLog = await getDayLog(dateStr);

  // Фильтруем по дате добавления и удаления
  const items = plan.filter(p => p.addedDate <= dateStr && (!p.deletedDate || p.deletedDate > dateStr));

  const list = document.getElementById('tasks-list');
  const progress = document.getElementById('day-progress');

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">&#128221;</div>
        <p>Пока пусто.<br>Добавь первый пункт плана!</p>
      </div>`;
    progress.style.display = 'none';
    return;
  }

  // Рендерим задачи
  list.innerHTML = '';
  let totalPercent = 0;

  for (const item of items) {
    const percent = dayLog[item.id] || 0;
    totalPercent += percent;

    const div = document.createElement('div');
    div.className = 'task-item' + (percent > 0 && percent < 100 ? ' partial' : '');
    div.dataset.percent = percent;

    div.innerHTML = `
      <div class="task-checkbox ${percent === 100 ? 'checked' : ''}" data-id="${item.id}"></div>
      <span class="task-text">${escapeHtml(item.text)}</span>
      ${percent === 100
        ? '<span class="task-percent-label">100%</span>'
        : `<input type="number" class="task-percent-input" data-id="${item.id}"
            value="${percent || ''}" placeholder="0" min="0" max="100" inputmode="numeric">
           <span class="task-percent-label">%</span>`
      }
      <button class="task-delete-btn" data-id="${item.id}" title="Удалить">&times;</button>`;

    list.appendChild(div);
  }

  // Обработчики
  list.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('click', async () => {
      const id = cb.dataset.id;
      const wasChecked = cb.classList.contains('checked');
      const newVal = wasChecked ? 0 : 100;
      await setItemProgress(dateStr, id, newVal);
      renderToday();
    });
  });

  list.querySelectorAll('.task-percent-input').forEach(input => {
    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const id = input.dataset.id;
        let val = parseInt(input.value) || 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;
        if (val === 100) {
          await setItemProgress(dateStr, id, 100);
          renderToday();
        } else {
          await setItemProgress(dateStr, id, val);
          updateDayProgress(items, dateStr);
          // Обновляем визуальный индикатор
          const taskItem = input.closest('.task-item');
          taskItem.dataset.percent = val;
          taskItem.classList.toggle('partial', val > 0);
        }
      }, 300);
    });

    // При потере фокуса — корректируем значение
    input.addEventListener('blur', async () => {
      const id = input.dataset.id;
      let val = parseInt(input.value) || 0;
      if (val < 0) val = 0;
      if (val > 100) val = 100;
      input.value = val || '';
      await setItemProgress(dateStr, id, val);
      if (val === 100) renderToday();
    });
  });

  // Удаление задач
  list.querySelectorAll('.task-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить этот пункт? Он останется в статистике за прошлые дни.')) return;
      await deletePlanItem(btn.dataset.id);
      renderToday();
    });
  });

  // Прогресс-бар
  progress.style.display = 'block';
  updateDayProgress(items, dateStr);
}

async function updateDayProgress(items, dateStr) {
  const dayLog = await getDayLog(dateStr);
  let total = 0;
  for (const item of items) {
    total += (dayLog[item.id] || 0);
  }
  const avg = Math.round(total / items.length);
  document.getElementById('day-percent').textContent = avg + '%';
  document.getElementById('day-fill').style.width = avg + '%';
}

// === Добавление задачи ===

function initAddTask() {
  const input = document.getElementById('new-task-input');
  const btn = document.getElementById('add-task-btn');

  async function add() {
    const text = input.value.trim();
    if (!text) return;
    await addPlanItem(text);
    input.value = '';
    renderToday();
  }

  btn.addEventListener('click', add);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') add();
  });
}

// === Статистика ===

function initStats() {
  document.querySelectorAll('.stats-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      renderStats();
    });
  });
}

function navigateStats(direction) {
  if (currentPeriod === 'day') {
    statsDate.setDate(statsDate.getDate() + direction);
  } else if (currentPeriod === 'week') {
    statsDate.setDate(statsDate.getDate() + direction * 7);
  } else {
    statsDate.setMonth(statsDate.getMonth() + direction);
  }
  renderStats();
}

async function renderStats() {
  const plan = await getPlan();
  const logs = await getAllLogs();
  const content = document.getElementById('stats-content');
  const dateStr = formatDate(statsDate);

  if (plan.length === 0) {
    content.innerHTML = '<div class="empty-state"><p>Добавь пункты в план,<br>чтобы увидеть статистику</p></div>';
    return;
  }

  if (currentPeriod === 'day') {
    renderDayStats(content, plan, logs, dateStr);
  } else if (currentPeriod === 'week') {
    renderWeekStats(content, plan, logs, dateStr);
  } else {
    renderMonthStats(content, plan, logs, dateStr);
  }

  // Обработчики навигации по статистике
  const prevBtn = content.querySelector('.stats-prev');
  const nextBtn = content.querySelector('.stats-next');
  if (prevBtn) prevBtn.addEventListener('click', () => navigateStats(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateStats(1));
}

function renderDayStats(container, plan, logs, dateStr) {
  const dayLog = logs[dateStr] || {};
  const items = filterActiveItems(plan, dateStr);
  const avg = calcDayPercent(dayLog, plan, dateStr);

  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const d = parseDate(dateStr);
  const label = days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];

  let html = `
    <div class="stats-summary">
      <div class="big-number" style="color: ${percentColor(avg)}">${avg}%</div>
      <div class="stats-nav">
        <button class="stats-prev">&#8249;</button>
        <span class="stats-nav-label">${label}</span>
        <button class="stats-next">&#8250;</button>
      </div>
    </div>
    <div class="stats-items">`;

  for (const item of items) {
    const p = dayLog[item.id] || 0;
    html += `
      <div class="stats-item">
        <span class="si-text">${escapeHtml(item.text)}</span>
        <span class="si-percent" style="color: ${percentColor(p)}">${p}%</span>
      </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderWeekStats(container, plan, logs, dateStr) {
  const range = getWeekRange(dateStr);
  const days = getDaysInRange(range.start, range.end);

  // Общий средний
  let weekTotal = 0;
  for (const day of days) {
    const dayLog = logs[day] || {};
    weekTotal += calcDayPercent(dayLog, plan, day);
  }
  const weekAvg = Math.round(weekTotal / days.length);

  // Столбчатый график
  const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  let barsHtml = '';
  for (let i = 0; i < days.length; i++) {
    const dayLog = logs[days[i]] || {};
    const p = calcDayPercent(dayLog, plan, days[i]);
    const h = Math.max(2, p);
    barsHtml += `
      <div class="bar-col">
        <div class="bar" style="height:${h}%;background:${percentColor(p)}"></div>
        <span class="bar-label">${dayLabels[i]}</span>
      </div>`;
  }

  // Статистика по пунктам — показываем задачи, которые были активны хотя бы в один день недели
  const items = plan.filter(p => p.addedDate <= range.end && (!p.deletedDate || p.deletedDate > range.start));
  let itemsHtml = '';
  for (const item of items) {
    const p = calcItemStats(item.id, logs, range.start, range.end);
    itemsHtml += `
      <div class="stats-item">
        <span class="si-text">${escapeHtml(item.text)}</span>
        <span class="si-percent" style="color: ${percentColor(p)}">${p}%</span>
      </div>`;
  }

  // Заголовок навигации
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const startD = parseDate(range.start);
  const endD = parseDate(range.end);
  const weekLabel = startD.getDate() + ' ' + months[startD.getMonth()] +
    ' — ' + endD.getDate() + ' ' + months[endD.getMonth()];

  container.innerHTML = `
    <div class="stats-summary">
      <div class="big-number" style="color: ${percentColor(weekAvg)}">${weekAvg}%</div>
      <div class="stats-nav">
        <button class="stats-prev">&#8249;</button>
        <span class="stats-nav-label">${weekLabel}</span>
        <button class="stats-next">&#8250;</button>
      </div>
    </div>
    <div class="bar-chart">${barsHtml}</div>
    <div class="stats-items">${itemsHtml}</div>`;
}

function renderMonthStats(container, plan, logs, dateStr) {
  const range = getMonthRange(dateStr);
  const days = getDaysInRange(range.start, range.end);
  const firstDay = parseDate(range.start);
  let startWeekday = firstDay.getDay();
  if (startWeekday === 0) startWeekday = 7; // Пн=1

  // Средний за месяц
  let monthTotal = 0;
  for (const day of days) {
    const dayLog = logs[day] || {};
    monthTotal += calcDayPercent(dayLog, plan, day);
  }
  const monthAvg = Math.round(monthTotal / days.length);

  // Календарная сетка
  const headers = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  let calHtml = headers.map(h => `<div class="cal-header">${h}</div>`).join('');

  // Пустые ячейки до первого дня
  for (let i = 1; i < startWeekday; i++) {
    calHtml += '<div class="cal-day empty"></div>';
  }

  for (const day of days) {
    const dayLog = logs[day] || {};
    const p = calcDayPercent(dayLog, plan, day);
    const dayNum = parseInt(day.split('-')[2]);
    let cls = 'none';
    if (p >= 75) cls = 'high';
    else if (p >= 40) cls = 'mid';
    else if (p > 0) cls = 'low';
    calHtml += `<div class="cal-day ${cls}">${dayNum}</div>`;
  }

  // Статистика по пунктам
  const items = plan.filter(p => p.addedDate <= range.end && (!p.deletedDate || p.deletedDate > range.start));
  let itemsHtml = '';
  for (const item of items) {
    const p = calcItemStats(item.id, logs, range.start, range.end);
    itemsHtml += `
      <div class="stats-item">
        <span class="si-text">${escapeHtml(item.text)}</span>
        <span class="si-percent" style="color: ${percentColor(p)}">${p}%</span>
      </div>`;
  }

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const d = parseDate(dateStr);

  container.innerHTML = `
    <div class="stats-summary">
      <div class="big-number" style="color: ${percentColor(monthAvg)}">${monthAvg}%</div>
      <div class="stats-nav">
        <button class="stats-prev">&#8249;</button>
        <span class="stats-nav-label">${monthNames[d.getMonth()]} ${d.getFullYear()}</span>
        <button class="stats-next">&#8250;</button>
      </div>
    </div>
    <div class="calendar-grid">${calHtml}</div>
    <div class="stats-items">${itemsHtml}</div>`;
}

// === Экспорт / Импорт ===

function initDataActions() {
  document.getElementById('export-btn').addEventListener('click', async () => {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daily-planner-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      await importData(text);
      renderToday();
      alert('Данные импортированы!');
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
    e.target.value = '';
  });
}

// === Утилиты ===

function percentColor(p) {
  if (p >= 75) return '#22c55e';
  if (p >= 40) return '#eab308';
  return '#ef4444';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
