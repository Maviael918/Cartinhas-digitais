@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 3; if ($r.ok -eq $true) { exit 0 } else { exit 1 } } catch { exit 1 }"
if not errorlevel 1 (
    start "" "http://127.0.0.1:3000/"
    exit /b 0
)
where node >nul 2>&1
if errorlevel 1 (
    echo Instale o Node.js 22 ou superior para iniciar o painel.
    pause
    exit /b 1
)
echo.
echo Iniciando o Racker. Mantenha esta janela aberta.
echo A senha temporaria sera exibida abaixo.
echo Depois que o servidor iniciar, abra http://127.0.0.1:3000/
echo.
node --preserve-symlinks --preserve-symlinks-main server.mjs
pause
