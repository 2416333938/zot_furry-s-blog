# 个人博客

一个纯前端实现的个人博客：无后端、无构建步骤，双击 `index.html` 即可运行。
文章数据既能在本地离线使用，也能**加密同步到 GitHub 仓库**，实现多设备共享。

线上地址：https://2416333938.github.io/zot_furry-s-blog/

## 功能

- **文章管理**：发布、编辑、删除、置顶、Markdown 编辑器（工具栏 + 实时预览 + 自动保存草稿）
- **草稿箱**：点「写文章」先进入草稿箱，集中管理**未发布**的草稿；可继续编辑、**新建分支**（以当前内容另存为新草稿）、直接发布、删除；编辑器内也有「新建分支」按钮
- **内容引擎**：自研 Markdown 渲染器、代码语法高亮、自动文章目录（滚动高亮）、字数与阅读时长
- **内容发现**：分类筛选、标签云、全文搜索（`Ctrl+K`）、最新/最热排序、分页、热门文章、相关推荐
- **互动系统**：楼中楼评论回复、评论/文章点赞、浏览量、复制链接、上一篇/下一篇导航
- **管理员登录**：**密钥密码解密登录**，密码不保存在代码或仓库中
- **云端同步**：文章/评论/站点设置自动提交到 GitHub 仓库，多设备共享
- **界面体验**：亮/暗主题、响应式移动端导航、阅读进度条、返回顶部、滚动出现动画、Toast 通知
- **数据持久化**：导出/导入 JSON 备份、恢复示例、一键清空

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 页面骨架 |
| `blog.js` | 全部功能逻辑（含云端同步） |
| `crypto.js` | 加解密实现（PBKDF2 + HMAC-SHA256，零依赖） |
| `style.css` | 样式（亮/暗主题、响应式、动画） |
| `secret.json` | **加密后的密钥密文包**（公开无妨，见下文） |
| `data/blog-data.json` | 云端文章数据（站点会自动读取） |
| `tools/gen-secret.js` | 生成/轮换密钥密文 |
| `tools/export-data.js` | 导出当前数据为 `data/blog-data.json` |
| `_smoke/` | 自动化测试（加密、解锁流程、功能回归） |

## 管理员登录与云端同步

### 安全模型

公开仓库里**不放任何明文密码或令牌**，只放加密后的密文：

```
密钥密码（只在脑中）
      │
      ├─ PBKDF2-HMAC-SHA256（15 万次迭代 + 随机 salt）
      │        ↓ 派生 kEnc / kMac
      ├─ HMAC-SHA256 流加密（随机 iv）      → 密文 ct
      └─ HMAC-SHA256(kMac, salt‖iv‖ct)      → 认证标签 mac

secret.json = { salt, iv, ct, mac }   ← 可以安全公开
```

- **登录 = 解密成功**：输入密码，解密出 GitHub 令牌 → 同时获得管理员权限与写入仓库的能力
- **密码错误 / 密文被篡改**：MAC 校验失败（常量时间比对），一律拒绝
- 令牌解密后**只存在 `sessionStorage`**，关闭标签页即消失；退出登录会立即清除

> ⚠️ **诚实说明**：这是**离线加密保护**，不是不可破解。密文公开可下载，因此理论上可被离线暴力尝试；PBKDF2 只是大幅提高每次尝试的成本。真正的兜底是：**密码足够强** + **令牌设置过期时间** + **出问题随时吊销**。请勿使用生日、手机号、用户名等可猜测内容。

### 首次配置

```bash
# 1. 生成密文（密码不会被写入任何文件）
node tools/gen-secret.js --password "你的密钥密码" --token "github_pat_xxx"
# 会生成 secret.json，并把同一份密文内嵌到 blog.js（保证 file:// 双击也能用）

# 2. 提交
git add -A && git commit -m "更新密钥密文" && git push
```

之后打开站点 → 点「登录」→ 输入密钥密码 → 解密成功即进入管理员模式，发文会自动同步到仓库。

### 轮换密钥

重新运行 `tools/gen-secret.js` 即可（旧密文被覆盖，旧密码立即失效）：

```bash
node tools/gen-secret.js --password "新密码" --token "github_pat_xxx"
git add -A && git commit -m "轮换密钥" && git push
```

### 令牌建议

使用 **Fine-grained personal access token**，权限最小化：

- Repository access：**Only select repositories** → 仅勾选 `zot_furry-s-blog`
- Permissions → Repository permissions → **Contents: Read and write**（其余全部 No access）
- **务必设置过期时间**（如 90 天），到期后重新生成并轮换密文

## 草稿箱

点导航栏的「✍️ 写文章」（或访问 `#/drafts`）进入草稿箱，这里**只列出未发布的草稿**：

| 操作 | 说明 |
|---|---|
| 继续编辑 | 打开编辑器修改该草稿 |
| **新建分支** | 以当前草稿的内容**另存为一篇新草稿**（标题自动加「· 分支N」），原草稿保持不变；新分支会立刻在编辑器中打开 |
| 发布 | 确认后把草稿转为已发布文章并跳转到正文 |
| 删除 | 删除该草稿（不影响已发布文章） |

编辑器标题栏也有「🌿 新建分支」按钮：会先把当前编辑内容存回原草稿（避免丢改动），再复制出新草稿并切换过去继续编辑。

草稿箱顶部还会单独列出**临时草稿**——即编辑器自动保存、尚未转正的本地内容，可「继续编辑」「转为草稿」或「丢弃」。

> 草稿与正式文章共用同一份数据（`status: 'draft'` / `'published'`），因此会一起同步到云端仓库，多设备一致。

## 本地使用

直接用浏览器打开 `index.html`，或起个静态服务：

```bash
npx serve .
```

未配置密文时，站点仍可作为纯本地博客使用（数据存在 `localStorage`）。

## 测试

```bash
npm i jsdom                 # 仅测试需要
node _smoke/crypto-test.js                              # 加密正确性（含官方测试向量）
BLOG_TEST_PASSWORD=… node _smoke/unlock-test.js          # 端到端解锁流程
BLOG_TEST_PASSWORD=… node _smoke/smoke.js                # 69 项功能回归
```

## 调试 API

控制台可用：

- `Blog.export()` / `Blog.download()` / `Blog.reset()`
- `Blog.posts()` / `Blog.theme()` / `Blog.openEditor()`
- `Blog.cloud.status()` 查看云端连接状态
- `Blog.cloud.unlock('密码')` 用密码解锁
- `Blog.cloud.push()` / `Blog.cloud.pull()` 手动上传 / 拉取
- `Blog.cloud.disconnect()` 清除本标签页令牌

## License

MIT
