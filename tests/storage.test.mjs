import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, saveJson } from '../src/core/storage.mjs';

function fakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    dump: () => Object.fromEntries(data),
  };
}

test('数据可以 JSON 形式持久化并读回', () => {
  const storage = fakeStorage();
  saveJson(storage, 'tasks', [{ id: 1, text: '任务' }]);
  assert.deepEqual(loadJson(storage, 'tasks', []), [{ id: 1, text: '任务' }]);
});

test('损坏的本地数据会回退默认值而不是闪退', () => {
  const storage = fakeStorage({ settings: '{bad json' });
  assert.deepEqual(loadJson(storage, 'settings', { focus: 25 }), { focus: 25 });
});
