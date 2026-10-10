#!/usr/bin/env node
/*!
 * 交互式更新密钥密文（供 更新密钥.bat 调用，也可直接 node tools/update-secret.js）
 * ---------------------------------------------------------------
 * 这个脚本承担全部中文交互，因为它运行在 Node 里，
 * 用 UTF-8 输出，不受 Windows 控制台代码页影响。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');

/* ---------------- 输出助手（统一 UTF-8） ---------------- */
function out(s) { process.stdout.write((s === undefined ? '' : s) + '\n'); }
function line(ch) { out((ch || '=').repeat(58)); }

/* ---------------- 隐藏输入 ---------------- */
function askHidden(question) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // 非交互（管道输入）时退化为按行读取
      const rl = readline.createInterface({ input: process.stdin });
      process.stdout.write(question);
      rl.once('line', a => { rl.close(); resolve(a.trim()); });
      return;
    }
    const stdin = process.stdin;
    process.stdout.write(question);
    let buf = '';
    const onData = ch => {
      ch = ch.toString('utf8');
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '\u0003') {           // Ctrl+C
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/* ---------------- 运行外部命令（继承 stdio，便于看到 git 输出） ---------------- */
function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: ROOT }, opts || {}));
  return r.status === null ? 1 : r.status;
}

/* ---------------- 长度自检 ---------------- */
function tokenLength(t) {
  // 按字符数统计（PAT 为 ASCII，直接用 length 即可）
  return [...t].length;
}

(async function main() {
  out();
  line('=');
  out('  博客密钥密文更新工具');
  line('=');
  out('  工作目录: ' + ROOT);
  out();

  // ---- 前置校验 ----
  if (!fs.existsSync(path.join(ROOT, 'tools', 'gen-secret.js'))) {
    out('[错误] 找不到 tools/gen-secret.js');
    out('       请确认脚本位于博客项目根目录内。');
    return 1;
  }
  if (!fs.existsSync(path.join(ROOT, 'crypto.js'))) {
    out('[错误] 找不到 crypto.js');
    return 1;
  }

  // ---- 输入密码 ----
  out('请输入密钥密码（输入时不会显示）:');
  const password = (await askHidden('> ')).trim();
  if (!password) { out('\n[已取消] 密码不能为空。'); return 1; }

  out();
  out('请再次输入以确认:');
  const password2 = (await askHidden('> ')).trim();
  if (password !== password2) { out('\n[已取消] 两次输入不一致。'); return 1; }

  // ---- 输入令牌 ----
  out();
  out('请粘贴 GitHub 令牌（github_pat_ 开头，93 个字符，输入时不会显示）:');
  let token = (await askHidden('> ')).trim();
  token = token.replace(/^["']|["']$/g, '').trim();   // 去掉误带的引号
  if (!token) { out('\n[已取消] 令牌不能为空。'); return 1; }

  // ---- 格式自检 ----
  const len = tokenLength(token);
  out();
  out('[自检] 令牌长度: ' + len + ' 字符');
  if (!/^github_pat_/.test(token)) {
    out('[警告] 令牌不是 github_pat_ 开头，可能是 classic 令牌（ghp_ 开头也可用）。');
  }
  if (len !== 93 && /^github_pat_/.test(token)) {
    out('[警告] fine-grained 令牌应为 93 字符，当前 ' + len + ' 字符。');
    out('       常见原因：复制时多了空格或少复制了字符。');
    out('       仍会继续，但若连接失败请重新复制令牌。');
  }

  // ---- 加密 ----
  out();
  line('=');
  out('  正在加密（PBKDF2 15 万次迭代，约 1~3 秒）');
  line('=');
  out();

  const env = Object.assign({}, process.env, { BLOG_PASSWORD: password });
  const genCode = run(process.execPath, [
    path.join(ROOT, 'tools', 'gen-secret.js'),
    '--token', token
  ], { env: env });

  if (genCode !== 0) {
    out();
    out('[失败] 生成密文出错，退出码 ' + genCode);
    return 1;
  }

  // ---- 提交推送 ----
  out();
  line('=');
  out('  提交并推送到 GitHub');
  line('=');
  out();

  run('git', ['add', '-A']);
  const commitCode = run('git', ['commit', '-m', 'chore: 更新密钥密文']);
  if (commitCode !== 0) {
    out();
    out('[提示] 没有需要提交的改动（密文可能与上次相同），继续推送。');
  }
  run('git', ['fetch', 'origin']);
  run('git', ['rebase', 'origin/main']);
  const pushCode = run('git', ['push', 'origin', 'main']);

  if (pushCode !== 0) {
    out();
    out('[失败] 推送失败。请检查网络后手动执行: git push origin main');
    return 1;
  }

  // ---- 完成 ----
  out();
  line('=');
  out('  完成');
  line('=');
  out();
  out('  线上站点（约 1 分钟后生效）:');
  out('  https://2416333938.github.io/zot_furry-s-blog/');
  out();
  out('  登录方式: 打开站点 -> 点「登录」-> 输入刚才的密钥密码');
  out('  请牢记密码 —— 它没有被写入任何文件。');
  out();
  return 0;
})().then(code => { process.exit(code || 0); })
  .catch(e => { out('[异常] ' + e.message); process.exit(1); });
