@echo off
title Sistema Institucional de Contactos QS - TEC
echo ================================================================
echo   Iniciando Sistema de Contactos QS - Tecnologico de Costa Rica
echo ================================================================
echo.

cd /d "%~dp0"

:: Verificar si Node.js esta en PATH o usar agy-node
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo Iniciando servidor con Node.js...
    node server.js
) else (
    if exist "%USERPROFILE%\AppData\Roaming\Antigravity\bin\agy-node.cmd" (
        echo Iniciando servidor con Antigravity Node...
        "%USERPROFILE%\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
    ) else (
        echo [ERROR] No se encontro Node.js instalado.
        pause
    )
)
pause
