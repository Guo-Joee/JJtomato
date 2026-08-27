import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionService, DEFAULT_MEMBER_PERMISSIONS, createRoomInviteCode } from '../server/companion-service.mjs';
import { nextReconnectDelay } from '../src/core/companion-realtime.mjs';

test('账号、邀请码和好友关系在加入陪伴房后被持久化', () => {
  let now = 100;
  const service = new CompanionService({}, { now: () => now++, random: () => 0 });
  const joee = service.createUser({ username: 'joee', displayName: '乔伊', passwordHash: 'hash-a' });
  const lin = service.createUser({ username: 'lin_01', displayName: '小林', passwordHash: 'hash-b' });
  const room = service.createRoom(joee.id, '一起坐下');
  assert.equal(room.inviteCode, 'JJ-AAAA-AAAA');
  const joined = service.joinRoom(lin.id, room.inviteCode);
  assert.equal(joined.members.length, 2);
  assert.deepEqual(service.listFriends(joee.id).map((friend) => friend.id), [lin.id]);
  assert.deepEqual(service.listFriends(lin.id).map((friend) => friend.id), [joee.id]);
  assert.deepEqual(joined.members.find((member) => member.id === lin.id).permissions, DEFAULT_MEMBER_PERMISSIONS);
});

test('陪伴房仅允许成员同步消息，成员权限可以独立更新', () => {
  const service = new CompanionService({}, { random: () => 0 });
  const owner = service.createUser({ username: 'owner', displayName: '房主', passwordHash: 'hash' });
  const friend = service.createUser({ username: 'friend', displayName: '朋友', passwordHash: 'hash' });
  const stranger = service.createUser({ username: 'stranger', displayName: '陌生人', passwordHash: 'hash' });
  const room = service.createRoom(owner.id, '房间');
  service.joinRoom(friend.id, room.inviteCode);
  const message = service.sendMessage(owner.id, room.id, { receiverId: friend.id, text: '专注顺利吗？' });
  assert.equal(message.sender.displayName, '房主');
  assert.equal(service.listMessages(friend.id, room.id).length, 1);
  assert.throws(() => service.sendMessage(stranger.id, room.id, { text: '闯入' }), /不在这间陪伴房/);
  const updated = service.setMemberPermissions(owner.id, room.id, friend.id, { shareTyping: false, shareTask: true });
  const member = updated.members.find((item) => item.id === friend.id);
  assert.equal(member.permissions.shareTyping, false);
  assert.equal(member.permissions.shareTask, true);
});

test('邀请码易读且断线重连使用有上限的退避间隔', () => {
  assert.equal(createRoomInviteCode(() => 0.999), 'JJ-9999-9999');
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((attempt) => nextReconnectDelay(attempt)), [1000, 2000, 4000, 8000, 15000, 15000]);
});
