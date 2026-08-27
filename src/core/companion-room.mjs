export const ROOM_PERMISSION_KEYS = Object.freeze([
  'shareOnline',
  'shareTyping',
  'shareActivity',
  'shareTask',
  'receiveReactions',
  'receiveMessageNotifications',
]);

export const DEFAULT_ROOM_PERMISSIONS = Object.freeze({
  shareOnline: true,
  shareTyping: true,
  shareActivity: true,
  shareTask: false,
  receiveReactions: true,
  receiveMessageNotifications: true,
});

export function createInviteCode(random = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () => Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length) % alphabet.length]).join('');
  return `JJ-${segment()}-${segment()}`;
}

export function normalizeRoomPermissions(value = {}) {
  return ROOM_PERMISSION_KEYS.reduce((permissions, key) => ({
    ...permissions,
    [key]: value[key] == null ? DEFAULT_ROOM_PERMISSIONS[key] : Boolean(value[key]),
  }), {});
}

export function normalizeRoomMember(member = {}) {
  return {
    id: String(member.id || `member-${Date.now()}`),
    name: String(member.name || '好友').slice(0, 40),
    permissions: normalizeRoomPermissions(member.permissions),
    joinedAt: Number(member.joinedAt) || Date.now(),
  };
}

export function createCompanionRoom({ id, name, inviteCode, members = [], createdAt = Date.now() } = {}) {
  return {
    id: String(id || `room-${createdAt}`),
    name: String(name || '桌边陪伴').slice(0, 60),
    inviteCode: String(inviteCode || createInviteCode()),
    createdAt: Number(createdAt) || Date.now(),
    members: (Array.isArray(members) ? members : []).map(normalizeRoomMember).slice(0, 8),
    events: [],
  };
}

export function normalizeCompanionRoom(room = {}) {
  const normalized = createCompanionRoom(room);
  return {
    ...normalized,
    events: Array.isArray(room.events) ? room.events.slice(-100).map((event) => ({
      id: String(event.id || `event-${Date.now()}`),
      type: String(event.type || 'presence'),
      senderId: String(event.senderId || ''),
      receiverId: event.receiverId == null ? null : String(event.receiverId),
      createdAt: Number(event.createdAt) || Date.now(),
      payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
    })) : [],
  };
}

export function setRoomMemberPermissions(room, memberId, patch) {
  const normalized = normalizeCompanionRoom(room);
  return {
    ...normalized,
    members: normalized.members.map((member) => member.id === String(memberId)
      ? { ...member, permissions: normalizeRoomPermissions({ ...member.permissions, ...patch }) }
      : member),
  };
}

export function appendRoomEvent(room, event) {
  const normalized = normalizeCompanionRoom(room);
  const next = {
    id: String(event?.id || `event-${Date.now()}`),
    type: String(event?.type || 'presence'),
    senderId: String(event?.senderId || ''),
    receiverId: event?.receiverId == null ? null : String(event.receiverId),
    createdAt: Number(event?.createdAt) || Date.now(),
    payload: event?.payload && typeof event.payload === 'object' ? event.payload : {},
  };
  return { ...normalized, events: [...normalized.events, next].slice(-100) };
}

export function createTogetherResult({ friend, startedAt, endedAt = Date.now(), userCompletedTasks = 0, friendCompletedTasks = 0 } = {}) {
  const finish = Number.isFinite(Number(endedAt)) ? Number(endedAt) : Date.now();
  const start = Number.isFinite(Number(startedAt)) ? Number(startedAt) : finish;
  const minutes = Math.max(0, Math.round((finish - start) / 60_000));
  return {
    id: `together-${startedAt}-${endedAt}`,
    friendId: friend?.id || null,
    friendName: friend?.name || '好友',
    startedAt: start,
    endedAt: finish,
    minutes,
    userCompletedTasks: Math.max(0, Number(userCompletedTasks) || 0),
    friendCompletedTasks: Math.max(0, Number(friendCompletedTasks) || 0),
  };
}
