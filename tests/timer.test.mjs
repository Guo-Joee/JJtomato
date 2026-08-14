import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerState, MODES, nextMode, formatTime, progressOf } from '../src/core/timer.mjs';

test('阶段配置包含专注、短休、长休且时长正确', () => {
  assert.equal(MODES.focus.seconds, 25 * 60);
  assert.equal(MODES.shortBreak.seconds, 5 * 60);
  assert.equal(MODES.longBreak.seconds, 15 * 60);
});

test('切换阶段会重置为目标阶段时长并停止运行', () => {
  const timer = new TimerState();
  timer.running = true;
  timer.remaining = 12;
  timer.switchMode('longBreak');
  assert.equal(timer.mode, 'longBreak');
  assert.equal(timer.remaining, 15 * 60);
  assert.equal(timer.running, false);
});

test('阶段循环：专注后短休，第四个专注后长休', () => {
  assert.equal(nextMode('focus', 1), 'shortBreak');
  assert.equal(nextMode('shortBreak', 1), 'focus');
  assert.equal(nextMode('focus', 4), 'longBreak');
  assert.equal(nextMode('longBreak', 4), 'focus');
});

test('时间格式总是 mm:ss', () => {
  assert.equal(formatTime(1500), '25:00');
  assert.equal(formatTime(5), '00:05');
  assert.equal(formatTime(0), '00:00');
});

test('进度百分比被限制在 0 到 1', () => {
  assert.equal(progressOf(1500, 1500), 0);
  assert.equal(progressOf(0, 1500), 1);
  assert.equal(progressOf(-5, 1500), 1);
  assert.equal(progressOf(2000, 1500), 0);
});
