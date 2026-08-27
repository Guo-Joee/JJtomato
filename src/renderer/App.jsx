import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarDays, Check, ClipboardCheck, Coffee, Download, ListTodo, MessageCircle, Minus, Pause, Play, Plus, RotateCcw,
  Send, Settings, SkipForward, Square, Target, Trash2, Users, X,
} from 'lucide-react';
import { MINIMUM_FOCUS_SESSION_SECONDS, MODES, accumulatedFocusSeconds, formatTime, nextMode, progressOf, remainingSecondsAt, shouldPersistFocusSession } from '../core/timer.mjs';
import { loadJson, saveJson } from '../core/storage.mjs';
import { addSubtask, buildDailyTodoMarkdown, buildMultiDayMarkdown, buildTimelineTaskGroups, completeTaskTree, consumeTaskTomatoes, dailyStatsForDate, daysForRange, flattenTaskTree, formatDuration, localDateKey, moveRangeAnchor, normalizePomodoros, normalizeTask, reopenTaskTree, rolloverTasksWithHistory, summarizeDay, summarizeTaskTree, toggleSubtaskCompletion, updateTaskInTree } from '../core/daily-todo.mjs';
import { COMPANION_QUICK_MESSAGES, COMPANION_REACTIONS, COMPANION_STATES, DEFAULT_COMPANION_PRIVACY, INITIAL_COMPANION_MESSAGES, INITIAL_COMPANIONS, addCompanionMessage, companionActivityLabel, companionStateLabel, normalizeCompanion, primaryCompanion, updateCompanionState } from '../core/companion.mjs';
import { INTERRUPTION_REASONS, createFocusSession, normalizeDailyReview, resolveTaskTarget, summarizeDailyReview, taskTargetOptions } from '../core/focus-review.mjs';

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
  { id: 1, text: '完成今天最重要的一件事', done: false, pomodoros: 2, subtasks: [] },
  { id: 2, text: '整理会议记录', done: false, pomodoros: 1, subtasks: [] },
];

function TomatoMark({ size = 30, mode = 'focus' }) {
  const tone = VISUAL[mode].color;
  if (mode === 'shortBreak') {
    return <span className="leaf-mark" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  if (mode === 'longBreak') {
    return <span className="break-mark coffee-mark" style={{ width: size, height: size }} aria-hidden="true"><i /><b /><em /></span>;
  }
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

function TimerHero({ mode, remaining, running, paused, targetOptions, currentTarget, focusElapsed, onSelectTarget, onToggle, onReset, onSkip, onInterruptionReason, onFinishSession }) {
  const cfg = MODES[mode];
  const visual = VISUAL[mode];
  const progress = progressOf(remaining, cfg.seconds);
  const radius = 128;
  const circumference = 2 * Math.PI * radius;
  const isFocus = mode === 'focus';

  return (
    <section className="timer-hero glass-panel" style={{ '--accent': visual.color, '--glow': visual.glow }}>
      <div className="hero-copy">
        <span>{cfg.fullLabel}</span>
        <p>{visual.caption}</p>
      </div>
      {isFocus && (
        <div className={`focus-target ${currentTarget ? 'selected' : ''}`}>
          <Target size={15} />
          <label>
            <span>{currentTarget ? '当前目标' : '开始前先选择任务'}</span>
            <select value={currentTarget?.key || ''} disabled={running} onChange={(event) => onSelectTarget(event.target.value)} aria-label="选择当前专注任务">
              <option value="">选择今天的下一步…</option>
              {targetOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
            </select>
          </label>
          <small>已专注 {formatTime(focusElapsed)}</small>
        </div>
      )}
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
          <div className="status">{running ? isFocus ? '正在专注' : '正在休息' : paused ? '已暂停' : '准备开始'}</div>
        </div>
      </div>
      <div className="timer-actions">
        <button className="secondary" aria-label="重置" onClick={onReset}><RotateCcw size={19} /></button>
        <motion.button className="primary-action" onClick={onToggle} whileTap={{ scale: .93 }} whileHover={{ scale: 1.035 }}>
          {running ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}
          <span>{running ? '暂停一下' : paused ? isFocus ? '继续专注' : '继续休息' : isFocus ? '开始专注' : '开始休息'}</span>
        </motion.button>
        <button className="secondary" aria-label="跳过" onClick={onSkip}><SkipForward size={20} /></button>
      </div>
      {isFocus && paused && (
        <div className="interruption-panel">
          <span>记录中断原因</span>
          <div>{INTERRUPTION_REASONS.map((reason) => <button type="button" key={reason} onClick={() => onInterruptionReason(reason)}>{reason}</button>)}</div>
          <button type="button" className="finish-session" onClick={onFinishSession}>结束本次</button>
        </div>
      )}
      <div className="key-hints"><kbd>Space</kbd> 开始/暂停 <i /> <kbd>R</kbd> 重置</div>
    </section>
  );
}

function ExpandableTaskName({ text, meta, className = '', onDoubleClick }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = String(text || '').length > 24;
  return (
    <button
      type="button"
      className={`expandable-task-name ${expanded ? 'expanded' : ''} ${className}`}
      title={text}
      aria-label={isLong ? `${expanded ? '收起' : '展开'}任务名称：${text}` : text}
      aria-expanded={expanded}
      onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}
      onDoubleClick={(event) => { event.stopPropagation(); onDoubleClick?.(event); }}
    >
      <span>{text}</span>
      {meta && <small>{meta}</small>}
      {isLong && <em>{expanded ? '收起' : '点击展开完整名称'}</em>}
    </button>
  );
}

function CompanionPet({ companion, open, onClick }) {
  const friend = normalizeCompanion(companion);
  const isTyping = friend.state === 'typing';
  return (
    <button className={`companion-pet state-${friend.state} ${open ? 'open' : ''}`} onClick={onClick} aria-label={`打开与${friend.name}的陪伴面板`} aria-expanded={open}>
      <span className="companion-pet-aura" aria-hidden="true" />
      <span className="companion-pet-bubble">{isTyping ? `${friend.name}正在输入…` : friend.state === 'offline' ? '好友暂时不在' : `${friend.name} ${companionStateLabel(friend.state)}`}</span>
      <span className="companion-cat" aria-hidden="true"><span className="companion-cat-face">🐱</span><span className="companion-keyboard">▰ ▰ ▰</span></span>
      <span className="companion-status-dot" aria-hidden="true" />
      <span className="companion-pet-label">桌边陪伴</span>
    </button>
  );
}

function CompanionPanel({ open, companions, selectedId, messages, togetherId, onSelect, onClose, onReaction, onSendMessage, onQuickMessage, onChangeState, onStartTogether }) {
  const [draft, setDraft] = useState('');
  const messageListRef = useRef(null);
  const selected = companions.find((item) => item.id === selectedId) || companions[0];
  const isTogether = selected?.id === togetherId;
  const isPausedTogether = isTogether && selected?.state === 'paused';
  const selectedMessages = messages.filter((message) => message.friendId === selected?.id).slice(-8);
  const latestMessageId = selectedMessages.at(-1)?.id;
  const friendListSize = companions.length > 4 ? 'many' : companions.length;
  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [selected?.id, latestMessageId]);
  const submit = (event) => {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    onSendMessage(selected.id, draft);
    setDraft('');
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="companion-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.aside className="companion-panel glass-panel" initial={{ opacity: 0, x: 24, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 24, scale: .98 }} transition={{ duration: .18 }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="companion-panel-head"><div><span className="eyebrow">桌边陪伴</span><strong><Users size={15} /> 和朋友一起在场</strong></div><button className="companion-close" onClick={onClose} aria-label="关闭陪伴面板"><X size={16} /></button></div>
            <p className="companion-panel-note">看见她在，也让她知道你在。状态只按你的权限共享。</p>
            <div className={`companion-friend-list count-${friendListSize}`}>
              {companions.map((friend) => (
                <button className={`companion-friend ${friend.id === selected?.id ? 'active' : ''}`} key={friend.id} onClick={() => onSelect(friend.id)}>
                  <span className={`companion-avatar ${friend.avatarTone || 'rose'}`}>🐱</span>
                  <span className="companion-friend-copy"><strong>{friend.name}</strong><small><i className={`companion-state-dot state-${friend.state}`} /> {companionStateLabel(friend.state)} · {companionActivityLabel(friend)}</small><em>{friend.durationLabel}</em></span>
                  {friend.unread > 0 && <b className="companion-unread">{friend.unread}</b>}
                </button>
              ))}
            </div>
            {selected ? (
              <>
                <div className="companion-selected"><span className={`companion-selected-icon state-${selected.state}`}>🐱</span><div><strong>{selected.name}</strong><small>{companionActivityLabel(selected)}{selected.state === 'typing' ? ' · 不显示输入内容' : ''}</small></div></div>
                <button className="companion-together" onClick={() => onStartTogether(selected.id)} disabled={selected.state === 'offline' || (isTogether && !isPausedTogether)}><span>🪑</span>{selected.state === 'offline' ? '等她回来再一起坐下' : isPausedTogether ? `和${selected.name}继续专注` : isTogether ? '正在一起专注' : `和${selected.name}一起坐下`}</button>
                <div className="companion-actions" aria-label="陪伴互动">
                  <button onClick={() => onReaction(selected.id, 'tomato')}><span>🍅</span>送番茄</button>
                  <button onClick={() => onReaction(selected.id, 'coffee')}><Coffee size={14} />递咖啡</button>
                  <button onClick={() => onReaction(selected.id, 'wave')}><span>👋</span>挥挥手</button>
                  <button onClick={() => onReaction(selected.id, 'paw')}><span>🐾</span>轻敲猫爪</button>
                </div>
                <div className="companion-quick"><div><strong>快捷留言</strong><small>不用打断专注，也可以回应她</small></div><div className="companion-quick-list">{COMPANION_QUICK_MESSAGES.map((text) => <button key={text} onClick={() => onQuickMessage(selected.id, text)}>{text}</button>)}</div></div>
                <div className="companion-message-title"><span><MessageCircle size={14} /> 陪伴留言</span><small>只保留这间房的短消息</small></div>
                <div className="companion-messages" ref={messageListRef} aria-live="polite">
                  {selectedMessages.length === 0 ? <div className="companion-empty">还没有留言，先送一颗番茄吧。</div> : selectedMessages.map((message) => <div className={`companion-message ${message.sender === 'me' ? 'mine' : ''} ${message.kind === 'reaction' ? 'reaction' : ''}`} key={message.id}><span>{message.text}</span><small>{message.createdAt}</small></div>)}
                </div>
                <form className="companion-message-form" onSubmit={submit}><input value={draft} maxLength={300} onChange={(event) => setDraft(event.target.value)} placeholder="说一句悄悄话…" aria-label="输入陪伴留言" /><button type="submit" aria-label="发送消息" disabled={!draft.trim()}><Send size={15} /></button></form>
                <label className="companion-demo-row"><span>本地演示状态</span><select value={selected.state} onChange={(event) => onChangeState(selected.id, event.target.value)}>{Object.entries(COMPANION_STATES).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label>
              </>
            ) : <div className="companion-empty large">还没有好友，下一步可以创建陪伴房。</div>}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function taskRootsForDate(tasks, date) {
  return tasks.map((task) => flattenTaskTree(task, date)[0]);
}

function TaskContextMenu({ menu, tasks, onClose, onAddSubtask, onToggleTask, onDeleteTask }) {
  const task = tasks.find((item) => item.id === menu.taskId);
  if (!task) return null;
  const width = 160;
  const height = 126;
  const left = Math.min(menu.x, window.innerWidth - width - 8);
  const top = Math.min(menu.y, window.innerHeight - height - 8);
  return createPortal(
    <>
      <div className="context-backdrop" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }} />
      <motion.div className="context-menu" style={{ left, top }} initial={{ opacity: 0, scale: .92, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .16, ease: [0.22, 1, 0.36, 1] }}>
        <button onClick={() => { onAddSubtask(task); onClose(); }}><Plus size={14} /> 创建子任务</button>
        <button onClick={() => { onToggleTask(task); onClose(); }}><Check size={14} /> {task.done ? '取消完成任务' : '完成任务'}</button>
        <hr />
        <button className="danger" onClick={() => { onDeleteTask(task); onClose(); }}><Trash2 size={14} /> 删除任务</button>
      </motion.div>
    </>,
    document.body,
  );
}

function TasksPanel({ tasks, setTasks, onToggleTask, notice, today }) {
  const [value, setValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [subtaskEditorId, setSubtaskEditorId] = useState(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const add = () => {
    const text = value.trim();
    if (!text) return;
    setTasks((items) => [...items, { id: Date.now(), text, done: false, pomodoros: 1, subtasks: [], addedDate: today, plannedDate: today, carryCount: 0 }]);
    setValue('');
  };
  const updatePomodoros = (id, value) => setTasks((items) => items.map((task) => task.id === id ? { ...task, pomodoros: normalizePomodoros(value, 0) } : task));
  const openContextMenu = (task, event) => {
    event.preventDefault();
    setContextMenu({ taskId: task.id, x: event.clientX, y: event.clientY });
  };
  const addChild = (task) => {
    const text = subtaskDraft.trim();
    if (!text) return;
    setTasks((items) => items.map((item) => item.id === task.id ? addSubtask(item, { id: `${task.id}-${Date.now()}`, text, pomodoros: 1 }) : item));
    setSubtaskDraft('');
    setSubtaskEditorId(null);
  };
  const updateSubtask = (taskId, subtaskId, patch) => setTasks((items) => items.map((task) => task.id === taskId
    ? { ...task, subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, ...patch } : subtask) }
    : task));
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('blur', close); };
  }, [contextMenu]);
  const renderSubtasks = (task) => task.subtasks?.length > 0 && (
    <div className="subtask-group">
      {task.subtasks.map((subtask) => (
        <div className={`subtask ${subtask.done ? 'done' : ''}`} key={subtask.id}>
          <button className="subtask-check" aria-label={subtask.done ? '取消完成子任务' : '完成子任务'} onClick={() => onToggleTask(subtask, task.id)}>{subtask.done && <Check size={12} />}</button>
          <ExpandableTaskName text={subtask.text} className="subtask-name" />
          <div className="pomodoro-editor"><TomatoMark size={13} /><input type="number" min="0" max="99" value={subtask.pomodoros} disabled={subtask.done} aria-label="子任务番茄数量" onChange={(e) => updateSubtask(task.id, subtask.id, { pomodoros: normalizePomodoros(e.target.value, 0) })} /></div>
        </div>
      ))}
    </div>
  );
  return (
    <section className="side-panel glass-panel">
      <div className="panel-title"><div><ListTodo size={17} /><strong>今日任务</strong></div><span>{tasks.filter((t) => t.done).length}/{tasks.length}</span></div>
      <div className="add-task"><input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="今天最重要的一件事…" /><button onClick={add} aria-label="添加任务"><Plus size={18} /></button></div>
      <div className="task-list"><AnimatePresence initial={false}>{tasks.map((task) => (
        <motion.div className={`task-group ${task.done ? 'done' : ''}`} key={task.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 16 }}>
          <div className="task" onContextMenu={(event) => openContextMenu(task, event)}><button className="check" aria-label={task.done ? '取消完成任务' : '完成任务'} onClick={() => onToggleTask(task)}>{task.done && <Check size={14} />}</button><ExpandableTaskName text={task.text} meta={task.subtasks?.length ? `${task.subtasks.filter((item) => item.done).length}/${task.subtasks.length} 个子任务` : null} /><div className="pomodoro-editor" aria-label={`${task.text}需要的番茄数`}><TomatoMark size={15} /><input type="number" min="0" max="99" value={summarizeTaskTree(task).pomodoros} disabled={task.done || task.subtasks?.length > 0} aria-label="番茄数量" readOnly={task.subtasks?.length > 0} onChange={(e) => updatePomodoros(task.id, e.target.value)} /></div><button className="delete" onClick={() => setTasks((list) => list.filter((t) => t.id !== task.id))}><Trash2 size={15} /></button></div>
          {task.subtasks?.length > 0 && <button className="collapse-toggle" onClick={() => setCollapsed((state) => ({ ...state, [task.id]: !state[task.id] }))}>{collapsed[task.id] ? '展开子任务' : '折叠子任务'}</button>}
          {!collapsed[task.id] && renderSubtasks(task)}
          {subtaskEditorId === task.id && (
            <div className="subtask-editor">
              <input autoFocus value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addChild(task); if (e.key === 'Escape') { setSubtaskEditorId(null); setSubtaskDraft(''); } }} placeholder="输入子任务名称，回车添加" />
              <button onClick={() => addChild(task)} aria-label="添加子任务"><Plus size={14} /></button>
            </div>
          )}
        </motion.div>
      ))}</AnimatePresence></div>
      {notice && <div className="task-notice" role="alert">{notice}</div>}
      {contextMenu && <TaskContextMenu menu={contextMenu} tasks={tasks} onClose={() => setContextMenu(null)} onAddSubtask={() => setSubtaskEditorId(contextMenu.taskId)} onToggleTask={onToggleTask} onDeleteTask={(task) => setTasks((list) => list.filter((t) => t.id !== task.id))} />}
    </section>
  );
}

function VerticalTodoOverview({ tasks, history, dailyStats, today, focusSessions, range, anchorDate, selectedDates, onRangeChange, onAnchorChange, onSelectDate, onToggleTask, onUpdateHistoricalTask, onExport }) {
  const [editing, setEditing] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [collapsedDays, setCollapsedDays] = useState({});
  const [collapsedParents, setCollapsedParents] = useState({});
  const beginEdit = (task, date) => { setEditing(`${date}:${task.id}`); setDraftText(task.text); };
  const saveEdit = (task, date) => { const text = draftText.trim(); if (text && text !== task.text) onUpdateHistoricalTask(date, task.id, { text }); setEditing(null); };
  const days = daysForRange(range, anchorDate);
  const groups = buildTimelineTaskGroups({ history, currentTasks: tasks, today, days });
  const hasTasks = groups.some((group) => group.tasks.length > 0);
  const selected = new Set(selectedDates);
  const selectedSummary = summarizeDay(history?.[anchorDate] || { focusSessions: focusSessions?.[anchorDate] || [] });
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
        <div><span className="eyebrow">Todo 总览</span><h1>计划</h1></div>
        <button className="export-todo" disabled={!selectedDates.length} onClick={onExport}><Download size={15} /> 导出</button>
      </div>
      <div className="vertical-toolbar">
        <div className="range-switcher" aria-label="查看范围">{['month', 'week', 'day'].map((item) => <button key={item} className={range === item ? 'active' : ''} onClick={() => onRangeChange(item)}>{item === 'month' ? '月' : item === 'week' ? '周' : '日'}</button>)}</div>
        <div className="vertical-date-nav"><button aria-label="上一个日期范围" onClick={() => onAnchorChange(-1)}>‹</button><strong>{rangeLabel}</strong><button aria-label="下一个日期范围" onClick={() => onAnchorChange(1)}>›</button><button className="today-jump" onClick={() => onRangeChange(range, today)}>今天</button></div>
      </div>
      <div className="vertical-export-row"><span>导出日期</span><div>{days.map((day) => <label key={day}><input type="checkbox" checked={selected.has(day)} onChange={() => toggleDate(day)} /><b>{day.slice(5).replace('-', '/')}</b></label>)}</div></div>
      <div className="plan-calendar-note">日视图用于执行，周视图用于安排，月视图用于回顾。未完成任务会进入下一天，历史记录不会被覆盖。</div>
      <div className="vertical-summary"><span><b>{tasks.length}</b>任务</span><span><b>{tasks.filter((task) => task.done).length}</b>完成</span><span><b>{tasks.filter((task) => !task.done).length}</b>待继续</span><span className="focus-total"><b>{selectedSummary.label}</b>专注</span><span><b>{selectedSummary.eaten}</b>已食用</span><span><b>{selectedSummary.digested}</b>已消化</span></div>
      <div className="vertical-timeline plan-calendar-shell">
        <div className={`plan-calendar-grid ${range}`}>
        {groups.map((group) => (
          <section className={`timeline-day ${group.date === today ? 'today' : ''}`} key={group.date}>
            <div className="timeline-node" />
            <header><div><strong>{group.date.slice(5).replace('-', '/')}</strong><span>{group.date === today ? '今天' : new Date(`${group.date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</span></div><small>专注 {summarizeDay(history?.[group.date] || { focusSessions: focusSessions?.[group.date] || [] }).label} · 已食用 {dailyStats?.[group.date]?.edibleTomatoes ?? history?.[group.date]?.edibleTomatoes ?? 0} · 已消化 {dailyStats?.[group.date]?.digestedTomatoes ?? history?.[group.date]?.digestedTomatoes ?? 0}</small></header>
            <button className="timeline-collapse" onClick={() => setCollapsedDays((state) => ({ ...state, [group.date]: !state[group.date] }))}>{collapsedDays[group.date] ? '展开任务' : '折叠任务'}</button>
            {!collapsedDays[group.date] && <div className="timeline-items">
              {group.tasks.length === 0 ? <div className="timeline-empty">今天还没有任务</div> : group.tasks.map((task) => {
                const children = (task.children || []).map((branch) => branch[0]);
                const collapsed = collapsedParents[task.id];
                return (
                <article className={`timeline-task-group ${task.done ? 'done' : ''}`} key={`${task.id}:${group.date}`}>
                  <div className="timeline-parent">
                    <button className="timeline-check" aria-label={task.done ? '取消完成任务' : '完成任务'} onClick={() => onToggleTask(task, null, group.date)}>{task.done && <Check size={13} />}</button>
                    <div className="timeline-task-main">{editing === `${group.date}:${task.id}` ? <input className="timeline-edit-input" autoFocus value={draftText} onChange={(e) => setDraftText(e.target.value)} onBlur={() => saveEdit(task, group.date)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(task, group.date); if (e.key === 'Escape') setEditing(null); }} /> : <ExpandableTaskName text={task.text} className="timeline-expandable-name" onDoubleClick={() => beginEdit(task, group.date)} />}<small>{task.done ? '已完成' : '待完成'}{task.carryCount ? ` · 创建于 ${(task.addedDate || group.date).slice(5).replace('-', '/')} · 顺延 ${task.carryCount} 次` : ''} · {children.filter((child) => child.done).length}/{children.length} 个子任务</small>{tomatoDots(summarizeTaskTree(task).pomodoros)}</div>
                    {children.length > 0 && <button className="parent-collapse" aria-label={collapsed ? '展开子任务' : '折叠子任务'} onClick={() => setCollapsedParents((state) => ({ ...state, [task.id]: !state[task.id] }))}>{collapsed ? '展开' : '折叠'}</button>}
                  </div>
                  {!collapsed && children.length > 0 && <div className="timeline-children">
                    {children.map((child) => <div className={`timeline-child ${child.done ? 'done' : ''}`} key={child.id}>
                      <button className="timeline-check" aria-label={child.done ? '取消完成子任务' : '完成子任务'} onClick={() => onToggleTask(child, task.id, group.date)}>{child.done && <Check size={12} />}</button>
                      <div className="timeline-task-main">{editing === `${group.date}:${child.id}` ? <input className="timeline-edit-input" autoFocus value={draftText} onChange={(e) => setDraftText(e.target.value)} onBlur={() => saveEdit(child, group.date)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(child, group.date); if (e.key === 'Escape') setEditing(null); }} /> : <ExpandableTaskName text={child.text} className="timeline-expandable-name" onDoubleClick={() => beginEdit(child, group.date)} />}<small>所属主任务：{task.text} · {child.done ? '已完成' : '待完成'}{child.carryCount ? ` · 创建于 ${(child.addedDate || group.date).slice(5).replace('-', '/')} · 顺延 ${child.carryCount} 次` : ''}</small>{tomatoDots(child.pomodoros)}</div>
                    </div>)}
                  </div>}
                </article>
              );})}
            </div>}
          </section>
        ))}
        {!hasTasks && <div className="timeline-empty all-empty">这个范围还没有任务</div>}
        </div>
      </div>
    </section>
  );
}

function DailyReviewPage({ date, tasks, sessions, review, onSave }) {
  const [draft, setDraft] = useState(() => normalizeDailyReview(review, date));
  const summary = summarizeDailyReview({ tasks, sessions });
  useEffect(() => { setDraft(normalizeDailyReview(review, date)); }, [date, review]);
  const save = (event) => {
    event.preventDefault();
    onSave(normalizeDailyReview({ ...draft, updatedAt: Date.now() }, date));
  };
  return (
    <main className="review-page">
      <section className="review-card glass-panel">
        <header className="review-head">
          <div><span className="eyebrow">10 秒复盘</span><h1>把今天真实留下来</h1><p>{date} · 不评分，只记录进展和下一步。</p></div>
          <ClipboardCheck size={34} />
        </header>
        <div className="review-stats">
          <div><span>今日专注</span><strong>{formatDuration(summary.focusSeconds)}</strong></div>
          <div><span>完成任务</span><strong>{summary.completedTasks} 项</strong></div>
          <div><span>被打断</span><strong>{summary.interruptions} 次</strong></div>
        </div>
        <form className="review-form" onSubmit={save}>
          <label><span>今天真正完成了什么？</span><textarea maxLength={1000} value={draft.completedReflection} onChange={(event) => setDraft((value) => ({ ...value, completedReflection: event.target.value }))} placeholder="写下一句就够了…" /></label>
          <label><span>明天最重要的一件事是什么？</span><textarea maxLength={500} value={draft.tomorrowFirstStep} onChange={(event) => setDraft((value) => ({ ...value, tomorrowFirstStep: event.target.value }))} placeholder="把它写成能立刻开始的下一步…" /></label>
          <button type="submit">保存今日复盘</button>
          {draft.updatedAt && <small>上次保存：{new Date(draft.updatedAt).toLocaleString('zh-CN')}</small>}
        </form>
      </section>
      <section className="session-card glass-panel">
        <div className="session-head"><div><span className="eyebrow">真实专注记录</span><h2>今天的每一段专注</h2></div><span>{sessions.length} 段</span></div>
        <div className="session-list">
          {sessions.length === 0 ? <div className="session-empty">完成至少 1 分钟专注后，这里会记录对应任务、有效时长和中断。</div> : [...sessions].reverse().map((session, index) => (
            <article key={session.id || `${session.startedAt}:${index}`}>
              <Target size={15} />
              <div><strong>{session.taskText || '旧版未绑定任务的专注'}</strong><small>{new Date(session.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 开始 · 有效专注 {formatDuration(session.actualSeconds)}</small>{session.interruptionReasons?.length > 0 && <em>中断：{session.interruptionReasons.join('、')}</em>}</div>
              <span>暂停 {Number(session.pauseCount) || 0} 次</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SettingsSheet({ open, onClose, durations, opacity, setOpacity, onSave, running, companionPrivacy, onCompanionPrivacyChange }) {
  const [draft, setDraft] = useState(durations);
  useEffect(() => { if (open) setDraft(durations); }, [open, durations]);
  const save = () => onSave(draft);
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
                <input type="number" min={min} max={max} value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))} />
              </label>
            ))}
            <label className="setting-row opacity-row">
              <span>窗口透明度<small>{Math.round(opacity * 100)}%</small></span>
              <input className="opacity-slider" type="range" min="65" max="100" value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
            </label>
            <div className="settings-section-label"><Users size={14} /> 陪伴共享</div>
            {[
              ['shareOnline', '共享在线状态', '好友可以知道你是否在桌边'],
              ['shareTyping', '共享正在输入', '只共享状态，不记录文字和按键'],
              ['shareActivity', '共享当前活动', '例如正在看书、写作或休息'],
              ['shareTask', '共享当前任务', '默认关闭，开启后才展示任务名称'],
              ['shareReactions', '接收互动动画', '允许好友送来番茄、咖啡和猫爪'],
            ].map(([key, label, note]) => (
              <label className="setting-toggle" key={key}>
                <span>{label}<small>{note}</small></span>
                <input type="checkbox" checked={Boolean(companionPrivacy?.[key])} onChange={(event) => onCompanionPrivacyChange?.(key, event.target.checked)} />
              </label>
            ))}
            <div className="sheet-note">{running ? '请结束本次计时，保存的时间将在下次倒计时自动生效。' : '保存后已更新当前倒计时。'}</div>
            <button className="sheet-save" onClick={save}>保存设置</button>
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
  const [view, setView] = useState('today');
  const [todoRange, setTodoRange] = useState('week');
  const [todoAnchor, setTodoAnchor] = useState(() => localDateKey());
  const [selectedDates, setSelectedDates] = useState(() => daysForRange('week', localDateKey()));
  const [mode, setMode] = useState('focus');
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const initialDailyStats = loadJson(localStorage, 'tomato.dailyStats', {});
  const initialTodayStats = dailyStatsForDate(initialDailyStats, localDateKey());
  const initialTodoState = useMemo(() => rolloverTasksWithHistory({
    tasks: loadJson(localStorage, 'tomato.tasks', INITIAL_TASKS),
    history: loadJson(localStorage, 'tomato.dailyTodo', {}),
    today: localDateKey(),
  }), []);
  const [completed, setCompleted] = useState(initialTodayStats.edibleTomatoes);
  const [digested, setDigested] = useState(initialTodayStats.digestedTomatoes);
  const [tasks, setTasks] = useState(initialTodoState.tasks);
  const [focusSessions, setFocusSessions] = useState(() => loadJson(localStorage, 'tomato.focusSessions', {}));
  const [currentTarget, setCurrentTarget] = useState(() => loadJson(localStorage, 'tomato.currentTarget', null));
  const [focusElapsed, setFocusElapsed] = useState(0);
  const [dailyReviews, setDailyReviews] = useState(() => loadJson(localStorage, 'tomato.dailyReviews', {}));
  const [dailyHistory, setDailyHistory] = useState(initialTodoState.history);
  const [dailyStats, setDailyStats] = useState(initialDailyStats);
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opacity, setOpacity] = useState(() => loadJson(localStorage, 'tomato.opacity', 0.92));
  const [durations, setDurations] = useState(() => loadJson(localStorage, 'tomato.durations', {
    focus: 25, shortBreak: 5, longBreak: 15,
  }));
  const [pendingDurationUpdate, setPendingDurationUpdate] = useState(false);
  const [companions, setCompanions] = useState(() => (loadJson(localStorage, 'tomato.companions', INITIAL_COMPANIONS) || INITIAL_COMPANIONS).map(normalizeCompanion));
  const [companionMessages, setCompanionMessages] = useState(() => loadJson(localStorage, 'tomato.companionMessages', INITIAL_COMPANION_MESSAGES) || INITIAL_COMPANION_MESSAGES);
  const [companionPrivacy, setCompanionPrivacy] = useState(() => ({ ...DEFAULT_COMPANION_PRIVACY, ...(loadJson(localStorage, 'tomato.companionPrivacy', {}) || {}) }));
  const [companionOpen, setCompanionOpen] = useState(false);
  const [selectedCompanionId, setSelectedCompanionId] = useState(() => (loadJson(localStorage, 'tomato.companions', INITIAL_COMPANIONS)?.[0]?.id || INITIAL_COMPANIONS[0].id));
  const [companionNotice, setCompanionNotice] = useState('');
  const [togetherCompanionId, setTogetherCompanionId] = useState(null);
  const miniDeadlineRef = useRef(null);
  const timerRef = useRef(null);
  const deadlineRef = useRef(null);
  const togetherCompanionIdRef = useRef(null);
  const focusStartedAtRef = useRef(null);
  const focusRunStartedAtRef = useRef(null);
  const focusActiveSecondsRef = useRef(0);
  const focusSessionDateRef = useRef(null);
  const focusPlannedSecondsRef = useRef(0);
  const focusPauseCountRef = useRef(0);
  const focusInterruptionReasonsRef = useRef([]);
  const focusTaskRef = useRef(null);

  // "一起专注" is a live session, not durable friend profile data. Repair
  // stale values saved by earlier versions so a restarted app never appears
  // to keep a friend trapped in a finished shared session.
  useEffect(() => {
    setCompanions((items) => items.map((item) => item.activity === '和你一起专注'
      ? updateCompanionState(item, 'online')
      : item));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = localDateKey();
      if (next === today) return;
      const rolled = rolloverTasksWithHistory({ tasks, history: dailyHistory, today: next });
      setDailyHistory(rolled.history);
      setTasks(rolled.tasks);
      const nextStats = dailyStatsForDate(dailyStats, next);
      setCompleted(nextStats.edibleTomatoes);
      setDigested(nextStats.digestedTomatoes);
      setToday(next);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [today, tasks, dailyHistory, completed, digested, focusSessions, dailyStats]);

  const focusSecondsToday = (focusSessions[today] || []).reduce((sum, session) => sum + (Number(session.actualSeconds) || 0), 0);
  const todayFocusLabel = formatDuration(focusSecondsToday);
  const availableTargets = useMemo(() => taskTargetOptions(tasks), [tasks]);
  const resolvedCurrentTarget = useMemo(() => resolveTaskTarget(tasks, currentTarget), [tasks, currentTarget]);
  const modeSeconds = durations[mode] * 60;
  const statePayload = useMemo(() => ({
    mode,
    remaining,
    running,
    total: modeSeconds,
    deadlineEpoch: running && deadlineRef.current != null ? Date.now() + remaining * 1000 : null,
  }), [mode, remaining, running, modeSeconds]);

  const saveDurations = (nextDurations) => {
    setDurations(nextDurations);
    if (running) {
      setPendingDurationUpdate(true);
      setNotice('请结束本次计时，已保存的时间将在下次倒计时自动生效。');
    } else {
      setRemaining(nextDurations[mode] * 60);
      setPaused(false);
      setPendingDurationUpdate(false);
      setNotice('保存后已更新当前倒计时。');
    }
    setSettingsOpen(false);
  };

  const selectFocusTarget = (key) => {
    if (running && mode === 'focus') {
      setNotice('请先暂停或结束当前专注，再切换任务。');
      return;
    }
    const next = availableTargets.find((option) => option.key === key) || null;
    setCurrentTarget(next ? { key: next.key, taskId: next.taskId, parentTaskId: next.parentTaskId } : null);
    setNotice(next ? `当前目标已切换为“${next.text}”。` : '已清除当前目标。');
  };

  const updateCompanion = (id, patch) => setCompanions((items) => items.map((item) => item.id === id ? normalizeCompanion({ ...item, ...patch }) : item));
  const setTogetherCompanion = (id) => {
    togetherCompanionIdRef.current = id;
    setTogetherCompanionId(id);
  };
  const clearTogetherCompanion = () => {
    togetherCompanionIdRef.current = null;
    setTogetherCompanionId(null);
  };
  const endTogetherFocus = (activity = '准备开始', durationLabel = '刚刚') => {
    const friendId = togetherCompanionIdRef.current;
    if (!friendId) return;
    updateCompanion(friendId, { state: 'online', activity, durationLabel });
    clearTogetherCompanion();
  };

  const beginFocusSession = (startedAt = Date.now(), target = resolvedCurrentTarget) => {
    if (focusStartedAtRef.current == null) {
      focusStartedAtRef.current = startedAt;
      focusActiveSecondsRef.current = 0;
      focusSessionDateRef.current = localDateKey(new Date(startedAt));
      focusPlannedSecondsRef.current = durations.focus * 60;
      focusPauseCountRef.current = 0;
      focusInterruptionReasonsRef.current = [];
      focusTaskRef.current = target;
    }
    focusRunStartedAtRef.current = startedAt;
    setFocusElapsed(Math.round(focusActiveSecondsRef.current));
  };
  const pauseFocusSegment = (endedAt = Date.now()) => {
    focusActiveSecondsRef.current = accumulatedFocusSeconds(focusActiveSecondsRef.current, focusRunStartedAtRef.current, endedAt);
    focusRunStartedAtRef.current = null;
    setFocusElapsed(Math.round(focusActiveSecondsRef.current));
  };
  const clearFocusSession = () => {
    focusStartedAtRef.current = null;
    focusRunStartedAtRef.current = null;
    focusActiveSecondsRef.current = 0;
    focusSessionDateRef.current = null;
    focusPlannedSecondsRef.current = 0;
    focusPauseCountRef.current = 0;
    focusInterruptionReasonsRef.current = [];
    focusTaskRef.current = null;
    setFocusElapsed(0);
  };
  const finishFocusSession = () => {
    if (mode !== 'focus' || focusStartedAtRef.current == null) return false;
    const endedAt = Date.now();
    pauseFocusSegment(endedAt);
    const seconds = Math.round(focusActiveSecondsRef.current);
    const startedAt = focusStartedAtRef.current;
    const sessionDate = focusSessionDateRef.current || today;
    const session = createFocusSession({
      startedAt,
      endedAt,
      actualSeconds: seconds,
      plannedSeconds: focusPlannedSecondsRef.current,
      pauseCount: focusPauseCountRef.current,
      interruptionReasons: focusInterruptionReasonsRef.current,
      target: focusTaskRef.current,
    });
    clearFocusSession();
    if (!shouldPersistFocusSession(seconds, MINIMUM_FOCUS_SESSION_SECONDS)) return false;
    setFocusSessions((all) => ({ ...all, [sessionDate]: [...(all[sessionDate] || []), session] }));
    return true;
  };

  const switchMode = (next) => {
    if (mode === 'focus') {
      finishFocusSession();
      endTogetherFocus();
    }
    deadlineRef.current = null;
    setMode(next);
    setRemaining(durations[next] * 60);
    setRunning(false);
    setPaused(false);
    setPendingDurationUpdate(false);
  };
  const reset = () => {
    if (mode === 'focus') {
      finishFocusSession();
      endTogetherFocus();
    }
    deadlineRef.current = null;
    setRemaining(modeSeconds);
    setRunning(false);
    setPaused(false);
  };
  const startTimer = () => {
    if (running || remaining <= 0) return;
    if (mode === 'focus') {
      if (!resolvedCurrentTarget) {
        setNotice('开始专注前，请先选择一个今天的任务或子任务。');
        return;
      }
      beginFocusSession(Date.now(), resolvedCurrentTarget);
      const friendId = togetherCompanionIdRef.current;
      if (friendId) updateCompanion(friendId, { state: 'focusing', activity: '和你一起专注', durationLabel: '继续专注' });
    }
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
    if (mode === 'focus') {
      pauseFocusSegment();
      focusPauseCountRef.current += 1;
      const friendId = togetherCompanionIdRef.current;
      if (friendId) updateCompanion(friendId, { state: 'paused', activity: '等你继续', durationLabel: '暂停中' });
    }
    setPaused(true);
    setRunning(false);
  };
  const recordInterruptionReason = (reason) => {
    if (mode !== 'focus' || !paused || focusStartedAtRef.current == null) return;
    const pauseIndex = Math.max(0, focusPauseCountRef.current - 1);
    focusInterruptionReasonsRef.current[pauseIndex] = reason;
    setNotice(`已记录中断原因：${reason}`);
  };
  const finishCurrentFocus = () => {
    const saved = finishFocusSession();
    endTogetherFocus();
    deadlineRef.current = null;
    setRemaining(durations.focus * 60);
    setRunning(false);
    setPaused(false);
    setNotice(saved ? '本次真实专注记录已保存。' : '本次不足 1 分钟，没有写入专注记录。');
  };
  const toggleRunning = useCallback(() => {
    if (running) pauseTimer();
    else startTimer();
  }, [running, remaining, mode, resolvedCurrentTarget]);
  const skip = () => switchMode(nextMode(mode, completed));

  const changeCompanionState = (id, state) => {
    const isActiveTogether = id === togetherCompanionIdRef.current;
    if (isActiveTogether && state !== 'focusing') clearTogetherCompanion();
    setCompanions((items) => items.map((item) => item.id === id
      ? updateCompanionState(item, state, state === 'typing' ? '正在敲键盘' : '')
      : item));
  };
  const flashCompanionNotice = (text) => {
    setCompanionNotice(text);
    window.clearTimeout(flashCompanionNotice.timer);
    flashCompanionNotice.timer = window.setTimeout(() => setCompanionNotice(''), 2400);
  };
  const sendCompanionReaction = (friendId, type) => {
    const friend = companions.find((item) => item.id === friendId);
    const reaction = COMPANION_REACTIONS[type];
    if (!friend || !reaction || companionPrivacy.shareReactions === false) return;
    setCompanionMessages((items) => addCompanionMessage(items, { friendId, sender: 'me', kind: 'reaction', text: `${reaction.emoji} ${reaction.text}`, createdAt: '刚刚' }));
    flashCompanionNotice(`已送给${friend.name}${reaction.text}`);
  };
  const sendCompanionMessage = (friendId, text) => {
    const friend = companions.find((item) => item.id === friendId);
    const trimmed = String(text || '').trim();
    if (!friend || !trimmed) return;
    setCompanionMessages((items) => addCompanionMessage(items, { friendId, sender: 'me', text: trimmed, createdAt: '刚刚' }));
    flashCompanionNotice(`留言已送达${friend.name}`);
  };
  const sendCompanionQuickMessage = (friendId, text) => sendCompanionMessage(friendId, text);
  const startTogetherFocus = (friendId) => {
    const friend = companions.find((item) => item.id === friendId);
    if (!friend || friend.state === 'offline') return;
    if (!resolvedCurrentTarget) {
      setNotice('一起专注前，请先在今天页面选择当前任务。');
      setCompanionOpen(false);
      return;
    }
    const wasTogether = togetherCompanionIdRef.current === friendId;
    if (togetherCompanionIdRef.current && !wasTogether) endTogetherFocus();
    if (!(running && mode === 'focus')) {
      const nextRemaining = mode === 'focus' ? remaining : durations.focus * 60;
      if (nextRemaining <= 0) return;
      deadlineRef.current = performance.now() + nextRemaining * 1000;
      setMode('focus');
      setRemaining(nextRemaining);
      beginFocusSession(Date.now(), resolvedCurrentTarget);
      setPaused(false);
      setRunning(true);
    }
    setTogetherCompanion(friendId);
    updateCompanion(friendId, { state: 'focusing', activity: '和你一起专注', durationLabel: '刚刚开始', unread: 0 });
    if (!wasTogether) setCompanionMessages((items) => addCompanionMessage(items, { friendId, sender: 'me', kind: 'reaction', text: `🪑 和${friend.name}一起坐下，开始专注`, createdAt: '刚刚' }));
    flashCompanionNotice(wasTogether ? `你和${friend.name}继续一起专注。` : `你和${friend.name}已经一起坐下，开始专注。`);
  };
  const primaryFriend = primaryCompanion(companions);
  const selectCompanion = (id) => {
    setSelectedCompanionId(id);
    setCompanions((items) => items.map((item) => item.id === id ? { ...item, unread: 0 } : item));
  };

  const toggleTask = (task, parentId = null, targetDate = today) => {
    if (targetDate !== today) {
      setDailyHistory((history) => {
        const day = history[targetDate];
        if (!day) return history;
        const available = Math.max(0, (day.edibleTomatoes || 0) - (day.digestedTomatoes || 0));
        const update = (items) => items.map((item) => {
          if (parentId && item.id === parentId) return toggleSubtaskCompletion(item, task.id, new Date(`${targetDate}T12:00:00`).toISOString());
          if (!parentId && item.id === task.id) {
            const normalized = normalizeTask(item, targetDate);
            return task.done
              ? reopenTaskTree(normalized)
              : completeTaskTree(normalized, new Date(`${targetDate}T12:00:00`).toISOString());
          }
          return item;
        });
        const nextDone = !task.done;
        const amount = parentId
          ? normalizePomodoros(task.pomodoros)
          : nextDone
            ? summarizeTaskTree(task).pomodoros - summarizeTaskTree(task).digested
            : summarizeTaskTree(task).digested;
        if (nextDone && amount > available) {
          setNotice('该日期可消化番茄不足，无法补完成任务。');
          return history;
        }
        const delta = nextDone ? amount : -amount;
        return { ...history, [targetDate]: { ...day, tasks: update(day.tasks || []), digestedTomatoes: Math.max(0, (day.digestedTomatoes || 0) + delta) } };
      });
      return;
    }
    if (parentId) {
      const parent = tasks.find((item) => item.id === parentId);
      if (!parent) return;
      const subtask = parent.subtasks.find((item) => item.id === task.id);
      if (!subtask) return;
      const nextDone = !subtask.done;
      const amount = normalizePomodoros(subtask.pomodoros);
      if (nextDone) {
        const result = consumeTaskTomatoes({ pomodoros: amount }, completed - digested);
        if (!result.ok) {
          setNotice(result.message);
          return;
        }
        setDigested((value) => value + result.amount);
      } else {
        setDigested((value) => Math.max(0, value - amount));
      }
      setTasks((list) => list.map((item) => item.id !== parentId ? item : toggleSubtaskCompletion(item, task.id, new Date().toISOString())));
      setNotice(nextDone ? `子任务“${task.text}”已完成，番茄已消化。` : '已取消子任务完成，番茄已退回今日可用数量。');
      return;
    }
    if (task.done) {
      const amount = summarizeTaskTree(task).digested;
      setTasks((list) => list.map((item) => item.id === task.id ? reopenTaskTree(item) : item));
      setDigested((value) => Math.max(0, value - amount));
      setNotice('已取消任务完成，番茄已退回今日可用数量。');
      return;
    }
    const amount = summarizeTaskTree(task).pomodoros - summarizeTaskTree(task).digested;
    const result = consumeTaskTomatoes({ pomodoros: amount }, completed - digested);
    if (!result.ok) {
      setNotice(result.message);
      window.setTimeout(() => setNotice(''), 2800);
      return;
    }
    setTasks((list) => list.map((item) => item.id === task.id ? completeTaskTree(item, new Date().toISOString()) : item));
    setDigested((value) => value + result.amount);
    setNotice(result.amount === 0 ? '任务已完成。' : `任务已完成，消化 ${result.amount} 个番茄。`);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const updateHistoricalTask = (date, targetId, patch) => {
    setDailyHistory((history) => {
      const day = history[date];
      if (!day) return history;
      return { ...history, [date]: { ...day, tasks: updateTaskInTree(day.tasks || [], targetId, (task) => ({ ...task, ...patch })) } };
    });
  };

  const saveDailyReview = (review) => {
    setDailyReviews((all) => ({ ...all, [today]: review }));
    setNotice('今日复盘已保存，明天可以从第一步继续。');
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
      if (mode === 'focus' && focusRunStartedAtRef.current != null) {
        setFocusElapsed(Math.round(accumulatedFocusSeconds(focusActiveSecondsRef.current, focusRunStartedAtRef.current, Date.now())));
      }
      // A delayed renderer callback may observe an older value. Never allow
      // the displayed countdown to increase because of that stale callback.
      setRemaining((value) => Math.min(value, nextRemaining));
      if (nextRemaining > 0) return;

      finishFocusSession();
      if (mode === 'focus') endTogetherFocus('完成一轮专注', '刚刚完成');
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

    intervalId = window.setInterval(tick, 1000);
    timerRef.current = intervalId;
    tick();
    return () => {
      window.clearInterval(intervalId);
      if (timerRef.current === intervalId) timerRef.current = null;
    };
  }, [running, mode, completed]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const isTextEntry = target instanceof HTMLElement && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
        || target.isContentEditable
      );
      if (isTextEntry || settingsOpen || event.repeat) return;
      if ((event.code === 'Space' || event.key === ' ') && !settingsOpen) {
        event.preventDefault();
        toggleRunning();
      }
      if (event.key?.toLowerCase() === 'r' && !settingsOpen) reset();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen, modeSeconds, toggleRunning]);

  useEffect(() => {
    if (!isMini) window.tomatoDesktop?.sendTimerState(statePayload);
  }, [isMini, statePayload]);
  useEffect(() => { saveJson(localStorage, 'tomato.tasks', tasks); }, [tasks]);
  useEffect(() => {
    setDailyStats((all) => ({ ...all, [today]: { edibleTomatoes: completed, digestedTomatoes: digested } }));
    saveJson(localStorage, 'tomato.completed', completed);
  }, [completed, digested, today]);
  useEffect(() => { saveJson(localStorage, 'tomato.digested', digested); }, [digested]);
  useEffect(() => { saveJson(localStorage, 'tomato.dailyStats', dailyStats); }, [dailyStats]);
  useEffect(() => { saveJson(localStorage, 'tomato.focusSessions', focusSessions); }, [focusSessions]);
  useEffect(() => { saveJson(localStorage, 'tomato.currentTarget', currentTarget); }, [currentTarget]);
  useEffect(() => { saveJson(localStorage, 'tomato.dailyReviews', dailyReviews); }, [dailyReviews]);
  useEffect(() => {
    if (currentTarget && !resolvedCurrentTarget && focusStartedAtRef.current == null) setCurrentTarget(null);
  }, [currentTarget, resolvedCurrentTarget]);
  useEffect(() => {
    setDailyHistory((history) => ({
      ...history,
      [today]: { date: today, tasks, edibleTomatoes: completed, digestedTomatoes: digested, focusSessions: focusSessions[today] || [] },
    }));
  }, [tasks, completed, digested, today, focusSessions]);
  useEffect(() => { saveJson(localStorage, 'tomato.dailyTodo', dailyHistory); }, [dailyHistory]);
  useEffect(() => { saveJson(localStorage, 'tomato.durations', durations); }, [durations]);
  useEffect(() => { saveJson(localStorage, 'tomato.companions', companions); }, [companions]);
  useEffect(() => { saveJson(localStorage, 'tomato.companionMessages', companionMessages); }, [companionMessages]);
  useEffect(() => { saveJson(localStorage, 'tomato.companionPrivacy', companionPrivacy); }, [companionPrivacy]);
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
      setRunning(state.running);
      if (state.running && state.deadlineEpoch) {
        miniDeadlineRef.current = state.deadlineEpoch;
        setRemaining(Math.max(0, Math.round((state.deadlineEpoch - Date.now()) / 1000)));
      } else {
        miniDeadlineRef.current = null;
        setRemaining(state.remaining);
      }
    };
    const unsubscribe = window.tomatoDesktop?.onMiniState(applyMiniState);
    window.tomatoDesktop?.getTimerState().then(applyMiniState).catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isMini]);

  useEffect(() => {
    if (!isMini || !running) return undefined;
    const intervalId = window.setInterval(() => {
      if (miniDeadlineRef.current == null) return;
      const seconds = Math.max(0, Math.round((miniDeadlineRef.current - Date.now()) / 1000));
      setRemaining((value) => Math.min(value, seconds));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isMini, running]);

  if (isMini) return <MiniTimer mode={mode} remaining={remaining} running={running} />;

  return (
    <div className={`app-shell ${opacity >= 0.999 ? 'opaque' : ''}`} style={{ '--accent': VISUAL[mode].color, '--soft': VISUAL[mode].soft, '--window-opacity': opacity }}>
      <div className="ambient-bg"><i /><i /><span className="grain" /></div>
      <TitleBar />
      <div className="top-controls">
        <div className="view-switcher" aria-label="页面切换">
          <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}><Target size={13} />今天</button>
          <button className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}><CalendarDays size={13} />计划</button>
          <button className={view === 'review' ? 'active' : ''} onClick={() => setView('review')}><ClipboardCheck size={13} />复盘</button>
        </div>
        {view === 'today' && <ModeSwitcher mode={mode} onChange={switchMode} />}
      </div>
      {view === 'plan' ? (
        <main className="todo-page">
          <VerticalTodoOverview tasks={tasks} history={dailyHistory} dailyStats={dailyStats} today={today} focusSessions={focusSessions} range={todoRange} anchorDate={todoAnchor} selectedDates={selectedDates} onRangeChange={changeTodoRange} onAnchorChange={moveTodoAnchor} onSelectDate={setSelectedDates} onToggleTask={toggleTask} onUpdateHistoricalTask={updateHistoricalTask} onExport={exportSelectedMarkdown} />
        </main>
      ) : view === 'review' ? (
        <DailyReviewPage date={today} tasks={tasks} sessions={focusSessions[today] || []} review={dailyReviews[today]} onSave={saveDailyReview} />
      ) : (
        <main className="dashboard">
          <TimerHero mode={mode} remaining={remaining} running={running} paused={paused} targetOptions={availableTargets} currentTarget={resolvedCurrentTarget || focusTaskRef.current} focusElapsed={focusElapsed} onSelectTarget={selectFocusTarget} onToggle={toggleRunning} onReset={reset} onSkip={skip} onInterruptionReason={recordInterruptionReason} onFinishSession={finishCurrentFocus} />
          <TasksPanel tasks={tasks} setTasks={setTasks} onToggleTask={toggleTask} notice={notice} today={today} />
        </main>
      )}
      {view === 'today' && <CompanionPet companion={primaryFriend} open={companionOpen} onClick={() => { setCompanionOpen((value) => !value); setSelectedCompanionId(primaryFriend.id); }} />}
      <CompanionPanel open={companionOpen && view === 'today'} companions={companions} selectedId={selectedCompanionId} messages={companionMessages} togetherId={togetherCompanionId} onSelect={selectCompanion} onClose={() => setCompanionOpen(false)} onReaction={sendCompanionReaction} onSendMessage={sendCompanionMessage} onQuickMessage={sendCompanionQuickMessage} onChangeState={changeCompanionState} onStartTogether={startTogetherFocus} />
      {companionNotice && <div className="companion-toast" role="status">{companionNotice}</div>}
      <footer className="bottom-bar glass-line">
        <div className="today-focus"><span>今日专注</span><strong>{todayFocusLabel}</strong></div>
        <div><span>已食用</span><strong>{completed}</strong></div>
        <div><span>已消化</span><strong>{digested}</strong></div>
        <div><span>完成任务</span><strong>{tasks.filter((t) => t.done).length}/{tasks.length}</strong></div>
        <div className="footer-actions">
          <button onClick={exportTodayMarkdown}><Download size={15} /> 导出 Todo</button>
          <button onClick={() => window.tomatoDesktop?.openMini()}><Square size={15} /> 置顶小窗</button>
          <button onClick={() => setSettingsOpen(true)}><Settings size={15} /> 设置</button>
        </div>
      </footer>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} durations={durations} opacity={opacity} setOpacity={setOpacity} onSave={saveDurations} running={running} companionPrivacy={companionPrivacy} onCompanionPrivacyChange={(key, value) => setCompanionPrivacy((privacy) => ({ ...privacy, [key]: value }))} />
    </div>
  );
}
