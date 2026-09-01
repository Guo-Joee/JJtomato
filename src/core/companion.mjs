export const COMPANION_STATES = Object.freeze({
  offline: { label: '暂时不在', activity: '小猫在窗边休息' },
  online: { label: '已上线', activity: '准备开始' },
  focusing: { label: '正在专注', activity: '正在专注' },
  typing: { label: '正在输入', activity: '正在敲键盘' },
  paused: { label: '暂时休息', activity: '正在休息' },
});

export const COMPANION_REACTIONS = Object.freeze({
  tomato: { label: '送番茄', text: '送来了一颗番茄', emoji: '🍅' },
  coffee: { label: '递咖啡', text: '递来了一杯咖啡', emoji: '☕' },
  wave: { label: '挥挥手', text: '对你挥了挥手', emoji: '👋' },
  paw: { label: '轻敲猫爪', text: '轻轻敲了敲猫爪', emoji: '🐾' },
});

export const COMPANION_QUICK_MESSAGES = Object.freeze([
  '我来了，一起开始',
  '我还在这里',
  '喝口水再继续',
  '慢慢来，不着急',
]);

export const DEFAULT_COMPANION_PRIVACY = Object.freeze({
  shareOnline: true,
  shareTyping: true,
  shareActivity: true,
  shareTask: false,
  shareReactions: true,
});

export const INITIAL_COMPANIONS = Object.freeze([
  {
    id: 'lin',
    name: '小林',
    state: 'focusing',
    activity: '正在写作业',
    durationLabel: '18 分钟',
    avatarTone: 'rose',
    avatarId: 'ragdoll',
  },
  {
    id: 'yue',
    name: '小月',
    state: 'online',
    activity: '准备开始',
    durationLabel: '刚刚上线',
    avatarTone: 'leaf',
    avatarId: 'shiba',
    unread: 1,
  },
]);

export const INITIAL_COMPANION_MESSAGES = Object.freeze([
  { id: 'm1', friendId: 'lin', sender: 'friend', text: '我开始写作业啦', createdAt: '刚刚' },
  { id: 'm2', friendId: 'lin', sender: 'me', text: '收到，我也开始', createdAt: '刚刚' },
  { id: 'm3', friendId: 'yue', sender: 'friend', text: '等你一起开始～', createdAt: '1 分钟前' },
]);

export function normalizeCompanion(value = {}) {
  const state = COMPANION_STATES[value.state] ? value.state : 'offline';
  return {
    id: String(value.id || `friend-${Date.now()}`),
    name: String(value.name || '好友'),
    state,
    activity: String(value.activity || COMPANION_STATES[state].activity),
    durationLabel: String(value.durationLabel || ''),
    avatarTone: String(value.avatarTone || 'rose'),
    avatarId: String(value.avatarId || ''),
    unread: Math.max(0, Number(value.unread) || 0),
  };
}

export function companionStateLabel(state) {
  return COMPANION_STATES[state]?.label || COMPANION_STATES.offline.label;
}

export function companionActivityLabel(companion) {
  if (!companion) return COMPANION_STATES.offline.activity;
  return companion.activity || COMPANION_STATES[companion.state]?.activity || COMPANION_STATES.offline.activity;
}

export function updateCompanionState(companion, state, activity = '') {
  const nextState = COMPANION_STATES[state] ? state : 'offline';
  return normalizeCompanion({
    ...companion,
    state: nextState,
    activity: activity || COMPANION_STATES[nextState].activity,
    durationLabel: nextState === 'offline' ? '' : nextState === 'online' ? '刚刚上线' : companion.durationLabel || '刚刚',
  });
}

export function addCompanionMessage(messages, message) {
  const hasStableId = Boolean(message?.id);
  const next = {
    id: message.id || `message-${Date.now()}`,
    friendId: String(message.friendId || ''),
    sender: message.sender === 'friend' ? 'friend' : 'me',
    kind: message.kind === 'reaction' ? 'reaction' : 'text',
    text: String(message.text || '').trim().slice(0, 300),
    createdAt: message.createdAt || '刚刚',
  };
  if (!next.friendId || !next.text) return messages;
  const existing = hasStableId ? (messages || []).filter((item) => item.id !== next.id) : (messages || []);
  return [...existing, next].slice(-100);
}

export function primaryCompanion(companions = []) {
  const normalized = companions.map(normalizeCompanion);
  return normalized.find((item) => item.state === 'typing')
    || normalized.find((item) => item.state === 'focusing')
    || normalized.find((item) => item.state === 'online')
    || normalized[0]
    || normalizeCompanion({ id: 'empty', name: '陪伴', state: 'offline' });
}
