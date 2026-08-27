const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000];

export function nextReconnectDelay(attempt, delays = DEFAULT_RETRY_DELAYS) {
  return delays[Math.min(Math.max(0, Number(attempt) || 0), delays.length - 1)];
}

export function companionServerUrl(value = import.meta.env.VITE_COMPANION_SERVER) {
  return String(value || 'http://127.0.0.1:4179').trim().replace(/\/$/, '');
}

export async function companionRequest(path, { method = 'GET', token, body, baseUrl = companionServerUrl() } = {}) {
  if (!baseUrl) throw new Error('尚未配置实时陪伴服务地址。');
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '服务请求失败。');
  return payload;
}

export function createRealtimeConnection({ token, baseUrl = companionServerUrl(), onEvent = () => {}, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket, setTimeoutImpl = globalThis.setTimeout, clearTimeoutImpl = globalThis.clearTimeout } = {}) {
  let socket = null;
  let retryTimer = null;
  let attempt = 0;
  let stopped = false;
  const websocketUrl = () => `${baseUrl.replace(/^http/, 'ws')}/realtime?token=${encodeURIComponent(token)}`;
  const connect = () => {
    if (stopped || !baseUrl || !token || !WebSocketImpl) return;
    onStatus({ connected: false, reconnecting: attempt > 0 });
    socket = new WebSocketImpl(websocketUrl());
    socket.onopen = () => { attempt = 0; onStatus({ connected: true, reconnecting: false }); };
    socket.onmessage = (event) => { try { onEvent(JSON.parse(event.data)); } catch { /* ignored */ } };
    socket.onclose = () => {
      if (stopped) return;
      const delay = nextReconnectDelay(attempt++);
      onStatus({ connected: false, reconnecting: true, retryIn: delay });
      retryTimer = setTimeoutImpl(connect, delay);
    };
    socket.onerror = () => socket?.close();
  };
  connect();
  return {
    send(event) { if (socket?.readyState === 1) socket.send(JSON.stringify(event)); },
    close() { stopped = true; clearTimeoutImpl(retryTimer); socket?.close(); },
  };
}
