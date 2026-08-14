import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTimerLayout, intersects } from '../src/core/layout.mjs';

for (const viewport of [
  { width: 420, height: 600 },
  { width: 440, height: 700 },
  { width: 900, height: 680 },
]) {
  test(`计时器在 ${viewport.width}x${viewport.height} 下不被控制按钮遮挡`, () => {
    const layout = computeTimerLayout(viewport);
    assert.equal(intersects(layout.ring, layout.modeControl), false);
    assert.equal(intersects(layout.ring, layout.actionControl), false);
    assert.ok(layout.ring.width >= 220);
    assert.ok(layout.actionControl.y >= layout.ring.y + layout.ring.height + 16);
  });
}
