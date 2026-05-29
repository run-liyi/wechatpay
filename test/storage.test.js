const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConfigStore } = require('../src/storage/store');

function tmp() {
  const f = path.join(os.tmpdir(), `cfg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return { f, store: new ConfigStore(f) };
}

test('ConfigStore: get 返回 fallback；set 后可读取', () => {
  const { store } = tmp();
  assert.strictEqual(store.get('theme', 'light'), 'light');
  store.set('theme', 'dark');
  assert.strictEqual(store.get('theme'), 'dark');
});

test('ConfigStore: 重启(新实例)后配置仍保留', () => {
  const { f, store } = tmp();
  store.set('budget', { 餐饮: 1000, 交通: 300 });
  const fresh = new ConfigStore(f);
  assert.deepStrictEqual(fresh.get('budget'), { 餐饮: 1000, 交通: 300 });
});

test('ConfigStore: merge 与 delete', () => {
  const { store } = tmp();
  store.merge({ a: 1, b: 2 });
  store.merge({ b: 3, c: 4 });
  assert.deepStrictEqual(store.getAll(), { a: 1, b: 3, c: 4 });
  store.delete('b');
  assert.deepStrictEqual(store.getAll(), { a: 1, c: 4 });
});
