import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompanionService } from './companion-service.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = process.env.COMPANION_DATA_FILE || resolve(root, 'server', 'data', 'companion-data.json');
const port = Number(process.env.COMPANION_PORT || 4179);
const tokenSecret = process.env.COMPANION_TOKEN_SECRET || 'development-only-change-me';
const sockets = new Map();
const presence = new Map();

async function loadData() {
  try { return JSON.parse(await readFile(dataFile, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
const service = new CompanionService(await loadData());
async function persist() {
  await mkdir(dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.tmp`;
  await writeFile(temporary, JSON.stringify(service.snapshot(), null, 2));
  await rename(temporary, dataFile);
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' });
  response.end(JSON.stringify(body));
}
function tokenFor(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function userFromToken(value) {
  try {
    const [payload, signature] = String(value || '').split('.');
    const expected = createHmac('sha256', tokenSecret).update(payload).digest('base64url');
    if (!payload || !signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return decoded.exp > Date.now() ? service.getUser(decoded.userId) : null;
  } catch { return null; }
}
function authenticate(request) {
  return userFromToken(String(request.headers.authorization || '').replace(/^Bearer\s+/i, ''));
}
function passwordHash(password, salt = randomBytes(16).toString('base64url')) {
  return `${salt}:${scryptSync(String(password), salt, 64).toString('base64url')}`;
}
function passwordMatches(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(String(password), salt, 64).toString('base64url');
  return timingSafeEqual(Buffer.from(hash), Buffer.from(actual));
}
function send(socket, message) {
  if (!socket.destroyed) socket.write(Buffer.concat([Buffer.from([0x81]), frameLength(Buffer.byteLength(JSON.stringify(message))), Buffer.from(JSON.stringify(message))]));
}
function frameLength(length) {
  if (length < 126) return Buffer.from([length]);
  if (length < 65536) { const output = Buffer.alloc(3); output[0] = 126; output.writeUInt16BE(length, 1); return output; }
  const output = Buffer.alloc(9); output[0] = 127; output.writeBigUInt64BE(BigInt(length), 1); return output;
}
function broadcast(roomId, message) {
  for (const connection of sockets.values()) if (connection.rooms.has(roomId)) send(connection.socket, message);
}
function decodeFrames(buffer, onMessage) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]; const second = buffer[offset + 1]; let length = second & 127; let cursor = offset + 2;
    if (length === 126) { if (cursor + 2 > buffer.length) break; length = buffer.readUInt16BE(cursor); cursor += 2; }
    else if (length === 127) { if (cursor + 8 > buffer.length) break; length = Number(buffer.readBigUInt64BE(cursor)); cursor += 8; }
    const masked = Boolean(second & 128); if (cursor + (masked ? 4 : 0) + length > buffer.length) break;
    const mask = masked ? buffer.subarray(cursor, cursor + 4) : null; cursor += masked ? 4 : 0;
    const payload = buffer.subarray(cursor, cursor + length); if (mask) for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    offset = cursor + length;
    if ((first & 15) === 1) { try { onMessage(JSON.parse(payload.toString())); } catch { /* malformed input is ignored */ } }
  }
  return buffer.subarray(offset);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'OPTIONS') return json(response, 204, {});
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true });
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      if (String(body.password || '').length < 8) return json(response, 400, { error: '密码至少需要 8 位。' });
      const user = service.createUser({ ...body, passwordHash: passwordHash(body.password) }); await persist(); return json(response, 201, { user, token: tokenFor(user.id) });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const account = service.findUserByUsername(body.username);
      if (!account || !passwordMatches(body.password, account.passwordHash)) return json(response, 401, { error: '用户名或密码不正确。' });
      return json(response, 200, { user: service.getUser(account.id), token: tokenFor(account.id) });
    }
    const user = authenticate(request); if (!user) return json(response, 401, { error: '请先登录。' });
    if (request.method === 'GET' && url.pathname === '/api/me') return json(response, 200, { user, rooms: service.listRooms(user.id), friends: service.listFriends(user.id) });
    if (request.method === 'POST' && url.pathname === '/api/rooms') { const room = service.createRoom(user.id, body.name); await persist(); return json(response, 201, { room }); }
    if (request.method === 'POST' && url.pathname === '/api/rooms/join') { const room = service.joinRoom(user.id, body.inviteCode); await persist(); broadcast(room.id, { type: 'room:member', room }); return json(response, 200, { room }); }
    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(messages|permissions\/([^/]+)))?$/);
    if (roomMatch && request.method === 'GET' && roomMatch[2] === 'messages') return json(response, 200, { messages: service.listMessages(user.id, roomMatch[1], url.searchParams.get('after')) });
    if (roomMatch && request.method === 'POST' && roomMatch[2] === 'messages') { const message = service.sendMessage(user.id, roomMatch[1], body); await persist(); broadcast(roomMatch[1], { type: 'message', message }); return json(response, 201, { message }); }
    if (roomMatch && request.method === 'PATCH' && roomMatch[3]) { const room = service.setMemberPermissions(user.id, roomMatch[1], roomMatch[3], body.permissions); await persist(); broadcast(room.id, { type: 'room:permissions', room }); return json(response, 200, { room }); }
    return json(response, 404, { error: '未找到接口。' });
  } catch (error) { return json(response, 400, { error: error.message || '请求无效。' }); }
});

server.on('upgrade', (request, socket) => {
  const url = new URL(request.url, `http://${request.headers.host}`); const user = userFromToken(url.searchParams.get('token'));
  if (url.pathname !== '/realtime' || !user || !request.headers['sec-websocket-key']) return socket.destroy();
  const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const connection = { socket, user, rooms: new Set(service.listRooms(user.id).map((room) => room.id)), buffer: Buffer.alloc(0) }; sockets.set(socket, connection);
  send(socket, { type: 'ready', rooms: [...connection.rooms] });
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => { buffer = decodeFrames(Buffer.concat([buffer, chunk]), async (event) => {
    try {
      if (event.type === 'subscribe' && service.roomFor(user.id, event.roomId)) connection.rooms.add(event.roomId);
      if (event.type === 'presence') {
        const state = ['online', 'focusing', 'typing', 'paused', 'away'].includes(event.state) ? event.state : 'online';
        presence.set(user.id, { state, activity: cleanName(event.activity).slice(0, 80), isTyping: Boolean(event.isTyping), updatedAt: Date.now() });
        for (const roomId of connection.rooms) broadcast(roomId, { type: 'presence', userId: user.id, presence: presence.get(user.id) });
      }
      if (event.type === 'typing' && connection.rooms.has(event.roomId)) broadcast(event.roomId, { type: 'typing', userId: user.id, isTyping: Boolean(event.isTyping) });
      if (event.type === 'message' && connection.rooms.has(event.roomId)) { const message = service.sendMessage(user.id, event.roomId, event); await persist(); broadcast(event.roomId, { type: 'message', message }); }
    } catch (error) { send(socket, { type: 'error', error: error.message || '操作失败。' }); }
  }); });
  socket.on('close', () => { sockets.delete(socket); presence.set(user.id, { state: 'offline', activity: '', isTyping: false, updatedAt: Date.now() }); for (const roomId of connection.rooms) broadcast(roomId, { type: 'presence', userId: user.id, presence: presence.get(user.id) }); });
  socket.on('error', () => socket.destroy());
});
server.listen(port, '0.0.0.0', () => console.log(`JJtomato companion server listening on ${port}`));
