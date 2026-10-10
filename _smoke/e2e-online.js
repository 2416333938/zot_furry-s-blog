/* 最终闭环验证：完全模拟浏览器在线登录的真实路径
 *   1. 从线上站点下载 secret.json（不是本地文件）
 *   2. 用密钥密码解密
 *   3. 用解出的令牌真实写入仓库数据文件，并读回校验
 */
const https = require('https');
const C = require(require('path').join(__dirname, '..', 'crypto.js'));

const PW = process.env.BLOG_TEST_PASSWORD;
if (!PW) { console.error('缺少 BLOG_TEST_PASSWORD'); process.exit(1); }

const SITE = 'https://2416333938.github.io/zot_furry-s-blog/';

function req(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({ 'User-Agent': 'blog-e2e' }, (opts && opts.headers) || {})
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, text: d }));
    });
    r.on('error', reject);
    if (opts && opts.body) r.write(opts.body);
    r.end();
  });
}

(async () => {
  console.log('步骤 1: 从线上站点获取密文');
  const s = await req(SITE + 'secret.json?_=' + Date.now());
  console.log('   HTTP ' + s.status + '，' + s.text.length + ' 字节');
  if (s.status !== 200) { console.error('无法获取密文'); process.exit(1); }
  const bundle = JSON.parse(s.text);

  console.log('\n步骤 2: 用密钥密码解密');
  const payload = C.decrypt(bundle, PW);
  console.log('   解密成功 ✅');
  console.log('   仓库: ' + payload.owner + '/' + payload.repo + '@' + payload.branch);
  console.log('   令牌: ' + payload.token.slice(0, 11) + '…（' + payload.token.length + ' 字符）');

  const API = 'https://api.github.com/repos/' + payload.owner + '/' + payload.repo;
  const H = {
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + payload.token,
    'User-Agent': 'blog-e2e',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  console.log('\n步骤 3: 用解出的令牌真实写入数据文件');
  const cur = await req(API + '/contents/' + payload.path + '?ref=' + payload.branch, { headers: H });
  if (cur.status !== 200) { console.error('   读取失败 HTTP ' + cur.status); process.exit(1); }
  const curJson = JSON.parse(cur.text);
  const data = JSON.parse(Buffer.from(curJson.content, 'base64').toString('utf8'));
  console.log('   当前数据: ' + data.posts.length + ' 篇文章, ' + data.comments.length + ' 条评论');

  // 心跳字段递增（模拟一次"发布文章"的写入）
  data.savedAt = Date.now();
  const body = JSON.stringify({
    message: 'chore: 端到端链路验证',
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch: payload.branch,
    sha: curJson.sha
  });
  const put = await req(API + '/contents/' + payload.path, {
    method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: body
  });
  console.log('   写入 -> HTTP ' + put.status + (put.status === 200 ? ' ✅' : ' ' + put.text.slice(0, 120)));
  if (put.status !== 200) process.exit(1);

  console.log('\n步骤 4: 读回校验（模拟访客加载线上站点）');
  await new Promise(r => setTimeout(r, 1500));
  const back = await req(API + '/contents/' + payload.path + '?ref=' + payload.branch, { headers: H });
  const backData = JSON.parse(Buffer.from(JSON.parse(back.text).content, 'base64').toString('utf8'));
  console.log('   读回: ' + backData.posts.length + ' 篇文章');
  const same = backData.savedAt === data.savedAt;
  console.log('   数据一致: ' + (same ? '✅' : '❌'));

  console.log('\n' + (same ? '✅ 完整闭环验证通过：线上密文 → 解密 → 令牌 → 写入 → 读回' : '❌ 闭环验证失败'));
  process.exit(same ? 0 : 1);
})().catch(e => { console.error('失败: ' + e.message); process.exit(1); });
