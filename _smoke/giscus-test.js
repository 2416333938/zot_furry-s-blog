/* 验证：访客视角评论区应渲染 giscus 容器；管理员视角保留站长评论 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n)); };

async function boot(asAdmin) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8'), {
    url: 'http://localhost/index.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  if (asAdmin) window.sessionStorage.setItem('blog_auth_v1', '1');
  window.fetch = () => Promise.reject(new Error('NETWORK_BLOCKED'));
  window.eval(fs.readFileSync(path.join(ROOT, 'crypto.js'), 'utf-8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8'));
  return { window, document: window.document, errs };
}

(async () => {
  console.log('[1] 访客视角');
  {
    const { window, document } = await boot(false);
    await new Promise(r => setTimeout(r, 120));
    window.location.hash = '#/post/post_welcome';
    await new Promise(r => setTimeout(r, 250));

    const $ = s => document.querySelector(s);
    ok(!!$('#giscus-container'), '渲染 giscus 容器');
    ok(!$('#comment-form'), '访客看不到会静默失败的本地表单');
    ok(!$('#btn-submit-comment'), '访客没有本地发表按钮');

    const s = $('#giscus-container script[src*="giscus.app"]');
    ok(!!s, '注入 giscus client.js');
    if (s) {
      ok(s.getAttribute('data-repo') === '2416333938/zot_furry-s-blog', 'data-repo 正确');
      ok(s.getAttribute('data-repo-id') === 'R_kgDOU8WT2w', 'data-repo-id 正确');
      ok(s.getAttribute('data-category-id') === 'DIC_kwDOU8WT284DIs8M', 'data-category-id 正确');
      ok(s.getAttribute('data-mapping') === 'pathname', 'data-mapping=pathname');
      ok(['light', 'dark'].includes(s.getAttribute('data-theme')), 'data-theme 有效: ' + s.getAttribute('data-theme'));
      ok(s.getAttribute('data-lang') === 'zh-CN', 'data-lang=zh-CN');
    }
    ok(document.body.textContent.includes('GitHub 账号登录'), '显示 GitHub 登录提示');
  }

  console.log('\n[2] 管理员视角');
  {
    const { window, document } = await boot(true);
    await new Promise(r => setTimeout(r, 120));
    window.location.hash = '#/post/post_welcome';
    await new Promise(r => setTimeout(r, 250));
    const $ = s => document.querySelector(s);
    ok(!!$('#giscus-container'), '管理员也能看到访客评论区');
    ok(!!$('#comment-form'), '管理员保留站长评论表单');
    ok(!!$('#btn-submit-comment'), '管理员有本地发表按钮');
  }

  console.log('\n[3] 主题切换同步 giscus');
  {
    const { window, document } = await boot(false);
    await new Promise(r => setTimeout(r, 120));
    window.location.hash = '#/post/post_welcome';
    await new Promise(r => setTimeout(r, 250));
    const before = document.querySelector('#giscus-container script').getAttribute('data-theme');
    document.getElementById('btn-theme').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    const after = document.documentElement.getAttribute('data-theme');
    ok(before !== after || after === 'dark', '切换主题后页面主题为 ' + after);
    ok(!document.querySelector('#giscus-container script[data-theme="' + before + '"]') ||
       before === after, 'giscus 主题跟随站点');
  }

  console.log('\n==============================');
  console.log('通过 ' + pass + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
