/*!
 * 个人博客核心脚本 blog.js
 * -------------------------------------------------------
 * 功能列表：
 *  1. 文章管理：新增、编辑、删除、置顶、草稿发布、恢复示例文章
 *  2. 内容呈现：Markdown 轻量渲染、代码高亮、目录生成、字数与阅读时间
 *  3. 内容发现：分类、标签、全文搜索、热门文章排序
 *  4. 互动系统：评论（支持楼中楼回复、点赞、作者标识）、文章点赞、文章浏览量
 *  5. 用户系统：访客昵称、管理呢单密码登录、登录状态保持
 *  6. 界面体验：亮/暗主题、移动端抽屉导航、返回顶部、阅读进度、滚动动画
 *  7. 数据持久化：localStorage 自动保存、导入 / 导出 JSON、一键重置
 *  8. 实用工具：草稿定时保存、日期格式化、随机名言、控制台彩蛋
 *
 * 使用方式：在 index.html 中引入本文件即可。
 */
(function () {
  'use strict';

  /* =====================================================
   * 一、常量与存储键
   * ===================================================== */
  var STORAGE_KEYS = {
    posts: 'blog_posts_v1',        // 文章数据
    comments: 'blog_comments_v1',  // 评论数据
    likes: 'blog_likes_v1',        // 我点过赞的文章
    clikes: 'blog_clikes_v1',      // 我点过赞的评论
    theme: 'blog_theme_v1',        // 主题偏好
    visitor: 'blog_visitor_v1',    // 访客昵称
    auth: 'blog_auth_v1',          // 管理员登录状态
    drafts: 'blog_drafts_v1'       // 编辑器草稿
  };

  var ADMIN_PASSWORD = 'Aa2452088011';   // 管理员密码（可自行修改）
  var PAGE_SIZE = 6;                 // 首页每页文章数

  var QUOTES = [
    { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
    { text: '千里之行，始于足下。', author: '老子' },
    { text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子' },
    { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
    { text: '世上无难事，只怕有心人。', author: '俗语' },
    { text: '学而不思则罔，思而不学则殆。', author: '孔子' },
    { text: '你若盛开，清风自来。', author: '三毛' },
    { text: '生活明朗，万物可爱。', author: '海子' }
  ];

  /* =====================================================
   * 二、基础工具函数
   * ===================================================== */

  /** 生成唯一 id */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** 安全读取 localStorage */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) {
      console.warn('[blog] 读取本地数据失败：', key, e);
      return fallback;
    }
  }

  /** 安全写入 localStorage */
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[blog] 保存本地数据失败：', key, e);
      return false;
    }
  }

  /** HTML 转义，防止 XSS */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 防抖 */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
    };
  }

  /** 数字千分位 */
  function formatNumber(n) {
    n = Number(n) || 0;
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 格式化日期：可传时间戳或字符串 */
  function formatDate(input, withTime) {
    var d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '未知时间';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    if (!withTime) return y + '-' + m + '-' + day;
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
  }

  /** 相对时间 */
  function timeAgo(ts) {
    var diff = Date.now() - Number(ts);
    if (diff < 0) diff = 0;
    var minute = 60 * 1000, hour = 60 * minute, day = 24 * hour;
    if (diff < minute) return '刚刚';
    if (diff < hour) return Math.floor(diff / minute) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 30 * day) return Math.floor(diff / day) + ' 天前';
    return formatDate(ts);
  }

  /** 计算正文字数（中英文混合） */
  function countWords(markdown) {
    var text = String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')   // 去掉代码块
      .replace(/[#>*_`\-|[\]()!]/g, ' '); // 去掉标记符号
    var en = (text.match(/[A-Za-z0-9'’-]+/g) || []).length;
    var cn = (text.match(/[一-龥]/g) || []).length;
    return en + cn;
  }

  /** 阅读时间（分钟） */
  function readingMinutes(markdown) {
    return Math.max(1, Math.ceil(countWords(markdown) / 450));
  }

  /** 简单摘要 */
  function makeExcerpt(markdown, len) {
    var text = String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    len = len || 140;
    return text.length > len ? text.slice(0, len) + '…' : text;
  }

  /** 随机取一句名言 */
  function randomQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  /** 模拟异步（用于登录、发布等，让 loading 动画可见） */
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** 图标（内联 SVG，不依赖外部图标库） */
  var ICONS = {
    menu: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
    write: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3-1-6z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3A5 5 0 0 0 13.5 3.5l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3A5 5 0 0 0 10.5 20.5l1.7-1.7"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    tag: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4L11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',
    top: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
  };

  /* =====================================================
   * 三、Markdown 轻量渲染器
   * ===================================================== */
  var Markdown = (function () {

    /** 行内格式渲染 */
    function inline(src) {
      var s = String(src == null ? '' : src);
      // 先抽取行内代码，避免内部被转义和加粗
      var codes = [];
      s = s.replace(/`([^`]+)`/g, function (_, c) {
        codes.push('<code>' + escapeHtml(c) + '</code>');
        return '\u0000' + (codes.length - 1) + '\u0000';
      });

      s = escapeHtml(s);

      // 图片（渲染前把原始地址暂存）
      var images = [];
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (_, alt, url, title) {
        var html = '<img src="' + url + '" alt="' + alt + '"' +
          (title ? ' title="' + title + '"' : '') +
          ' loading="lazy" decoding="async">';
        images.push(html);
        return '\u0001' + (images.length - 1) + '\u0001';
      });

      // 链接
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (_, text, url, title) {
        var external = /^https?:/i.test(url);
        return '<a href="' + url + '"' +
          (title ? ' title="' + title + '"' : '') +
          (external ? ' target="_blank" rel="noopener noreferrer nofollow"' : '') +
          '>' + text + '</a>';
      });

      // 引用
      s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
      // 加粗
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      // 删除线
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      // 斜体（避免与加粗冲突，加粗已处理完）
      s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
      s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

      // 还原图片与行内代码
      s = s.replace(/\u0001(\d+)\u0001/g, function (_, i) { return images[+i]; });
      s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
      return s;
    }

    /** 生成标题锚点 id */
    function slugify(text, index) {
      var s = String(text).toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return 'h-' + (s || 'section') + '-' + index;
    }

    /** 把行内代码中的占位符号还原 */
    function restoreInlineCode(text) {
      return text.replace(/\u0000(\d+)\u0000/g, '<code>$1</code>');
    }

    /**
     * 渲染 Markdown → HTML
     * @param {string} src 原始 Markdown
     * @param {Object} opts { headingIndex:{n:0} } 用于跨块共享标题序号
     */
    function render(src, opts) {
      opts = opts || {};
      var headingIndex = opts.headingIndex || { n: 0 };
      var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
      var html = [];
      var i = 0;

      function isTableSeparator(line) {
        return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
      }

      function cells(line) {
        var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
        return t.split('|').map(function (c) { return c.trim(); });
      }

      while (i < lines.length) {
        var line = lines[i];

        // ---- 空行 ----
        if (/^\s*$/.test(line)) { i++; continue; }

        // ---- 代码块 ----
        var fence = line.match(/^```\s*([\w+-]*)\s*$/);
        if (fence) {
          var lang = fence[1] || '';
          var buf = [];
          i++;
          while (i < lines.length && !/^```\s*$/.test(lines[i])) {
            buf.push(lines[i]);
            i++;
          }
          i++; // 跳过结尾 ```
          var raw = escapeHtml(buf.join('\n'));
          html.push(
            '<div class="code-block">' +
              (lang ? '<div class="code-lang">' + escapeHtml(lang) + '</div>' : '') +
              '<pre><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' +
                raw + '\n</code></pre>' +
            '</div>'
          );
          continue;
        }

        // ---- 行内代码占位（防止跨行误判） ----
        if (/`[^`\n]+`/.test(line)) {
          line = line.replace(/`([^`\n]+)`/g, function (_, c) {
            return '\u0000' + escapeHtml(c).replace(/\u0000/g, '') + '\u0000';
          });
        }

        // ---- 标题 ----
        var h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
          var level = h[1].length;
          headingIndex.n++;
          var hid = slugify(h[2], headingIndex.n);
          html.push(
            '<h' + level + ' id="' + hid + '" class="md-heading">' +
              '<a class="heading-anchor" href="#' + hid + '" aria-label="锚点链接">#</a>' +
              inline(h[2]) +
            '</h' + level + '>'
          );
          i++; continue;
        }

        // ---- 分割线 ----
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          html.push('<hr>');
          i++; continue;
        }

        // ---- 引用 ----
        if (/^\s*>\s?/.test(line)) {
          var quoteBuf = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quoteBuf.push(lines[i].replace(/^\s*>\s?/, ''));
            i++;
          }
          var inner = quoteBuf.join('\n');
          var subIndex = { n: headingIndex.n };
          var rendered = render(inner, { headingIndex: subIndex }).html;
          headingIndex.n = subIndex.n;
          html.push('<blockquote>' + rendered + '</blockquote>');
          i++; continue;
        }

        // ---- 无序列表 ----
        if (/^\s*[-*+]\s+/.test(line)) {
          var ul = parseList(lines, i, function (s) { return /^\s*[-*+]\s+/.test(s); }, function (s) { return s.replace(/^\s*[-*+]\s+/, ''); });
          html.push('<ul>' + ul.items.map(function (t) {
            return '<li>' + inline(t) + '</li>';
          }).join('') + '</ul>');
          i = ul.next; continue;
        }

        // ---- 有序列表 ----
        if (/^\s*\d+[.)]\s+/.test(line)) {
          var ol = parseList(lines, i, function (s) { return /^\s*\d+[.)]\s+/.test(s); }, function (s) { return s.replace(/^\s*\d+[.)]\s+/, ''); });
          html.push('<ol>' + ol.items.map(function (t) {
            return '<li>' + inline(t) + '</li>';
          }).join('') + '</ol>');
          i = ol.next; continue;
        }

        // ---- 表格 ----
        if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
          var head = cells(line);
          i += 2;
          var body = [];
          while (i < lines.length && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) {
            body.push(cells(lines[i]));
            i++;
          }
          var thead = '<thead><tr>' + head.map(function (c) {
            return '<th>' + inline(c) + '</th>';
          }).join('') + '</tr></thead>';
          var tbody = '<tbody>' + body.map(function (row) {
            return '<tr>' + row.map(function (c) {
              return '<td>' + inline(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody>';
          html.push('<div class="table-wrap"><table>' + thead + tbody + '</table></div>');
          i++; continue;
        }

        // ---- 段落 ----
        var para = [];
        while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
          para.push(lines[i]);
          i++;
        }
        if (para.length) {
          html.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
        } else {
          i++;
        }
      }

      // 恢复被占位的行内代码
      return {
        html: html.join('\n').replace(/\u0000/g, '<code>').replace(/\u0000/g, '</code>'),
        headingIndex: headingIndex
      };
    }

    /** 判断是否是新块的开始 */
    function isBlockStart(line) {
      return /^(#{1,6})\s+/.test(line) ||
        /^```/.test(line) ||
        /^\s*[-*+]\s+/.test(line) ||
        /^\s*\d+[.)]\s+/.test(line) ||
        /^\s*>\s?/.test(line) ||
        /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
    }

    /** 解析列表（从 offset 行开始，绝不改动调用方的行游标） */
    function parseList(lines, offset, match, strip) {
      var items = [];
      var i = offset;
      while (i < lines.length && match(lines[i])) {
        var text = strip(lines[i]);
        i++;
        // 支持缩进的续行
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !match(lines[i]) && !/^\s*[-*+]\s/.test(lines[i])) {
          text += ' ' + lines[i].trim();
          i++;
        }
        items.push(text);
      }
      return { items: items, next: i };
    }

    return { render: render, inline: inline };
  })();

  /* =====================================================
   * 四、语法高亮（自研极简版，支持常用语言）
   * ===================================================== */
  function highlightCode(root) {
    var rules = [
      { cls: 'hlc-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|--[^\n]*|<!--[\s\S]*?-->)/ },
      { cls: 'hlc-string', re: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/ },
      { cls: 'hlc-number', re: /\b(\d+(?:\.\d+)?)\b/ },
      { cls: 'hlc-keyword', re: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|delete|typeof|instanceof|class|extends|super|this|import|export|from|default|async|await|try|catch|finally|throw|in|of|void|yield|static|public|private|protected|interface|type|enum|implements|null|undefined|true|false|def|elif|lambda|pass|with|as|not|and|or|is|None|True|False|print|require|module|package|func|go|chan|map|struct|nil|end|then|do)\b/ },
      { cls: 'hlc-fn', re: /\b([A-Za-z_$][\w$]*)(?=\s*\()/ },
      { cls: 'hlc-var', re: /\b([A-Za-z_$][\w$]*)\b/ }
    ];

    Array.prototype.forEach.call(root.querySelectorAll('pre code'), function (el) {
      var raw = el.textContent;
      var html = '';
      var pos = 0;
      var len = raw.length;

      while (pos < len) {
        var matched = null, cls = '', consumed = 0;
        for (var r = 0; r < rules.length; r++) {
          var m = rules[r].re.exec(raw.slice(pos));
          if (m && m.index === 0) { matched = m; cls = rules[r].cls; break; }
        }
        if (matched) {
          html += escapeHtml(raw.slice(pos, pos + matched[0].length))
            .replace(/^/, '<span class="' + cls + '">')
            .replace(/$/, '</span>');
          consumed = matched[0].length;
        } else {
          html += escapeHtml(raw[pos]);
          consumed = 1;
        }
        pos += consumed;
      }
      el.innerHTML = html;
      el.classList.add('highlighted');
    });
  }

  /* =====================================================
   * 五、应用状态
   * ===================================================== */
  var state = {
    posts: load(STORAGE_KEYS.posts, null),
    comments: load(STORAGE_KEYS.comments, null),
    likedPosts: load(STORAGE_KEYS.likes, []),
    likedComments: load(STORAGE_KEYS.clikes, []),
    visitor: load(STORAGE_KEYS.visitor, null),
    isAdmin: sessionStorage.getItem(STORAGE_KEYS.auth) === '1',
    theme: localStorage.getItem(STORAGE_KEYS.theme) || 'auto',

    // 视图状态
    view: 'home',          // home | post | about
    page: 1,
    query: '',
    category: '全部',
    tag: '',
    sort: 'new',           // new | hot
    editingId: null,       // null=新建，否则为文章 id
    replyingTo: null,      // 正在回复的评论 id
    backTarget: 'home'
  };

  /* =====================================================
   * 六、示例数据
   * ===================================================== */
  function samplePosts() {
    var now = Date.now();
    var day = 24 * 60 * 60 * 1000;
    return [
      {
        id: 'post_welcome',
        title: '欢迎来到我的博客',
        category: '随笔',
        tags: ['公告', '博客'],
        cover: '',
        pinned: true,
        status: 'published',
        likes: 12,
        views: 108,
        created: now - 1 * day,
        updated: now - 1 * day,
        content: [
          '你好，欢迎来到我的个人博客！这是一个**纯前端实现**的博客系统，所有数据都保存在浏览器的 `localStorage` 中，无需任何后端服务。',
          '',
          '## 这个博客能做什么',
          '',
          '- 📝 完整的文章管理：发布、编辑、删除、置顶、草稿',
          '- 🏷️ 分类与标签筛选，支持全文搜索',
          '- 💬 评论系统：楼中楼回复、点赞',
          '- 🌗 亮色 / 暗色主题切换',
          '- 📱 响应式布局，手机也能舒服阅读',
          '- 💾 数据导入导出，换电脑不丢内容',
          '',
          '## 快速上手',
          '',
          '1. 点击右上角 **写文章** 即可创建新内容（需管理员登录）',
          '2. 在关于页面可以修改站点信息',
          '3. 底部工具区支持导出全部数据为 JSON 文件',
          '',
          '> 提示：默认管理员密码是 `admin123`，可在 `blog.js` 顶部的 `ADMIN_PASSWORD` 常量中修改。',
          '',
          '祝你写得开心！'
        ].join('\n')
      },
      {
        id: 'post_js_guide',
        title: 'JavaScript 闭包与作用域详解',
        category: '前端开发',
        tags: ['JavaScript', '教程'],
        cover: '',
        pinned: false,
        status: 'published',
        likes: 8,
        views: 76,
        created: now - 3 * day,
        updated: now - 3 * day,
        content: [
          '闭包是 JavaScript 最核心的概念之一，理解它才能真正理解这门语言的运行机制。',
          '',
          '## 什么是闭包',
          '',
          '> 闭包是指**能够访问其词法作用域外部变量的函数**，即使该函数在其原始作用域之外被执行。',
          '',
          '简单例子：',
          '',
          '```js',
          'function createCounter() {',
          '  let count = 0;           // 私有变量',
          '  return function () {',
          '    count += 1;',
          '    return count;',
          '  };',
          '}',
          '',
          'const counter = createCounter();',
          'console.log(counter()); // 1',
          'console.log(counter()); // 2',
          'console.log(counter()); // 3',
          '```',
          '',
          '`count` 变量被返回的函数"记住"了，这就是闭包。',
          '',
          '## 典型应用场景',
          '',
          '| 场景 | 说明 |',
          '| --- | --- |',
          '| 数据私有 | 模拟私有变量，外部无法直接访问 |',
          '| 函数工厂 | 返回定制化行为的函数 |',
          '| 缓存 / 记忆化 | 缓存计算结果避免重复计算 |',
          '| 事件回调 | 保持对创建时上下文的引用 |',
          '',
          '## 注意事项',
          '',
          '1. 闭包会让变量常驻内存，滥用会导致**内存泄漏**',
          '2. 循环中创建闭包要使用 `let` 或 IIFE 固定变量',
          '3. 理解作用域链是排查变量覆盖问题的关键',
          '',
          '```js',
          '// 经典面试题：循环中的闭包',
          'for (var i = 0; i < 3; i++) {',
          '  setTimeout(() => console.log(i), 100);',
          '} // 输出 3 3 3',
          '',
          'for (let j = 0; j < 3; j++) {',
          '  setTimeout(() => console.log(j), 100);',
          '} // 输出 0 1 2',
          '```'
        ].join('\n')
      },
      {
        id: 'post_css_layout',
        title: 'CSS 布局技巧：从 Flexbox 到 Grid',
        category: '前端开发',
        tags: ['CSS', '教程'],
        cover: '',
        pinned: false,
        status: 'published',
        likes: 5,
        views: 54,
        created: now - 6 * day,
        updated: now - 5 * day,
        content: [
          '现代 CSS 提供了两套强大的布局系统：**Flexbox** 负责一维布局，**Grid** 负责二维布局。',
          '',
          '## Flexbox 一维布局',
          '',
          '```css',
          '.nav {',
          '  display: flex;',
          '  align-items: center;    /* 交叉轴居中 */',
          '  justify-content: space-between;',
          '  gap: 16px;',
          '}',
          '```',
          '',
          '适合导航栏、工具条、卡片内文字与按钮的水平排布。',
          '',
          '## Grid 二维布局',
          '',
          '```css',
          '.posts {',
          '  display: grid;',
          '  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));',
          '  gap: 20px;',
          '}',
          '```',
          '',
          '一行代码就能实现**自适应瀑布流卡片**，非常适合博客文章列表。',
          '',
          '## 如何选择',
          '',
          '- 只有一个方向需要对齐 → 用 Flexbox',
          '- 行和列都需要控制 → 用 Grid',
          '- 现代实践中两者常常**配合使用**，并不互斥'
        ].join('\n')
      },
      {
        id: 'post_read_list',
        title: '我的 2025 阅读书单与心得',
        category: '生活记录',
        tags: ['读书', '思考'],
        cover: '',
        pinned: false,
        status: 'published',
        likes: 6,
        views: 43,
        created: now - 12 * day,
        updated: now - 12 * day,
        content: [
          '过去一年我读完了 18 本书，这里挑选三本最有收获的记录一下。',
          '',
          '## 《纳瓦尔宝典》',
          '',
          '关于财富与幸福的箴言合集。核心观点：**用杠杆放大判断力**，并把时间花在复利效应的事情上。',
          '',
          '## 《置身事内》',
          '',
          '理解中国经济的绝佳入门书，把地方政府的行为逻辑讲得非常清楚。',
          '',
          '## 《被讨厌的勇气》',
          '',
          '阿德勒心理学的对话体普及读物。"课题分离"这个概念让我在人际交往中轻松了很多。',
          '',
          '> 阅读不在于数量，而在于是否改变了你的某个行为。',
          '',
          '## 一些读书习惯',
          '',
          '1. 每天固定 30 分钟，睡前不带手机',
          '2. 边读边写批注，读完必写一段总结',
          '3. 同时最多读两本，一本专业、一本休闲'
        ].join('\n')
      },
      {
        id: 'post_draft_tools',
        title: '高效开发者的 10 个 VS Code 插件',
        category: '工具分享',
        tags: ['工具', '效率'],
        cover: '',
        pinned: false,
        status: 'draft',
        likes: 0,
        views: 0,
        created: now - 2 * day,
        updated: now - 2 * day,
        content: [
          '（这是一篇**草稿**，点击发布后才会出现在首页。）',
          '',
          '1. Prettier — 代码格式化',
          '2. ESLint — 语法检查',
          '3. GitLens — Git 增强',
          '4. Error Lens — 错误内联显示',
          '5. Path Intellisense — 路径自动补全'
        ].join('\n')
      }
    ];
  }

  function sampleComments() {
    var now = Date.now();
    var day = 24 * 60 * 60 * 1000;
    return [
      {
        id: 'c_1', postId: 'post_welcome', parentId: null,
        nickname: '小明', content: '博客写得很不错，界面很清爽！',
        likes: 3, admin: false, created: now - 20 * 60 * 60 * 1000
      },
      {
        id: 'c_2', postId: 'post_welcome', parentId: 'c_1',
        nickname: '博主', content: '谢谢支持，欢迎常来～',
        likes: 1, admin: true, created: now - 19 * 60 * 60 * 1000
      },
      {
        id: 'c_3', postId: 'post_js_guide', parentId: null,
        nickname: '路过的前端', content: '闭包这段讲得清楚，循环闭包的面试题也解释明白了。',
        likes: 5, admin: false, created: now - 2 * day
      }
    ];
  }

  /** 首次运行时初始化数据 */
  function ensureData() {
    if (!state.posts || !Array.isArray(state.posts)) {
      state.posts = samplePosts();
      save(STORAGE_KEYS.posts, state.posts);
    }
    if (!state.comments || !Array.isArray(state.comments)) {
      state.comments = sampleComments();
      save(STORAGE_KEYS.comments, state.comments);
    }
  }

  /** 持久化 */
  function persistPosts() { save(STORAGE_KEYS.posts, state.posts); }
  function persistComments() { save(STORAGE_KEYS.comments, state.comments); }

  /* =====================================================
   * 七、站点配置（关于页面可编辑）
   * ===================================================== */
  var DEFAULT_CONFIG = {
    siteName: 'My Blog',
    slogan: '记录 · 思考 · 分享',
    author: '博主',
    avatar: '',
    bio: '一个热爱技术与生活的普通人，这里是我的自留地。',
    github: '',
    email: '',
    about: [
      '欢迎来到我的个人博客。',
      '',
      '这里主要记录**前端技术**、读书笔记与生活随想。所有文章均为原创，转载请注明出处。',
      '',
      '如果你对文章有疑问，欢迎在评论区留言交流。'
    ].join('\n')
  };

  function getConfig() {
    return Object.assign({}, DEFAULT_CONFIG, load('blog_config_v1', {}));
  }
  function setConfig(cfg) {
    save('blog_config_v1', cfg);
  }

  /* =====================================================
   * 八、路由（hash 路由）
   * ===================================================== */
  function parseHash() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'post' && parts[1]) return { name: 'post', id: parts[1] };
    if (parts[0] === 'about') return { name: 'about' };
    if (parts[0] === 'search') return { name: 'home', query: parts[1] || '' };
    return { name: 'home' };
  }

  function navigate(hash, replace) {
    if (replace) {
      history.replaceState(null, '', hash);
      handleRoute();
    } else {
      location.hash = hash;
    }
  }

  function handleRoute() {
    var r = parseHash();
    window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement ? 'auto' : 'auto' });

    if (r.name === 'post') {
      var post = state.posts.find(function (p) { return p.id === r.id; });
      if (post && post.status === 'published') {
        state.view = 'post';
        state.backTarget = 'home';
        renderPostPage(post);
        return;
      }
      // 找不到 → 提示并回首页
      toast('文章不存在或已被删除', 'error');
      navigate('#/', true);
      return;
    }

    if (r.name === 'about') {
      state.view = 'about';
      renderAboutPage();
      return;
    }

    state.view = 'home';
    if (typeof r.query === 'string') state.query = r.query;
    renderHomePage();
  }

  /* =====================================================
   * 九、首页渲染
   * ===================================================== */

  /** 获取筛选后的文章列表 */
  function getFilteredPosts(opts) {
    opts = opts || {};
    var includeDrafts = opts.includeDrafts && state.isAdmin;
    var list = state.posts.filter(function (p) {
      if (!includeDrafts && p.status !== 'published') return false;
      if (state.category !== '全部' && p.category !== state.category) return false;
      if (state.tag && (p.tags || []).indexOf(state.tag) === -1) return false;
      if (state.query) {
        var q = state.query.toLowerCase();
        var hay = (p.title + ' ' + p.content + ' ' + (p.tags || []).join(' ') + ' ' + p.category).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    // 置顶始终在最前
    list.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (state.sort === 'hot') return (b.views + b.likes * 3) - (a.views + a.likes * 3);
      return b.created - a.created;
    });
    return list;
  }

  /** 统计信息 */
  function getStats() {
    var published = state.posts.filter(function (p) { return p.status === 'published'; });
    var totalWords = published.reduce(function (s, p) { return s + countWords(p.content); }, 0);
    var totalViews = published.reduce(function (s, p) { return s + (p.views || 0); }, 0);
    return {
      posts: published.length,
      words: totalWords,
      views: totalViews,
      tags: new Set(published.reduce(function (acc, p) { return acc.concat(p.tags || []); }, [])).size
    };
  }

  function renderHomePage() {
    var app = document.getElementById('app');
    var list = getFilteredPosts();
    var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = 1;
    var pageItems = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var stats = getStats();
    var cfg = getConfig();
    var quote = randomQuote();

    var categories = ['全部'].concat(
      Array.from(new Set(state.posts.filter(function (p) { return p.status === 'published'; })
        .map(function (p) { return p.category; })))
    );
    var tagCloud = {};
    state.posts.filter(function (p) { return p.status === 'published'; }).forEach(function (p) {
      (p.tags || []).forEach(function (t) { tagCloud[t] = (tagCloud[t] || 0) + 1; });
    });

    var html = '';

    /* ---------- Hero 区 ---------- */
    if (!state.query && state.category === '全部' && !state.tag) {
      html += [
        '<section class="hero reveal">',
        '  <div class="hero-inner">',
        '    <div class="hero-avatar">' + renderAvatar(cfg, 96) + '</div>',
        '    <h1 class="hero-title">' + escapeHtml(cfg.siteName) + '</h1>',
        '    <p class="hero-slogan">' + escapeHtml(cfg.slogan) + '</p>',
        '    <div class="hero-quote">「' + escapeHtml(quote.text) + '」<span>—— ' + escapeHtml(quote.author) + '</span></div>',
        '    <div class="hero-stats">',
        '      <div class="stat"><b>' + stats.posts + '</b><span>文章</span></div>',
        '      <div class="stat"><b>' + stats.tags + '</b><span>标签</span></div>',
        '      <div class="stat"><b>' + formatNumber(stats.views) + '</b><span>阅读</span></div>',
        '      <div class="stat"><b>' + (stats.words >= 10000 ? (stats.words / 10000).toFixed(1) + 'w' : formatNumber(stats.words)) + '</b><span>字数</span></div>',
        '    </div>',
        '    <button class="btn btn-primary hero-cta" data-action="scroll-to-list">开始阅读 →</button>',
        '  </div>',
        '</section>'
      ].join('\n');
    }

    html += '<div class="layout container">';

    /* ---------- 主内容 ---------- */
    html += '<main class="main-col" id="post-list">';

    // 搜索 / 筛选状态条
    if (state.query || state.category !== '全部' || state.tag) {
      html += '<div class="filter-bar reveal">';
      html += '<span>当前筛选：';
      if (state.query) html += '<em class="chip chip-active">搜索「' + escapeHtml(state.query) + '」</em>';
      if (state.category !== '全部') html += '<em class="chip chip-active">分类：' + escapeHtml(state.category) + '</em>';
      if (state.tag) html += '<em class="chip chip-active">标签：#' + escapeHtml(state.tag) + '</em>';
      html += '</span><button class="btn btn-ghost btn-sm" data-action="clear-filter">清除筛选</button></div>';
    }

    // 排序 + 标题
    html += '<div class="list-head reveal">';
    html += '<h2 class="section-title">' + (state.query ? '搜索结果' : '最新文章') +
      ' <span class="count">' + list.length + '</span></h2>';
    html += '<div class="sort-tabs">';
    html += '<button class="sort-tab' + (state.sort === 'new' ? ' active' : '') + '" data-sort="new">最新</button>';
    html += '<button class="sort-tab' + (state.sort === 'hot' ? ' active' : '') + '" data-sort="hot">最热</button>';
    html += '</div></div>';

    if (!pageItems.length) {
      html += '<div class="empty-state reveal">' +
        '<div class="empty-icon">📭</div>' +
        '<p>没有找到匹配的文章</p>' +
        (state.query || state.category !== '全部' || state.tag
          ? '<button class="btn btn-primary btn-sm" data-action="clear-filter">清除筛选条件</button>'
          : (state.isAdmin ? '<button class="btn btn-primary btn-sm" data-action="new-post">写第一篇文章</button>' : '')) +
        '</div>';
    } else {
      html += '<div class="post-cards">';
      pageItems.forEach(function (p, idx) { html += postCard(p, idx); });
      html += '</div>';

      // 分页
      if (totalPages > 1) {
        html += '<nav class="pagination reveal" aria-label="分页">';
        html += '<button class="page-btn" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>‹ 上一页</button>';
        for (var pg = 1; pg <= totalPages; pg++) {
          html += '<button class="page-btn' + (pg === state.page ? ' active' : '') + '" data-page="' + pg + '">' + pg + '</button>';
        }
        html += '<button class="page-btn" data-page="' + (state.page + 1) + '"' + (state.page === totalPages ? ' disabled' : '') + '>下一页 ›</button>';
        html += '</nav>';
      }
    }

    html += '</main>';

    /* ---------- 侧边栏 ---------- */
    html += '<aside class="side-col">';

    // 个人卡片
    html += [
      '<div class="widget author-widget reveal">',
      '  <div class="author-cover"></div>',
      '  <div class="author-body">',
      '    <div class="author-avatar">' + renderAvatar(cfg, 72) + '</div>',
      '    <h3>' + escapeHtml(cfg.author) + '</h3>',
      '    <p>' + escapeHtml(cfg.bio) + '</p>',
      '    <div class="author-links">',
      cfg.github ? '<a href="' + escapeHtml(cfg.github) + '" target="_blank" rel="noopener">GitHub</a>' : '',
      cfg.email ? '<a href="mailto:' + escapeHtml(cfg.email) + '">Email</a>' : '',
      '      <a href="#/about">关于</a>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    // 分类
    html += '<div class="widget reveal"><h4 class="widget-title">文章分类</h4><div class="cat-list">';
    categories.forEach(function (c) {
      var n = c === '全部'
        ? state.posts.filter(function (p) { return p.status === 'published'; }).length
        : state.posts.filter(function (p) { return p.status === 'published' && p.category === c; }).length;
      html += '<button class="cat-item' + (state.category === c ? ' active' : '') + '" data-category="' + escapeHtml(c) + '">' +
        '<span>' + escapeHtml(c) + '</span><b>' + n + '</b></button>';
    });
    html += '</div></div>';

    // 标签云
    var tagKeys = Object.keys(tagCloud);
    if (tagKeys.length) {
      html += '<div class="widget reveal"><h4 class="widget-title">标签云</h4><div class="tag-cloud">';
      tagKeys.forEach(function (t) {
        html += '<button class="tag-chip' + (state.tag === t ? ' active' : '') + '" data-tag="' + escapeHtml(t) + '">#' +
          escapeHtml(t) + '<i>' + tagCloud[t] + '</i></button>';
      });
      html += '</div></div>';
    }

    // 热门文章
    var hot = state.posts.filter(function (p) { return p.status === 'published'; })
      .slice().sort(function (a, b) { return (b.views || 0) - (a.views || 0); }).slice(0, 5);
    html += '<div class="widget reveal"><h4 class="widget-title">热门文章</h4><ol class="hot-list">';
    hot.forEach(function (p, i) {
      html += '<li><em>' + (i + 1) + '</em><a href="#/post/' + p.id + '">' + escapeHtml(p.title) + '</a></li>';
    });
    html += '</ol></div>';

    // 站点信息
    html += '<div class="widget reveal"><h4 class="widget-title">站点信息</h4><ul class="site-info">' +
      '<li><span>文章总数</span><b>' + stats.posts + ' 篇</b></li>' +
      '<li><span>标签总数</span><b>' + stats.tags + ' 个</b></li>' +
      '<li><span>总字数</span><b>' + formatNumber(stats.words) + '</b></li>' +
      '<li><span>总阅读量</span><b>' + formatNumber(stats.views) + '</b></li>' +
      '<li><span>运行模式</span><b>纯前端 · 本地存储</b></li>' +
      '</ul></div>';

    // 管理工具
    if (state.isAdmin) {
      html += '<div class="widget reveal"><h4 class="widget-title">🛠 管理工具</h4><div class="tool-grid">' +
        '<button class="btn btn-ghost btn-sm" data-action="export">导出数据</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="import">导入数据</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="restore-samples">恢复示例</button>' +
        '<button class="btn btn-ghost btn-sm btn-danger" data-action="reset-all">清空数据</button>' +
        '</div></div>';
    }

    html += '</aside>';
    html += '</div>';

    app.innerHTML = html;
    afterRender();
  }

  function renderAvatar(cfg, size) {
    if (cfg.avatar) {
      return '<img src="' + escapeHtml(cfg.avatar) + '" alt="头像" width="' + size + '" height="' + size + '">';
    }
    var ch = (cfg.author || '博').trim().charAt(0) || '博';
    return '<span class="avatar-fallback" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px">' +
      escapeHtml(ch) + '</span>';
  }

  /** 文章卡片 */
  function postCard(p, idx) {
    var time = timeAgo(p.created);
    var words = countWords(p.content);
    var liked = state.likedPosts.indexOf(p.id) !== -1;
    var commentCount = state.comments.filter(function (c) { return c.postId === p.id; }).length;

    return [
      '<article class="post-card reveal' + (p.pinned ? ' pinned' : '') + '" style="--d:' + (idx % PAGE_SIZE) + '">',
      p.pinned ? '<div class="pin-badge">' + ICONS.pin + ' 置顶</div>' : '',
      p.status === 'draft' ? '<div class="draft-badge">草稿</div>' : '',
      '  <div class="post-card-body">',
      '    <div class="post-meta">',
      '      <span class="meta-cat">' + escapeHtml(p.category) + '</span>',
      '      <span>' + escapeHtml(time) + '</span>',
      '      <span>' + ICONS.eye + ' ' + formatNumber(p.views || 0) + '</span>',
      '      <span>' + ICONS.comment + ' ' + commentCount + '</span>',
      '    </div>',
      '    <h3 class="post-card-title"><a href="#/post/' + p.id + '">' + escapeHtml(p.title) + '</a></h3>',
      '    <p class="post-excerpt">' + escapeHtml(makeExcerpt(p.content)) + '</p>',
      '    <div class="post-tags">',
      (p.tags || []).map(function (t) {
        return '<button class="mini-tag" data-tag="' + escapeHtml(t) + '">' + ICONS.tag + escapeHtml(t) + '</button>';
      }).join(''),
      '    </div>',
      '  </div>',
      '  <footer class="post-card-foot">',
      '    <span class="reading-time">约 ' + readingMinutes(p.content) + ' 分钟 · ' + formatNumber(words) + ' 字</span>',
      '    <div class="card-actions">',
      '      <button class="icon-btn like-btn' + (liked ? ' liked' : '') + '" data-like="' + p.id + '" title="点赞">' + ICONS.heart + '<i>' + (p.likes || 0) + '</i></button>',
      state.isAdmin
        ? '<button class="icon-btn" data-edit="' + p.id + '" title="编辑">' + ICONS.edit + '</button>' +
          '<button class="icon-btn" data-pin="' + p.id + '" title="' + (p.pinned ? '取消置顶' : '置顶') + '">' + ICONS.pin + '</button>' +
          '<button class="icon-btn icon-danger" data-delete="' + p.id + '" title="删除">' + ICONS.trash + '</button>'
        : '<a class="icon-btn" href="#/post/' + p.id + '" title="阅读全文">→</a>',
      '    </div>',
      '  </footer>',
      '</article>'
    ].join('\n');
  }

  /* =====================================================
   * 十、文章详情页
   * ===================================================== */
  function renderPostPage(post) {
    post.views = (post.views || 0) + 1;
    persistPosts();

    var app = document.getElementById('app');
    var cfg = getConfig();
    var rendered = Markdown.render(post.content);

    var tocItems = [];
    var tmp = document.createElement('div');
    tmp.innerHTML = rendered.html;
    Array.prototype.forEach.call(tmp.querySelectorAll('.md-heading'), function (h) {
      tocItems.push({ id: h.id, level: Number(h.tagName.substring(1)), text: h.textContent.replace(/^#/, '') });
    });

    var related = state.posts
      .filter(function (p) { return p.status === 'published' && p.id !== post.id; })
      .map(function (p) {
        var overlap = (p.tags || []).filter(function (t) { return (post.tags || []).indexOf(t) !== -1; }).length;
        return { post: p, score: overlap * 10 + (p.category === post.category ? 5 : 0) };
      })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 3)
      .map(function (x) { return x.post; });

    var liked = state.likedPosts.indexOf(post.id) !== -1;

    var html = '';

    /* 阅读进度条 */
    html += '<div class="reading-progress" id="reading-progress"><span></span></div>';

    /* 文章主体 */
    html += '<div class="container article-layout">';

    html += '<article class="article-main reveal">';
    html += '<nav class="breadcrumb"><a href="#/">首页</a> <span>/</span> ' +
      '<a href="#/" data-category-link="' + escapeHtml(post.category) + '">' + escapeHtml(post.category) + '</a> ' +
      '<span>/</span> <em>' + escapeHtml(post.title) + '</em></nav>';

    html += '<header class="article-header">';
    if (post.pinned) html += '<div class="pin-badge">' + ICONS.pin + ' 置顶文章</div>';
    html += '<h1 class="article-title">' + escapeHtml(post.title) + '</h1>';
    html += '<div class="article-meta">';
    html += '<span>' + ICONS.eye + ' ' + formatNumber(post.views) + ' 阅读</span>';
    html += '<span>' + formatDate(post.created, true) + '</span>';
    html += '<span>约 ' + readingMinutes(post.content) + ' 分钟</span>';
    html += '<span>' + formatNumber(countWords(post.content)) + ' 字</span>';
    if (post.updated && post.updated !== post.created) {
      html += '<span>更新于 ' + formatDate(post.updated) + '</span>';
    }
    html += '</div>';
    if ((post.tags || []).length) {
      html += '<div class="post-tags">' + post.tags.map(function (t) {
        return '<button class="mini-tag" data-tag="' + escapeHtml(t) + '">' + ICONS.tag + escapeHtml(t) + '</button>';
      }).join('') + '</div>';
    }
    html += '</header>';

    html += '<div class="article-content markdown-body" id="article-content">' + rendered.html + '</div>';

    /* 互动栏 */
    html += '<footer class="article-foot">';
    html += '<div class="interact">';
    html += '<button class="big-like like-btn' + (liked ? ' liked' : '') + '" data-like="' + post.id + '">' +
      ICONS.heart + '<span>点赞</span><b>' + (post.likes || 0) + '</b></button>';
    html += '<button class="big-like" data-action="share">' + ICONS.link + '<span>复制链接</span></button>';
    if (state.isAdmin) {
      html += '<button class="big-like" data-edit="' + post.id + '">' + ICONS.edit + '<span>编辑</span></button>';
      html += '<button class="big-like" data-pin="' + post.id + '">' + ICONS.pin + '<span>' + (post.pinned ? '取消置顶' : '置顶') + '</span></button>';
      html += '<button class="big-like danger" data-delete="' + post.id + '">' + ICONS.trash + '<span>删除</span></button>';
    }
    html += '</div>';

    /* 上一篇 / 下一篇 */
    var sorted = state.posts.filter(function (p) { return p.status === 'published'; })
      .sort(function (a, b) { return b.created - a.created; });
    var idx = sorted.findIndex(function (p) { return p.id === post.id; });
    var prev = sorted[idx + 1] || null; // 更早
    var next = sorted[idx - 1] || null; // 更新
    html += '<div class="post-nav">';
    html += prev
      ? '<a class="post-nav-item" href="#/post/' + prev.id + '"><span>上一篇</span><b>‹ ' + escapeHtml(prev.title) + '</b></a>'
      : '<span class="post-nav-item disabled"><span>上一篇</span><b>没有了</b></span>';
    html += next
      ? '<a class="post-nav-item next" href="#/post/' + next.id + '"><span>下一篇</span><b>' + escapeHtml(next.title) + ' ›</b></a>'
      : '<span class="post-nav-item next disabled"><span>下一篇</span><b>没有了</b></span>';
    html += '</div>';

    /* 评论区 */
    html += renderComments(post.id);
    html += '</article>';

    /* 侧栏：目录 + 推荐 */
    html += '<aside class="side-col article-side">';
    if (tocItems.length > 1) {
      html += '<div class="widget toc-widget reveal" id="toc-widget"><h4 class="widget-title">文章目录</h4><nav class="toc-list">';
      tocItems.forEach(function (t) {
        html += '<a class="toc-item lvl-' + t.level + '" href="#' + t.id + '" data-toc="' + t.id + '">' + escapeHtml(t.text) + '</a>';
      });
      html += '</nav></div>';
    }
    html += '<div class="widget reveal"><h4 class="widget-title">相关推荐</h4><ul class="hot-list">';
    related.forEach(function (p) {
      html += '<li><em>' + ICONS.eye + '</em><a href="#/post/' + p.id + '">' + escapeHtml(p.title) + '</a></li>';
    });
    if (!related.length) html += '<li class="muted">暂无相关文章</li>';
    html += '</ul></div>';
    html += '<div class="widget reveal"><h4 class="widget-title">打赏</h4><div class="donate"><p>如果觉得文章有帮助，欢迎点赞鼓励 👇</p><button class="btn btn-primary btn-block" data-like="' + post.id + '">❤ 给作者点个赞</button></div></div>';
    html += '</aside>';

    html += '</div>';

    app.innerHTML = html;
    highlightCode(app);
    afterRender();
    initTocHighlight();
  }

  /* =====================================================
   * 十一、评论系统
   * ===================================================== */
  function getPostComments(postId) {
    return state.comments
      .filter(function (c) { return c.postId === postId; })
      .sort(function (a, b) { return a.created - b.created; });
  }

  function renderComments(postId) {
    var all = getPostComments(postId);
    var roots = all.filter(function (c) { return !c.parentId; });
    var html = '';

    html += '<section class="comments" id="comments">';
    html += '<h3 class="section-title">评论 <span class="count">' + all.length + '</span></h3>';

    /* 评论输入框 */
    var vname = state.visitor ? state.visitor.nickname : '';
    html += '<div class="comment-form" id="comment-form">';
    html += '<div class="form-row">';
    html += '<label>昵称</label><input type="text" id="c-nickname" maxlength="20" placeholder="怎么称呼你？" value="' + escapeHtml(vname) + '">';
    html += '</div>';
    html += '<div class="form-row">';
    html += '<label>评论</label><textarea id="c-content" rows="4" maxlength="500" placeholder="写下你的看法…（支持基础 Markdown）"></textarea>';
    html += '</div>';
    html += '<div class="form-foot">';
    html += '<span class="muted" id="c-count">0 / 500</span>';
    html += '<button class="btn btn-primary" id="btn-submit-comment" data-post="' + postId + '">发表评论</button>';
    html += '</div></div>';

    /* 评论列表 */
    html += '<div class="comment-list">';
    if (!roots.length) {
      html += '<div class="empty-state small"><div class="empty-icon">💬</div><p>还没有评论，来抢沙发～</p></div>';
    }
    roots.forEach(function (c, i) {
      html += commentItem(c, all, postId, i);
    });
    html += '</div>';
    html += '</section>';
    return html;
  }

  function commentItem(c, all, postId, index) {
    var children = all.filter(function (x) { return x.parentId === c.id; });
    var liked = state.likedComments.indexOf(c.id) !== -1;
    var isReplying = state.replyingTo === c.id;
    var isVisitor = state.visitor && state.visitor.nickname === c.nickname;

    var html = '';
    html += '<div class="comment-item reveal' + (c.admin ? ' admin' : '') + '" style="--d:' + index + '" id="comment-' + c.id + '">';
    html += '<div class="comment-avatar"><span>' + escapeHtml((c.nickname || '?').charAt(0)) + '</span></div>';
    html += '<div class="comment-main">';
    html += '<div class="comment-head">';
    html += '<b>' + escapeHtml(c.nickname) + '</b>';
    if (c.admin) html += '<em class="badge-admin">博主</em>';
    html += '<time title="' + formatDate(c.created, true) + '">' + timeAgo(c.created) + '</time>';
    html += '</div>';
    html += '<div class="comment-body markdown-body">' + Markdown.render(c.content).html + '</div>';
    html += '<div class="comment-actions">';
    html += '<button class="link-btn' + (liked ? ' liked' : '') + '" data-clike="' + c.id + '">' + ICONS.heart +
      '<i>' + (c.likes || 0) + '</i></button>';
    html += '<button class="link-btn" data-reply="' + c.id + '">回复</button>';
    if (state.isAdmin || isVisitor) {
      html += '<button class="link-btn danger" data-cdel="' + c.id + '">删除</button>';
    }
    html += '</div>';

    /* 回复表单 */
    if (isReplying) {
      html += '<div class="reply-box">';
      html += '<textarea id="reply-content" rows="3" maxlength="500" placeholder="回复 @' + escapeHtml(c.nickname) + '…"></textarea>';
      html += '<div class="form-foot">';
      html += '<button class="btn btn-ghost btn-sm" data-action="cancel-reply">取消</button>';
      html += '<button class="btn btn-primary btn-sm" data-send-reply="' + c.id + '" data-post="' + postId + '">回复</button>';
      html += '</div></div>';
    }

    /* 楼中楼 */
    if (children.length) {
      html += '<div class="comment-children">';
      children.forEach(function (ch) { html += commentItem(ch, all, postId, index); });
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  /** 发表评论 */
  function submitComment(postId) {
    var nameEl = document.getElementById('c-nickname');
    var contentEl = document.getElementById('c-content');
    var nickname = (nameEl && nameEl.value || '').trim();
    var content = (contentEl && contentEl.value || '').trim();

    if (!nickname) { toast('请先填写昵称', 'warning'); nameEl && nameEl.focus(); return; }
    if (nickname.length > 20) { toast('昵称不能超过 20 个字符', 'warning'); return; }
    if (!content) { toast('评论内容不能为空', 'warning'); contentEl && contentEl.focus(); return; }

    var isAdmin = state.isAdmin;
    var c = {
      id: uid('c'),
      postId: postId,
      parentId: null,
      nickname: isAdmin ? '博主' : nickname,
      content: content,
      likes: 0,
      admin: isAdmin,
      created: Date.now()
    };
    state.comments.push(c);
    persistComments();

    // 记住访客昵称
    if (!isAdmin) {
      state.visitor = { nickname: nickname };
      save(STORAGE_KEYS.visitor, state.visitor);
    }

    var post = state.posts.find(function (p) { return p.id === postId; });
    renderPostPage(post);
    setTimeout(function () {
      var el = document.getElementById('comment-' + c.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
      }
    }, 80);
    toast('评论发表成功', 'success');
  }

  /** 回复评论 */
  function submitReply(parentId, postId) {
    var box = document.getElementById('reply-content');
    var content = (box && box.value || '').trim();
    if (!content) { toast('回复内容不能为空', 'warning'); box && box.focus(); return; }

    var parent = state.comments.find(function (c) { return c.id === parentId; });
    var nickname = state.isAdmin ? '博主'
      : (state.visitor && state.visitor.nickname) || '匿名访客';

    state.comments.push({
      id: uid('c'),
      postId: postId,
      parentId: parentId,
      nickname: nickname,
      content: content,
      likes: 0,
      admin: state.isAdmin,
      created: Date.now()
    });
    persistComments();
    state.replyingTo = null;

    var post = state.posts.find(function (p) { return p.id === postId; });
    renderPostPage(post);
    toast('回复成功', 'success');
  }

  /* =====================================================
   * 十二、关于页面
   * ===================================================== */
  function renderAboutPage() {
    var app = document.getElementById('app');
    var cfg = getConfig();
    var html = '';

    html += '<div class="container narrow">';
    html += '<section class="about reveal">';
    html += '<div class="about-head">' + renderAvatar(cfg, 88) + '<div><h1>' + escapeHtml(cfg.author) + '</h1><p>' + escapeHtml(cfg.slogan) + '</p></div></div>';
    html += '<div class="markdown-body">' + Markdown.render(cfg.about).html + '</div>';

    html += '<div class="about-links">';
    if (cfg.github) html += '<a class="btn btn-ghost" href="' + escapeHtml(cfg.github) + '" target="_blank" rel="noopener">GitHub</a>';
    if (cfg.email) html += '<a class="btn btn-ghost" href="mailto:' + escapeHtml(cfg.email) + '">Email</a>';
    html += '<a class="btn btn-ghost" href="#/">返回首页</a>';
    html += '</div>';

    /* 站点设置（管理员） */
    if (state.isAdmin) {
      html += '<hr class="soft">';
      html += '<h2 class="section-title">⚙️ 站点设置</h2>';
      html += '<div class="settings-form">';
      html += field('站点名称', 'siteName', cfg.siteName);
      html += field('副标题 / 标语', 'slogan', cfg.slogan);
      html += field('作者昵称', 'author', cfg.author);
      html += field('头像图片 URL（留空则显示首字母）', 'avatar', cfg.avatar);
      html += field('一句话简介', 'bio', cfg.bio);
      html += field('GitHub 地址', 'github', cfg.github);
      html += field('联系邮箱', 'email', cfg.email);
      html += '<div class="form-row full"><label>关于我（支持 Markdown）</label>' +
        '<textarea id="set-about" rows="8">' + escapeHtml(cfg.about) + '</textarea></div>';
      html += '<div class="form-foot full"><span class="muted">修改后立即生效并保存到本地</span>' +
        '<button class="btn btn-primary" data-action="save-config">保存设置</button></div>';
      html += '</div>';
    }

    html += '</section></div>';

    app.innerHTML = html;
    highlightCode(app);
    afterRender();

    function field(label, key, val) {
      return '<div class="form-row"><label>' + escapeHtml(label) + '</label>' +
        '<input type="text" id="set-' + key + '" value="' + escapeHtml(val) + '"></div>';
    }
  }

  function saveConfigFromForm() {
    var cfg = getConfig();
    ['siteName', 'slogan', 'author', 'avatar', 'bio', 'github', 'email'].forEach(function (k) {
      var el = document.getElementById('set-' + k);
      if (el) cfg[k] = el.value.trim();
    });
    var about = document.getElementById('set-about');
    if (about) cfg.about = about.value;
    setConfig(cfg);
    renderHeader();
    toast('站点设置已保存', 'success');
    renderAboutPage();
  }

  /* =====================================================
   * 十三、写文章 / 编辑器
   * ===================================================== */
  function openEditor(postId) {
    if (!state.isAdmin) { openLogin(function () { openEditor(postId); }); return; }

    state.editingId = postId || null;
    var post = postId ? state.posts.find(function (p) { return p.id === postId; }) : null;
    var overlay = document.getElementById('editor-overlay');

    var title = post ? post.title : '';
    var cat = post ? post.category : '';
    var tags = post ? (post.tags || []).join(', ') : '';
    var content = post ? post.content : '';
    var pinned = post && post.pinned;

    // 恢复未发布的本地草稿（仅新建时）
    var drafts = load(STORAGE_KEYS.drafts, {});
    if (!post && drafts.title) {
      title = drafts.title; cat = drafts.category || '';
      tags = drafts.tags || ''; content = drafts.content || '';
      toast('已恢复上次未发布的草稿', 'info');
    }

    var categories = Array.from(new Set(state.posts.map(function (p) { return p.category; })));

    overlay.innerHTML = [
      '<div class="editor-panel" role="dialog" aria-modal="true" aria-label="写文章">',
      '  <header class="editor-head">',
      '    <h3>' + (post ? '✏️ 编辑文章' : '📝 写文章') + '</h3>',
      '    <div class="editor-head-actions">',
      '      <button class="btn btn-ghost btn-sm" data-action="close-editor">取消</button>',
      '      <button class="btn btn-ghost btn-sm" data-action="save-draft">存草稿</button>',
      '      <button class="btn btn-primary btn-sm" data-action="publish">' + (post && post.status === 'published' ? '保存修改' : '发布文章') + '</button>',
      '    </div>',
      '  </header>',
      '  <div class="editor-meta">',
      '    <input type="text" id="e-title" placeholder="文章标题…" maxlength="80" value="' + escapeHtml(title) + '">',
      '    <div class="editor-meta-row">',
      '      <input type="text" id="e-category" list="cat-list" placeholder="分类" maxlength="20" value="' + escapeHtml(cat) + '">',
      '      <datalist id="cat-list">' + categories.map(function (c) { return '<option value="' + escapeHtml(c) + '">'; }).join('') + '</datalist>',
      '      <input type="text" id="e-tags" placeholder="标签，用逗号分隔" value="' + escapeHtml(tags) + '">',
      '      <label class="check-label"><input type="checkbox" id="e-pinned"' + (pinned ? ' checked' : '') + '> 置顶</label>',
      '    </div>',
      '  </div>',
      '  <div class="editor-toolbar">',
      '    <button class="tool-btn" data-md="bold" title="加粗"><b>B</b></button>',
      '    <button class="tool-btn" data-md="italic" title="斜体"><i>I</i></button>',
      '    <button class="tool-btn" data-md="strike" title="删除线"><s>S</s></button>',
      '    <button class="tool-btn" data-md="h2" title="二级标题">H2</button>',
      '    <button class="tool-btn" data-md="h3" title="三级标题">H3</button>',
      '    <button class="tool-btn" data-md="quote" title="引用">❝</button>',
      '    <button class="tool-btn" data-md="code" title="代码块">&lt;/&gt;</button>',
      '    <button class="tool-btn" data-md="link" title="链接">🔗</button>',
      '    <button class="tool-btn" data-md="ul" title="无序列表">•≡</button>',
      '    <button class="tool-btn" data-md="ol" title="有序列表">1≡</button>',
      '    <button class="tool-btn" data-md="table" title="表格">▦</button>',
      '    <span class="tool-spacer"></span>',
      '    <button class="tool-btn" data-action="toggle-preview" id="btn-preview">👁 预览</button>',
      '  </div>',
      '  <div class="editor-body">',
      '    <textarea id="e-content" placeholder="开始写作…（支持 Markdown：# 一级标题、**加粗**、``` 代码块、> 引用、- 列表等）">' + escapeHtml(content) + '</textarea>',
      '    <div class="editor-preview markdown-body" id="e-preview" hidden></div>',
      '  </div>',
      '  <footer class="editor-foot">',
      '    <span class="muted" id="e-stats">0 字 · 约 1 分钟阅读</span>',
      '    <span class="muted" id="e-autosave"></span>',
      '  </footer>',
      '</div>'
    ].join('\n');

    overlay.classList.add('open');
    document.body.classList.add('no-scroll');

    var ta = document.getElementById('e-title');
    setTimeout(function () { ta && ta.focus(); }, 60);

    initEditorEvents();
  }

  function closeEditor(force) {
    var overlay = document.getElementById('editor-overlay');
    var content = document.getElementById('e-content');
    if (!force && content && content.value.trim() && !confirm('关闭后未保存的内容会保留在本地草稿中，确定关闭？')) return;

    // 自动保存草稿
    if (content && content.value.trim() && !state.editingId) {
      var t = document.getElementById('e-title');
      var c = document.getElementById('e-category');
      var g = document.getElementById('e-tags');
      save(STORAGE_KEYS.drafts, {
        title: t ? t.value : '',
        category: c ? c.value : '',
        tags: g ? g.value : '',
        content: content.value,
        saved: Date.now()
      });
    }

    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    state.editingId = null;
  }

  function initEditorEvents() {
    var content = document.getElementById('e-content');
    var title = document.getElementById('e-title');
    if (!content) return;

    // 工具栏
    document.querySelectorAll('[data-md]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyMarkdown(btn.getAttribute('data-md')); });
    });

    // 字数统计 + 预览
    var update = debounce(function () {
      var words = countWords(content.value);
      var stats = document.getElementById('e-stats');
      if (stats) stats.textContent = formatNumber(words) + ' 字 · 约 ' + Math.max(1, Math.ceil(words / 450)) + ' 分钟阅读';
      var preview = document.getElementById('e-preview');
      if (preview && !preview.hidden) {
        preview.innerHTML = Markdown.render(content.value).html;
        highlightCode(preview);
      }
    }, 200);
    content.addEventListener('input', update);
    title.addEventListener('input', update);
    update();

    // 自动保存（每 8 秒）
    clearInterval(window.__blogAutoSave);
    window.__blogAutoSave = setInterval(function () {
      if (!state.editingId && content && content.value.trim()) {
        save(STORAGE_KEYS.drafts, {
          title: title.value,
          category: (document.getElementById('e-category') || {}).value || '',
          tags: (document.getElementById('e-tags') || {}).value || '',
          content: content.value,
          saved: Date.now()
        });
        var el = document.getElementById('e-autosave');
        if (el) el.textContent = '已自动保存 ' + formatDate(Date.now(), true);
        renderHeader(); // 让导航栏草稿角标更新
      }
    }, 8000);
  }

  /** 工具栏插入 Markdown */
  function applyMarkdown(action) {
    var ta = document.getElementById('e-content');
    if (!ta) return;
    var start = ta.selectionStart, end = ta.selectionEnd;
    var selected = ta.value.slice(start, end);
    var before = ta.value.slice(0, start);
    var after = ta.value.slice(end);
    var ins = '', caret = 0;

    function linePrefix(prefix) {
      var lineStart = before.lastIndexOf('\n') + 1;
      var lineText = ta.value.slice(lineStart, end);
      return before.slice(0, lineStart) + lineText.split('\n').map(function (l) {
        return prefix + l;
      }).join('\n');
    }

    switch (action) {
      case 'bold': ins = '**' + (selected || '加粗文本') + '**'; caret = 2; break;
      case 'italic': ins = '*' + (selected || '斜体文本') + '*'; caret = 1; break;
      case 'strike': ins = '~~' + (selected || '删除线') + '~~'; caret = 2; break;
      case 'h2': before = linePrefix('## '); ins = ''; break;
      case 'h3': before = linePrefix('### '); ins = ''; break;
      case 'quote': before = linePrefix('> '); ins = ''; break;
      case 'ul': before = linePrefix('- '); ins = ''; break;
      case 'ol': {
        var ls = before.lastIndexOf('\n') + 1;
        var txt = ta.value.slice(ls, end);
        before = before.slice(0, ls) + txt.split('\n').map(function (l, i) {
          return (i + 1) + '. ' + l.replace(/^\d+[.)]\s*/, '');
        }).join('\n');
        ins = ''; break;
      }
      case 'code': ins = '\n```js\n' + (selected || '// code') + '\n```\n'; caret = 0; break;
      case 'link': ins = '[' + (selected || '链接文字') + '](https://)'; caret = 0; break;
      case 'table': ins = '\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n'; caret = 0; break;
    }

    if (action === 'h2' || action === 'h3' || action === 'quote' || action === 'ul' || action === 'ol') {
      ta.value = before + after;
      ta.selectionStart = ta.selectionEnd = before.length;
    } else {
      ta.value = before + ins + after;
      var pos = before.length + ins.length;
      if (selected && ['bold', 'italic', 'strike'].indexOf(action) !== -1) {
        pos = before.length + caret + selected.length;
        ta.selectionStart = before.length + caret;
      } else {
        ta.selectionStart = ta.selectionEnd = pos;
      }
      if (!selected && ['bold', 'italic', 'strike'].indexOf(action) !== -1) {
        ta.selectionEnd = pos;
      }
    }
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** 发布 / 保存文章 */
  function publishPost(asDraft) {
    var title = (document.getElementById('e-title').value || '').trim();
    var category = (document.getElementById('e-category').value || '').trim() || '未分类';
    var tagsRaw = (document.getElementById('e-tags').value || '').trim();
    var content = document.getElementById('e-content').value;
    var pinned = document.getElementById('e-pinned').checked;

    if (!title) { toast('请输入文章标题', 'warning'); document.getElementById('e-title').focus(); return; }
    if (!content.trim()) { toast('文章内容不能为空', 'warning'); document.getElementById('e-content').focus(); return; }

    var tags = tagsRaw.split(/[,，、\s]+/).filter(Boolean).slice(0, 8);

    if (state.editingId) {
      var post = state.posts.find(function (p) { return p.id === state.editingId; });
      if (!post) { toast('文章不存在', 'error'); return; }
      post.title = title;
      post.category = category;
      post.tags = tags;
      post.content = content;
      post.pinned = pinned;
      post.updated = Date.now();
      if (asDraft) post.status = 'draft';
      persistPosts();
      closeEditor(true);
      toast(asDraft ? '已保存为草稿' : '文章已更新', 'success');
      handleRoute();
      return;
    }

    var np = {
      id: uid('post'),
      title: title,
      category: category,
      tags: tags,
      cover: '',
      pinned: pinned,
      status: asDraft ? 'draft' : 'published',
      likes: 0,
      views: 0,
      created: Date.now(),
      updated: Date.now(),
      content: content
    };
    state.posts.unshift(np);
    persistPosts();
    localStorage.removeItem(STORAGE_KEYS.drafts);
    closeEditor(true);

    if (asDraft) {
      toast('已保存到草稿箱', 'success');
      renderHomePage();
    } else {
      toast('文章发布成功 🎉', 'success');
      navigate('#/post/' + np.id);
    }
  }

  /* =====================================================
   * 十四、登录
   * ===================================================== */
  function openLogin(onSuccess) {
    var overlay = document.getElementById('login-overlay');
    overlay.innerHTML = [
      '<div class="modal" role="dialog" aria-modal="true">',
      '  <button class="modal-close" data-action="close-login" aria-label="关闭">' + ICONS.close + '</button>',
      '  <div class="modal-icon">🔐</div>',
      '  <h3>管理员登录</h3>',
      '  <p class="muted">登录后可以撰写、编辑和管理文章</p>',
      '  <div class="form-row"><label>密码</label>',
      '    <input type="password" id="login-pass" placeholder="请输入管理员密码" autocomplete="current-password">',
      '  </div>',
      '  <p class="form-error" id="login-error" hidden></p>',
      '  <button class="btn btn-primary btn-block" id="btn-login">登 录</button>',
      //'  <p class="hint">默认密码：<code>admin123</code>（可在 blog.js 中修改）</p>',
      '</div>'
    ].join('');
    overlay.classList.add('open');
    document.body.classList.add('no-scroll');

    var input = document.getElementById('login-pass');
    setTimeout(function () { input && input.focus(); }, 80);

    document.getElementById('btn-login').onclick = function () { doLogin(); };
    input.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };

    async function doLogin() {
      var btn = document.getElementById('btn-login');
      var err = document.getElementById('login-error');
      btn.disabled = true;
      btn.textContent = '验证中…';
      await delay(500);
      if (input.value === ADMIN_PASSWORD) {
        state.isAdmin = true;
        sessionStorage.setItem(STORAGE_KEYS.auth, '1');
        closeLogin();
        toast('登录成功，欢迎回来！', 'success');
        renderHeader();
        handleRoute();
        if (typeof onSuccess === 'function') onSuccess();
      } else {
        err.hidden = false;
        err.textContent = '密码错误，请重试';
        btn.disabled = false;
        btn.textContent = '登 录';
        input.value = '';
        input.focus();
      }
    }
  }

  function closeLogin() {
    document.getElementById('login-overlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  function logout() {
    state.isAdmin = false;
    sessionStorage.removeItem(STORAGE_KEYS.auth);
    toast('已退出管理员模式', 'info');
    renderHeader();
    handleRoute();
  }

  /* =====================================================
   * 十五、头部 / 底部 / 全局 UI
   * ===================================================== */
  function renderHeader() {
    var cfg = getConfig();
    var nav = document.getElementById('nav-menu');
    var drafts = load(STORAGE_KEYS.drafts, {});
    var draftCount = state.posts.filter(function (p) { return p.status === 'draft'; }).length +
      (drafts.content ? 1 : 0);

    nav.innerHTML = [
      '<a class="nav-link" href="#/" data-nav="home">首页</a>',
      '<a class="nav-link" href="#/about" data-nav="about">关于</a>',
      state.isAdmin
        ? '<button class="nav-link nav-btn" data-action="new-post">✍️ 写文章' +
          (draftCount ? '<em class="dot-badge">' + draftCount + '</em>' : '') + '</button>'
        : '',
      state.isAdmin
        ? '<button class="nav-link nav-btn" data-action="logout">退出</button>'
        : '<button class="nav-link nav-btn" data-action="login">登录</button>'
    ].join('');

    document.getElementById('site-name').textContent = cfg.siteName;

    // 主题按钮图标
    var tbtn = document.getElementById('btn-theme');
    var isDark = isDarkNow();
    tbtn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
    tbtn.title = isDark ? '切换到亮色模式' : '切换到暗色模式';

    // 搜索框回填
    var s = document.getElementById('search-input');
    if (s && document.activeElement !== s) s.value = state.query;
  }

  function isDarkNow() {
    if (state.theme === 'dark') return true;
    if (state.theme === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDarkNow() ? 'dark' : 'light');
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    renderHeader();
  }

  function toggleTheme() {
    state.theme = isDarkNow() ? 'light' : 'dark';
    applyTheme();
    toast(isDarkNow() ? '已切换到暗色模式 🌙' : '已切换到亮色模式 ☀️', 'info', 1500);
  }

  function renderFooter() {
    var stats = getStats();
    document.getElementById('footer-inner').innerHTML = [
      '<div class="foot-cols">',
      '  <div class="foot-col">',
      '    <h5>' + escapeHtml(getConfig().siteName) + '</h5>',
      '    <p>' + escapeHtml(getConfig().slogan) + '</p>',
      '  </div>',
      '  <div class="foot-col">',
      '    <h5>导航</h5>',
      '    <a href="#/">首页</a><a href="#/about">关于</a>',
      '  </div>',
      '  <div class="foot-col">',
      '    <h5>数据</h5>',
      '    <p>' + stats.posts + ' 篇文章 · ' + formatNumber(stats.words) + ' 字</p>',
      '    <p>' + (state.isAdmin ? '管理员已登录' : '访客模式') + '</p>',
      '  </div>',
      '</div>',
      '<div class="foot-bottom">',
      '  <span>© ' + new Date().getFullYear() + ' ' + escapeHtml(getConfig().author) + ' · 由 blog.js 驱动</span>',
      '  <span class="muted">数据保存在浏览器本地</span>',
      '</div>'
    ].join('');
  }

  /* =====================================================
   * 十六、Toast 通知
   * ===================================================== */
  var toastTimer = null;
  function toast(message, type, duration) {
    var box = document.getElementById('toast-box');
    var el = document.createElement('div');
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    el.className = 'toast ' + (type || 'info');
    el.innerHTML = '<span>' + (icons[type] || '') + '</span>' + escapeHtml(message);
    box.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, duration || 2600);

    // 最多同时保留 4 条
    while (box.children.length > 4) box.firstChild.remove();
  }

  /** 轻量确认框（Promise） */
  function confirmBox(message) {
    return new Promise(function (resolve) {
      var overlay = document.getElementById('confirm-overlay');
      overlay.innerHTML = [
        '<div class="modal small" role="dialog" aria-modal="true">',
        '  <div class="modal-icon">🤔</div>',
        '  <p class="confirm-msg">' + escapeHtml(message) + '</p>',
        '  <div class="confirm-actions">',
        '    <button class="btn btn-ghost" data-cf="0">取消</button>',
        '    <button class="btn btn-danger-solid" data-cf="1">确定</button>',
        '  </div>',
        '</div>'
      ].join('');
      overlay.classList.add('open');
      function done(v) {
        overlay.classList.remove('open');
        overlay.removeEventListener('click', onClick);
        resolve(v);
      }
      function onClick(e) {
        var b = e.target.closest('[data-cf]');
        if (b) done(b.getAttribute('data-cf') === '1');
        else if (e.target === overlay) done(false);
      }
      overlay.addEventListener('click', onClick);
      setTimeout(function () {
        var cancel = overlay.querySelector('[data-cf="0"]');
        cancel && cancel.focus();
      }, 50);
    });
  }

  /* =====================================================
   * 十七、全局事件委托
   * ===================================================== */
  function bindGlobalEvents() {

    /* ---- 导航：汉堡菜单 ---- */
    document.getElementById('btn-menu').addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });

    /* ---- 导航：主题切换 ---- */
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);

    /* ---- 导航：搜索 ---- */
    document.getElementById('search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = this.value.trim();
        state.query = q;
        state.page = 1;
        if (state.view === 'home') renderHomePage();
        else navigate(q ? '#/search/' + encodeURIComponent(q) : '#/');
        this.blur();
      }
    });
    document.getElementById('search-input').addEventListener('search', function () {
      if (!this.value) { state.query = ''; if (state.view === 'home') renderHomePage(); }
    });

    /* ---- 主点击事件委托 ---- */
    document.addEventListener('click', function (e) {
      var t = e.target;
      var el;

      /* 关闭移动端菜单（点击导航链接后） */
      if (t.closest('#nav-menu a')) document.body.classList.remove('nav-open');

      /* --- 数据动作按钮 --- */
      if ((el = t.closest('[data-action]'))) {
        var action = el.getAttribute('data-action');
        switch (action) {
          case 'login': openLogin(); return;
          case 'logout': logout(); return;
          case 'new-post': openEditor(null); return;
          case 'close-editor': closeEditor(); return;
          case 'publish': publishPost(false); return;
          case 'save-draft': publishPost(true); return;
          case 'close-login': closeLogin(); return;
          case 'toggle-preview': togglePreview(); return;
          case 'clear-filter':
            state.query = ''; state.category = '全部'; state.tag = ''; state.page = 1;
            var si = document.getElementById('search-input'); if (si) si.value = '';
            renderHomePage();
            return;
          case 'scroll-to-list':
            var target = document.getElementById('post-list');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          case 'share': shareLink(); return;
          case 'cancel-reply': state.replyingTo = null; handleRoute(); return;
          case 'save-config': saveConfigFromForm(); return;
          case 'export': exportData(); return;
          case 'import': importData(); return;
          case 'restore-samples': restoreSamples(); return;
          case 'reset-all': resetAll(); return;
        }
      }

      /* --- 分页 --- */
      if ((el = t.closest('[data-page]')) && !el.disabled) {
        var pg = Number(el.getAttribute('data-page'));
        if (pg >= 1) {
          state.page = pg;
          renderHomePage();
          var list = document.getElementById('post-list');
          if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      /* --- 排序 --- */
      if ((el = t.closest('[data-sort]'))) {
        state.sort = el.getAttribute('data-sort');
        state.page = 1;
        renderHomePage();
        return;
      }

      /* --- 分类 --- */
      if ((el = t.closest('[data-category]'))) {
        state.category = el.getAttribute('data-category');
        state.tag = ''; state.page = 1;
        if (state.view !== 'home') { navigate('#/'); setTimeout(renderHomePage, 30); }
        else renderHomePage();
        return;
      }
      if ((el = t.closest('[data-category-link]'))) {
        e.preventDefault();
        state.category = el.getAttribute('data-category-link');
        state.page = 1;
        navigate('#/');
        return;
      }

      /* --- 标签 --- */
      if ((el = t.closest('[data-tag]'))) {
        state.tag = el.getAttribute('data-tag');
        state.category = '全部';
        state.query = '';
        state.page = 1;
        if (state.view !== 'home') navigate('#/');
        else renderHomePage();
        setTimeout(function () {
          var list = document.getElementById('post-list');
          if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
        return;
      }

      /* --- 文章点赞 --- */
      if ((el = t.closest('[data-like]'))) {
        toggleLike(el.getAttribute('data-like'));
        return;
      }

      /* --- 编辑 / 置顶 / 删除 --- */
      if ((el = t.closest('[data-edit]'))) {
        openEditor(el.getAttribute('data-edit'));
        return;
      }
      if ((el = t.closest('[data-pin]'))) {
        togglePin(el.getAttribute('data-pin'));
        return;
      }
      if ((el = t.closest('[data-delete]'))) {
        deletePost(el.getAttribute('data-delete'));
        return;
      }

      /* --- 评论：发表 --- */
      if (t.id === 'btn-submit-comment') {
        submitComment(t.getAttribute('data-post'));
        return;
      }

      /* --- 评论：点赞 --- */
      if ((el = t.closest('[data-clike]'))) {
        toggleCommentLike(el.getAttribute('data-clike'));
        return;
      }

      /* --- 评论：回复 --- */
      if ((el = t.closest('[data-reply]'))) {
        var rid = el.getAttribute('data-reply');
        state.replyingTo = state.replyingTo === rid ? null : rid;
        handleRoute();
        setTimeout(function () {
          var box = document.getElementById('reply-content');
          if (box) box.focus();
        }, 60);
        return;
      }
      if ((el = t.closest('[data-send-reply]'))) {
        submitReply(el.getAttribute('data-send-reply'), el.getAttribute('data-post'));
        return;
      }

      /* --- 评论：删除 --- */
      if ((el = t.closest('[data-cdel]'))) {
        deleteComment(el.getAttribute('data-cdel'));
        return;
      }

      /* --- 目录锚点 --- */
      if ((el = t.closest('[data-toc]'))) {
        e.preventDefault();
        var targetEl = document.getElementById(el.getAttribute('data-toc'));
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    });

    /* ---- 键盘快捷键 ---- */
    document.addEventListener('keydown', function (e) {
      // Esc 关闭弹层
      if (e.key === 'Escape') {
        if (document.getElementById('confirm-overlay').classList.contains('open')) return;
        if (document.getElementById('login-overlay').classList.contains('open')) { closeLogin(); return; }
        if (document.getElementById('editor-overlay').classList.contains('open')) { closeEditor(); return; }
        document.body.classList.remove('nav-open');
      }
      // Ctrl/Cmd + K 聚焦搜索
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        var s = document.getElementById('search-input');
        s && s.focus();
      }
      // Ctrl/Cmd + S 保存文章（编辑器打开时）
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (document.getElementById('editor-overlay').classList.contains('open')) {
          e.preventDefault();
          publishPost(false);
        }
      }
      // 登录框回车
      if (e.key === 'Enter' && document.activeElement &&
          document.activeElement.id === 'c-content' && (e.ctrlKey || e.metaKey)) {
        var btn = document.getElementById('btn-submit-comment');
        if (btn) submitComment(btn.getAttribute('data-post'));
      }
    });

    /* ---- 点击遮罩关闭弹层 ---- */
    document.getElementById('editor-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeEditor();
    });
    document.getElementById('login-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeLogin();
    });

    /* ---- 评论字数 ---- */
    document.addEventListener('input', function (e) {
      if (e.target.id === 'c-content') {
        var c = document.getElementById('c-count');
        if (c) c.textContent = e.target.value.length + ' / 500';
      }
    });

    /* ---- 滚动：阅读进度 / 返回顶部 / 目录高亮 ---- */
    window.addEventListener('scroll', debounce(onScroll, 50), { passive: true });
    window.addEventListener('scroll', function () {
      // 阅读进度条（即时更新，不防抖）
      updateReadingProgress();
    }, { passive: true });

    /* ---- 路由变化 ---- */
    window.addEventListener('hashchange', handleRoute);

    /* ---- 系统主题变化 ---- */
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (state.theme === 'auto') applyTheme();
      });
    }

    /* ---- 返回顶部按钮 ---- */
    document.getElementById('btn-top').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    document.getElementById('btn-top').classList.toggle('show', y > 480);
    highlightToc();
  }

  /* =====================================================
   * 十八、文章操作
   * ===================================================== */
  function toggleLike(postId) {
    var post = state.posts.find(function (p) { return p.id === postId; });
    if (!post) return;
    var idx = state.likedPosts.indexOf(postId);
    if (idx === -1) {
      state.likedPosts.push(postId);
      post.likes = (post.likes || 0) + 1;
      toast('感谢你的点赞 ❤', 'success', 1600);
    } else {
      state.likedPosts.splice(idx, 1);
      post.likes = Math.max(0, (post.likes || 0) - 1);
      toast('已取消点赞', 'info', 1400);
    }
    save(STORAGE_KEYS.likes, state.likedPosts);
    persistPosts();

    // 局部更新按钮状态
    document.querySelectorAll('[data-like="' + postId + '"]').forEach(function (btn) {
      btn.classList.toggle('liked', idx === -1);
      var b = btn.querySelector('b');
      if (b) b.textContent = post.likes;
      var i = btn.querySelector('i');
      if (i) i.textContent = post.likes;
    });
  }

  function togglePin(postId) {
    var post = state.posts.find(function (p) { return p.id === postId; });
    if (!post) return;
    post.pinned = !post.pinned;
    post.updated = Date.now();
    persistPosts();
    toast(post.pinned ? '文章已置顶' : '已取消置顶', 'success');
    handleRoute();
  }

  async function deletePost(postId) {
    var post = state.posts.find(function (p) { return p.id === postId; });
    if (!post) return;
    var ok = await confirmBox('确定删除《' + post.title + '》吗？该文章的所有评论也会一并删除，此操作不可恢复。');
    if (!ok) return;

    state.posts = state.posts.filter(function (p) { return p.id !== postId; });
    state.comments = state.comments.filter(function (c) { return c.postId !== postId; });
    persistPosts();
    persistComments();
    toast('文章已删除', 'success');

    if (state.view === 'post') navigate('#/');
    else handleRoute();
  }

  function deleteComment(commentId) {
    var c = state.comments.find(function (x) { return x.id === commentId; });
    if (!c) return;
    if (!state.isAdmin && (!state.visitor || state.visitor.nickname !== c.nickname)) {
      toast('只能删除自己的评论', 'warning');
      return;
    }
    confirmBox('确定删除这条评论吗？').then(function (ok) {
      if (!ok) return;
      // 连同子回复一起删除
      var ids = [commentId];
      var changed = true;
      while (changed) {
        changed = false;
        state.comments.forEach(function (x) {
          if (x.parentId && ids.indexOf(x.parentId) !== -1 && ids.indexOf(x.id) === -1) {
            ids.push(x.id);
            changed = true;
          }
        });
      }
      state.comments = state.comments.filter(function (x) { return ids.indexOf(x.id) === -1; });
      persistComments();
      toast('评论已删除', 'success');
      handleRoute();
    });
  }

  function toggleCommentLike(commentId) {
    var c = state.comments.find(function (x) { return x.id === commentId; });
    if (!c) return;
    var idx = state.likedComments.indexOf(commentId);
    if (idx === -1) {
      state.likedComments.push(commentId);
      c.likes = (c.likes || 0) + 1;
    } else {
      state.likedComments.splice(idx, 1);
      c.likes = Math.max(0, (c.likes || 0) - 1);
    }
    save(STORAGE_KEYS.clikes, state.likedComments);
    persistComments();

    var btn = document.querySelector('[data-clike="' + commentId + '"]');
    if (btn) {
      btn.classList.toggle('liked', idx === -1);
      var i = btn.querySelector('i');
      if (i) i.textContent = c.likes;
    }
  }

  function shareLink() {
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('链接已复制到剪贴板', 'success');
      }).catch(fallbackCopy);
    } else fallbackCopy();

    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('链接已复制', 'success'); }
      catch (e) { toast('复制失败，请手动复制地址栏', 'error'); }
      ta.remove();
    }
  }

  /* =====================================================
   * 十九、数据导入导出
   * ===================================================== */
  function exportData() {
    var data = {
      version: 1,
      exported: new Date().toISOString(),
      posts: state.posts,
      comments: state.comments,
      config: getConfig()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'blog-backup-' + formatDate(Date.now()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast('数据已导出为 JSON 文件', 'success');
  }

  function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.posts)) throw new Error('格式不正确');
          confirmBox('导入将覆盖当前所有文章和评论，确定继续？').then(function (ok) {
            if (!ok) return;
            state.posts = data.posts;
            state.comments = Array.isArray(data.comments) ? data.comments : [];
            if (data.config) setConfig(data.config);
            persistPosts();
            persistComments();
            toast('导入成功，共 ' + state.posts.length + ' 篇文章', 'success');
            renderHeader();
            navigate('#/');
            handleRoute();
          });
        } catch (err) {
          toast('导入失败：' + err.message, 'error');
        }
      };
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  }

  function restoreSamples() {
    confirmBox('恢复示例文章会把当前所有文章替换为内置示例，确定继续？').then(function (ok) {
      if (!ok) return;
      state.posts = samplePosts();
      state.comments = sampleComments();
      persistPosts();
      persistComments();
      toast('已恢复示例数据', 'success');
      handleRoute();
    });
  }

  function resetAll() {
    confirmBox('这会清空所有文章、评论和设置，且无法恢复（建议先导出备份）。确定清空？').then(function (ok) {
      if (!ok) return;
      Object.keys(STORAGE_KEYS).forEach(function (k) {
        if (k === 'theme') return; // 保留主题
        localStorage.removeItem(STORAGE_KEYS[k]);
      });
      localStorage.removeItem('blog_config_v1');
      state.posts = [];
      state.comments = [];
      state.likedPosts = [];
      state.likedComments = [];
      toast('数据已清空', 'success');
      navigate('#/');
      handleRoute();
    });
  }

  /* =====================================================
   * 二十、渲染后处理（动画、进度条、目录）
   * ===================================================== */
  function afterRender() {
    // 滚动出现动画
    var els = document.querySelectorAll('.reveal:not(.in)');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      els.forEach(function (el) { io.observe(el); });
    } else {
      els.forEach(function (el) { el.classList.add('in'); });
    }

    // 语法高亮
    highlightCode(document);

    // 导航高亮
    document.querySelectorAll('.nav-link').forEach(function (a) {
      a.classList.toggle('active',
        (a.getAttribute('data-nav') === 'home' && state.view === 'home') ||
        (a.getAttribute('data-nav') === 'about' && state.view === 'about'));
    });

    // 图片加载失败兜底
    document.querySelectorAll('.markdown-body img').forEach(function (img) {
      img.addEventListener('error', function () {
        if (img.dataset.failed) return;
        img.dataset.failed = '1';
        var span = document.createElement('span');
        span.className = 'img-fallback';
        span.textContent = '🖼 图片加载失败';
        img.replaceWith(span);
      });
    });

    updateReadingProgress();
    renderFooter();
    renderHeader();
  }

  function updateReadingProgress() {
    var bar = document.getElementById('reading-progress');
    if (!bar) return;
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    bar.firstElementChild.style.width = pct + '%';
  }

  /** 目录生成后初始化高亮跟踪 */
  function initTocHighlight() {
    highlightToc();
  }

  function highlightToc() {
    var toc = document.getElementById('toc-widget');
    if (!toc) return;
    var headings = document.querySelectorAll('#article-content .md-heading');
    if (!headings.length) return;

    var current = headings[0].id;
    var offset = 140;
    headings.forEach(function (h) {
      if (h.getBoundingClientRect().top <= offset) current = h.id;
    });
    toc.querySelectorAll('.toc-item').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-toc') === current);
    });
  }

  /** 预览切换 */
  function togglePreview() {
    var ta = document.getElementById('e-content');
    var pv = document.getElementById('e-preview');
    var btn = document.getElementById('btn-preview');
    if (!ta || !pv) return;
    var show = pv.hidden;
    pv.hidden = !show;
    ta.style.display = show ? 'none' : '';
    btn.classList.toggle('active', show);
    if (show) {
      pv.innerHTML = Markdown.render(ta.value).html;
      highlightCode(pv);
      btn.innerHTML = '✍️ 继续编辑';
    } else {
      btn.innerHTML = '👁 预览';
      ta.focus();
    }
  }

  /* =====================================================
   * 二十一、控制台彩蛋
   * ===================================================== */
  function consoleEasterEgg() {
    try {
      console.log('%c' + getConfig().siteName + ' %c Powered by blog.js',
        'color:#6c5ce7;font-size:16px;font-weight:bold;',
        'color:#888;font-size:12px;');
      console.log('%c常用命令：',
        'color:#6c5ce7;font-weight:bold;');
      console.log('  Blog.export()   导出数据为 JSON 对象');
      console.log('  Blog.download()  下载数据备份文件');
      console.log('  Blog.reset()     清空所有本地数据');
      console.log('  Blog.posts()     打印文章列表');
      console.log('  Blog.theme()     切换亮 / 暗主题');
    } catch (e) { /* ignore */ }
  }

  /* =====================================================
   * 二十二、初始化
   * ===================================================== */
  function init() {
    ensureData();
    applyTheme();
    renderHeader();
    renderFooter();
    bindGlobalEvents();
    handleRoute();
    consoleEasterEgg();

    // 未读草稿提醒
    var drafts = load(STORAGE_KEYS.drafts, {});
    if (drafts.content && !state.isAdmin) {
      toast('检测到一篇未发布的本地草稿', 'info');
    }
  }

  // 暴露调试 API
  window.Blog = {
    version: '1.0.0',
    export: function () { return { posts: state.posts, comments: state.comments, config: getConfig() }; },
    download: exportData,
    reset: resetAll,
    posts: function () { console.table(state.posts.map(function (p) {
      return { id: p.id, title: p.title, status: p.status, views: p.views, likes: p.likes };
    })); },
    theme: toggleTheme,
    openEditor: openEditor
  };

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
