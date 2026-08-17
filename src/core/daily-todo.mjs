export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function daysForRange(range, anchorDate) {
  if (range === 'day') return [anchorDate];
  const date = new Date(`${anchorDate}T12:00:00`);
  if (range === 'month') {
    const year = date.getFullYear();
    const month = date.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => localDateKey(new Date(year, month, index + 1, 12)));
  }
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = shiftDate(anchorDate, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export function moveRangeAnchor(range, anchorDate, direction) {
  if (range === 'day') return shiftDate(anchorDate, direction);
  if (range === 'week') return shiftDate(anchorDate, direction * 7);
  const date = new Date(`${anchorDate}T12:00:00`);
  date.setMonth(date.getMonth() + direction, 1);
  return localDateKey(date);
}

export function normalizePomodoros(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(99, Math.round(number)));
}

export function normalizeTask(task, today = localDateKey()) {
  const addedDate = task.addedDate || today;
  return {
    ...task,
    addedDate,
    plannedDate: task.plannedDate || today,
    carryCount: Number.isFinite(task.carryCount) ? task.carryCount : 0,
    pomodoros: normalizePomodoros(task.pomodoros, 0),
    done: Boolean(task.done),
  };
}

export function carryOverTasks(tasks, today = localDateKey()) {
  return tasks.map((raw) => {
    const task = normalizeTask(raw, today);
    if (task.done || task.plannedDate >= today) return task;
    return {
      ...task,
      plannedDate: today,
      carriedFrom: task.plannedDate,
      carryCount: task.carryCount + 1,
    };
  });
}

export function consumeTaskTomatoes(task, available) {
  const amount = normalizePomodoros(task?.pomodoros);
  const stock = Math.max(0, Number(available) || 0);
  if (amount === 0) return { ok: true, amount: 0, remaining: stock };
  if (amount > stock) {
    return { ok: false, amount, remaining: stock, message: '今日食用番茄已经被消化啦！' };
  }
  return { ok: true, amount, remaining: stock - amount };
}

export function buildDailyTodoMarkdown({ date, tasks = [], edibleTomatoes = 0, digestedTomatoes = 0 }) {
  const completedTasks = tasks.filter((task) => task.done);
  const pendingTasks = tasks.filter((task) => !task.done);
  const lines = [
    `# JJtomato 今日 Todo · ${date}`,
    '',
    `- 已食用番茄数量：${edibleTomatoes}`,
    `- 已消化番茄数量：${digestedTomatoes}`,
    `- 完成任务：${completedTasks.length}/${tasks.length}`,
    '',
    '## 今日计划',
    '',
  ];
  if (tasks.length === 0) lines.push('暂无任务', '');
  for (const task of tasks) {
    const amount = normalizePomodoros(task.pomodoros);
    const label = task.done ? 'x' : ' ';
    const tomato = amount === 0 ? '无需番茄' : `${amount} 个番茄`;
    const origin = task.addedDate ? `，添加于 ${task.addedDate}` : '';
    lines.push(`- [${label}] ${task.text}（${tomato}${origin}）`);
  }
  lines.push('', '## 状态', '', `- 待完成：${pendingTasks.length} 项`, `- 导出时间：${new Date().toLocaleString()}`, '');
  return lines.join('\n');
}

export function buildMultiDayMarkdown({ dates = [], history = {}, today, currentTasks = [], edibleTomatoes = 0, digestedTomatoes = 0 }) {
  return dates.map((date) => {
    const record = date === today
      ? { tasks: currentTasks, edibleTomatoes, digestedTomatoes }
      : history[date] || { tasks: [], edibleTomatoes: 0, digestedTomatoes: 0 };
    return buildDailyTodoMarkdown({ date, ...record });
  }).join('\n\n---\n\n');
}
