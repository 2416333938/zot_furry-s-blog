/* 加密模块正确性测试 */
const path = require('path');
const C = require(path.join(__dirname, '..', 'crypto.js'));

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('[1] SHA-256 标准测试向量');
const hex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
ok(hex(C.sha256(C.utf8ToBytes(''))) ===
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256("") 正确');
ok(hex(C.sha256(C.utf8ToBytes('abc'))) ===
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256("abc") 正确');

console.log('[2] HMAC-SHA256 标准测试向量 (RFC 4231 case 2)');
ok(hex(C.hmacSha256(C.utf8ToBytes('Jefe'), C.utf8ToBytes('what do ya want for nothing?'))) ===
  '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'HMAC 向量正确');

console.log('[3] PBKDF2-HMAC-SHA256 标准测试向量 (RFC 6070 风格)');
// PBKDF2-HMAC-SHA256, P="password", S="salt", c=1, dkLen=32
ok(hex(C.pbkdf2('password', C.utf8ToBytes('salt'), 1, 32)) ===
  '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b', 'PBKDF2 c=1 正确');
ok(hex(C.pbkdf2('password', C.utf8ToBytes('salt'), 4096, 32)) ===
  'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a', 'PBKDF2 c=4096 正确');

console.log('[4] 加解密往返');
const secret = { token: 'github_pat_ABC123xyz', owner: '2416333938', note: '中文测试 🎉' };
const PW = 'correct horse battery staple';
const bundle = C.encrypt(secret, PW, 1000);
ok(bundle && bundle.ct && bundle.mac, '生成密文包');
ok(JSON.stringify(bundle).indexOf('github_pat_ABC123xyz') === -1, '密文中不含明文令牌');
ok(JSON.stringify(bundle).indexOf(PW) === -1, '密文中不含密码');
const back = C.decrypt(bundle, PW);
ok(back.token === secret.token && back.note === secret.note, '解密还原正确（含中文/emoji）');

console.log('[5] 错误密码必须失败');
let threw = false;
try { C.decrypt(bundle, PW + 'x'); } catch (e) { threw = e.message === 'PASSWORD_OR_TAMPER'; }
ok(threw, '错误密码被 MAC 拒绝');

threw = false;
try { C.decrypt(bundle, ''); } catch (e) { threw = true; }
ok(threw, '空密码被拒绝');

console.log('[6] 篡改检测');
const tampered = JSON.parse(JSON.stringify(bundle));
const raw = C.fromB64(tampered.ct);
raw[0] ^= 0x01;
tampered.ct = C.toB64(raw);
threw = false;
try { C.decrypt(tampered, PW); } catch (e) { threw = e.message === 'PASSWORD_OR_TAMPER'; }
ok(threw, '篡改密文被检测');

const tampered2 = JSON.parse(JSON.stringify(bundle));
tampered2.mac = C.toB64(C.fromB64(bundle.mac).map((b, i) => i === 0 ? b ^ 1 : b));
threw = false;
try { C.decrypt(tampered2, PW); } catch (e) { threw = true; }
ok(threw, '篡改 MAC 被检测');

console.log('[7] 随机性：同一明文两次加密结果不同');
const b1 = C.encrypt(secret, PW, 1000);
const b2 = C.encrypt(secret, PW, 1000);
ok(b1.ct !== b2.ct && b1.kdf.salt !== b2.kdf.salt, 'salt/iv 随机化生效');

console.log('[8] 空值与边界');
ok(C.decrypt(C.encrypt({}, PW, 1000), PW) && true, '空对象往返');
ok(C.decrypt(C.encrypt('纯字符串', PW, 1000), PW) === '纯字符串', '字符串往返');
const long = 'x'.repeat(10000);
ok(C.decrypt(C.encrypt(long, PW, 500), PW) === long, '长文本(10KB)往返');

console.log('[9] 性能（150k 迭代，单次约需 <2s）');
const t0 = Date.now();
C.encrypt({ token: 'x' }, PW, C.DEFAULT_ITERATIONS);
const dt = Date.now() - t0;
ok(dt < 5000, '150k 迭代耗时 ' + dt + 'ms');

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
