import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check, Coffee, Download, ListTodo, Minus, Pause, Play, Plus, RotateCcw,
  Settings, SkipForward, Square, Trash2, X,
} from 'lucide-react';
import { MODES, formatTime, nextMode, progressOf, remainingSecondsAt } from '../core/timer.mjs';
import { loadJson, saveJson } from '../core/storage.mjs';
import { buildDailyTodoMarkdown, buildMultiDayMarkdown, carryOverTasks, consumeTaskTomatoes, daysForRange, localDateKey, moveRangeAnchor, normalizePomodoros, normalizeTask, shiftDate } from '../core/daily-todo.mjs';

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
  { id: 2, text: '整理会议记录', done: false, pomodoros: 1 },
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

function TimerHero({ mode, remaining, running, paused, onToggle, onReset, onSkip }) {
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
          <div className="status">{running ? '正在专注' : paused ? '已暂停' : '准备开始'}</div>
        </div>
      </div>
      <div className="timer-actions">
        <button className="secondary" aria-label="重置" onClick={onReset}><RotateCcw size={19} /></button>
        <motion.button className="primary-action" onClick={onToggle} whileTap={{ scale: .93 }} whileHover={{ scale: 1.035 }}>
          {running ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}
          <span>{running ? '暂停一下' : paused ? '继续专注' : '开始专注'}</span>
        </motion.button>
        <button className="secondary" aria-label="跳过" onClick={onSkip}><SkipForward size={20} /></button>
      </div>
      <div className="key-hints"><kbd>Space</kbd> 开始/暂停 <i /> <kbd>R</kbd> 重置</div>
    </section>
  );
}

function TasksPanel({ tasks, setTasks, onToggleTask, notice, today }) {
  const [value, setValue] = useState('');
  const add = () => {
    const text = value.trim();
    if (!text) return;
    setTasks((items) => [...items, { id: Date.now(), text, done: false, pomodoros: 1, addedDate: today, plannedDate: today, carryCount: 0 }]);
    setValue('');
  };
  const updatePomodoros = (id, value) => {
    const next = normalizePomodoros(value, 0);
    setTasks((items) => items.map((task) => task.id === id ? { ...task, pomodoros: next } : task));
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
              <button className="check" aria-label={task.done ? '取消完成任务' : '完成任务'} onClick={() => onToggleTask(task)}>
                {task.done && <Check size={14} />}
              </button>
              <span>{task.text}</span>
              <div className="pomodoro-editor" aria-label={`${task.text}需要的番茄数`}>
                <TomatoMark size={15} />
                <button type="button" aria-label="减少番茄数" disabled={task.done} onClick={() => updatePomodoros(task.id, task.pomodoros - 1)}>−</button>
                <input type="number" min="0" max="99" value={task.pomodoros} disabled={task.done} aria-label="番茄数量" onChange={(e) => updatePomodoros(task.id, e.target.value)} />
                <button type="button" aria-label="增加番茄数" disabled={task.done} onClick={() => updatePomodoros(task.id, task.pomodoros + 1)}>+</button>
              </div>
              <button className="delete" onClick={() => setTasks((list) => list.filter((t) => t.id !== task.id))}><Trash2 size={15} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {notice && <div className="task-notice" role="alert">{notice}</div>}
    </section>
  );
}

function TodoOverview({ tasks, history, today, range, anchorDate, selectedDates, onRangeChange, onAnchorChange, onSelectDate, onToggleTask, onExport }) {
  const days = daysForRange(range, anchorDate);
  const records = new Map();
  Object.values(history || {}).forEach((day) => {
    (day.tasks || []).forEach((task) => {
      const item = normalizeTask(task, day.date);
      records.set(`${item.id}:${item.plannedDate || day.date}`, { ...item, timelineDate: item.plannedDate || day.date });
    });
  });
  tasks.forEach((task) => {
    const item = normalizeTask(task, today);
    records.set(`${item.id}:${item.plannedDate}`, { ...item, timelineDate: item.plannedDate });
  });
  const rows = [...records.values()].filter((task) => days.includes(task.timelineDate));
  const rangeLabel = range === 'month' ? anchorDate.slice(0, 7) : range === 'week' ? `${days[0]} ～ ${days.at(-1)}` : anchorDate;
  const selected = new Set(selectedDates);
  const toggleDate = (date) => onSelectDate(selected.has(date) ? selectedDates.filter((item) => item !== date) : [...selectedDates, date]);
  return (
    <section className="todo-overview glass-panel">
      <div className="todo-overview-head">
        <div>
          <span className="eyebrow">番茄时间轴</span>
          <h1>Todo 总览</h1>
          <p>普通甘特图 · 任务未完成会自动顺延，并保留最初添加日期。</p>
        </div>
        <button className="export-todo" disabled={!selectedDates.length} onClick={onExport}><Download size={16} /> 导出已选日期</button>
      </div>
      <div className="todo-toolbar">
        <div className="range-switcher" aria-label="甘特图范围">
          {['month', 'week', 'day'].map((item) => <button key={item} className={range === item ? 'active' : ''} onClick={() => onRangeChange(item)}>{item === 'month' ? '月' : item === 'week' ? '周' : '日'}</button>)}
        </div>
        <div className="date-navigator">
          <button aria-label="上一个日期范围" onClick={() => onAnchorChange(-1)}>‹</button>
          <strong>{rangeLabel}</strong>
          <button aria-label="下一个日期范围" onClick={() => onAnchorChange(1)}>›</button>
          <button className="today-jump" onClick={() => onRangeChange(range, today)}>今天</button>
        </div>
      </div>
      <div className="export-dates">
        <span>选择导出日期</span>
        <div>{days.map((day) => <label key={day}><input type="checkbox" checked={selected.has(day)} onChange={() => toggleDate(day)} /><b>{day.slice(5).replace('-', '/')}</b></label>)}</div>
      </div>
      <div className="todo-summary">
        <span><b>{tasks.length}</b> 项任务</span>
        <span><b>{tasks.filter((task) => task.done).length}</b> 项已完成</span>
        <span><b>{tasks.filter((task) => !task.done).length}</b> 项待继续</span>
      </div>
      <div className="gantt-scroll">
        <div className="gantt" style={{ '--day-count': days.length }}>
          <div className="gantt-corner">任务 / 来源</div>
          {days.map((day) => <div className={`gantt-day ${day === today ? 'today' : ''}`} key={day}><strong>{day.slice(5).replace('-', '/')}</strong><small>{day === today ? '今天' : new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</small></div>)}
          {rows.length === 0 && <div className="gantt-empty">这个日期范围还没有任务。</div>}
          {rows.map((task) => (
            <React.Fragment key={`${task.id}:${task.timelineDate}`}>
              <div className={`gantt-task-label ${task.done ? 'done' : ''}`}>
                <button className="gantt-check" aria-label={task.done ? '取消完成任务' : '完成任务'} onClick={() => onToggleTask(task)}>{task.done && <Check size={13} />}</button>
                <div><strong>{task.text}</strong><small>{task.done ? '已完成' : '待完成'} · 添加于 {task.addedDate}{task.carryCount ? ` · 顺延 ${task.carryCount} 次` : ''}</small></div>
              </div>
              {days.map((day) => <div className={`gantt-cell ${day === today ? 'today' : ''}`} key={day}>{task.timelineDate === day && <div className={`gantt-bar ${task.done ? 'done' : ''}`} title={`${task.text} · ${task.pomodoros || 0} 个番茄`}><TomatoMark size={16} /><span>{task.pomodoros || 0}</span></div>}</div>)}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function VerticalTodoOverview({ tasks, history, today, range, anchorDate, selectedDates, onRangeChange, onAnchorChange, onSelectDate, onToggleTask, onExport }) {
  const days = daysForRange(range, anchorDate);
  const records = new Map();
  Object.values(history || {}).forEach((day) => (day.tasks || []).forEach((task) => {
    const item = normalizeTask(task, day.date);
    const timelineDate = item.plannedDate || day.date;
    records.set(String(item.id), { ...item, timelineDate });
  }));
  tasks.forEach((task) => {
    const item = normalizeTask(task, today);
    records.set(String(item.id), { ...item, timelineDate: item.plannedDate });
  });
  const groups = days.map((date) => ({ date, tasks: [...records.values()].filter((task) => task.timelineDate === date) })).filter((group) => group.tasks.length || group.date === today || range === 'day');
  const selected = new Set(selectedDates);
  const rangeLabel = range === 'month' ? anchorDate.slice(0, 7) : range === 'week' ? `${days[0]} ～ ${days.at(-1)}` : anchorDate;
  const toggleDate = (date) => onSelectDate(selected.has(date) ? selectedDates.filter((item) => item !== date) : [...selectedDates, date]);
  const tomatoDots = (amount) => {
    const count = normalizePomodoros(amount);
    const visible = Math.min(count, 5);
    return <span className="tomato-dots">{Array.from({ length: visible }, (_, index) => <TomatoMark key={index} size={14} />)}{count > visible && <em>+{count - visible}</em>}{count === 0 && <em>无需番茄</em>}</span>;
  };
  return (
    <section className="vertical-todo glass-panel">
      <div className="vertical-todo-head">
        <div><span className="eyebrow">番茄时间轴</span><h1>Todo 总览</h1></div>
        <button className="export-todo" disabled={!selectedDates.length} onClick={onExport}><Download size={15} /> 导出</button>
      </div>
      <div className="vertical-toolbar">
        <div className="range-switcher" aria-label="查看范围">{['month', 'week', 'day'].map((item) => <button key={item} className={range === item ? 'active' : ''} onClick={() => onRangeChange(item)}>{item === 'month' ? '月' : item === 'week' ? '周' : '日'}</button>)}</div>
        <div className="vertical-date-nav"><button aria-label="上一个日期范围" onClick={() => onAnchorChange(-1)}>‹</button><strong>{rangeLabel}</strong><button aria-label="下一个日期范围" onClick={() => onAnchorChange(1)}>›</button><button className="today-jump" onClick={() => onRangeChange(range, today)}>今天</button></div>
      </div>
      <div className="vertical-export-row"><span>导出日期</span><div>{days.map((day) => <label key={day}><input type="checkbox" checked={selected.has(day)} onChange={() => toggleDate(day)} /><b>{day.slice(5).replace('-', '/')}</b></label>)}</div></div>
      <div className="vertical-summary"><span><b>{tasks.length}</b>任务</span><span><b>{tasks.filter((task) => task.done).length}</b>完成</span><span><b>{tasks.filter((task) => !task.done).length}</b>待继续</span></div>
      <div className="vertical-timeline">
        {groups.map((group) => (
          <section className={`timeline-day ${group.date === today ? 'today' : ''}`} key={group.date}>
            <div className="timeline-node" />
            <header><strong>{group.date.slice(5).replace('-', '/')}</strong><span>{group.date === today ? '今天' : new Date(`${group.date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</span></header>
            <div className="timeline-items">
              {group.tasks.length === 0 ? <div className="timeline-empty">今天还没有任务</div> : group.tasks.map((task) => (
                <article className={`timeline-task ${task.done ? 'done' : ''}`} key={`${task.id}:${group.date}`}>
                  <button className="timeline-check" aria-label={task.done ? '取消完成任务' : '完成任务'} onClick={() => onToggleTask(task)}>{task.done && <Check size={13} />}</button>
                  <div className="timeline-task-main"><strong>{task.text}</strong><small>{task.done ? '已完成' : '待完成'} · 添加于 {task.addedDate}{task.carryCount ? ` · 顺延 ${task.carryCount} 次` : ''}</small>{tomatoDots(task.pomodoros)}</div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <div className="timeline-empty all-empty">这个范围还没有任务</div>}
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
  const [today, setToday] = useState(() => localDateKey());
  const [view, setView] = useState('timer');
  const [todoRange, setTodoRange] = useState('week');
  const [todoAnchor, setTodoAnchor] = useState(() => localDateKey());
  const [selectedDates, setSelectedDates] = useState(() => daysForRange('week', localDateKey()));
  const [mode, setMode] = useState('focus');
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(() => loadJson(localStorage, 'tomato.completed', 0));
  const [digested, setDigested] = useState(() => loadJson(localStorage, 'tomato.digested', 0));
  const [tasks, setTasks] = useState(() => carryOverTasks(loadJson(localStorage, 'tomato.tasks', INITIAL_TASKS), localDateKey()));
  const [dailyHistory, setDailyHistory] = useState(() => loadJson(localStorage, 'tomato.dailyTodo', {}));
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opacity, setOpacity] = useState(() => loadJson(localStorage, 'tomato.opacity', 0.92));
  const [durations, setDurations] = useState(() => loadJson(localStorage, 'tomato.durations', {
    focus: 25, shortBreak: 5, longBreak: 15,
  }));
  const timerRef = useRef(null);
  const deadlineRef = useRef(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = localDateKey();
      if (next === today) return;
      setTasks((items) => carryOverTasks(items, next));
      setToday(next);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [today]);

  const modeSeconds = durations[mode] * 60;
  const statePayload = useMemo(() => ({ mode, remaining, running, total: modeSeconds }), [mode, remaining, running, modeSeconds]);

  const switchMode = (next) => {
    deadlineRef.current = null;
    setMode(next);
    setRemaining(durations[next] * 60);
    setRunning(false);
    setPaused(false);
  };
  const reset = () => {
    deadlineRef.current = null;
    setRemaining(modeSeconds);
    setRunning(false);
    setPaused(false);
  };
  const startTimer = () => {
    if (running || remaining <= 0) return;
    deadlineRef.current = performance.now() + remaining * 1000;
    setPaused(false);
    setRunning(true);
  };
  const pauseTimer = () => {
    if (!running) return;
    const nextRemaining = deadlineRef.current == null
      ? remaining
      : remainingSecondsAt(deadlineRef.current, performance.now());
    deadlineRef.current = null;
    setRemaining(nextRemaining);
    setPaused(true);
    setRunning(false);
  };
  const toggleRunning = useCallback(() => {
    if (running) pauseTimer();
    else startTimer();
  }, [running, remaining]);
  const skip = () => switchMode(nextMode(mode, completed));

  const toggleTask = (task) => {
    if (task.done) {
      const amount = normalizePomodoros(task.pomodoros);
      setTasks((list) => list.map((item) => item.id === task.id ? { ...item, done: false } : item));
      setDigested((value) => Math.max(0, value - amount));
      setNotice('已取消任务完成，番茄已退回今日可用数量。');
      return;
    }
    const result = consumeTaskTomatoes(task, completed - digested);
    if (!result.ok) {
      setNotice(result.message);
      window.setTimeout(() => setNotice(''), 2600);
      return;
    }
    setTasks((list) => list.map((item) => item.id === task.id ? { ...item, done: true } : item));
    setDigested((value) => value + result.amount);
    setNotice(result.amount === 0 ? '任务已完成，不需要消耗番茄。' : `任务已完成，消化 ${result.amount} 个番茄。`);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const exportTodayMarkdown = () => {
    const date = today;
    const markdown = buildDailyTodoMarkdown({ date, tasks, edibleTomatoes: completed, digestedTomatoes: digested });
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `JJtomato-${date}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const changeTodoRange = (nextRange, nextAnchor = today) => {
    setTodoRange(nextRange);
    setTodoAnchor(nextAnchor);
    setSelectedDates(daysForRange(nextRange, nextAnchor));
  };
  const moveTodoAnchor = (direction) => {
    const next = moveRangeAnchor(todoRange, todoAnchor, direction);
    setTodoAnchor(next);
    setSelectedDates(daysForRange(todoRange, next));
  };
  const exportSelectedMarkdown = () => {
    const markdown = buildMultiDayMarkdown({ dates: selectedDates, history: dailyHistory, today, currentTasks: tasks, edibleTomatoes: completed, digestedTomatoes: digested });
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `JJtomato-Todo-${selectedDates[0]}-${selectedDates.at(-1)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
      setPaused(false);
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
  useEffect(() => { saveJson(localStorage, 'tomato.digested', digested); }, [digested]);
  useEffect(() => {
    setDailyHistory((history) => ({
      ...history,
      [today]: { date: today, tasks, edibleTomatoes: completed, digestedTomatoes: digested },
    }));
  }, [tasks, completed, digested, today]);
  useEffect(() => { saveJson(localStorage, 'tomato.dailyTodo', dailyHistory); }, [dailyHistory]);
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
      <div className="top-controls">
        <div className="view-switcher" aria-label="页面切换">
          <button className={view === 'timer' ? 'active' : ''} onClick={() => setView('timer')}>专注台</button>
          <button className={view === 'todo' ? 'active' : ''} onClick={() => setView('todo')}>Todo 总览</button>
        </div>
        {view === 'timer' && <ModeSwitcher mode={mode} onChange={switchMode} />}
      </div>
      {view === 'todo' ? (
        <main className="todo-page">
          <VerticalTodoOverview tasks={tasks} history={dailyHistory} today={today} range={todoRange} anchorDate={todoAnchor} selectedDates={selectedDates} onRangeChange={changeTodoRange} onAnchorChange={moveTodoAnchor} onSelectDate={setSelectedDates} onToggleTask={toggleTask} onExport={exportSelectedMarkdown} />
        </main>
      ) : (
        <main className="dashboard">
          <TimerHero mode={mode} remaining={remaining} running={running} paused={paused} onToggle={toggleRunning} onReset={reset} onSkip={skip} />
          <TasksPanel tasks={tasks} setTasks={setTasks} onToggleTask={toggleTask} notice={notice} today={today} />
        </main>
      )}
      <footer className="bottom-bar glass-line">
        <div><span>已食用</span><strong>{completed}</strong></div>
        <div><span>已消化</span><strong>{digested}</strong></div>
        <div><span>完成任务</span><strong>{tasks.filter((t) => t.done).length}/{tasks.length}</strong></div>
        <div className="footer-actions">
          <button onClick={exportTodayMarkdown}><Download size={15} /> 导出 Todo</button>
          <button onClick={() => window.tomatoDesktop?.openMini()}><Square size={15} /> 置顶小窗</button>
          <button onClick={() => setSettingsOpen(true)}><Settings size={15} /> 设置</button>
        </div>
      </footer>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} durations={durations} setDurations={setDurations} opacity={opacity} setOpacity={setOpacity} />
    </div>
  );
}
