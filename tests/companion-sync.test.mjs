import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientEventId, isPresenceExpired, shouldApplyPresence, typingTransition } from '../src/core/companion-sync.mjs';

test('Presence 只接受更高版本，并会在心跳过期后降级', () => {
  assert.equal(shouldApplyPresence({ stateVersion: 3 }, { stateVersion: 4 }), true);
  assert.equal(shouldApplyPresence({ stateVersion: 4 }, { stateVersion: 4 }), false);
  assert.equal(isPresenceExpired({ updatedAt: 100 }, 35_101), true);
  assert.equal(isPresenceExpired({ updatedAt: 100 }, 35_100), false);
});

test('输入状态仅生成有限事件 ID，并在 2.5 秒空闲后回到 idle', () => {
  assert.match(createClientEventId('message', () => 'abc'), /^message-abc$/);
  assert.deepEqual(typingTransition({ typing: false, lastInputAt: 100 }, 101), { typing: true, changed: true });
  assert.deepEqual(typingTransition({ typing: true, lastInputAt: 100 }, 2600), { typing: false, changed: true });
});
