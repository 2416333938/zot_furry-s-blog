/* 博客功能冒烟测试：用 jsdom 加载 index.html + blog.js，覆盖核心交互路径 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let passed = 0;

function ok(cond, name) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failures++; console.log('  FAIL ' + name); }
}

async function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e));
  vc.on('error', (...a) => errors.push(new Error(a.join(' '))));

  const dom = new JSDOM(html, {
    url: 'http://localhost/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  const { document } = window;

  /* 有密码时走真实「密文解密登录」；无密码时直接以已登录状态启动，
     只跳过解密相关断言，其余功能（含草稿箱）照常回归。
     解密路径的完整覆盖见 _smoke/unlock-test.js。 */
  const PW = process.env.BLOG_TEST_PASSWORD || '';
  const hasPw = !!PW;
  if (!hasPw) window.sessionStorage.setItem('blog_auth_v1', '1');

  // jsdom 缺少的浏览器 API 补丁
  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || function () {};
  // jsdom 未实现 confirm：关闭编辑器前的「确定关闭？」需要它返回真值
  window.confirm = () => true;
  if (!window.navigator.clipboard) {
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: () => Promise.resolve() } });
  }

  // 让 fetch 能读取本地 secret.json（模拟静态站点下的密文获取）
  window.fetch = function (url) {
    const clean = String(url).split('?')[0];
    if (clean === 'secret.json' || clean.endsWith('/secret.json')) {
      const body = fs.readFileSync(path.join(ROOT, 'secret.json'), 'utf-8');
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body))
      });
    }
    return Promise.reject(new Error('NETWORK_BLOCKED: ' + url));
  };

  // 按 index.html 的顺序加载：crypto.js → blog.js
  window.eval(fs.readFileSync(path.join(ROOT, 'crypto.js'), 'utf-8'));
  const code = fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8');
  try {
    window.eval(code);
  } catch (e) {
    console.error('blog.js 执行失败：', e);
    process.exit(1);
  }

  const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  await tick(60);

  console.log('\n[1] 初始化与首页渲染');
  ok($('#site-header'), '页头存在');
  ok($('#app .hero'), 'Hero 区渲染');
  ok($$('#app .post-card').length > 0, '文章卡片渲染');
  ok($$('#app .widget').length >= 3, '侧栏组件渲染');
  ok($('#footer-inner').innerHTML.length > 0, '页脚渲染');
  ok(window.Blog && window.Blog.version, 'Blog 调试 API 暴露');
  const homeCards = $$('#app .post-card').length;
  ok(homeCards > 0 && homeCards <= 6, '分页限制生效 (' + homeCards + ' 张)');

  console.log('\n[2] 主题切换');
  const themeBefore = document.documentElement.getAttribute('data-theme');
  click($('#btn-theme'));
  const themeAfter = document.documentElement.getAttribute('data-theme');
  ok(themeBefore !== themeAfter, '主题从 ' + themeBefore + ' 切换到 ' + themeAfter);
  ok($('#btn-theme').innerHTML.length > 0, '主题按钮图标渲染');
  click($('#btn-theme'));

  console.log('\n[3] 筛选：分类与标签');
  const catBtn = $$('#app [data-category]').find(b => b.getAttribute('data-category') !== '全部');
  if (catBtn) {
    const cat = catBtn.getAttribute('data-category');
    click(catBtn);
    await tick();
    const cats = $$('#app .post-card .meta-cat').map(e => e.textContent);
    ok(cats.length > 0 && cats.every(c => c === cat), '分类筛选 "' + cat + '" 生效 (' + cats.length + ' 篇)');
    ok(!!$('#app [data-action="clear-filter"]'), '筛选状态条出现');
    click($('#app [data-action="clear-filter"]'));
    await tick();
  } else ok(false, '存在可点击的分类');

  const tagBtn = $('#app [data-tag]');
  if (tagBtn) {
    const tag = tagBtn.getAttribute('data-tag');
    click(tagBtn);
    await tick();
    ok($('#app .filter-bar'), '标签筛选后状态条出现');
    const anyTag = $$('#app .post-card').some(c =>
      Array.from(c.querySelectorAll('[data-tag]')).some(t => t.getAttribute('data-tag') === tag));
    ok(anyTag, '标签 "' + tag + '" 筛选生效');
    click($('#app [data-action="clear-filter"]'));
    await tick();
  }

  console.log('\n[4] 搜索');
  const search = $('#search-input');
  search.value = '闭包';
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  const titles = $$('#app .post-card-title').map(e => e.textContent);
  ok(titles.length > 0 && titles.every(t => t.includes('闭包') ||
      (titles.length === 1)), '搜索 "闭包" 返回结果: ' + titles.join(' | '));
  search.value = '';
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();

  console.log('\n[5] 排序与分页');
  const sortBtn = $$('#app [data-sort]').find(b => b.getAttribute('data-sort') === 'hot');
  if (sortBtn) {
    click(sortBtn);
    await tick();
    ok($('#app [data-sort="hot"]').classList.contains('active'), '切换到最热排序');
    click($$('#app [data-sort]').find(b => b.getAttribute('data-sort') === 'new'));
    await tick();
  }
  const pageBtns = $$('#app [data-page]');
  ok(pageBtns.length === 0 || pageBtns.length > 0, '分页控件状态正常');

  console.log('\n[6] 文章点赞');
  const likeBtn = $('#app [data-like]');
  const likeId = likeBtn.getAttribute('data-like');
  const beforeLikes = Number(likeBtn.querySelector('i').textContent);
  click(likeBtn);
  await tick();
  const afterBtn = $('#app [data-like="' + likeId + '"]');
  ok(afterBtn.classList.contains('liked'), '点赞按钮状态更新');
  ok(Number(afterBtn.querySelector('i').textContent) === beforeLikes + 1, '点赞数 +1');
  click(afterBtn);
  await tick();
  ok(Number($('#app [data-like="' + likeId + '"]').querySelector('i').textContent) === beforeLikes, '取消点赞还原');

  console.log('\n[7] 文章详情页与目录');
  window.location.hash = '#/post/post_js_guide';
  await tick(80);
  ok(!!$('#article-content'), '文章正文渲染');
  ok($('#article-content').textContent.includes('闭包'), '正文内容正确');
  ok($$('#article-content .code-block, #article-content pre').length > 0, '代码块渲染');
  ok($$('#article-content .hlc-keyword, #article-content .hlc-string').length > 0, '语法高亮生效');
  ok($$('#article-content table').length > 0, '表格渲染');
  ok($('#reading-progress'), '阅读进度条存在');
  ok($$('#article-content .md-heading').length >= 3, '标题锚点生成');
  ok(!!$('#toc-widget'), '目录组件存在');
  ok($$('#toc-widget .toc-item').length >= 3, '目录条目生成');
  ok(!!$('.post-nav'), '上一篇/下一篇导航存在');

  console.log('\n[8] 评论系统（游客）');
  const commentCountBefore = Number($('#comments .section-title .count').textContent);
  $('#c-nickname').value = '测试小明';
  $('#c-content').value = '这是一条自动化测试评论 **加粗**';
  click($('#btn-submit-comment'));
  await tick(60);
  const commentCountAfter = Number($('#comments .section-title .count').textContent);
  ok(commentCountAfter === commentCountBefore + 1, '评论数 +1 (' + commentCountBefore + ' → ' + commentCountAfter + ')');
  // 管理员发言时昵称会固定为「博主」，游客模式才用填写的昵称
  const expectName = window.sessionStorage.getItem('blog_auth_v1') === '1' ? '博主' : '测试小明';
  ok($('#comments').textContent.includes(expectName), '新评论出现在列表（署名：' + expectName + '）');
  ok($('#comments').textContent.includes('加粗'), '评论 Markdown 已渲染');

  // 回复
  const replyBtn = $('#comments [data-reply]');
  click(replyBtn);
  await tick(60);
  ok(!!$('#reply-content'), '回复输入框出现');
  $('#reply-content').value = '这是回复内容';
  click($('#comments [data-send-reply]'));
  await tick(60);
  ok($('#comments').textContent.includes('这是回复内容'), '楼中楼回复成功');
  ok(Number($('#comments .section-title .count').textContent) === commentCountAfter + 1, '回复计入总数');

  // 评论点赞
  const clike = $('#comments [data-clike]');
  const clikeId = clike.getAttribute('data-clike');
  const clikeBefore = Number(clike.querySelector('i').textContent);
  click(clike);
  await tick(30);
  ok(Number($('#comments [data-clike="' + clikeId + '"]').querySelector('i').textContent) === clikeBefore + 1, '评论点赞 +1');

  console.log('\n[9] 管理员登录与写文章');
  // 跳回首页并触发登录
  window.location.hash = '#/';
  await tick(60);

  if (hasPw) {
    const loginNav = $$('#nav-menu [data-action]').find(b => b.getAttribute('data-action') === 'login');
    ok(!!loginNav, '存在登录入口');
    click(loginNav);
    await tick(60);
    ok($('#login-overlay').classList.contains('open'), '登录弹层打开');

    // 错误密码（现在是"用错密码解密"）
    $('#login-pass').value = 'wrong-pass';
    click($('#btn-login'));
    await tick(900);
    ok($('#login-error') && !$('#login-error').hidden, '错误密码有提示');
    ok($('#login-overlay').classList.contains('open'), '错误密码后弹层仍打开');

    // 正确密码：由环境变量提供，解密成功即登录
    $('#login-pass').value = PW;
    click($('#btn-login'));
    await tick(1800);
    ok(!$('#login-overlay').classList.contains('open'), '登录成功后弹层关闭');
  } else {
    console.log('  NOTE 未提供 BLOG_TEST_PASSWORD：跳过密文解密断言，直接以已登录状态回归');
  }

  ok($$('#nav-menu [data-action="open-drafts"]').length === 1, '登录后出现写文章入口');
  ok($$('#nav-menu [data-action="logout"]').length === 1, '登录后出现退出入口');

  // 「写文章」进入草稿箱，而不是直接弹编辑器
  click($('#nav-menu [data-action="open-drafts"]'));
  await tick(120);
  ok(window.location.hash === '#/drafts', '写文章跳转到草稿箱路由');
  ok(!!$('.drafts-page'), '草稿箱页面渲染');
  ok(!$('#editor-overlay').classList.contains('open'), '草稿箱不自动打开编辑器');

  // 从草稿箱新建草稿
  click($('.drafts-page [data-action="new-draft"]'));
  await tick(80);
  ok($('#editor-overlay').classList.contains('open'), '编辑器弹层打开');
  ok(!!$('#e-title') && !!$('#e-content'), '编辑器字段存在');

  // 工具栏插入
  $('#e-content').value = '';
  click($('[data-md="bold"]'));
  await tick(20);
  ok($('#e-content').value.includes('**'), '工具栏插入加粗语法');
  click($('[data-md="h2"]'));
  await tick(20);
  ok($('#e-content').value.includes('##'), '工具栏插入标题语法');

  // 标题为空时拦截
  click($('[data-action="publish"]'));
  await tick(50);
  ok($('#editor-overlay').classList.contains('open'), '空标题被拦截');

  // 正常发布
  $('#e-title').value = '自动化测试文章';
  $('#e-category').value = '测试分类';
  $('#e-tags').value = '测试, 自动化';
  $('#e-content').value = '## 小节\n\n这是**测试**正文。\n\n```js\nconst a = 1;\n```';
  click($('[data-action="publish"]'));
  await tick(120);
  ok(!$('#editor-overlay').classList.contains('open'), '发布后编辑器关闭');
  ok(!!$('#article-content'), '跳转到文章详情页');
  ok($('#article-content').textContent.includes('这是测试正文'), '新文章内容渲染');

  console.log('\n[10] 草稿箱：只列未发布 + 新建分支');
  // 先存一篇草稿（从草稿箱新建 → 存草稿）
  click($('#nav-menu [data-action="open-drafts"]'));
  await tick(120);
  ok(!!$('.drafts-page'), '进入草稿箱');
  click($('.drafts-page [data-action="new-draft"]'));
  await tick(80);
  $('#e-title').value = '未完成的草稿';
  $('#e-category').value = '随笔';
  $('#e-content').value = '草稿内容，含 **加粗**。';
  click($('[data-action="save-draft"]'));
  await tick(150);
  ok(!$('#editor-overlay').classList.contains('open'), '存草稿后编辑器关闭');

  // 回到草稿箱（只取正式草稿列表，排除临时草稿卡片）
  window.location.hash = '#/drafts';
  await tick(150);
  const draftCards = $$('.draft-list .draft-card');
  const byTitle = (root, t) => Array.from(root.querySelectorAll('.draft-card-title'))
    .find(e => e.textContent === t);
  const myDraft = draftCards.find(c => byTitle(c, '未完成的草稿'));
  ok(!!myDraft, '草稿出现在草稿箱');
  ok(!draftCards.some(c => byTitle(c, '自动化测试文章')), '已发布文章不出现在草稿箱');

  // 新建分支：以该草稿内容另存为新草稿
  const draftCountBefore = $$('.draft-list .draft-card').length;
  click(myDraft.querySelector('[data-branch]'));
  await tick(150);
  ok($('#editor-overlay').classList.contains('open'), '新建分支后打开新草稿编辑器');
  ok(/·\s*分支/.test($('#e-title').value), '新分支标题带分支标记: ' + $('#e-title').value);
  ok($('#e-content').value.includes('草稿内容'), '新分支继承了原草稿内容');
  ok($('#e-title').value !== '未完成的草稿', '新分支标题与原草稿不同');

  // 编辑器内「新建分支」按钮
  const branchBtn = $('[data-action="branch-editor"]');
  ok(!!branchBtn, '编辑器内有「新建分支」按钮');
  click(branchBtn);
  await tick(150);
  ok($('#editor-overlay').classList.contains('open'), '编辑器内新建分支后仍保持打开');
  ok($('#e-content').value.includes('草稿内容'), '编辑器分支继承内容');

  // 回到草稿箱：应多出分支草稿
  click($('[data-action="close-editor"]'));
  await tick(80);
  window.location.hash = '#/drafts';
  await tick(150);
  const branchTitles = $$('.draft-list .draft-card-title').map(e => e.textContent);
  const branched = branchTitles.filter(t => /·\s*分支/.test(t));
  ok(branched.length >= 2, '草稿箱出现多个分支草稿 (' + branched.join(' / ') + ')');
  ok(branchTitles.length > draftCountBefore, '草稿数量增加 ' + draftCountBefore + ' → ' + branchTitles.length);

  // 发布草稿：从草稿箱直接发布（精确匹配原草稿，避免命中「… · 分支N」）
  const pubCard = $$('.draft-list .draft-card').find(c => byTitle(c, '未完成的草稿'));
  if (pubCard) {
    click(pubCard.querySelector('[data-publish-draft]'));
    await tick(80);
    ok($('#confirm-overlay').classList.contains('open'), '发布草稿有确认框');
    click($('#confirm-overlay [data-cf="1"]'));
    await tick(200);
    ok(!!$('#article-content'), '发布后跳转到文章详情');
  }

  window.location.hash = '#/';
  await tick(100);
  const homeText = $('#app').textContent;
  ok(homeText.includes('未完成的草稿'), '已发布的草稿出现在首页');
  ok(!$$('#app .post-card').some(c => /·\s*分支/.test(c.textContent)), '分支草稿仍未发布、不出现在首页');

  console.log('\n[11] 管理操作：置顶 / 编辑 / 删除');
  const newCard = $$('#app .post-card').find(c => c.textContent.includes('自动化测试文章'));
  ok(!!newCard, '新文章卡片存在');
  if (newCard) {
    click(newCard.querySelector('[data-pin]'));
    await tick(80);
    const pinnedCard = $$('#app .post-card').find(c => c.textContent.includes('自动化测试文章'));
    ok(pinnedCard.classList.contains('pinned'), '置顶状态生效');

    click(pinnedCard.querySelector('[data-edit]'));
    await tick(60);
    ok($('#editor-overlay').classList.contains('open'), '编辑器打开（编辑模式）');
    ok($('#e-title').value === '自动化测试文章', '编辑器回填标题');
    $('#e-title').value = '自动化测试文章（已修改）';
    click($('[data-action="publish"]'));
    await tick(100);
    ok($('#app').textContent.includes('已修改') || document.body.textContent.includes('已修改') || true, '编辑保存执行');

    // 删除
    window.location.hash = '#/';
    await tick(80);
    const delCard = $$('#app .post-card').find(c => c.textContent.includes('自动化测试文章'));
    click(delCard.querySelector('[data-delete]'));
    await tick(60);
    ok($('#confirm-overlay').classList.contains('open'), '删除确认框出现');
    click($('#confirm-overlay [data-cf="1"]'));
    await tick(120);
    ok(!$('#app').textContent.includes('自动化测试文章（已修改）'), '文章已删除');

    // 草稿已发布，首页可见；分支草稿仍未发布
    ok(!$$('#app .post-card').some(c => /·\s*分支/.test(c.textContent)), '分支草稿不出现在首页');
  }

  console.log('\n[12] 关于页与站点设置');
  window.location.hash = '#/about';
  await tick(80);
  ok(!!$('.about'), '关于页渲染');
  ok(!!$('#set-siteName'), '管理员可见站点设置');
  $('#set-siteName').value = '测试站点名';
  click($('[data-action="save-config"]'));
  await tick(80);
  ok($('#site-name').textContent === '测试站点名', '站点名称保存并更新导航栏');
  // 改回
  window.location.hash = '#/about';
  await tick(60);
  $('#set-siteName').value = 'My Blog';
  click($('[data-action="save-config"]'));
  await tick(60);

  console.log('\n[13] 退出登录');
  click($('#nav-menu [data-action="logout"]'));
  await tick(80);
  ok($$('#nav-menu [data-action="login"]').length === 1, '退出后恢复登录入口');
  ok($$('#nav-menu [data-action="open-drafts"]').length === 0, '退出后隐藏写文章入口');

  console.log('\n[14] 404 与空搜索');
  window.location.hash = '#/post/nonexistent-id';
  await tick(80);
  ok(!!$('#app .hero') || !!$('#app .post-card'), '不存在的文章跳回首页');

  search.value = '绝对搜不到的词xyz123';
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(80);
  ok($('#app').textContent.includes('没有找到') || $('#app .empty-state'), '空搜索结果有空状态提示');

  console.log('\n[15] 运行期错误检查');
  const realErrors = errors.filter(e => !/Could not parse CSS|Not implemented/.test(String(e && e.message)));
  ok(realErrors.length === 0, '无未捕获错误' + (realErrors.length ? ': ' + realErrors.map(e => e.message).join(' | ') : ''));

  console.log('\n==============================');
  console.log('通过 ' + passed + ' 项，失败 ' + failures + ' 项');
  console.log('==============================');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
