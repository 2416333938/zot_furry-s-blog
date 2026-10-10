/* 令牌诊断：只输出前缀与长度，绝不打印完整令牌 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const C = require(path.join(__dirname, '..', 'crypto.js'));

const PW = process.env.BLOG_TEST_PASSWORD;
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'secret.json'), 'utf-8'));
const newTok = C.decrypt(bundle, PW).token;

function call(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, body: j });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function describe(name, tok) {
  const prefix = tok.slice(0, 11);
  const kind = prefix === 'github_pat_' ? 'fine-grained PAT'
    : prefix.startsWith('ghp_') ? 'classic PAT'
    : prefix.startsWith('gho_') ? 'OAuth token'
    : prefix.startsWith('ghs_') ? 'server-to-server'
    : '未知类型';
  // 官方格式：github_pat_ + 22 + _ + 59 = 93
  const expected = 93;
  console.log('--- ' + name + ' ---');
  console.log('  类型      : ' + kind);
  console.log('  前缀      : ' + prefix + '…');
  console.log('  长度      : ' + tok.length + (prefix === 'github_pat_' ? '（官方应为 ' + expected + '，差 ' + (tok.length - expected) + '）' : ''));
  console.log('  含空白    : ' + (/\s/.test(tok) ? '是（异常）' : '否'));
  const bad = tok.match(/[^A-Za-z0-9_]/g);
  console.log('  非法字符  : ' + (bad ? JSON.stringify(bad.slice(0, 5)) : '无'));
  return tok;
}

(async () => {
  describe('新令牌（用户提供）', newTok);

  const base = { 'User-Agent': 'diag', 'Accept': 'application/vnd.github+json' };
  const r1 = await call('https://api.github.com/user', Object.assign({ Authorization: 'Bearer ' + newTok }, base));
  console.log('  GET /user (Bearer)  -> HTTP ' + r1.status + (r1.status === 200 ? ' login=' + r1.body.login : ' ' + (r1.body && r1.body.message)));
  const r2 = await call('https://api.github.com/user', Object.assign({ Authorization: 'token ' + newTok }, base));
  console.log('  GET /user (token)   -> HTTP ' + r2.status);
  const r3 = await call('https://api.github.com/', base);
  console.log('  匿名 GET /          -> HTTP ' + r3.status + '（确认网络链路本身可用）');
})().catch(e => { console.error(e.message); process.exit(1); });
