/**
 * key-derivation.js — 由主密码派生对称密钥（scrypt）。
 *
 * 使用 Node 内置 crypto.scrypt，密钥仅在内存中存在，绝不落盘明文；落盘的仅有随机 salt。
 */
const crypto = require('crypto');

const KEY_LEN = 32;   // AES-256
const SALT_LEN = 16;
// scrypt 成本参数（N 必须为 2 的幂）；maxmem 需够大以容纳 N*r*128
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function generateSalt() {
  return crypto.randomBytes(SALT_LEN);
}

function deriveKey(password, salt) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('主密码必须为非空字符串');
  }
  const saltBuf = Buffer.isBuffer(salt) ? salt : Buffer.from(salt);
  return crypto.scryptSync(Buffer.from(password, 'utf8'), saltBuf, KEY_LEN, SCRYPT);
}

module.exports = { generateSalt, deriveKey, KEY_LEN, SALT_LEN, SCRYPT };
