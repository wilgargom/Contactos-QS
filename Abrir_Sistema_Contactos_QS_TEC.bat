@echo off
title Sistema Institucional de Contactos QS - Tecnologico de Costa Rica
color 0B
cd /d "%~dp0"

echo ======================================================================
echo    TECNOLOGICO DE COSTA RICA - GESTION DE CONTACTOS RANKING QS
echo ======================================================================
echo.

set NODE_CMD=
where node >nul 2>&1
if %errorlevel% equ 0 (
    set NODE_CMD=node
) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"
) else if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
) else if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
    set ELECTRON_RUN_AS_NODE=1
    set "NODE_CMD=%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
)

if "%NODE_CMD%"=="" (
    color 0C
    echo [ERROR] No se encontro Node.js para ejecutar el servidor.
    pause
    exit /b
)

echo Abriendo navegador en esta computadora...
start "" http://localhost:3000

echo Iniciando servidor en puerto 3000...
echo.
%NODE_CMD% server.js
pause
