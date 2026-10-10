#!/usr/bin/env node
/*!
 * 导出当前博客数据为 data/blog-data.json（云端数据源）
 * ---------------------------------------------------------------
 * 用法：node tools/export-data.js
 * 依赖：jsdom（仅本机开发用：npm i jsdom）
 *
 * 说明：以无头方式启动博客，读取其内置示例数据（或本地已有数据），
 *       写成云端数据文件。之后站点会自动从仓库读取该文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'blog-data.json');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('需要 jsdom：请先运行  npm i jsdom');
  process.exit(1);
}

(async function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');

  const dom = new JSDOM(html, {
    url: 'http://localhost/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;

  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  // 阻断网络：本次只用本地示例数据，避免把线上内容误写回
  window.fetch = () => Promise.reject(new Error('offline'));

  window.eval(fs.readFileSync(path.join(ROOT, 'crypto.js'), 'utf-8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'blog.js'), 'utf-8'));

  await new Promise(r => setTimeout(r, 300));

  const data = window.Blog.export();
  const payload = {
    version: 2,
    savedAt: Date.now(),
    posts: data.posts || [],
    comments: data.comments || [],
    config: data.config || {}
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf-8');

  console.log('已写出 ' + path.relative(ROOT, OUT));
  console.log('  文章 ' + payload.posts.length + ' 篇' +
    '（已发布 ' + payload.posts.filter(p => p.status === 'published').length + '，草稿 ' +
    payload.posts.filter(p => p.status !== 'published').length + '）');
  console.log('  评论 ' + payload.comments.length + ' 条');
  console.log('  文件大小 ' + fs.statSync(OUT).size + ' 字节');
})().catch(e => { console.error('导出失败:', e.message); process.exit(1); });
