const { test } = require('node:test');
const assert = require('node:assert');
const { extractFileName } = require('../src/utils/filename');

test('extractFileName: 跨平台路径只取文件名', () => {
  assert.strictEqual(extractFileName('C:\\Users\\me\\我的 账单.xlsx'), '我的 账单.xlsx');
  assert.strictEqual(extractFileName('/home/me/我的 账单.xlsx'), '我的 账单.xlsx');
  assert.strictEqual(extractFileName('/Users/me/Documents/账单 2026.csv'), '账单 2026.csv');
  assert.strictEqual(extractFileName('demo-bill.xlsx'), 'demo-bill.xlsx');
});

test('extractFileName: 边界输入', () => {
  assert.strictEqual(extractFileName(''), '');
  assert.strictEqual(extractFileName(null), '');
  assert.strictEqual(extractFileName(undefined), '');
});
