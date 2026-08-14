import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check, Coffee, ListTodo, Minus, Pause, Play, Plus, RotateCcw,
  Settings, SkipForward, Square, Trash2, X,
} from 'lucide-react';
import { MODES, formatTime, nextMode, progressOf, remainingSecondsAt } from '../core/timer.mjs';
import { loadJson, saveJson } from '../core/storage.mjs';

const VISUAL = {
  focus: {
    icon: 'tomato',
    color: '#de7668',
    soft: 'rgba(222,118,104,.16)',
    glow: 'rgba(222,118,104,.32)',
    caption: '把注意力留给此刻',
  },
  shortBreak: {
    icon: 'leaf',
    color: '#7e9d7a',
    soft: 'rgba(126,157,122,.16)',
    glow: 'rgba(126,157,122,.26)',
    caption: '让眼睛和思绪透口气',
  },
  longBreak: {
    icon: 'coffee',
    color: '#ad8a75',
    soft: 'rgba(173,138,117,.16)',
    glow: 'rgba(173,138,117,.28)',
    caption: '慢下来，重新蓄满能量',
  },
};

const INITIAL_TASKS = [
  { id: 1, text: '完成今天最重要的一件事', done: false, pomodoros: 2 },
  { id: 2, text: '整理会议记录', done: true, pomodoros: 1 },
];

function TomatoMark({ size = 30, mode = 'focus' }) {
  const tone = VISUAL[mode].color;
  if (mode === 'shortBreak') {
    return <span className="leaf-mark" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  if (mode === 'longBreak') return <Coffee size={size * .74} strokeWidth={1.7} />;
  return (
    <span className="tomato-mark" style={{ width: size, height: size, '--tomato': tone }} aria-hidden="true">
      <i /><b />
    </span>
  );
}

function TitleBar() {
  return (
    <header className="titlebar glass-line">
      <div className="drag-region brand">
        <TomatoMark size={26} />
        <div>
          <strong>JJtomato</strong>
          <small>Focus gently</small>
        </div>
      </div>
      <div className="window-actions no-drag">
        <button aria-label="最小化" onClick={() => window.tomatoDesktop?.minimize()}><Minus size={17} /></button>
        <button className="close" aria-label="关闭" onClick={() => window.tomatoDesktop?.close()}><X size={17} /></button>
      </div>
    </header>
  );
}

function ModeSwitcher({ mode, onChange }) {
  return (
    <div className="mode-switcher" aria-label="计时模式">
      {Object.values(MODES).map((item) => (
        <button
          key={item.key}
          className={mode === item.key ? 'active' : ''}
          onClick={() => onChange(item.key)}
          aria-pressed={mode === item.key}
        >
          {item.label}<small>{item.seconds / 60}m</small>
        </button>
      ))}
    </div>
  );
}

function TimerHero({ mode, remaining, running, onToggle, onReset, onSkip }) {
  const cfg = MODES[mode];
  const visual = VISUAL[mode];
  const progress = progressOf(remaining, cfg.seconds);
  const radius = 128;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="timer-hero glass-panel" style={{ '--accent': visual.color, '--glow': visual.glow }}>
      <div className="hero-copy">
        <span>{cfg.fullLabel}</span>
        <p>{visual.caption}</p>
      </div>
      <div className="timer-safe-zone">
        <motion.div
          className="halo"
          animate={{ scale: running ? [1, 1.05, 1] : 1, opacity: running ? [.55, .8, .55] : .45 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <svg viewBox="0 0 300 300" className="timer-ring" aria-hidden="true">
          <circle className="ring-track" cx="150" cy="150" r={radius} />
          <motion.circle
            className="ring-progress"
            cx="150" cy="150" r={radius}
            stroke={visual.color}
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: .65, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="timer-center">
          <motion.div key={mode} className="mode-mark" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <TomatoMark size={38} mode={mode} />
          </motion.div>
          <div className="time" aria-live="polite">{formatTime(remaining)}</div>
          <div className="status">{running ? '正在专注' : '准备开始'}</div>
        </div>
      </div>
      <div className="timer-actions">
        <button className="secondary" aria-label="重置" onClick={onReset}><RotateCcw size={19} /></button>
        <motion.button className="primary-action" onClick={onToggle} whileTap={{ scale: .93 }} whileHover={{ scale: 1.035 }}>
          {running ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}
          <span>{running ? '暂停一下' : '开始专注'}</span>
        </motion.button>
        <button className="secondary" aria-label="跳过" onClick={onSkip}><SkipForward size={20} /></button>
      </div>
      <div className="key-hints"><kbd>Space</kbd> 开始/暂停 <i /> <kbd>R</kbd> 重置</div>
    </section>
  );
}

function TasksPanel({ tasks, setTasks }) {
  const [value, setValue] = useState('');
  const add = () => {
    const text = value.trim();
    if (!text) return;
    setTasks((items) => [...items, { id: Date.now(), text, done: false, pomodoros: 1 }]);
    setValue('');
  };
  return (
    <section className="side-panel glass-panel">
      <div className="panel-title">
        <div><ListTodo size={17} /><strong>今日任务</strong></div>
        <span>{tasks.filter((t) => t.done).length}/{tasks.length}</span>
      </div>
      <div className="add-task">
        <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="今天最重要的一件事…" />
        <button onClick={add} aria-label="添加任务"><Plus size={18} /></button>
      </div>
      <div className="task-list">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <motion.div className={`task ${task.done ? 'done' : ''}`} key={task.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 16 }}>
              <button className="check" onClick={() => setTasks((list) => list.map((t) => t.id === task.id ? { ...t, done: !t.done } : t))}>
                {task.done && <Check size={14} />}
              </button>
              <span>{task.text}</span>
              <small><TomatoMark size={17} /> {task.pomodoros}</small>
              <button className="delete" onClick={() => setTasks((list) => list.filter((t) => t.id !== task.id))}><Trash2 size={15} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function SettingsSheet({ open, onClose, durations, setDurations, opacity, setOpacity }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.aside className="settings-sheet glass-panel" initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheet-title"><div><Settings size={19} /><strong>计时设置</strong></div><button onClick={onClose}><X size={18} /></button></div>
            {[
              ['focus', '专注时长', 1, 120],
              ['shortBreak', '短休时长', 1, 60],
              ['longBreak', '长休时长', 1, 90],
            ].map(([key, label, min, max]) => (
              <label className="setting-row" key={key}>
                <span>{label}<small>分钟</small></span>
                <input type="number" min={min} max={max} value={durations[key]} onChange={(e) => setDurations((d) => ({ ...d, [key]: Number(e.target.value) }))} />
              </label>
            ))}
            <label className="setting-row opacity-row">
              <span>窗口透明度<small>{Math.round(opacity * 100)}%</small></span>
              <input className="opacity-slider" type="range" min="65" max="100" value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
            </label>
            <div className="sheet-note">更改将在下次切换阶段时生效。</div>
            <button className="sheet-save" onClick={onClose}>保存设置</button>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MiniTimer({ mode, remaining, running }) {
  const cfg = MODES[mode];
  const visual = VISUAL[mode];
  const progress = progressOf(remaining, cfg.seconds);
  const restore = () => window.tomatoDesktop?.restoreMain();
  const dragRef = useRef(null);
  const handlePointerDown = async (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pending: true };
    const origin = await window.tomatoDesktop?.startMiniDrag();
    if (dragRef.current && origin) dragRef.current = { active: true };
  };
  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    window.tomatoDesktop?.moveMini();
  };
  const handlePointerUp = (event) => {
    dragRef.current = null;
    window.tomatoDesktop?.endMiniDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return (
    <main className="mini-window" style={{ '--accent': visual.color }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onDoubleClick={restore}>
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="51" /><circle className="mini-progress" cx="60" cy="60" r="51" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} /></svg>
      <div className="mini-return-zone" onDoubleClick={restore} title="双击返回主页面">
        <TomatoMark size={28} mode={mode} />
        <strong>{formatTime(remaining)}</strong>
        <small>{running ? '进行中' : cfg.label}</small>
        <em>双击返回</em>
      </div>
    </main>
  );
}

export default function App() {
  const isMini = window.location.hash === '#mini';
  const [mode, setMode] = useState('focus');
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(() => loadJson(localStorage, 'tomato.completed', 0));
  const [tasks, setTasks] = useState(() => loadJson(localStorage, 'tomato.tasks', INITIAL_TASKS));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opacity, setOpacity] = useState(() => loadJson(localStorage, 'tomato.opacity', 0.92));
  const [durations, setDurations] = useState(() => loadJson(localStorage, 'tomato.durations', {
    focus: 25, shortBreak: 5, longBreak: 15,
  }));
  const timerRef = useRef(null);
  const deadlineRef = useRef(null);

  const modeSeconds = durations[mode] * 60;
  const statePayload = useMemo(() => ({ mode, remaining, running, total: modeSeconds }), [mode, remaining, running, modeSeconds]);

  const switchMode = (next) => {
    deadlineRef.current = null;
    setMode(next);
    setRemaining(durations[next] * 60);
    setRunning(false);
  };
  const reset = () => {
    deadlineRef.current = null;
    setRemaining(modeSeconds);
    setRunning(false);
  };
  const startTimer = () => {
    if (running || remaining <= 0) return;
    deadlineRef.current = performance.now() + remaining * 1000;
    setRunning(true);
  };
  const pauseTimer = () => {
    if (!running) return;
    const nextRemaining = deadlineRef.current == null
      ? remaining
      : remainingSecondsAt(deadlineRef.current, performance.now());
    deadlineRef.current = null;
    setRemaining(nextRemaining);
    setRunning(false);
  };
  const toggleRunning = useCallback(() => {
    if (running) pauseTimer();
    else startTimer();
  }, [running, remaining]);
  const skip = () => switchMode(nextMode(mode, completed));

  useEffect(() => {
    if (!running) return undefined;

    let intervalId;
    const tick = () => {
      if (deadlineRef.current == null) return;
      const nextRemaining = remainingSecondsAt(deadlineRef.current, performance.now());
      // A delayed renderer callback may observe an older value. Never allow
      // the displayed countdown to increase because of that stale callback.
      setRemaining((value) => Math.min(value, nextRemaining));
      if (nextRemaining > 0) return;

      window.clearInterval(intervalId);
      timerRef.current = null;
      deadlineRef.current = null;
      setRunning(false);
      const nextCompleted = mode === 'focus' ? completed + 1 : completed;
      if (mode === 'focus') setCompleted(nextCompleted);
      window.tomatoDesktop?.notify(mode === 'focus' ? '专注完成' : '休息结束', mode === 'focus' ? '做得很好，起来走一走吧。' : '准备好开始下一个番茄了吗？');
      const next = nextMode(mode, nextCompleted);
      window.setTimeout(() => switchMode(next), 0);
    };

    intervalId = window.setInterval(tick, 250);
    timerRef.current = intervalId;
    tick();
    return () => {
      window.clearInterval(intervalId);
      if (timerRef.current === intervalId) timerRef.current = null;
    };
  }, [running, mode, completed]);

  useEffect(() => {
    const handler = (event) => {
      if (event.code === 'Space' && !settingsOpen) { event.preventDefault(); toggleRunning(); }
      if (event.key.toLowerCase() === 'r' && !settingsOpen) reset();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen, modeSeconds, toggleRunning]);

  useEffect(() => {
    if (!isMini) window.tomatoDesktop?.sendTimerState(statePayload);
  }, [isMini, statePayload]);
  useEffect(() => { saveJson(localStorage, 'tomato.tasks', tasks); }, [tasks]);
  useEffect(() => { saveJson(localStorage, 'tomato.completed', completed); }, [completed]);
  useEffect(() => { saveJson(localStorage, 'tomato.durations', durations); }, [durations]);
  useEffect(() => {
    saveJson(localStorage, 'tomato.opacity', opacity);
    window.tomatoDesktop?.setOpacity(opacity);
  }, [opacity]);
  useEffect(() => {
    if (!isMini) return undefined;
    let active = true;
    const applyMiniState = (state) => {
      if (!active || !state) return;
      setMode(state.mode);
      setRemaining(state.remaining);
      setRunning(state.running);
    };
    const unsubscribe = window.tomatoDesktop?.onMiniState(applyMiniState);
    window.tomatoDesktop?.getTimerState().then(applyMiniState).catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isMini]);

  if (isMini) return <MiniTimer mode={mode} remaining={remaining} running={running} />;

  return (
    <div className={`app-shell ${opacity >= 0.999 ? 'opaque' : ''}`} style={{ '--accent': VISUAL[mode].color, '--soft': VISUAL[mode].soft, '--window-opacity': opacity }}>
      <div className="ambient-bg"><i /><i /><span className="grain" /></div>
      <TitleBar />
      <ModeSwitcher mode={mode} onChange={switchMode} />
      <main className="dashboard">
        <TimerHero mode={mode} remaining={remaining} running={running} onToggle={toggleRunning} onReset={reset} onSkip={skip} />
        <TasksPanel tasks={tasks} setTasks={setTasks} />
      </main>
      <footer className="bottom-bar glass-line">
        <div><span>今日番茄</span><strong>{completed}</strong></div>
        <div><span>完成任务</span><strong>{tasks.filter((t) => t.done).length}/{tasks.length}</strong></div>
        <div className="footer-actions">
          <button onClick={() => window.tomatoDesktop?.openMini()}><Square size={15} /> 置顶小窗</button>
          <button onClick={() => setSettingsOpen(true)}><Settings size={15} /> 设置</button>
        </div>
      </footer>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} durations={durations} setDurations={setDurations} opacity={opacity} setOpacity={setOpacity} />
    </div>
  );
}
