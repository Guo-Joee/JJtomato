import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyTodoMarkdown, buildMultiDayMarkdown, carryOverTasks, consumeTaskTomatoes, daysForRange, localDateKey, moveRangeAnchor, normalizePomodoros, shiftDate } from '../src/core/daily-todo.mjs';

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
  assert.equal(blocked.message, '今日食用番茄已经被消化啦！');
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

test('甘特图支持日、周、月范围切换和日期移动', () => {
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
