export const MODES = Object.freeze({
  focus: { key: 'focus', label: '专注', fullLabel: '深度专注', seconds: 25 * 60 },
  shortBreak: { key: 'shortBreak', label: '短休', fullLabel: '短暂休息', seconds: 5 * 60 },
  longBreak: { key: 'longBreak', label: '长休', fullLabel: '长时休息', seconds: 15 * 60 },
});

export function nextMode(mode, completedFocusCount) {
  if (mode === 'focus') {
    return completedFocusCount > 0 && completedFocusCount % 4 === 0
      ? 'longBreak'
      : 'shortBreak';
  }
  return 'focus';
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function progressOf(remaining, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

/**
 * Calculate remaining whole seconds from a monotonic-clock deadline.
 * `performance.now()` is monotonic, unlike wall-clock time, so changing the
 * system clock cannot make a running countdown move backwards.
 */
export function remainingSecondsAt(deadline, now) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export class TimerState {
  constructor() {
    this.mode = 'focus';
    this.remaining = MODES.focus.seconds;
    this.running = false;
    this.completedFocusCount = 0;
  }

  switchMode(mode) {
    if (!MODES[mode]) throw new Error(`Unknown timer mode: ${mode}`);
    this.mode = mode;
    this.remaining = MODES[mode].seconds;
    this.running = false;
  }
}
