/* 回归：点「新建草稿」必须是空白，不能带回上一篇暂存内容 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n)); };

const STALE = {
  title: '这是上一篇没写完的旧草稿',
  category: '旧分类',
  tags: '旧标签',
  content: '旧草稿的正文内容，不应该出现在新建草稿里。',
  saved: Date.now() - 3600_000
};

async function boot() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8'), {
    url: 'http://localhost/index.html', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: vc
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.sessionStorage.setItem('blog_auth_v1', '1');
  window.fetch = () => Promise.reject(new Error('NETWORK_BLOCKED'));

  // 预置一篇「旧临时草稿」，模拟用户上次没写完就关掉页面
  window.localStorage.setItem('blog_posts_v1', JSON.stringify([]));
  window.localStorage.setItem('blog_comments_v1', JSON.stringify([]));
  window.localStorage.setItem('blog_drafts_v1', JSON.stringify(STALE));

  window.eval(fs.readFileSync(path.join(ROOT, 'crypto.js'), 'utf-8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8'));
  return { window, document: window.document };
}

const tick = ms => new Promise(r => setTimeout(r, ms));
const ev = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

(async () => {
  console.log('[1] 点「新建草稿」应为空白');
  {
    const { window, document } = await boot();
    await tick(120);
    window.location.hash = '#/drafts';
    await tick(200);

    const btn = document.querySelector('.drafts-page [data-action="new-draft"]');
    ok(!!btn, '找到「新建草稿」按钮');
    ev(window, btn);
    await tick(150);

    ok(document.getElementById('editor-overlay').classList.contains('open'), '编辑器已打开');
    const title = document.getElementById('e-title').value;
    const content = document.getElementById('e-content').value;

    ok(title === '', '标题为空（实际：' + JSON.stringify(title) + '）');
    ok(content === '', '正文为空（实际：' + JSON.stringify(content.slice(0, 30)) + '）');
    ok(!title.includes('旧草稿'), '没有带入旧标题');
    ok(!content.includes('旧草稿的正文'), '没有带入旧正文');

    const toasts = document.querySelector('.toast-box');
    ok(!toasts || !toasts.textContent.includes('已恢复'), '没有弹出「已恢复」提示');
  }

  console.log('\n[2] 「继续编辑临时草稿」仍应恢复内容');
  {
    const { window, document } = await boot();
    await tick(120);
    window.location.hash = '#/drafts';
    await tick(200);

    const btn = document.querySelector('[data-action="edit-temp-draft"]');
    ok(!!btn, '找到「继续编辑」临时草稿按钮');
    ev(window, btn);
    await tick(150);

    ok(document.getElementById('e-title').value === STALE.title, '恢复了旧标题');
    ok(document.getElementById('e-content').value === STALE.content, '恢复了旧正文');
  }

  console.log('\n[3] 空白新建后关闭，不应覆盖已有暂存草稿');
  {
    const { window, document } = await boot();
    await tick(120);
    window.location.hash = '#/drafts';
    await tick(200);
    ev(window, document.querySelector('.drafts-page [data-action="new-draft"]'));
    await tick(120);

    // 什么都不填，直接关闭
    ev(window, document.querySelector('[data-action="close-editor"]'));
    await tick(150);

    const after = JSON.parse(window.localStorage.getItem('blog_drafts_v1'));
    ok(after && after.content === STALE.content, '旧暂存草稿未被空内容覆盖');
  }

  console.log('\n==============================');
  console.log('通过 ' + pass + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
