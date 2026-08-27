import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROOM_PERMISSIONS,
  appendRoomEvent,
  createCompanionRoom,
  createInviteCode,
  createTogetherResult,
  setRoomMemberPermissions,
} from '../src/core/companion-room.mjs';

test('陪伴房生成易读邀请码并保留成员级默认权限', () => {
  assert.equal(createInviteCode(() => 0), 'JJ-AAAA-AAAA');
  const room = createCompanionRoom({ createdAt: 1, members: [{ id: 'lin', name: '小林' }] });
  assert.equal(room.id, 'room-1');
  assert.match(room.inviteCode, /^JJ-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.deepEqual(room.members[0].permissions, DEFAULT_ROOM_PERMISSIONS);
  assert.deepEqual(createCompanionRoom({ members: null }).members, []);
});

test('成员权限按人保存，房间事件最多保留最近 100 条', () => {
  let room = createCompanionRoom({ members: [{ id: 'lin', name: '小林' }] });
  room = setRoomMemberPermissions(room, 'lin', { shareTask: true, shareTyping: false });
  assert.equal(room.members[0].permissions.shareTask, true);
  assert.equal(room.members[0].permissions.shareTyping, false);
  for (let index = 0; index < 105; index += 1) room = appendRoomEvent(room, { id: `e${index}`, type: 'reaction', createdAt: index });
  assert.equal(room.events.length, 100);
  assert.equal(room.events[0].id, 'e5');
});

test('共同专注结果只记录汇总时长和完成数量', () => {
  const result = createTogetherResult({ friend: { id: 'lin', name: '小林' }, startedAt: 0, endedAt: 3_090_000, userCompletedTasks: 2, friendCompletedTasks: 1 });
  assert.deepEqual(result, {
    id: 'together-0-3090000', friendId: 'lin', friendName: '小林', startedAt: 0, endedAt: 3090000,
    minutes: 52, userCompletedTasks: 2, friendCompletedTasks: 1,
  });
});
