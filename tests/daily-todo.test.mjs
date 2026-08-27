import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyTodoMarkdown, buildMultiDayMarkdown, buildTimelineTaskGroups, carryOverTasks, consumeTaskTomatoes, dailyStatsForDate, daysForRange, localDateKey, moveRangeAnchor, normalizePomodoros, shiftDate, addSubtask, completeTaskTree, carryOverTaskTree, rolloverTasksWithHistory, summarizeTaskTree, flattenTaskTree, formatDuration, reopenTaskTree, summarizeDay, toggleSubtaskCompletion, updateTaskInTree } from '../src/core/daily-todo.mjs';

test('主任务树可以展开为带主任务名称的历史回顾记录', () => {
  const rows = flattenTaskTree({ id: 1, text: '复习通信协议', subtasks: [{ id: 2, text: 'IIC', done: true, parentId: 1 }] }, '2026-08-18');
  assert.equal(rows[0].parentText, '复习通信协议');
  assert.equal(rows[0].date, '2026-08-18');
  assert.equal(rows[0].children[0][0].text, 'IIC');
});

test('每日统计按实际专注秒数累计并格式化', () => {
  const summary = summarizeDay({ focusSessions: [{ actualSeconds: 900 }, { actualSeconds: 1800 }], tasks: [{ done: true, pomodoros: 2, started: true }] });
  assert.equal(summary.focusSeconds, 2700);
  assert.equal(summary.label, '45 分钟');
  assert.equal(formatDuration(3660), '1 小时 1 分钟');
});

test('子任务完成状态按父任务定位更新，主任务可直接完成', () => {
  const task = { id: 1, text: '主任务', pomodoros: 0, done: false, subtasks: [{ id: 2, text: '子任务', pomodoros: 1, done: false }] };
  const done = completeTaskTree(task);
  assert.equal(done.done, true);
  assert.equal(done.subtasks[0].done, true);
});

test('最后一个子任务完成后主任务自动完成，取消子任务时主任务恢复未完成', () => {
  const task = { id: 1, text: '主任务', done: false, subtasks: [
    { id: 2, text: 'IIC', done: true, pomodoros: 1 },
    { id: 3, text: 'SPI', done: false, pomodoros: 1 },
  ] };
  const complete = toggleSubtaskCompletion(task, 3);
  assert.equal(complete.done, true);
  assert.ok(complete.subtasks.every((item) => item.done));
  const reopen = toggleSubtaskCompletion(complete, 2);
  assert.equal(reopen.done, false);
  assert.equal(reopen.subtasks[0].done, false);
});

test('主任务可以创建子任务，并自动汇总子任务番茄数', () => {
  const task = addSubtask({ id: 1, text: '复习通信协议', pomodoros: 0, subtasks: [] }, { id: 2, text: 'IIC', pomodoros: 1 });
  const next = addSubtask(task, { id: 3, text: 'SPI', pomodoros: 2 });
  assert.equal(next.subtasks.length, 2);
  assert.equal(summarizeTaskTree(next).pomodoros, 3);
});

test('完成主任务会联动完成未完成子任务并消化全部番茄', () => {
  const task = { id: 1, text: '复习通信协议', done: false, subtasks: [
    { id: 2, text: 'IIC', done: true, pomodoros: 1 },
    { id: 3, text: 'SPI', done: false, pomodoros: 2 },
  ] };
  const completed = completeTaskTree(task);
  assert.equal(completed.done, true);
  assert.ok(completed.subtasks.every((subtask) => subtask.done));
  assert.equal(summarizeTaskTree(completed).digested, 3);
});

test('顺延主任务时只顺延未完成子任务，已完成子任务保留原日期', () => {
  const task = { id: 1, text: '复习通信协议', done: false, plannedDate: '2026-08-16', subtasks: [
    { id: 2, text: 'IIC', done: true, plannedDate: '2026-08-16' },
    { id: 3, text: 'SPI', done: false, plannedDate: '2026-08-16' },
  ] };
  const next = carryOverTaskTree(task, '2026-08-17');
  assert.equal(next.plannedDate, '2026-08-17');
  assert.equal(next.subtasks[0].plannedDate, '2026-08-16');
  assert.equal(next.subtasks[1].plannedDate, '2026-08-17');
});

test('任务番茄数允许 0，并限制在 0 到 99', () => {
  assert.equal(normalizePomodoros(0), 0);
  assert.equal(normalizePomodoros(-2), 0);
  assert.equal(normalizePomodoros(120), 99);
  assert.equal(normalizePomodoros('bad'), 0);
});

test('消化任务番茄：库存足够时扣除，不足时阻止完成', () => {
  assert.deepEqual(consumeTaskTomatoes({ pomodoros: 2 }, 3), { ok: true, amount: 2, remaining: 1 });
  const blocked = consumeTaskTomatoes({ pomodoros: 2 }, 1);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.message, '可消化番茄不足，请先完成专注获得番茄。');
});

test('主任务所需番茄按未完成子任务汇总，并受库存限制', () => {
  const task = { subtasks: [
    { done: true, pomodoros: 1 },
    { done: false, pomodoros: 2 },
  ] };
  const amount = summarizeTaskTree(task).pomodoros - summarizeTaskTree(task).digested;
  assert.equal(amount, 2);
  assert.equal(consumeTaskTomatoes({ pomodoros: amount }, 0).ok, false);
  assert.equal(consumeTaskTomatoes({ pomodoros: amount }, 2).ok, true);
});

test('Todo 时间轴分组保留主任务的 children 嵌套以渲染子任务', () => {
  const groups = buildTimelineTaskGroups({
    history: {},
    currentTasks: [{ id: 1, text: '主任务', done: false, pomodoros: 2, plannedDate: '2026-08-18', subtasks: [{ id: 2, text: '子任务', done: false, pomodoros: 1, plannedDate: '2026-08-18' }] }],
    today: '2026-08-18',
    days: ['2026-08-18'],
  });
  const task = groups[0].tasks[0];
  assert.ok(Array.isArray(task.children));
  assert.equal(task.children[0][0].text, '子任务');
});

test('8/17 未完成任务顺延后出现在 8/18，历史快照不会覆盖当前顺延日期', () => {
  const pending = carryOverTasks([{ id: 17, text: '8/17 未完成', done: false, pomodoros: 1, plannedDate: '2026-08-17', addedDate: '2026-08-17', subtasks: [] }], '2026-08-18');
  const groups = buildTimelineTaskGroups({ history: { '2026-08-17': { date: '2026-08-17', tasks: [{ id: 17, text: '8/17 未完成', done: false, pomodoros: 1, plannedDate: '2026-08-17', subtasks: [] }] } }, currentTasks: pending, today: '2026-08-18', days: ['2026-08-17', '2026-08-18'] });
  assert.equal(groups[1].tasks[0].plannedDate, '2026-08-18');
});

test('同一任务连续顺延时保留每一天的历史记录', () => {
  const task = (date) => ({ id: 17, text: '连续推进的任务', done: false, pomodoros: 1, plannedDate: date, addedDate: '2026-08-16', subtasks: [] });
  const groups = buildTimelineTaskGroups({
    history: {
      '2026-08-16': { date: '2026-08-16', tasks: [task('2026-08-16')] },
      '2026-08-17': { date: '2026-08-17', tasks: [task('2026-08-17')] },
    },
    currentTasks: [task('2026-08-18')],
    today: '2026-08-18',
    days: ['2026-08-16', '2026-08-17', '2026-08-18'],
  });
  assert.deepEqual(groups.map((group) => group.tasks.map((item) => item.timelineDate)), [
    ['2026-08-16'], ['2026-08-17'], ['2026-08-18'],
  ]);
});

test('已完成任务不会被顺延到下一天或在下一天历史快照中重复显示', () => {
  const finished = { id: 18, text: '已完成任务', done: true, pomodoros: 1, plannedDate: '2026-08-25', subtasks: [] };
  assert.deepEqual(carryOverTasks([finished], '2026-08-26'), []);
  const groups = buildTimelineTaskGroups({
    history: {
      '2026-08-25': { date: '2026-08-25', tasks: [finished] },
      '2026-08-26': { date: '2026-08-26', tasks: [finished] },
    },
    currentTasks: [],
    today: '2026-08-26',
    days: ['2026-08-25', '2026-08-26'],
  });
  assert.equal(groups[0].tasks.length, 1);
  assert.equal(groups[1].tasks.length, 0);
});

test('跨多天再次启动时补齐未完成任务的每一天历史快照', () => {
  const rolled = rolloverTasksWithHistory({
    tasks: [{ id: 88, text: '连续推进的任务', done: false, pomodoros: 1, plannedDate: '2026-08-25', addedDate: '2026-08-25', subtasks: [] }],
    history: {},
    today: '2026-08-28',
  });
  assert.deepEqual(Object.keys(rolled.history).sort(), ['2026-08-25', '2026-08-26', '2026-08-27']);
  assert.deepEqual(rolled.tasks.map((task) => ({ plannedDate: task.plannedDate, carryCount: task.carryCount })), [{ plannedDate: '2026-08-28', carryCount: 3 }]);
});

test('补历史快照不会覆盖用户已经编辑过的旧日期记录', () => {
  const rolled = rolloverTasksWithHistory({
    tasks: [{ id: 89, text: '当前名称', done: false, pomodoros: 1, plannedDate: '2026-08-25', subtasks: [] }],
    history: { '2026-08-25': { date: '2026-08-25', tasks: [{ id: 89, text: '历史名称', done: false, pomodoros: 1, plannedDate: '2026-08-25', subtasks: [] }] } },
    today: '2026-08-27',
  });
  assert.equal(rolled.history['2026-08-25'].tasks[0].text, '历史名称');
  assert.equal(rolled.history['2026-08-26'].tasks[0].text, '当前名称');
});

test('已完成任务按完成日期归档，不会在之后继续成为当前任务', () => {
  const rolled = rolloverTasksWithHistory({
    tasks: [{ id: 90, text: '昨晚完成', done: true, completedAt: '2026-08-26T12:00:00.000Z', pomodoros: 1, plannedDate: '2026-08-25', subtasks: [] }],
    history: {},
    today: '2026-08-28',
  });
  assert.equal(rolled.tasks.length, 0);
  assert.equal(rolled.history['2026-08-26'].tasks[0].id, 90);
  assert.equal(rolled.history['2026-08-25'], undefined);
});

test('完成和取消完成会写入或清除完成时间', () => {
  const completed = completeTaskTree({ id: 91, text: '任务', done: false, subtasks: [{ id: 92, text: '子任务', done: false }] }, '2026-08-27T12:00:00.000Z');
  assert.equal(completed.completedAt, '2026-08-27T12:00:00.000Z');
  assert.equal(completed.subtasks[0].completedAt, '2026-08-27T12:00:00.000Z');
  const reopened = reopenTaskTree(completed);
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.subtasks[0].completedAt, null);
});

test('历史 Todo 可以通过 ID 更新嵌套主任务或子任务名称和状态', () => {
  const tasks = [{ id: 1, text: '主任务', done: false, subtasks: [{ id: 2, text: '子任务', done: false }] }];
  const renamed = updateTaskInTree(tasks, 2, (task) => ({ ...task, text: '改名后的子任务', done: true }));
  assert.equal(renamed[0].subtasks[0].text, '改名后的子任务');
  assert.equal(renamed[0].subtasks[0].done, true);
});

test('每日统计按日期独立，新日期没有记录时从零开始', () => {
  const stats = { '2026-08-17': { edibleTomatoes: 4, digestedTomatoes: 2 } };
  assert.deepEqual(stats['2026-08-17'], { edibleTomatoes: 4, digestedTomatoes: 2 });
  assert.deepEqual(stats['2026-08-18'] || { edibleTomatoes: 0, digestedTomatoes: 0 }, { edibleTomatoes: 0, digestedTomatoes: 0 });
});

test('读取当天统计不会回退到旧版全局已食用和已消化数量', () => {
  assert.deepEqual(dailyStatsForDate({ '2026-08-17': { edibleTomatoes: 4, digestedTomatoes: 4 } }, '2026-08-18'), { edibleTomatoes: 0, digestedTomatoes: 0 });
});

test('0 番茄任务可以直接完成且不消耗库存', () => {
  assert.deepEqual(consumeTaskTomatoes({ pomodoros: 0 }, 0), { ok: true, amount: 0, remaining: 0 });
});

test('每日 Todo Markdown 包含统计和任务状态', () => {
  const markdown = buildDailyTodoMarkdown({
    date: '2026-08-17',
    edibleTomatoes: 4,
    digestedTomatoes: 2,
    tasks: [
      { text: '写报告', pomodoros: 2, done: true },
      { text: '整理文件', pomodoros: 0, done: false },
    ],
  });
  assert.match(markdown, /# JJtomato 今日 Todo · 2026-08-17/);
  assert.match(markdown, /已食用番茄数量：4/);
  assert.match(markdown, /已消化番茄数量：2/);
  assert.match(markdown, /- \[x\] 写报告（2 个番茄）/);
  assert.match(markdown, /- \[ \] 整理文件（无需番茄）/);
});

test('日期键使用本地年月日', () => {
  assert.equal(localDateKey(new Date(2026, 7, 17)), '2026-08-17');
});

test('未完成任务跨日自动顺延，并保留原始添加日期', () => {
  const tasks = carryOverTasks([{ id: 1, text: '旧任务', pomodoros: 2, done: false, addedDate: '2026-08-15', plannedDate: '2026-08-16' }], '2026-08-17');
  assert.equal(tasks[0].plannedDate, '2026-08-17');
  assert.equal(tasks[0].addedDate, '2026-08-15');
  assert.equal(tasks[0].carryCount, 1);
  assert.equal(shiftDate('2026-08-17', 1), '2026-08-18');
});

test('计划视图支持日、周、月范围切换和日期移动', () => {
  assert.equal(daysForRange('day', '2026-08-17').length, 1);
  assert.equal(daysForRange('week', '2026-08-17').length, 7);
  assert.equal(daysForRange('month', '2026-08-17').length, 31);
  assert.equal(moveRangeAnchor('week', '2026-08-17', 1), '2026-08-24');
});

test('多日期 Todo 可以合并导出为一个 Markdown', () => {
  const markdown = buildMultiDayMarkdown({
    dates: ['2026-08-16', '2026-08-17'],
    today: '2026-08-17',
    history: { '2026-08-16': { tasks: [{ text: '旧任务', pomodoros: 1, done: false }] } },
    currentTasks: [{ text: '今天任务', pomodoros: 0, done: true }],
  });
  assert.match(markdown, /旧任务/);
  assert.match(markdown, /今天任务/);
  assert.match(markdown, /---/);
});
