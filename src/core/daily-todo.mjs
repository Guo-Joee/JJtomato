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
  const subtasks = Array.isArray(task.subtasks)
    ? task.subtasks.map((subtask) => normalizeTask(subtask, task.plannedDate || today))
    : [];
  return {
    ...task,
    addedDate,
    plannedDate: task.plannedDate || today,
    carryCount: Number.isFinite(task.carryCount) ? task.carryCount : 0,
    pomodoros: normalizePomodoros(task.pomodoros, 0),
    done: Boolean(task.done),
    subtasks,
  };
}

export function summarizeTaskTree(task) {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  if (!subtasks.length) {
    const pomodoros = normalizePomodoros(task?.pomodoros);
    return { pomodoros, eaten: task?.started ? pomodoros : 0, digested: task?.done ? pomodoros : 0 };
  }
  return subtasks.reduce((summary, subtask) => {
    const next = summarizeTaskTree(subtask);
    return { pomodoros: summary.pomodoros + next.pomodoros, eaten: summary.eaten + next.eaten, digested: summary.digested + next.digested };
  }, { pomodoros: 0, eaten: 0, digested: 0 });
}

export function addSubtask(task, subtask) {
  const parent = normalizeTask(task);
  const child = normalizeTask({ ...subtask, parentId: parent.id, done: false }, parent.plannedDate);
  return { ...parent, pomodoros: 0, subtasks: [...parent.subtasks, child] };
}

export function completeTaskTree(task) {
  const normalized = normalizeTask(task);
  return { ...normalized, done: true, subtasks: normalized.subtasks.map((subtask) => completeTaskTree(subtask)) };
}

export function toggleSubtaskCompletion(task, subtaskId) {
  const normalized = normalizeTask(task);
  const subtasks = normalized.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask);
  return { ...normalized, subtasks, done: subtasks.length > 0 && subtasks.every((subtask) => subtask.done) };
}

export function carryOverTaskTree(task, today = localDateKey()) {
  const normalized = normalizeTask(task, today);
  const next = normalized.done || normalized.plannedDate >= today
    ? normalized
    : { ...normalized, plannedDate: today, carriedFrom: normalized.plannedDate, carryCount: normalized.carryCount + 1 };
  return {
    ...next,
    subtasks: next.subtasks.map((subtask) => subtask.done ? subtask : carryOverTaskTree(subtask, today)),
  };
}

export function carryOverTasks(tasks, today = localDateKey()) {
  return tasks.map((task) => carryOverTaskTree(task, today));
}

export function flattenTaskTree(task, date, parentText = null) {
  const normalized = normalizeTask(task, date);
  const rows = [{ ...normalized, date, parentText: parentText || (normalized.subtasks.length ? normalized.text : null), children: normalized.subtasks.map((subtask) => flattenTaskTree(subtask, date, normalized.text)) }];
  return rows;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours} 小时${minutes ? ` ${minutes} 分钟` : ''}`;
  return `${minutes} 分钟`;
}

export function summarizeDay(day = {}) {
  const focusSeconds = (day.focusSessions || []).reduce((sum, session) => sum + Math.max(0, Number(session.actualSeconds) || 0), 0);
  return {
    focusSeconds,
    label: formatDuration(focusSeconds),
    eaten: Number(day.edibleTomatoes) || 0,
    digested: Number(day.digestedTomatoes) || 0,
  };
}

export function dailyStatsForDate(allStats = {}, date) {
  const value = allStats?.[date];
  return {
    edibleTomatoes: Math.max(0, Number(value?.edibleTomatoes) || 0),
    digestedTomatoes: Math.max(0, Number(value?.digestedTomatoes) || 0),
  };
}

export function consumeTaskTomatoes(task, available) {
  const amount = normalizePomodoros(task?.pomodoros);
  const stock = Math.max(0, Number(available) || 0);
  if (amount === 0) return { ok: true, amount: 0, remaining: stock };
  if (amount > stock) {
    return { ok: false, amount, remaining: stock, message: '可消化番茄不足，请先完成专注获得番茄。' };
  }
  return { ok: true, amount, remaining: stock - amount };
}

export function updateTaskInTree(tasks, targetId, updater) {
  return tasks.map((task) => {
    if (task.id === targetId) return updater(normalizeTask(task));
    if (Array.isArray(task.subtasks) && task.subtasks.length) return { ...task, subtasks: updateTaskInTree(task.subtasks, targetId, updater) };
    return task;
  });
}

export function buildTimelineTaskGroups({ history = {}, currentTasks = [], today, days = [] }) {
  const byId = new Map();
  Object.values(history).forEach((day) => {
    (day.tasks || []).forEach((task) => {
      const row = flattenTaskTree(task, day.date)[0];
      byId.set(String(row.id), { ...row, timelineDate: row.plannedDate || day.date });
    });
  });
  currentTasks.forEach((task) => {
    const row = flattenTaskTree(task, today)[0];
    byId.set(String(row.id), { ...row, timelineDate: row.plannedDate || today });
  });
  return days.map((date) => ({ date, tasks: [...byId.values()].filter((task) => task.timelineDate === date) }));
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
