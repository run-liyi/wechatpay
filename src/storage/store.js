/**
 * storage/store.js — 用户配置与设置的本地持久化层（键值 JSON 存储）。
 *
 * 与交易数据存储（src/store/db.js）分离：本层保存预算、归类规则、标签、储蓄目标、界面偏好等
 * 用户配置，落在 Electron userData 目录。为预算/自动归类/主题等功能提供统一读写接口。
 *
 * 不依赖 Electron，可独立单测。
 */
const fs = require('fs');
const path = require('path');

class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  _read() {
    try {
      const obj = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  _write(obj) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), { mode: 0o600 });
  }

  getAll() {
    return this._read();
  }

  get(key, fallback) {
    const obj = this._read();
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
  }

  set(key, value) {
    const obj = this._read();
    obj[key] = value;
    this._write(obj);
    return obj;
  }

  // 浅合并多个键
  merge(partial) {
    const obj = this._read();
    Object.assign(obj, partial || {});
    this._write(obj);
    return obj;
  }

  delete(key) {
    const obj = this._read();
    delete obj[key];
    this._write(obj);
    return obj;
  }
}

module.exports = { ConfigStore };
