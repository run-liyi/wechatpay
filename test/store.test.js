const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TransactionStore } = require('../src/store/db');

function tmpStore() {
  const f = path.join(os.tmpdir(), `store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return { f, store: new TransactionStore(f) };
}

test('TransactionStore: 空库返回空数组', () => {
  const { store } = tmpStore();
  assert.deepStrictEqual(store.load().transactions, []);
  assert.strictEqual(store.count(), 0);
});

test('TransactionStore: 保存后可重新加载（免重导）', () => {
  const { f, store } = tmpStore();
  const recs = [
    { '交易单号': 'A1', '交易对方': '店A', '金额(元)': '10' },
    { '交易单号': 'A2', '交易对方': '店B', '金额(元)': '20' }
  ];
  const r = store.save(recs, { nickname: '演示用户' });
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.added, 2);

  const fresh = new TransactionStore(f); // 模拟重启
  const { transactions, metadata } = fresh.load();
  assert.strictEqual(transactions.length, 2);
  assert.strictEqual(metadata.nickname, '演示用户');
});

test('TransactionStore: 重复落库按交易单号去重，不产生重复行', () => {
  const { store } = tmpStore();
  store.save([{ '交易单号': 'A1', '金额(元)': '10' }]);
  const r = store.save([
    { '交易单号': 'A1', '金额(元)': '10' }, // 重复
    { '交易单号': 'A3', '金额(元)': '30' }  // 新增
  ]);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.added, 1);
});

test('TransactionStore: clear 清空', () => {
  const { store } = tmpStore();
  store.save([{ '交易单号': 'A1' }]);
  store.clear();
  assert.strictEqual(store.count(), 0);
});
