export const AVATAR_ATLAS_SPEC = Object.freeze({
  width: 1024,
  height: 960,
  columns: 8,
  rows: 6,
  cellWidth: 128,
  cellHeight: 160,
  pose: 'seated-front-v1',
});

export const AVATAR_ANIMATIONS = Object.freeze({
  idle: Object.freeze({ row: 0, frameCount: 6, fps: 3, blankFrames: [6, 7] }),
  focusing: Object.freeze({ row: 1, frameCount: 8, fps: 6, blankFrames: [] }),
  typing: Object.freeze({ row: 2, frameCount: 8, fps: 8, blankFrames: [] }),
  browsing: Object.freeze({ row: 3, frameCount: 8, fps: 5, blankFrames: [] }),
  short_rest: Object.freeze({ row: 4, frameCount: 6, fps: 4, blankFrames: [6, 7] }),
  long_rest: Object.freeze({ row: 5, frameCount: 8, fps: 6, blankFrames: [] }),
});

const ACTIVITY_ALIASES = Object.freeze({
  focus: 'focusing',
  focusing: 'focusing',
  typing: 'typing',
  browse: 'browsing',
  browsing: 'browsing',
  short_break: 'short_rest',
  short_rest: 'short_rest',
  long_break: 'long_rest',
  long_rest: 'long_rest',
  idle: 'idle',
  online: 'idle',
  paused: 'idle',
  offline: 'idle',
});

const FALLBACKS = Object.freeze({
  typing: 'focusing',
  browsing: 'focusing',
  short_rest: 'idle',
  long_rest: 'short_rest',
  focusing: 'idle',
  idle: null,
});

export function avatarAnimationForActivity(activity) {
  const key = String(activity || '').trim().toLowerCase();
  return ACTIVITY_ALIASES[key] || 'idle';
}

export function resolveAvatarAnimation(activity, available = AVATAR_ANIMATIONS) {
  let animation = avatarAnimationForActivity(activity);
  while (!available?.[animation]) animation = FALLBACKS[animation];
  return animation || 'idle';
}

export function avatarFrameAt(activity, elapsedMs = 0, { reducedMotion = false, available } = {}) {
  const animation = resolveAvatarAnimation(activity, available);
  const definition = (available || AVATAR_ANIMATIONS)[animation] || AVATAR_ANIMATIONS.idle;
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const frame = reducedMotion ? 0 : Math.floor((elapsed / 1000) * definition.fps) % definition.frameCount;
  return { animation, row: definition.row, frame, frameCount: definition.frameCount, fps: definition.fps };
}

export function validateAvatarAtlas(metadata = {}) {
  const errors = [];
  if (metadata.width !== AVATAR_ATLAS_SPEC.width || metadata.height !== AVATAR_ATLAS_SPEC.height) errors.push('图集尺寸必须是 1024×960。');
  if (metadata.hasAlpha !== true) errors.push('图集必须保留透明背景。');
  if (metadata.columns !== AVATAR_ATLAS_SPEC.columns || metadata.rows !== AVATAR_ATLAS_SPEC.rows) errors.push('图集必须使用 8×6 网格。');
  for (const [name, action] of Object.entries(AVATAR_ANIMATIONS)) {
    const provided = metadata.actions?.[name];
    if (provided && (provided.row !== action.row || provided.frameCount !== action.frameCount || provided.fps !== action.fps)) errors.push(`${name} 的行号、帧数或帧率不符合规范。`);
  }
  return { valid: errors.length === 0, errors };
}
