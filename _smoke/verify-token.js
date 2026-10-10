/* 只读验证：用密文解出的令牌检查仓库权限（不产生任何写入） */
const fs = require('fs');
const path = require('path');
const https = require('https');
const C = require(path.join(__dirname, '..', 'crypto.js'));

const PASSWORD = process.env.BLOG_TEST_PASSWORD;
if (!PASSWORD) { console.error('缺少 BLOG_TEST_PASSWORD'); process.exit(1); }

const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'secret.json'), 'utf-8'));
const payload = C.decrypt(bundle, PASSWORD);
console.log('解密成功 → 仓库 ' + payload.owner + '/' + payload.repo + '@' + payload.branch);
console.log('令牌前缀 ' + payload.token.slice(0, 16) + '…（长度 ' + payload.token.length + '）');

function api(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'blog-permission-check',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, body: j, raw: d });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const r = await api(`https://api.github.com/repos/${payload.owner}/${payload.repo}`, payload.token);
  console.log('\n[仓库访问] HTTP ' + r.status);
  if (r.status !== 200) {
    console.log('  失败：' + (r.body && r.body.message));
    process.exit(1);
  }
  console.log('  仓库: ' + r.body.full_name + (r.body.private ? '（私有）' : '（公开）'));
  console.log('  默认分支: ' + r.body.default_branch);
  console.log('  权限 push: ' + (r.body.permissions && r.body.permissions.push));
  console.log('  权限 admin: ' + (r.body.permissions && r.body.permissions.admin));

  // 检查目标数据文件是否存在（只读）
  const f = await api(`https://api.github.com/repos/${payload.owner}/${payload.repo}/contents/${payload.path}?ref=${payload.branch}`, payload.token);
  console.log('\n[数据文件 ' + payload.path + '] HTTP ' + f.status);
  if (f.status === 200) console.log('  已存在，sha=' + f.body.sha);
  else if (f.status === 404) console.log('  尚不存在（首次上传时创建）');
  else console.log('  ' + (f.body && f.body.message));

  // 检查密文文件是否已在仓库（只读）
  const s = await api(`https://api.github.com/repos/${payload.owner}/${payload.repo}/contents/${payload.secretPath}?ref=${payload.branch}`, payload.token);
  console.log('\n[密文文件 ' + payload.secretPath + '] HTTP ' + s.status);

  const push = !!(r.body.permissions && r.body.permissions.push);
  console.log('\n令牌写入权限: ' + (push ? '✅ 具备' : '❌ 缺失（无法同步）'));
  process.exit(push ? 0 : 2);
})().catch(e => { console.error('请求失败: ' + e.message); process.exit(1); });
