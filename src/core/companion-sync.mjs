export const PRESENCE_TTL_MS = 35_000;

export function createClientEventId(prefix = 'event', random = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  const suffix = random ? random() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`.slice(0, 100);
}

export function shouldApplyPresence(current, incoming) {
  return Number(incoming?.stateVersion || 0) > Number(current?.stateVersion || 0);
}

export function isPresenceExpired(presence, now = Date.now(), ttl = PRESENCE_TTL_MS) {
  return !presence?.updatedAt || Number(now) - Number(presence.updatedAt) > ttl;
}

export function typingTransition({ typing = false, lastInputAt = 0 } = {}, now = Date.now(), idleAfterMs = 2500) {
  return { typing: Number(now) - Number(lastInputAt) < idleAfterMs, changed: Boolean(typing) !== (Number(now) - Number(lastInputAt) < idleAfterMs) };
}
