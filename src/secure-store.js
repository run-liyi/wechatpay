/**
 * secure-store.js — 账单缓存与配置的静态加密存储（AES-256-GCM）。
 *
 * 设计：
 * - 首次 initialize(主密码)：生成随机 salt，派生密钥，写入一个加密的“验证块”。
 * - unlock(主密码)：用派生密钥尝试解密验证块/数据；GCM 认证标签会在密钥错误时校验失败，
 *   据此判定主密码是否正确。密钥仅驻留内存（this.key），绝不落盘。
 * - save/load：以 AES-256-GCM 加解密 JSON 负载；落盘文件仅含密文、IV、认证标签与 salt。
 * - wipe：忘记密码时清空数据（安全降级，宁可丢数据不泄密）。
 *
 * 不依赖 Electron，可独立单测。
 */
const crypto = require('crypto');
const fs = require('fs');
const { generateSalt, deriveKey } = require('./key-derivation');

const MAGIC = 'WBILLENC1';

class SecureStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.key = null; // 仅内存
  }

  isInitialized() {
    return fs.existsSync(this.filePath);
  }

  isUnlocked() {
    return this.key !== null;
  }

  // 首次设置主密码并落地初始（空）数据
  initialize(password) {
    const salt = generateSalt();
    const key = deriveKey(password, salt);
    this.key = key;
    this._persist(salt, { data: null });
  }

  // 用主密码解锁；正确返回 true，错误返回 false（GCM 校验失败）
  unlock(password) {
    const meta = this._read();
    const salt = Buffer.from(meta.salt, 'base64');
    const key = deriveKey(password, salt);
    try {
      this._decrypt(key, meta);
      this.key = key;
      return true;
    } catch (e) {
      return false;
    }
  }

  lock() {
    this.key = null;
  }

  save(dataObj) {
    if (!this.key) throw new Error('SecureStore 未解锁');
    const meta = this._read();
    const salt = Buffer.from(meta.salt, 'base64');
    this._persist(salt, dataObj);
  }

  load() {
    if (!this.key) throw new Error('SecureStore 未解锁');
    const meta = this._read();
    const plain = this._decrypt(this.key, meta);
    return JSON.parse(plain.toString('utf8'));
  }

  // 忘记密码：清空数据（安全降级）
  wipe() {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    this.key = null;
  }

  _persist(salt, dataObj) {
    const plaintext = Buffer.from(JSON.stringify(dataObj), 'utf8');
    const enc = this._encrypt(this.key, plaintext);
    this._write({ magic: MAGIC, salt: salt.toString('base64'), ...enc });
  }

  _encrypt(key, plaintextBuf) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64')
    };
  }

  _decrypt(key, meta) {
    const iv = Buffer.from(meta.iv, 'base64');
    const tag = Buffer.from(meta.tag, 'base64');
    const ct = Buffer.from(meta.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag); // 错误密钥 / 被篡改时 final() 抛错
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  _read() {
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
  }

  _write(obj) {
    fs.writeFileSync(this.filePath, JSON.stringify(obj), { mode: 0o600 });
  }
}

module.exports = { SecureStore, MAGIC };
