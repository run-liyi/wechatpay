/**
 * db.js — 本地交易数据持久化（零原生依赖的 JSON 存储）。
 *
 * 选型：优先考虑过 better-sqlite3，但其为原生模块、需随 Electron 版本重新编译，部署成本高；
 * 这里采用零原生依赖的 JSON 文件存储（lowdb 风格）作为稳妥回退，落在 Electron userData 目录，
 * 以「交易单号」为天然主键 upsert，重复落库不产生重复行。接口稳定，后续可平滑替换为 sqlite。
 *
 * 不依赖 Electron，可独立单测。
 */
const fs = require('fs');
const path = require('path');

function keyOf(r) {
  const orderNo = (r['交易单号'] || '').toString().trim();
  return orderNo || [r['交易时间'], r['交易对方'], r['金额(元)'], r['收/支']].join('|');
}

class TransactionStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  _read() {
    try {
      const obj = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        transactions: Array.isArray(obj.transactions) ? obj.transactions : [],
        metadata: obj.metadata || {},
        updatedAt: obj.updatedAt || null
      };
    } catch (e) {
      return { transactions: [], metadata: {}, updatedAt: null };
    }
  }

  _write(data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data), { mode: 0o600 });
  }

  load() {
    const { transactions, metadata } = this._read();
    return { transactions, metadata };
  }

  count() {
    return this._read().transactions.length;
  }

  // 以交易单号为主键 upsert；返回 {total, added}，重复落库不产生重复行
  save(records, metadata) {
    const data = this._read();
    const index = new Map();
    for (const r of data.transactions) index.set(keyOf(r), r);

    let added = 0;
    for (const r of records || []) {
      const k = keyOf(r);
      if (!index.has(k)) {
        index.set(k, r);
        added++;
      }
    }

    const merged = [...index.values()];
    this._write({
      transactions: merged,
      metadata: metadata || data.metadata || {},
      updatedAt: new Date().toISOString()
    });
    return { total: merged.length, added };
  }

  clear() {
    this._write({ transactions: [], metadata: {}, updatedAt: null });
  }
}

module.exports = { TransactionStore, keyOf };
