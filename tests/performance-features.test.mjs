import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.jsx'), 'utf8');
const dailyTodo = fs.readFileSync(path.join(root, 'src/core/daily-todo.mjs'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('整条标题栏是拖拽区，交互控件排除拖拽', () => {
  assert.match(css, /\.titlebar\s*\{[^}]*-webkit-app-region:\s*drag/s);
  assert.match(css, /\.no-drag, button, input, \.brand, \.window-actions\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
});

test('Electron 使用单实例锁', () => {
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(main, /second-instance/);
});

test('透明度设置有 UI、持久化和 IPC 通道', () => {
  assert.match(app, /透明度/);
  assert.match(app, /setOpacity/);
  assert.match(main, /window:set-opacity/);
  assert.match(app, /opacity >= 0\.999/);
});

test('置顶小窗支持双击返回主页面和右键尺寸菜单', () => {
  assert.match(app, /const restore = \(\) => window\.tomatoDesktop\?\.restoreMain\(\)/);
  assert.match(app, /className="mini-return-zone" onDoubleClick/);
  assert.match(app, /onPointerDown=\{handlePointerDown\}/);
  assert.match(app, /onPointerMove=\{handlePointerMove\}/);
  assert.match(app, /startMiniDrag/);
  assert.doesNotMatch(app, /event\.screenX|event\.screenY/);
  assert.match(main, /window:mini-drag-start/);
  assert.match(main, /window:mini-drag-move/);
  assert.match(main, /screen\.getCursorScreenPoint\(\)/);
  assert.match(main, /window:mini-drag-end/);
  assert.match(main, /bounds:\s*miniWindow\.getBounds\(\)/);
  assert.match(main, /width:\s*miniDragState\.bounds\.width/);
  assert.match(main, /height:\s*miniDragState\.bounds\.height/);
  assert.doesNotMatch(main, /miniWindow\.setPosition/);
  assert.match(css, /\.mini-window[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(main, /resizable:\s*false/);
  assert.match(main, /transparent:\s*true/);
  assert.match(main, /backgroundColor:\s*'\#00000000'/);
  assert.match(main, /webContents\.on\('context-menu'/);
  assert.match(main, /resizeMiniWindow/);
  assert.match(main, /if \(mainWindow\.isMinimized\(\)\) mainWindow\.restore\(\)/);
});

test('隐藏主窗口后计时器不会被 Electron 后台节流', () => {
  assert.match(main, /backgroundThrottling:\s*false/);
});

test('小窗加载后会立即拉取主窗口的最新计时状态', () => {
  assert.match(main, /let latestTimerState/);
  assert.match(main, /timer:get-state/);
  assert.match(main, /latestTimerState\s*=\s*state/);
  assert.match(app, /getTimerState\(\)/);
  assert.match(app, /applyMiniState/);
});

test('计时状态只能由主窗口发布，小窗不能反向发送默认时间', () => {
  assert.match(app, /if \(!isMini\) window\.tomatoDesktop\?\.sendTimerState\(statePayload\)/);
});

test('软件品牌名称为 JJtomato', () => {
  assert.equal(pkg.name, 'jjtomato');
  assert.equal(pkg.version, '0.2.1');
  assert.match(app, />JJtomato</);
  assert.match(main, /title: 'JJtomato'/);
});

test('Windows 使用统一多尺寸番茄 ICO，托盘与打包配置指向同一资源', () => {
  const ico = fs.readFileSync(path.join(root, 'assets/icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 8);
  assert.match(main, /assets\/icon\.ico/);
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
});

test('运行时依赖不包含构建工具和前端源码依赖', () => {
  assert.ok(!pkg.dependencies?.electron);
  assert.ok(!pkg.dependencies?.['electron-builder']);
  assert.ok(pkg.devDependencies?.electron);
});

test('Electron 只保留中英文语言包', () => {
  assert.deepEqual(pkg.build.electronLanguages, ['zh-CN', 'en-US']);
});

test('生产 CSS 不依赖网络字体', () => {
  assert.doesNotMatch(css, /@import\s+url\(['"]https?:\/\//);
});

test('专注支持暂停后继续，任务番茄数量可编辑', () => {
  assert.match(app, /const pauseTimer = \(\) =>/);
  assert.match(app, /paused \? isFocus \? '继续专注' : '继续休息'/);
  assert.match(app, /className="pomodoro-editor"/);
  assert.match(app, /aria-label="番茄数量"/);
  assert.match(app, /updatePomodoros/);
  assert.match(css, /\.pomodoro-editor/);
});

test('任务完成会按番茄数消化库存，并支持今日 Todo Markdown 导出', () => {
  assert.match(app, /consumeTaskTomatoes/);
  assert.match(dailyTodo, /可消化番茄不足，请先完成专注获得番茄/);
  assert.match(app, /tomato\.digested/);
  assert.match(app, /tomato\.dailyTodo/);
  assert.match(app, /buildDailyTodoMarkdown/);
  assert.match(app, /导出 Todo/);
  assert.match(app, /min="0"/);
});

test('Todo 总览提供日历计划视图和跨日来源标记', () => {
  assert.match(app, /Todo 总览/);
  assert.match(app, /plan-calendar-note/);
  assert.match(app, /创建于/);
  assert.match(app, /顺延 \$\{task\.carryCount\} 次/);
  assert.match(app, /rolloverTasksWithHistory/);
  assert.match(css, /\.plan-calendar-grid/);
  assert.doesNotMatch(app, /普通甘特图/);
});

test('专注记录仅累计运行片段，并在暂停或完成时按实际时长结算', () => {
  assert.match(app, /focusActiveSecondsRef/);
  assert.match(app, /pauseFocusSegment\(\)/);
  assert.match(app, /finishFocusSession\(\)/);
  assert.match(app, /shouldPersistFocusSession\(seconds, MINIMUM_FOCUS_SESSION_SECONDS\)/);
});

test('Todo 总览支持月/周/日切换、日期导航和多日期导出', () => {
  assert.match(app, /range-switcher/);
  assert.match(app, /item === 'month' \? '月'/);
  assert.match(app, /item === 'week' \? '周'/);
  assert.match(app, /item === 'week' \? '周' : '日'/);
  assert.match(app, /selectedDates/);
  assert.match(app, /导出日期/);
  assert.match(app, /buildMultiDayMarkdown/);
  assert.match(css, /\.vertical-date-nav/);
  assert.match(css, /\.vertical-export-row/);
});

test('Todo 总览使用竖向时间轴而不是日期表格', () => {
  assert.match(app, /function VerticalTodoOverview/);
  assert.match(app, /className="vertical-timeline plan-calendar-shell"/);
  assert.match(app, /className={`timeline-day/);
  assert.match(app, /className={`timeline-task/);
  assert.match(css, /\.vertical-timeline::before/);
  assert.match(css, /\.timeline-task/);
});

test('Todo 总览按日历分栏，周视图用于安排，月视图用于回顾', () => {
  assert.match(app, /plan-calendar-note/);
  assert.match(app, /className=\{`plan-calendar-grid \$\{range\}`\}/);
  assert.match(css, /\.plan-calendar-grid\.week/);
  assert.match(css, /\.plan-calendar-grid\.month/);
});

test('Todo 总览使用统一时间轴分组逻辑，当前顺延任务覆盖历史快照', () => {
  assert.match(app, /buildTimelineTaskGroups/);
});

test('子任务通过右键主任务菜单创建，不显示常驻输入框', () => {
  assert.match(app, /onContextMenu/);
  assert.match(app, /创建子任务/);
  assert.match(app, /context-menu/);
  assert.match(app, /subtask-editor/);
  assert.doesNotMatch(app, /className="subtask-add"/);
  assert.match(css, /\.context-menu/);
  assert.match(css, /\.subtask-editor/);
});

test('Todo 时间轴包含子任务及所属主任务提示', () => {
  assert.match(app, /taskRootsForDate/);
  assert.match(app, /timeline-children/);
  assert.match(app, /所属主任务：/);
});

test('每日专注时长保存到 focusSessions 并显示在底部和日期时间轴', () => {
  assert.match(app, /tomato\.focusSessions/);
  assert.match(app, /今日专注/);
  assert.match(app, /summarizeDay/);
  assert.match(app, /focusSessions=\{focusSessions\}/);
});

test('已食用和已消化使用按日期保存的 dailyStats，不依赖旧版全局计数', () => {
  assert.match(app, /tomato\.dailyStats/);
  assert.match(app, /dailyStatsForDate/);
  assert.match(app, /initialTodayStats = dailyStatsForDate/);
});

test('Todo 日期标题显示对应日期的已食用和已消化番茄', () => {
  assert.match(app, /dailyStats\?\.\[group\.date\]/);
  assert.match(app, /已食用/);
  assert.match(app, /已消化/);
});

test('Todo 总览点击历史日期任务时使用日期参数更新对应历史记录', () => {
  assert.match(app, /onToggleTask\(task, null, group\.date\)/);
  assert.match(app, /onToggleTask\(child, task\.id, group\.date\)/);
});

test('历史 Todo 支持双击编辑主任务和子任务名称', () => {
  assert.match(app, /timeline-edit-input/);
  assert.match(app, /onDoubleClick/);
  assert.match(app, /updateHistoricalTask/);
});

test('Todo 总览顺延任务显示创建时间和顺延次数', () => {
  assert.match(app, /创建于/);
  assert.match(app, /顺延 \$\{task\.carryCount\} 次/);
  assert.match(app, /顺延 \$\{child\.carryCount\} 次/);
});

test('任务复选框使用 flex 居中并且 Todo 子任务使用父子层级样式', () => {
  assert.match(css, /\.check\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(css, /\.subtask-check\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.timeline-task-content\.is-subtask/);
  assert.match(css, /border-left:\s*2px/);
});

test('长任务名称支持省略提示和点击展开，并限制在任务卡片内', () => {
  assert.match(app, /function ExpandableTaskName/);
  assert.match(app, /点击展开完整名称/);
  assert.match(app, /aria-expanded=\{expanded\}/);
  assert.match(css, /\.expandable-task-name/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(css, /max-height:\s*min\(7em, 30vh\)/);
});

test('主任务和 Todo 日期组支持折叠子任务', () => {
  assert.match(app, /collapse-toggle/);
  assert.match(app, /timeline-collapse/);
  assert.match(app, /collapsedDays/);
});

test('Todo 时间轴按主任务分组渲染并由主任务折叠子任务', () => {
  assert.match(app, /timeline-task-group/);
  assert.match(app, /timeline-parent/);
  assert.match(app, /timeline-children/);
  assert.match(app, /collapsedParents/);
});

test('计时设置保存后空闲计时器立即更新，运行中显示下次生效提示', () => {
  assert.match(app, /onSave/);
  assert.match(app, /保存后已更新当前倒计时/);
  assert.match(app, /请结束本次计时/);
  assert.match(app, /pendingDurationUpdate/);
});

test('空格快捷键忽略输入框、设置面板和按键自动重复', () => {
  assert.match(app, /event\.repeat/);
  assert.match(app, /isTextEntry/);
  assert.match(app, /event\.code === 'Space'/);
});

test('专注台主任务完成状态由 task-group 驱动绿色对勾和删除线', () => {
  assert.match(css, /\.task-group\.done\s*>\s*\.task\s*>\s*\.check\s*\{/);
  assert.match(css, /\.task-group\.done\s+\.task\s*>\s*span/);
});

test('Todo 总览切换时声明主任务折叠状态，避免渲染异常', () => {
  assert.match(app, /const \[collapsedParents, setCollapsedParents\] = useState\(\{\}\)/);
});

test('主窗口推送带 deadlineEpoch，小窗基于同一 deadline 自主计算倒计时', () => {
  assert.match(app, /deadlineEpoch/);
  assert.match(app, /miniDeadlineRef/);
});

test('长休小窗使用与其他模式一致的填色杯子图案', () => {
  assert.match(app, /className="break-mark coffee-mark"/);
  assert.match(app, /<i \/><b \/><em \/>/);
  assert.match(css, /\.coffee-mark::before[^}]*background:/s);
  assert.match(css, /\.coffee-mark b[^}]*border:/s);
});

test('v0.1.18 提供桌边陪伴小猫和好友状态面板', () => {
  assert.match(app, /function CompanionPet/);
  assert.match(app, /function CompanionPanel/);
  assert.match(app, /className="companion-pet/);
  assert.match(app, /className="companion-panel/);
  assert.match(app, /正在输入/);
  assert.match(css, /\.companion-pet\.state-typing/);
  assert.match(css, /companion-cat-type/);
});

test('v0.2.1 提供可启动的实时陪伴服务与账号入口', () => {
  const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server/companion-server.mjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');
  assert.match(packageJson, /"companion-server"/);
  assert.match(app, /CompanionConnectionCard/);
  assert.match(app, /createRealtimeConnection/);
  assert.match(server, /\/api\/auth\/register/);
  assert.match(server, /\/api\/rooms\/join/);
  assert.match(server, /\/realtime/);
  assert.match(server, /MAX_HTTP_BODY_BYTES/);
  assert.match(server, /127\.0\.0\.1/);
  assert.match(preload, /saveCompanionSession/);
  assert.match(app, /window\.tomatoDesktop\?\.saveCompanionSession/);
  assert.match(app, /window\.tomatoDesktop\?\.loadCompanionSession/);
});

test('陪伴支持送番茄、快捷互动和短消息', () => {
  assert.match(app, /sendCompanionReaction/);
  assert.match(app, /送番茄/);
  assert.match(app, /递咖啡/);
  assert.match(app, /轻敲猫爪/);
  assert.match(app, /快捷留言/);
  assert.match(app, /onQuickMessage/);
  assert.match(app, /kind === 'reaction'/);
  assert.match(app, /陪伴留言/);
  assert.match(app, /maxLength=\{300\}/);
  assert.match(app, /sendCompanionMessage/);
});

test('陪伴面板支持本地开始和实时邀请确认后的一起专注', () => {
  assert.match(app, /startTogetherFocus/);
  assert.match(app, /和\$\{selected\.name\}一起坐下/);
  assert.match(app, /inviteStatus === 'incoming'/);
  assert.match(app, /shared-focus\.invited/);
  assert.match(app, /shared-focus\.joined/);
  assert.match(app, /disabled=\{selected\.state === 'offline' \|\| \(isTogether && !isPausedTogether\) \|\| inviteStatus === 'outgoing'\}/);
  assert.match(app, /正在一起专注/);
  assert.match(app, /activity: '和你一起专注'/);
  assert.match(app, /setMode\('focus'\)/);
  assert.match(app, /setRunning\(true\)/);
  assert.match(css, /\.companion-together\s*\{/);
});

test('共同专注会随着暂停、继续、取消和完成实时收尾', () => {
  assert.match(app, /const togetherCompanionIdRef = useRef\(null\)/);
  assert.match(app, /const endTogetherFocus = \(activity = '准备开始', durationLabel = '刚刚'/);
  assert.match(app, /activity: '等你继续', durationLabel: '暂停中'/);
  assert.match(app, /activity: '和你一起专注', durationLabel: '继续专注'/);
  assert.match(app, /endTogetherFocus\('完成一轮专注', '刚刚完成'\)/);
  assert.match(app, /const isPausedTogether = isTogether && selected\?\.state === 'paused'/);
  assert.match(app, /updateCompanionState\(item, state, state === 'typing' \? '正在敲键盘' : ''\)/);
  assert.match(app, /const reset = \(\) => \{\s*if \(mode === 'focus'\) \{\s*finishFocusSession\(\);\s*endTogetherFocus\(\);/s);
  assert.match(app, /const switchMode = \(next\) => \{\s*if \(mode === 'focus'\) \{\s*finishFocusSession\(\);\s*endTogetherFocus\(\);/s);
});

test('陪伴隐私设置覆盖在线、输入、活动、任务和互动', () => {
  assert.match(app, /shareOnline/);
  assert.match(app, /shareTyping/);
  assert.match(app, /shareActivity/);
  assert.match(app, /shareTask/);
  assert.match(app, /shareReactions/);
  assert.match(app, /tomato\.companionPrivacy/);
  assert.match(css, /\.setting-toggle/);
});

test('好友列表会按实际人数收缩，并在人数较多时才限制滚动高度', () => {
  assert.match(css, /\.companion-friend-list\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(app, /count-\$\{friendListSize\}/);
  assert.match(css, /\.companion-friend-list\.count-1\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.companion-friend-list\.count-many\s*\{[^}]*224px/s);
  assert.match(css, /max-height:\s*122px/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
});

test('陪伴消息在消息数量不变时也会跟随最新消息滚动到底部', () => {
  assert.match(app, /const messageListRef = useRef\(null\)/);
  assert.match(app, /const latestMessageId = selectedMessages\.at\(-1\)\?\.id/);
  assert.match(app, /messageListRef\.current\.scrollTop = messageListRef\.current\.scrollHeight/);
  assert.match(app, /\[selected\?\.id, latestMessageId\]/);
  assert.match(app, /className="companion-messages" ref=\{messageListRef\}/);
});

test('好友状态与上线时间在同一信息列内换行，避免卡片文字重叠', () => {
  assert.match(app, /companion-friend-copy[\s\S]*?<em>\{friend\.durationLabel\}<\/em>/);
  assert.match(css, /\.companion-friend-copy > em\s*\{[^}]*display:\s*block/s);
  assert.doesNotMatch(css, /\.companion-friend > em\s*\{[^}]*position:\s*absolute/s);
});
