#!/usr/bin/env node
/*!
 * 生成管理员密钥密文包
 * ---------------------------------------------------------------
 * 用法（密码不会被写进任何文件）：
 *   node tools/gen-secret.js --password "你的密码"
 *   或交互式：node tools/gen-secret.js
 *   或用环境变量：BLOG_PASSWORD=xxx node tools/gen-secret.js
 *
 * 产物：
 *   secret.json           —— 提交到仓库的密文包（公开也无妨）
 *   blog.js 内的内嵌副本  —— 保证 file:// 双击打开也能登录
 *
 * 注意：两者内容一致，由本脚本统一更新，避免手工维护出错。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const C = require(path.join(__dirname, '..', 'crypto.js'));

const ROOT = path.join(__dirname, '..');
const SECRET_FILE = path.join(ROOT, 'secret.json');
const BLOG_FILE = path.join(ROOT, 'blog.js');

/* 默认加密的内容：管理员令牌与仓库坐标 */
const DEFAULT_PAYLOAD = {
  token: '',
  owner: '2416333938',
  repo: 'zot_furry-s-blog',
  branch: 'main',
  path: 'data/blog-data.json',
  secretPath: 'secret.json'
};

function parseArgs(argv) {
  const out = { password: process.env.BLOG_PASSWORD || '', token: '', iterations: 0, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--password' || a === '-p') out.password = argv[++i] || '';
    else if (a === '--token' || a === '-t') out.token = argv[++i] || '';
    else if (a === '--iterations' || a === '-i') out.iterations = parseInt(argv[++i], 10) || 0;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function ask(question, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!hidden) {
      rl.question(question, ans => { rl.close(); resolve(ans); });
      return;
    }
    // 隐藏输入
    const stdin = process.stdin;
    process.stdout.write(question);
    const onData = char => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        rl.close();
        process.stdout.write('\n');
        resolve(buffer);
      } else if (char === '\u0003') {
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') {
        buffer = buffer.slice(0, -1);
      } else {
        buffer += char;
      }
    };
    let buffer = '';
    stdin.on('data', onData);
  });
}

/** 把密文写进 blog.js 的内嵌常量 */
function embedIntoBlog(bundleJson) {
  const src = fs.readFileSync(BLOG_FILE, 'utf8');
  const marker = 'var EMBEDDED_SECRET = ';
  const start = src.indexOf(marker);
  if (start === -1) {
    console.error('!! blog.js 中找不到 EMBEDDED_SECRET 常量，请先完成代码改造');
    return false;
  }
  // 定位该行末尾（常量写成单行 JSON）
  const lineEnd = src.indexOf('\n', start);
  const replacement = marker + bundleJson + ';   // 由 tools/gen-secret.js 生成，仅含密文';
  const next = src.slice(0, start) + replacement + src.slice(lineEnd);
  fs.writeFileSync(BLOG_FILE, next, 'utf8');
  return true;
}

(async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log('用法: node tools/gen-secret.js --password "密码" [--token "github_pat_xxx"] [--iterations 150000]');
    process.exit(0);
  }

  let password = args.password;
  if (!password) password = (await ask('请输入登录密码: ', true)).trim();
  if (!password) { console.error('密码不能为空'); process.exit(1); }

  let password2 = '';
  if (!args.password) {
    password2 = (await ask('请再次输入确认: ', true)).trim();
    if (password !== password2) { console.error('两次输入不一致'); process.exit(1); }
  }

  // 取令牌：参数 > 已有密文解出的 > 交互输入 > 保留占位
  let token = args.token;
  if (!token && fs.existsSync(SECRET_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
      // 尝试用同一个新密码解旧密文（多半失败，忽略）
      void old;
    } catch (e) { /* ignore */ }
  }
  if (!token) {
    token = (await ask('请输入 GitHub 令牌 (github_pat_…): ', true)).trim();
  }
  if (!token) { console.error('令牌不能为空'); process.exit(1); }

  const existing = {};
  if (fs.existsSync(SECRET_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
      // 旧密文只能用旧密码解；若本次提供了旧密码可继承其他字段
      Object.assign(existing, prev);
    } catch (e) { /* 忽略损坏文件 */ }
  }

  const payload = Object.assign({}, DEFAULT_PAYLOAD, {
    token: token,
    owner: existing.owner || DEFAULT_PAYLOAD.owner,
    repo: existing.repo || DEFAULT_PAYLOAD.repo,
    branch: existing.branch || DEFAULT_PAYLOAD.branch,
    path: existing.path || DEFAULT_PAYLOAD.path,
    secretPath: DEFAULT_PAYLOAD.secretPath
  });

  const iterations = args.iterations || C.DEFAULT_ITERATIONS;
  console.log('\n正在加密（PBKDF2 ' + iterations.toLocaleString() + ' 次迭代）…');
  const t0 = Date.now();
  const bundle = C.encrypt(payload, password, iterations);
  console.log('完成，用时 ' + (Date.now() - t0) + 'ms');

  const json = JSON.stringify(bundle, null, 2);
  fs.writeFileSync(SECRET_FILE, json + '\n', 'utf8');
  console.log('已写出 ' + path.relative(ROOT, SECRET_FILE));

  const embedded = JSON.stringify(bundle);
  if (embedIntoBlog(embedded)) console.log('已同步内嵌副本到 blog.js');

  // 自检：确认密文中不含明文
  const leaks = [];
  if (json.includes(password)) leaks.push('密码');
  if (json.includes(token)) leaks.push('令牌');
  console.log('\n安全自检：');
  console.log('  密文体积 ' + json.length + ' 字节');
  console.log('  包含密码明文: ' + (leaks.includes('密码') ? '是（异常！）' : '否'));
  console.log('  包含令牌明文: ' + (leaks.includes('令牌') ? '是（异常！）' : '否'));

  // 往返验证
  const back = C.decrypt(JSON.parse(json), password);
  console.log('  解密自检: ' + (back.token === token ? '通过' : '失败（异常！）'));
  if (leaks.length || back.token !== token) process.exit(1);

  console.log('\n✅ 完成。密码请自行牢记 —— 它没有被写入任何文件。');
})().catch(e => { console.error('生成失败:', e.message); process.exit(1); });
