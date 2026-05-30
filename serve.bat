@echo off
rem ═══════════════════════════════════════════════════════════════════
rem  Dev-сервер для crossword-tes на http://localhost:8767
rem  Python http.server раздаёт текущую папку (нужен Python 3).
rem  Закрой окно → сервер остановится.
rem ═══════════════════════════════════════════════════════════════════
setlocal
cd /d "%~dp0"
title crossword-tes dev server :: 8767

echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║                                                                  ║
echo ║   Crossword TES  ·  http://localhost:8767/                       ║
echo ║   Dragon Lab     ·  http://localhost:8767/dragon-lab.html        ║
echo ║   Cinematic-3D   ·  http://localhost:8767/?dragon=cinematic      ║
echo ║                                                                  ║
echo ║   Ctrl+C — остановить                                            ║
echo ║                                                                  ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.

rem Открыть основную страницу в браузере по умолчанию через 1.5 сек
rem (timeout, чтобы сервер успел подняться)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8767/dragon-lab.html"

rem Запустить Python http.server (3.14 как в launch.json; если нет — fallback 3)
py -3.14 -m http.server 8767 --bind 127.0.0.1 2>nul
if errorlevel 1 (
  echo [serve.bat] py -3.14 недоступен — пробую py -3
  py -3 -m http.server 8767 --bind 127.0.0.1
)
