/* 真实写入测试：用解密出的令牌向仓库发起一次可控写入，并立刻回滚
 * 目的：验证"登录 → 写入仓库"端到端链路真的可用
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const C = require(path.join(__dirname, '..', 'crypto.js'));

const PW = process.env.BLOG_TEST_PASSWORD;
if (!PW) { console.error('缺少 BLOG_TEST_PASSWORD'); process.exit(1); }

const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'secret.json'), 'utf-8'));
const p = C.decrypt(bundle, PW);
const TOK = p.token;
const OWNER = p.owner, REPO = p.repo, BRANCH = p.branch;

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: '/repos/' + OWNER + '/' + REPO + apiPath,
      method,
      headers: Object.assign({
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + TOK,
        'User-Agent': 'blog-write-test',
        'X-GitHub-Api-Version': '2022-11-28'
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, body: j });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const TEST_PATH = 'data/.write-test.json';

(async () => {
  console.log('目标: ' + OWNER + '/' + REPO + '@' + BRANCH + '/' + TEST_PATH);

  // 1) 写入测试文件
  const content = Buffer.from(JSON.stringify({ t: Date.now(), note: 'write test' }, null, 2)).toString('base64');
  const put = await api('PUT', '/contents/' + TEST_PATH, {
    message: 'chore: 写入链路测试',
    content: content,
    branch: BRANCH
  });
  console.log('[1] 写入 -> HTTP ' + put.status + (put.status === 201 ? ' ✅ 成功' : ' ' + JSON.stringify(put.body)));
  if (put.status !== 201) { process.exit(1); }
  const sha = put.body.content.sha;

  // 2) 读回确认
  const get = await api('GET', '/contents/' + TEST_PATH + '?ref=' + BRANCH);
  console.log('[2] 读回 -> HTTP ' + get.status + (get.status === 200 ? ' ✅' : ''));

  // 3) 删除测试文件（回滚，不留痕迹）
  const del = await api('DELETE', '/contents/' + TEST_PATH, {
    message: 'chore: 清理写入链路测试',
    sha: sha,
    branch: BRANCH
  });
  console.log('[3] 回滚 -> HTTP ' + del.status + (del.status === 200 ? ' ✅ 已清理' : ' ' + JSON.stringify(del.body)));

  const okAll = put.status === 201 && get.status === 200 && del.status === 200;
  console.log('\n' + (okAll ? '✅ 端到端写入链路完全可用' : '❌ 写入链路存在问题'));
  process.exit(okAll ? 0 : 1);
})().catch(e => { console.error('请求失败: ' + e.message); process.exit(1); });
