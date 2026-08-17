export function intersects(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function computeTimerLayout({ width, height }) {
  const horizontalPadding = width < 560 ? 24 : 40;
  const modeHeight = 40;
  const actionHeight = 72;
  const gap = 20;
  const availableWidth = width - horizontalPadding * 2;
  const reservedHeight = modeHeight + actionHeight + gap * 2 + 80;
  const availableHeight = Math.max(220, height - reservedHeight);
  const ringSize = Math.max(220, Math.min(380, availableWidth, availableHeight));
  const centerX = width / 2;
  const modeY = 28;
  const ringY = modeY + modeHeight + gap;

  return {
    modeControl: {
      x: centerX - Math.min(280, availableWidth) / 2,
      y: modeY,
      width: Math.min(280, availableWidth),
      height: modeHeight,
    },
    ring: {
      x: centerX - ringSize / 2,
      y: ringY,
      width: ringSize,
      height: ringSize,
    },
    actionControl: {
      x: centerX - Math.min(320, availableWidth) / 2,
      y: ringY + ringSize + gap,
      width: Math.min(320, availableWidth),
      height: actionHeight,
    },
  };
}
