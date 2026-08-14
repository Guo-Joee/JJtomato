import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.jsx'), 'utf8');
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
  assert.match(css, /\.mini-window > div[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(css, /\.mini-window svg[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(main, /webContents\.on\('context-menu'/);
  assert.match(main, /resizeMiniWindow/);
  assert.match(main, /if \(mainWindow\.isMinimized\(\)\) mainWindow\.restore\(\)/);
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
