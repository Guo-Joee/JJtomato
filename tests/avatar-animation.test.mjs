import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATAR_ANIMATIONS, AVATAR_ATLAS_SPEC, avatarAnimationForActivity, avatarFrameAt, resolveAvatarAnimation, validateAvatarAtlas } from '../src/core/avatar-animation.mjs';
import { CHARACTER_IDS, CHARACTER_OPTIONS, normalizeCharacterProfile } from '../src/core/character-profile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('默认角色包含动物、植物和水果，档案只保存受支持的角色', () => {
  assert.equal(CHARACTER_OPTIONS.length, 12);
  assert.deepEqual(new Set(CHARACTER_OPTIONS.map((item) => item.kind)), new Set(['animal', 'food', 'plant']));
  assert.ok(CHARACTER_IDS.includes('tomato'));
  assert.ok(CHARACTER_IDS.includes('apple'));
  assert.ok(CHARACTER_IDS.includes('american-shorthair'));
  assert.deepEqual(normalizeCharacterProfile({ name: '  小苹果  ', avatarId: 'apple' }), { name: '小苹果', avatarId: 'apple' });
  assert.equal(normalizeCharacterProfile({ name: '小伙伴', avatarId: 'unknown' }).avatarId, 'american-shorthair');
});

test('六类动作严格遵循方案中的帧数、帧率与透明尾格', () => {
  assert.deepEqual(Object.keys(AVATAR_ANIMATIONS), ['idle', 'focusing', 'typing', 'browsing', 'short_rest', 'long_rest']);
  assert.deepEqual(Object.values(AVATAR_ANIMATIONS).map(({ frameCount, fps }) => [frameCount, fps]), [[6, 3], [8, 6], [8, 8], [8, 5], [6, 4], [8, 6]]);
  assert.deepEqual(AVATAR_ANIMATIONS.idle.blankFrames, [6, 7]);
  assert.deepEqual(AVATAR_ANIMATIONS.short_rest.blankFrames, [6, 7]);
  assert.equal(avatarAnimationForActivity('short_break'), 'short_rest');
  assert.equal(avatarAnimationForActivity('typing'), 'typing');
  assert.equal(resolveAvatarAnimation('typing', { idle: AVATAR_ANIMATIONS.idle, focusing: AVATAR_ANIMATIONS.focusing }), 'focusing');
  assert.deepEqual(avatarFrameAt('typing', 999), { animation: 'typing', row: 2, frame: 7, frameCount: 8, fps: 8 });
  assert.equal(avatarFrameAt('typing', 999, { reducedMotion: true }).frame, 0);
});

test('不符合固定画布、透明和网格要求的图集会被拒绝', () => {
  assert.equal(validateAvatarAtlas({ width: 1295, height: 1214, hasAlpha: true, columns: 8, rows: 6 }).valid, false);
  assert.deepEqual(validateAvatarAtlas({ width: AVATAR_ATLAS_SPEC.width, height: AVATAR_ATLAS_SPEC.height, hasAlpha: true, columns: 8, rows: 6 }).errors, []);
});

test('十二位默认角色都引用正式 1024×960 透明 WebP 图集', () => {
  const formalAtlasDir = path.join(root, 'assets', 'characters', 'atlases', 'formal');
  const atlases = fs.readdirSync(formalAtlasDir).filter((file) => file.endsWith('.webp'));
  assert.equal(atlases.length, CHARACTER_OPTIONS.length);
  for (const option of CHARACTER_OPTIONS) assert.ok(atlases.includes(`${option.id}.webp`));
});
