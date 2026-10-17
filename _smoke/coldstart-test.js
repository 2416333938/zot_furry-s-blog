/* 回归测试：冷启动直接访问文章页，不应误报「文章不存在」 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n)); };

// 云端数据：延迟返回，模拟「网络慢、数据后到」
const CLOUD_DATA = {
  version: 2,
  posts: [{
    id: 'post_late', title: '云端才有的文章', category: '测试', tags: [],
    cover: '', pinned: false, status: 'published', likes: 0, views: 1,
    created: Date.now(), updated: Date.now(), content: '# 云端内容\n\n这篇文章只在云端数据里。'
  }],
  comments: [],
  config: { siteName: 'Late Blog', slogan: 's', author: 'a', avatar: '', bio: '', github: '', email: '', about: 'x' }
};

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

(async () => {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));

  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8'), {
    url: 'http://localhost/index.html#/post/post_late',   // 冷启动直接进文章页
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
  });
  const { window } = dom;
  const { document } = window;

  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = function () {};

  // 关键：本地缓存为空（模拟第一次访问 / 换了浏览器）
  window.localStorage.setItem('blog_posts_v1', JSON.stringify([]));
  window.localStorage.setItem('blog_comments_v1', JSON.stringify([]));

  // fetch：云端数据延迟 600ms 才返回
  window.fetch = function (url) {
    const u = String(url);
    if (u.includes('/contents/')) {
      return new Promise(resolve => {
        setTimeout(() => resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify({
            content: b64(JSON.stringify(CLOUD_DATA)),
            sha: 'fake-sha'
          }))
        }), 600);
      });
    }
    return Promise.reject(new Error('NETWORK_BLOCKED ' + u));
  };

  window.eval(fs.readFileSync(path.join(ROOT, 'crypto.js'), 'utf-8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8'));

  const tick = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);

  // 立刻检查：还没等到云端数据时，不应已经跳走或报错
  await tick(120);
  ok(window.location.hash === '#/post/post_late', '等待期间仍停留在文章路由（未跳首页）');
  ok(!!$('.post-skeleton'), '显示加载骨架屏');
  const earlyToast = document.querySelector('.toast-box');
  ok(!earlyToast || !earlyToast.textContent.includes('不存在'), '未提前弹出「文章不存在」');

  // 等云端数据到达
  await tick(1400);
  ok(!!$('#article-content'), '云端数据到达后渲染正文');
  ok($('#article-content') && $('#article-content').textContent.includes('云端内容'), '渲染的是云端文章内容');
  const finalToast = document.querySelector('.toast-box');
  ok(!finalToast || !finalToast.textContent.includes('不存在'), '全程没有「文章不存在」提示');

  // 场景 2：文章确实不存在 → 应正常报错并回首页
  console.log('\n[2] 文章确实不存在时仍要报错');
  window.location.hash = '#/post/definitely_missing';
  await tick(1600);
  ok(window.location.hash === '#/' || window.location.hash === '', '不存在的文章跳回首页');

  console.log('\n==============================');
  console.log('通过 ' + pass + '，失败 ' + fail);
  if (errs.length) console.log('运行期错误:', errs.slice(0, 3));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
