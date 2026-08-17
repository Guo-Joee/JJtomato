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
  assert.match(app, /paused \? '继续专注'/);
  assert.match(app, /className="pomodoro-editor"/);
  assert.match(app, /aria-label="番茄数量"/);
  assert.match(app, /updatePomodoros/);
  assert.match(css, /\.pomodoro-editor/);
});

test('任务完成会按番茄数消化库存，并支持今日 Todo Markdown 导出', () => {
  assert.match(app, /consumeTaskTomatoes/);
  assert.match(dailyTodo, /今日食用番茄已经被消化啦/);
  assert.match(app, /tomato\.digested/);
  assert.match(app, /tomato\.dailyTodo/);
  assert.match(app, /buildDailyTodoMarkdown/);
  assert.match(app, /导出 Todo/);
  assert.match(app, /min="0"/);
});

test('Todo 总览提供番茄风甘特时间轴和跨日来源标记', () => {
  assert.match(app, /Todo 总览/);
  assert.match(app, /className="gantt"/);
  assert.match(app, /添加于 \{task\.addedDate\}/);
  assert.match(app, /顺延 \$\{task\.carryCount\} 次/);
  assert.match(app, /carryOverTasks/);
  assert.match(css, /\.gantt-bar/);
  assert.match(css, /\.todo-overview/);
});

test('Todo 总览支持月/周/日切换、日期导航和多日期导出', () => {
  assert.match(app, /range-switcher/);
  assert.match(app, /item === 'month' \? '月'/);
  assert.match(app, /item === 'week' \? '周'/);
  assert.match(app, /item === 'week' \? '周' : '日'/);
  assert.match(app, /selectedDates/);
  assert.match(app, /导出已选日期/);
  assert.match(app, /buildMultiDayMarkdown/);
  assert.match(css, /\.date-navigator/);
  assert.match(css, /\.export-dates/);
});

test('Todo 总览使用竖向时间轴而不是日期表格', () => {
  assert.match(app, /function VerticalTodoOverview/);
  assert.match(app, /className="vertical-timeline"/);
  assert.match(app, /className={`timeline-day/);
  assert.match(app, /className={`timeline-task/);
  assert.match(css, /\.vertical-timeline::before/);
  assert.match(css, /\.timeline-task/);
});

test('Todo 总览按任务 ID 合并当前任务与历史快照，避免重复显示', () => {
  assert.match(app, /const records = new Map\(\)/);
  assert.match(app, /records\.set\(String\(item\.id\)/);
  assert.match(app, /\[\.\.\.records\.values\(\)\]/);
});
