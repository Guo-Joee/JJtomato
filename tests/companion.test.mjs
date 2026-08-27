import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANION_QUICK_MESSAGES,
  COMPANION_STATES,
  DEFAULT_COMPANION_PRIVACY,
  INITIAL_COMPANIONS,
  addCompanionMessage,
  companionActivityLabel,
  companionStateLabel,
  normalizeCompanion,
  primaryCompanion,
  updateCompanionState,
} from '../src/core/companion.mjs';

test('陪伴状态会归一化并提供清晰文案', () => {
  const friend = normalizeCompanion({ id: 'a', name: '小林', state: 'typing' });
  assert.equal(friend.state, 'typing');
  assert.equal(companionStateLabel(friend.state), '正在输入');
  assert.equal(companionActivityLabel(friend), '正在敲键盘');
  assert.equal(companionStateLabel('unknown'), '暂时不在');
});

test('陪伴状态切换会同步活动文案并保留好友身份', () => {
  const friend = normalizeCompanion({ id: 'a', name: '小林', state: 'online', durationLabel: '刚刚上线' });
  const next = updateCompanionState(friend, 'paused');
  assert.equal(next.id, 'a');
  assert.equal(next.name, '小林');
  assert.equal(next.state, 'paused');
  assert.equal(next.activity, COMPANION_STATES.paused.activity);
});

test('主要陪伴对象优先显示正在输入和专注的好友', () => {
  const friend = primaryCompanion([
    { id: 'a', name: '小林', state: 'online' },
    { id: 'b', name: '小月', state: 'typing' },
  ]);
  assert.equal(friend.id, 'b');
});

test('陪伴消息限制长度、忽略空消息并保留最近 100 条', () => {
  let messages = addCompanionMessage([], { friendId: 'a', sender: 'me', text: '  你好  ' });
  assert.equal(messages[0].text, '你好');
  assert.equal(addCompanionMessage([], { friendId: 'a', kind: 'reaction', text: '🍅 送来了一颗番茄' })[0].kind, 'reaction');
  assert.equal(addCompanionMessage(messages, { friendId: 'a', text: '   ' }).length, 1);
  for (let index = 0; index < 105; index += 1) messages = addCompanionMessage(messages, { friendId: 'a', text: `${index}` });
  assert.equal(messages.length, 100);
  assert.equal(messages.at(-1).text, '104');
  assert.equal(addCompanionMessage([], { friendId: 'a', text: 'x'.repeat(400) })[0].text.length, 300);
});

test('陪伴隐私默认只共享状态，不共享当前任务', () => {
  assert.equal(DEFAULT_COMPANION_PRIVACY.shareOnline, true);
  assert.equal(DEFAULT_COMPANION_PRIVACY.shareTyping, true);
  assert.equal(DEFAULT_COMPANION_PRIVACY.shareTask, false);
});

test('陪伴提供低干扰快捷留言，并为演示好友保留未读状态', () => {
  assert.equal(COMPANION_QUICK_MESSAGES.length, 4);
  assert.ok(COMPANION_QUICK_MESSAGES.includes('我还在这里'));
  assert.equal(INITIAL_COMPANIONS.find((friend) => friend.id === 'yue').unread, 1);
});
