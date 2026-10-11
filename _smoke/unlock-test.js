/* 端到端：密文解锁流程测试（模拟浏览器环境加载 blog.js + crypto.js） */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

const PASSWORD = process.env.BLOG_TEST_PASSWORD;
if (!PASSWORD) { console.error('需要 BLOG_TEST_PASSWORD 环境变量'); process.exit(1); }

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => errors.push(e));

  const dom = new JSDOM(html, {
    url: 'http://localhost/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  const { document } = window;

  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {}
  }));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function () {};

  // 让 fetch 能在 jsdom 里读取本地文件（模拟静态站点）
  window.fetch = function (url) {
    const clean = String(url).split('?')[0];
    if (clean === 'secret.json' || clean.endsWith('/secret.json')) {
      const body = fs.readFileSync(path.join(ROOT, 'secret.json'), 'utf-8');
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) });
    }
    return Promise.reject(new Error('NETWORK_BLOCKED: ' + url));
  };

  window.eval(fs.readFileSync(path.join(ROOT, 'crypto.js'), 'utf-8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8'));

  const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  await tick(150);

  console.log('[1] 基础渲染');
  ok(!!$('#site-header'), '页面已渲染');
  ok(window.BlogCrypto && window.Blog, 'crypto.js 与 blog.js 均已加载');
  ok(window.Blog.version === '2.0.0', '版本号 ' + window.Blog.version);

  console.log('[2] 源码中不得存在明文密码常量');
  const blogSrc = fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8');
  ok(!/ADMIN_PASSWORD/.test(blogSrc), 'blog.js 已无 ADMIN_PASSWORD 常量');
  ok(!blogSrc.includes(PASSWORD), 'blog.js 不含密钥密码明文');
  ok(!/github_pat_[A-Za-z0-9_]{10,}/.test(blogSrc), 'blog.js 不含令牌明文');
  ok(/var EMBEDDED_SECRET = \{/.test(blogSrc), 'blog.js 已内嵌密文包');

  console.log('[3] 错误密码必须被拒绝');
  const loginNav = $$('#nav-menu [data-action]').find(b => b.getAttribute('data-action') === 'login');
  ok(!!loginNav, '存在登录入口');
  click(loginNav);
  await tick(80);
  ok($('#login-overlay').classList.contains('open'), '登录弹层打开');

  $('#login-pass').value = 'wrong-password-123';
  click($('#btn-login'));
  await tick(900);
  ok($('#login-overlay').classList.contains('open'), '错误密码后仍停留在登录框');
  ok(!$('#login-error').hidden, '显示错误提示');
  ok(/密码错误|PASSWORD_OR_TAMPER|解密/.test($('#login-error').textContent), '提示文案：' + $('#login-error').textContent);
  ok($$('#nav-menu [data-action="open-drafts"]').length === 0, '错误密码未获得管理员权限');

  console.log('[4] 正确密码应解锁并取得令牌');
  $('#login-pass').value = PASSWORD;
  click($('#btn-login'));
  await tick(1500);

  ok(!$('#login-overlay').classList.contains('open'), '登录弹层已关闭');
  ok($$('#nav-menu [data-action="open-drafts"]').length === 1, '已获得写文章入口');
  ok($$('#nav-menu [data-action="logout"]').length === 1, '已获得退出入口');

  const st = window.Blog.cloud.status();
  ok(st.connected === true, '云端已连接');
  ok(/2416333938\/zot_furry-s-blog/.test(st.target), '仓库坐标正确：' + st.target);

  // 令牌必须只存在于会话存储，且不落 localStorage
  const sessTok = window.sessionStorage.getItem('blog_pat_v1');
  const localTok = window.localStorage.getItem('blog_pat_v1');
  ok(!!sessTok && /^github_pat_/.test(sessTok), '令牌已解出并保存在 sessionStorage');
  ok(!localTok, '令牌未写入 localStorage（更安全）');

  console.log('[5] 登录后可正常发文章（本地路径）');
  // 「写文章」现在先进入草稿箱，再从草稿箱新建
  click($('#nav-menu [data-action="open-drafts"]'));
  await tick(120);
  click($('.drafts-page [data-action="new-draft"]'));
  await tick(100);
  ok($('#editor-overlay').classList.contains('open'), '编辑器打开');
  $('#e-title').value = '加密登录测试文章';
  $('#e-content').value = '## 测试\n\n正文内容。';
  click($('[data-action="publish"]'));
  await tick(200);
  ok(!$('#editor-overlay').classList.contains('open'), '发布后编辑器关闭');
  ok(document.body.textContent.includes('加密登录测试文章'), '新文章出现在页面上');

  console.log('[6] 退出登录应清除令牌');
  click($('#nav-menu [data-action="logout"]'));
  await tick(120);
  ok($$('#nav-menu [data-action="login"]').length === 1, '已退出');
  ok(!window.sessionStorage.getItem('blog_pat_v1'), '退出后令牌已清除');

  console.log('[7] 无未捕获错误');
  const real = errors.filter(e => !/Could not parse CSS|Not implemented|NETWORK_BLOCKED/.test(String(e && e.message)));
  ok(real.length === 0, '无未捕获错误' + (real.length ? ': ' + real.map(e => e.message).join(' | ') : ''));

  console.log('\n==============================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('==============================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
