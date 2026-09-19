@echo off
chcp 65001 >nul
title CodeCraft Agentic IDE Launcher
color 0B

echo ===================================================
echo       🚀 Welcome to CodeCraft Agentic IDE 🚀
echo ===================================================
echo.
set "NEEDS_RESTART=0"

:: Step 1: Bootstrapping - Check Node.js runtime
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [System] Node.js runtime not found!
    echo [System] Initiating unattended installation via Windows Package Manager...
    echo [!] Please click 'Yes' if User Account Control prompt appears.
    echo [System] Downloading and installing... ^(This may take 1-3 minutes^)
    
    :: Force source to 'winget' to avoid msstore certificate errors, and mask system localized output
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements --silent >nul 2>nul
    
    echo [✅] Node.js installation complete!
    set "NEEDS_RESTART=1"
)

:: Step 2: Bootstrapping - Check Git Version Control
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [System] Git version control not found!
    echo [System] Initiating unattended installation via Windows Package Manager...
    echo [!] Please click 'Yes' if User Account Control prompt appears.
    echo [System] Downloading and installing... ^(This may take 1-3 minutes^)
    
    :: Force source to 'winget' to avoid msstore certificate errors, and mask system localized output
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements --silent >nul 2>nul
    
    echo [✅] Git installation complete!
    set "NEEDS_RESTART=1"
)

:: Step 3: Hard Stop for Environment Variable Reload
if "%NEEDS_RESTART%"=="1" (
    echo.
    echo ==============================================================
    echo [⚠️] ACTION REQUIRED: System Environment Variables Updated!
    echo [⚠️] You MUST CLOSE this terminal window completely right now.
    echo [⚠️] After closing, DOUBLE-CLICK 'OpenCodeCraft.bat' again.
    echo ==============================================================
    pause
    exit /b
)

:: Step 4: Dependency Resolution (npm install)
if not exist "node_modules\" (
    echo [System] First run detected. Resolving project dependencies...
    echo [System] Please wait, fetching packages from npm registry...
    call npm install >nul 2>nul
    echo [✅] Dependencies successfully installed!
    echo.
)

:: Step 5: Launching the Service
echo [System] Booting up CodeCraft Agentic Workflow Engine and Web UI...
echo [System] Keep this terminal open. The system will be available in your browser!
echo.

:: [新增核心修復] 在啟動 Node.js 前，自動呼叫 Windows 預設瀏覽器打開網頁
start http://localhost:8080

:: Standardized entry point for the Web GUI
node src/server.js

:: 服务退出后保持窗口，方便查看报错。
echo.
echo [⚠️ System] The CodeCraft Engine has stopped.
echo [💡 Tip] You can type "node src/server.js" to restart it manually.
cmd /k