/*!
 * BlogCrypto — 纯 JS 加密工具（零依赖，file:// 与 https 均可运行）
 * ---------------------------------------------------------------
 * 用途：把 GitHub 令牌加密后存入公开仓库，密码只存在于使用者脑中。
 *
 * 方案（全部基于 SHA-256，自研实现以便在无 secure context 时也能用）：
 *   1. master = PBKDF2-HMAC-SHA256(password, salt, iterations, 64字节)
 *      - 拆成 kEnc(32) 与 kMac(32)
 *   2. 密文 ct = 明文 XOR HMAC-SHA256(kEnc, iv || counter) 生成的流密钥
 *   3. 认证 mac = HMAC-SHA256(kMac, salt || iv || ct)   —— encrypt-then-MAC
 *   4. 解密时先做常量时间比对校验 mac，不通过即判定密码错误 / 数据被篡改
 *
 * 说明：这是「离线加密保护」，能保证公开仓库里拿不到明文令牌；
 * 但公网密文可被离线暴力尝试，因此密码强度与令牌有效期才是最终防线。
 */
(function (root) {
  'use strict';

  /* ---------------- SHA-256 ---------------- */
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256(bytes) {
    var l = bytes.length;
    var padded = new Uint8Array((((l + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[l] = 0x80;
    var dv = new DataView(padded.buffer);
    var bitLen = l * 8;
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
    dv.setUint32(padded.length - 4, bitLen >>> 0);

    var H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    var w = new Uint32Array(64);

    for (var off = 0; off < padded.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
        var s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    for (var k = 0; k < 8; k++) odv.setUint32(k * 4, H[k]);
    return out;
  }

  /* ---------------- 字节工具 ---------------- */
  function utf8ToBytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str));
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }
  function concat(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
    return out;
  }
  function toB64(bytes) {
    var bin = '', CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function randomBytes(n) {
    var b = new Uint8Array(n);
    if (root.crypto && root.crypto.getRandomValues) {
      root.crypto.getRandomValues(b);
      return b;
    }
    // 退化路径：仅用于极端环境，优先使用 crypto.getRandomValues
    for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }
  /** 常量时间比较，避免通过响应时间泄露信息 */
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /* ---------------- HMAC-SHA256 ---------------- */
  function hmacSha256(key, msg) {
    var BLOCK = 64;
    if (key.length > BLOCK) key = sha256(key);
    var k = new Uint8Array(BLOCK);
    k.set(key);
    var o = new Uint8Array(BLOCK), i = new Uint8Array(BLOCK);
    for (var n = 0; n < BLOCK; n++) { o[n] = k[n] ^ 0x5c; i[n] = k[n] ^ 0x36; }
    return sha256(concat([o, sha256(concat([i, msg]))]));
  }

  /* ---------------- PBKDF2-HMAC-SHA256 ---------------- */
  function pbkdf2(password, salt, iterations, dkLen) {
    var pw = typeof password === 'string' ? utf8ToBytes(password) : password;
    var hLen = 32;
    var blocks = Math.ceil(dkLen / hLen);
    var dk = new Uint8Array(blocks * hLen);

    for (var b = 1; b <= blocks; b++) {
      var saltBlock = new Uint8Array(salt.length + 4);
      saltBlock.set(salt);
      new DataView(saltBlock.buffer).setUint32(salt.length, b);

      var u = hmacSha256(pw, saltBlock);
      var t = u.slice();
      for (var iter = 1; iter < iterations; iter++) {
        u = hmacSha256(pw, u);
        for (var j = 0; j < hLen; j++) t[j] ^= u[j];
      }
      dk.set(t, (b - 1) * hLen);
    }
    return dk.slice(0, dkLen);
  }

  /* ---------------- 流加密（CTR 风格，基于 HMAC 密钥流） ---------------- */
  function keystreamXor(key, iv, data) {
    var out = new Uint8Array(data.length);
    var counter = 0;
    for (var off = 0; off < data.length; off += 32) {
      var blk = new Uint8Array(iv.length + 4);
      blk.set(iv);
      new DataView(blk.buffer).setUint32(iv.length, counter++);
      var ks = hmacSha256(key, blk);
      for (var i = 0; i < 32 && off + i < data.length; i++) {
        out[off + i] = data[off + i] ^ ks[i];
      }
    }
    return out;
  }

  var DEFAULT_ITERATIONS = 150000;
  var ALG_LABEL = 'PBKDF2-HMAC-SHA256 + HMAC-SHA256-CTR + HMAC-SHA256(encrypt-then-MAC)';

  /**
   * 加密任意 JSON 可序列化对象
   * @returns {Object} 可安全提交到公开仓库的密文包
   */
  function encrypt(plainObject, password, iterations) {
    iterations = iterations || DEFAULT_ITERATIONS;
    var plaintext = typeof plainObject === 'string' ? plainObject : JSON.stringify(plainObject);
    var salt = randomBytes(16);
    var iv = randomBytes(16);

    var master = pbkdf2(password, salt, iterations, 64);
    var kEnc = master.slice(0, 32);
    var kMac = master.slice(32, 64);

    var ct = keystreamXor(kEnc, iv, utf8ToBytes(plaintext));
    var mac = hmacSha256(kMac, concat([salt, iv, ct]));

    return {
      v: 1,
      alg: ALG_LABEL,
      kdf: { name: 'PBKDF2-HMAC-SHA256', salt: toB64(salt), iterations: iterations },
      iv: toB64(iv),
      ct: toB64(ct),
      mac: toB64(mac),
      created: new Date().toISOString()
    };
  }

  /**
   * 解密。密码错误或数据被篡改都会抛错（MAC 校验失败）。
   */
  function decrypt(bundle, password) {
    if (!bundle || typeof bundle !== 'object') throw new Error('密文包格式不正确');
    if (!bundle.kdf || !bundle.kdf.salt || !bundle.iv || !bundle.ct || !bundle.mac) {
      throw new Error('密文包字段缺失');
    }

    var salt = fromB64(bundle.kdf.salt);
    var iv = fromB64(bundle.iv);
    var ct = fromB64(bundle.ct);
    var mac = fromB64(bundle.mac);
    var iterations = Number(bundle.kdf.iterations) || DEFAULT_ITERATIONS;

    var master = pbkdf2(password, salt, iterations, 64);
    var kEnc = master.slice(0, 32);
    var kMac = master.slice(32, 64);

    var expect = hmacSha256(kMac, concat([salt, iv, ct]));
    if (!timingSafeEqual(expect, mac)) {
      throw new Error('PASSWORD_OR_TAMPER');
    }

    var pt = keystreamXor(kEnc, iv, ct);
    var text = bytesToUtf8(pt);
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  root.BlogCrypto = {
    encrypt: encrypt,
    decrypt: decrypt,
    pbkdf2: pbkdf2,
    hmacSha256: hmacSha256,
    sha256: sha256,
    toB64: toB64,
    fromB64: fromB64,
    utf8ToBytes: utf8ToBytes,
    bytesToUtf8: bytesToUtf8,
    timingSafeEqual: timingSafeEqual,
    DEFAULT_ITERATIONS: DEFAULT_ITERATIONS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.BlogCrypto;
})(typeof globalThis !== 'undefined' ? globalThis : this);
