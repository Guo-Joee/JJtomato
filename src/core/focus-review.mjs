export const INTERRUPTION_REASONS = Object.freeze([
  '身体需求',
  '工作插入',
  '查资料',
  '注意力走神',
  '其他',
]);

function targetKey(parentTaskId, taskId) {
  return `${parentTaskId == null ? 'root' : String(parentTaskId)}:${String(taskId)}`;
}

export function taskTargetOptions(tasks = []) {
  return tasks.flatMap((task) => {
    if (!task || task.done) return [];
    const root = [{
      key: targetKey(null, task.id),
      taskId: task.id,
      parentTaskId: null,
      text: String(task.text || ''),
      label: String(task.text || ''),
    }];
    const children = (task.subtasks || [])
      .filter((subtask) => !subtask.done)
      .map((subtask) => ({
        key: targetKey(task.id, subtask.id),
        taskId: subtask.id,
        parentTaskId: task.id,
        text: String(subtask.text || ''),
        parentText: String(task.text || ''),
        label: `${task.text} / ${subtask.text}`,
      }));
    return [...root, ...children];
  });
}

export function resolveTaskTarget(tasks = [], target = null) {
  if (!target) return null;
  const key = target.key || targetKey(target.parentTaskId, target.taskId);
  return taskTargetOptions(tasks).find((option) => option.key === key) || null;
}

export function createFocusSession({
  id,
  startedAt,
  endedAt,
  actualSeconds,
  plannedSeconds,
  pauseCount = 0,
  interruptionReasons = [],
  target,
} = {}) {
  const seconds = Math.max(0, Math.round(Number(actualSeconds) || 0));
  return {
    id: id || `focus-${startedAt}-${endedAt}`,
    startedAt,
    endedAt,
    actualSeconds: seconds,
    plannedSeconds: Math.max(0, Math.round(Number(plannedSeconds) || 0)),
    mode: 'focus',
    pauseCount: Math.max(0, Math.round(Number(pauseCount) || 0)),
    interruptionReasons: interruptionReasons.filter(Boolean),
    taskId: target?.taskId ?? null,
    parentTaskId: target?.parentTaskId ?? null,
    taskText: target?.text || '未命名任务',
    parentTaskText: target?.parentText || null,
  };
}

function completedLeafCount(tasks = []) {
  return tasks.reduce((count, task) => {
    const children = Array.isArray(task?.subtasks) ? task.subtasks : [];
    if (children.length) return count + completedLeafCount(children);
    return count + (task?.done ? 1 : 0);
  }, 0);
}

export function summarizeDailyReview({ tasks = [], sessions = [] } = {}) {
  return {
    focusSeconds: sessions.reduce((sum, session) => sum + Math.max(0, Number(session?.actualSeconds) || 0), 0),
    completedTasks: completedLeafCount(tasks),
    interruptions: sessions.reduce((sum, session) => sum + Math.max(0, Number(session?.pauseCount) || 0), 0),
  };
}

export function normalizeDailyReview(review = {}, date = '') {
  return {
    date,
    completedReflection: String(review.completedReflection || '').slice(0, 1000),
    tomorrowFirstStep: String(review.tomorrowFirstStep || '').slice(0, 500),
    updatedAt: Number(review.updatedAt) || null,
  };
}
