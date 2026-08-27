import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFocusSession,
  normalizeDailyReview,
  resolveTaskTarget,
  summarizeDailyReview,
  taskTargetOptions,
} from '../src/core/focus-review.mjs';

const tasks = [{
  id: 1,
  text: '完成报告',
  done: false,
  subtasks: [
    { id: 11, text: '找资料', done: true },
    { id: 12, text: '写摘要', done: false },
  ],
}];

test('专注目标包含未完成主任务和未完成子任务', () => {
  const options = taskTargetOptions(tasks);
  assert.deepEqual(options.map((item) => item.label), ['完成报告', '完成报告 / 写摘要']);
  assert.equal(resolveTaskTarget(tasks, { taskId: 12, parentTaskId: 1 }).text, '写摘要');
  assert.equal(resolveTaskTarget(tasks, { taskId: 11, parentTaskId: 1 }), null);
});

test('专注记录保存任务、计划时长、暂停和中断原因', () => {
  const target = taskTargetOptions(tasks)[1];
  const session = createFocusSession({
    startedAt: 1000,
    endedAt: 62000,
    actualSeconds: 61.2,
    plannedSeconds: 1500,
    pauseCount: 2,
    interruptionReasons: ['查资料', '', '注意力走神'],
    target,
  });
  assert.equal(session.actualSeconds, 61);
  assert.equal(session.taskText, '写摘要');
  assert.equal(session.parentTaskText, '完成报告');
  assert.equal(session.pauseCount, 2);
  assert.deepEqual(session.interruptionReasons, ['查资料', '注意力走神']);
});

test('每日复盘汇总真实专注、叶子任务和暂停次数', () => {
  const summary = summarizeDailyReview({
    tasks,
    sessions: [{ actualSeconds: 90, pauseCount: 2 }, { actualSeconds: 30, pauseCount: 1 }],
  });
  assert.deepEqual(summary, { focusSeconds: 120, completedTasks: 1, interruptions: 3 });
});

test('复盘文本规范化并限制长度', () => {
  const review = normalizeDailyReview({ completedReflection: 'a'.repeat(1200), tomorrowFirstStep: 'b'.repeat(700) }, '2026-08-27');
  assert.equal(review.date, '2026-08-27');
  assert.equal(review.completedReflection.length, 1000);
  assert.equal(review.tomorrowFirstStep.length, 500);
});
