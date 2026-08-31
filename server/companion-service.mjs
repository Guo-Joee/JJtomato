import { randomBytes } from 'node:crypto';

const MAX_ROOM_MEMBERS = 8;
const MAX_MESSAGES = 500;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEFAULT_MEMBER_PERMISSIONS = Object.freeze({
  shareOnline: true,
  shareTyping: true,
  shareActivity: true,
  shareTask: false,
  receiveReactions: true,
  receiveMessageNotifications: true,
});

function id(prefix) {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

function cleanName(value, fallback = '') {
  return String(value || fallback).trim().replace(/\s+/g, ' ').slice(0, 40);
}

function cleanRoomName(value) {
  return cleanName(value, '桌边陪伴').slice(0, 60);
}

function cleanInvite(value) {
  return String(value || '').trim().toUpperCase();
}

export function createRoomInviteCode(random = Math.random) {
  const part = () => Array.from({ length: 4 }, () => INVITE_ALPHABET[Math.floor(random() * INVITE_ALPHABET.length) % INVITE_ALPHABET.length]).join('');
  return `JJ-${part()}-${part()}`;
}

export function normalizeMemberPermissions(input = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_MEMBER_PERMISSIONS).map(([key, defaultValue]) => [key, input[key] == null ? defaultValue : Boolean(input[key])]));
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.displayName, createdAt: user.createdAt };
}

function publicMember(user, member, viewerMember) {
  // Privacy is directional: the viewer chooses what to share with each friend.
  // Keep the former `permissions` field as a migration fallback for existing data.
  const pairPermissions = viewerMember?.permissionsByMember?.[member.userId];
  return { ...publicUser(user), joinedAt: member.joinedAt, permissions: normalizeMemberPermissions(pairPermissions || member.permissions) };
}

export class CompanionService {
  constructor(data = {}, { now = () => Date.now(), random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.data = {
      users: Array.isArray(data.users) ? data.users : [],
      rooms: Array.isArray(data.rooms) ? data.rooms : [],
      friendships: Array.isArray(data.friendships) ? data.friendships : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  }

  snapshot() {
    return structuredClone(this.data);
  }

  createUser({ username, displayName, passwordHash }) {
    const normalizedUsername = cleanName(username).toLowerCase();
    if (!/^[a-z0-9_-]{3,24}$/.test(normalizedUsername)) throw new Error('用户名需为 3-24 位字母、数字、下划线或短横线。');
    if (this.data.users.some((user) => user.username === normalizedUsername)) throw new Error('这个用户名已被使用。');
    const user = { id: id('user'), username: normalizedUsername, displayName: cleanName(displayName, normalizedUsername), passwordHash: String(passwordHash || ''), createdAt: this.now() };
    this.data.users.push(user);
    return publicUser(user);
  }

  findUserByUsername(username) {
    return this.data.users.find((user) => user.username === cleanName(username).toLowerCase()) || null;
  }

  getUser(userId) {
    const user = this.data.users.find((item) => item.id === userId);
    return user ? publicUser(user) : null;
  }

  createRoom(ownerId, name) {
    const owner = this.data.users.find((user) => user.id === ownerId);
    if (!owner) throw new Error('账号不存在。');
    let inviteCode = createRoomInviteCode(this.random);
    while (this.data.rooms.some((room) => room.inviteCode === inviteCode)) inviteCode = createRoomInviteCode(this.random);
    const room = { id: id('room'), name: cleanRoomName(name), inviteCode, ownerId, createdAt: this.now(), members: [{ userId: ownerId, joinedAt: this.now(), permissions: normalizeMemberPermissions(), permissionsByMember: {} }] };
    this.data.rooms.push(room);
    return this.roomFor(ownerId, room.id);
  }

  roomFor(userId, roomId) {
    const room = this.data.rooms.find((item) => item.id === roomId && item.members.some((member) => member.userId === userId));
    if (!room) return null;
    return {
      id: room.id,
      name: room.name,
      inviteCode: room.inviteCode,
      ownerId: room.ownerId,
      createdAt: room.createdAt,
      members: room.members.map((member) => publicMember(this.data.users.find((user) => user.id === member.userId), member, room.members.find((item) => item.userId === userId))).filter(Boolean),
    };
  }

  listRooms(userId) {
    return this.data.rooms.filter((room) => room.members.some((member) => member.userId === userId)).map((room) => this.roomFor(userId, room.id));
  }

  joinRoom(userId, inviteCode) {
    const room = this.data.rooms.find((item) => item.inviteCode === cleanInvite(inviteCode));
    if (!room) throw new Error('邀请码无效或已失效。');
    if (!this.data.users.some((user) => user.id === userId)) throw new Error('账号不存在。');
    if (!room.members.some((member) => member.userId === userId)) {
      if (room.members.length >= MAX_ROOM_MEMBERS) throw new Error('这间陪伴房已满。');
      const existingIds = room.members.map((member) => member.userId);
      room.members.push({ userId, joinedAt: this.now(), permissions: normalizeMemberPermissions(), permissionsByMember: {} });
      existingIds.forEach((friendId) => this.addFriendship(userId, friendId));
    }
    return this.roomFor(userId, room.id);
  }

  addFriendship(firstId, secondId) {
    if (firstId === secondId) return;
    const [userId, friendId] = [firstId, secondId].sort();
    if (!this.data.friendships.some((item) => item.userId === userId && item.friendId === friendId)) this.data.friendships.push({ userId, friendId, createdAt: this.now() });
  }

  listFriends(userId) {
    const friendIds = this.data.friendships.flatMap((item) => item.userId === userId ? [item.friendId] : item.friendId === userId ? [item.userId] : []);
    return friendIds.map((friendId) => this.getUser(friendId)).filter(Boolean);
  }

  setMemberPermissions(userId, roomId, memberId, patch) {
    const room = this.data.rooms.find((item) => item.id === roomId && item.members.some((member) => member.userId === userId));
    const ownerMember = room?.members.find((item) => item.userId === userId);
    const member = room?.members.find((item) => item.userId === memberId);
    if (!ownerMember || !member || member.userId === userId) throw new Error('未找到可配置的陪伴房成员。');
    ownerMember.permissionsByMember = {
      ...(ownerMember.permissionsByMember || {}),
      [memberId]: normalizeMemberPermissions({ ...(ownerMember.permissionsByMember?.[memberId] || ownerMember.permissions), ...patch }),
    };
    return this.roomFor(userId, roomId);
  }

  sendMessage(userId, roomId, { text, kind = 'text', receiverId = null, clientEventId = null } = {}) {
    const room = this.data.rooms.find((item) => item.id === roomId && item.members.some((member) => member.userId === userId));
    const normalizedText = String(text || '').trim().slice(0, 300);
    if (!room) throw new Error('你不在这间陪伴房中。');
    if (!normalizedText) throw new Error('留言不能为空。');
    if (receiverId && !room.members.some((member) => member.userId === receiverId)) throw new Error('收件人不在这间陪伴房中。');
    const normalizedEventId = clientEventId == null ? null : String(clientEventId).trim().slice(0, 100);
    const duplicate = normalizedEventId && this.data.messages.find((message) => message.roomId === roomId && message.senderId === userId && message.clientEventId === normalizedEventId);
    if (duplicate) return this.publicMessage(duplicate);
    const message = { id: id('message'), roomId, senderId: userId, receiverId, kind: kind === 'reaction' ? 'reaction' : 'text', text: normalizedText, clientEventId: normalizedEventId, createdAt: this.now() };
    this.data.messages.push(message);
    const roomMessages = this.data.messages.filter((item) => item.roomId === roomId);
    if (roomMessages.length > MAX_MESSAGES) {
      const stale = new Set(roomMessages.slice(0, roomMessages.length - MAX_MESSAGES).map((item) => item.id));
      this.data.messages = this.data.messages.filter((item) => !stale.has(item.id));
    }
    return this.publicMessage(message);
  }

  publicMessage(message) {
    const sender = this.getUser(message.senderId);
    return { ...message, sender: sender ? { id: sender.id, displayName: sender.displayName } : null };
  }

  listMessages(userId, roomId, after = 0) {
    const room = this.data.rooms.find((item) => item.id === roomId && item.members.some((member) => member.userId === userId));
    if (!room) throw new Error('你不在这间陪伴房中。');
    return this.data.messages.filter((message) => message.roomId === roomId && message.createdAt > Number(after || 0)).slice(-100).map((message) => this.publicMessage(message));
  }
}
