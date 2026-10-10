@echo off
chcp 936 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem  一键更新密钥密文
rem  自动定位到脚本所在目录，无需手动 cd，避免盘符问题
rem ============================================================

cd /d "%~dp0."

echo.
echo ============================================================
echo   博客密钥密文更新工具
echo ============================================================
echo   工作目录: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 找不到 node 命令，请先安装 Node.js: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "tools\gen-secret.js" (
  echo [错误] 当前目录不是博客项目根目录，缺少 tools\gen-secret.js
  echo        当前目录: %CD%
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo [错误] 当前目录不是 git 仓库，缺少 .git
  echo        当前目录: %CD%
  echo.
  pause
  exit /b 1
)

echo 请输入密钥密码:
set /p PASSWORD=
if "!PASSWORD!"=="" (
  echo [已取消] 密码不能为空。
  echo.
  pause
  exit /b 1
)

echo.
echo 请粘贴 GitHub 令牌 github_pat_ 开头 93 个字符:
set /p TOKEN=
if "!TOKEN!"=="" (
  echo [已取消] 令牌不能为空。
  echo.
  pause
  exit /b 1
)

rem 去掉可能被复制进来的引号和空格
set "TOKEN=!TOKEN:"=!"
for /f "tokens=* delims= " %%a in ("!TOKEN!") do set "TOKEN=%%a"

set "TLEN=0"
for /l %%A in (0,1,200) do (
  set "CH=!TOKEN:~%%A,1!"
  if not "!CH!"=="" set /a TLEN+=1
)
echo.
echo [自检] 令牌长度 !TLEN! 字符
if not "!TLEN!"=="93" (
  echo [警告] fine-grained 令牌应为 93 字符，当前 !TLEN!
  echo        常见原因: 复制时多了空格或少了字符
)
echo.

echo ============================================================
echo   正在加密，PBKDF2 15 万次迭代，约需 1 到 3 秒
echo ============================================================
echo.

set "BLOG_PASSWORD=!PASSWORD!"
node tools\gen-secret.js --token "!TOKEN!"
set "GEN_RESULT=%ERRORLEVEL%"
set "BLOG_PASSWORD="

if not "%GEN_RESULT%"=="0" (
  echo.
  echo [失败] 生成密文出错，退出码 %GEN_RESULT%
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   提交并推送到 GitHub
echo ============================================================
echo.

git add -A
git commit -m "chore: 更新密钥密文"
git fetch origin
git rebase origin/main
git push origin main
if errorlevel 1 (
  echo.
  echo [失败] 推送失败，请检查网络后手动执行: git push origin main
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   完成
echo ============================================================
echo.
echo   线上站点约 1 分钟后生效:
echo   https://2416333938.github.io/zot_furry-s-blog/
echo.
echo   登录方式: 打开站点 点登录 输入刚才的密钥密码
echo   请牢记密码，它没有被写入任何文件。
echo.
pause