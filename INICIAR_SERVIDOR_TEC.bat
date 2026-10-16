@echo off
title Sistema Institucional de Contactos QS - TEC
color 0B
cd /d "%~dp0"

echo =====================================================================
echo    INSTITUTO TECNOLOGICO DE COSTA RICA (TEC)
echo    Sistema Institucional de Contactos QS
echo =====================================================================
echo.
echo Verificando entorno de ejecucion en el equipo...

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
    echo [ERROR] No se encontro el ejecutable de Node.js en el sistema.
    echo.
    pause
    exit /b
)

echo Entorno detectado correctamente: %NODE_CMD%
echo.
echo =====================================================================
echo ENLACES DE ACCESO:
echo    - En esta computadora:  http://localhost:3000
powershell -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254*' }; foreach ($ip in $ips) { Write-Host ('   - Para compartir en la red (' + $ip.InterfaceAlias + '): http://' + $ip.IPAddress + ':3000') -ForegroundColor Green }"
echo Modo de Acceso:
echo    Administrador: Wilson Garita Gomez (wgarita@itcr.ac.cr) - Clave: TecQS2026!
echo    Dependencia:   Oficina de Planificacion Institucional (OPI)
echo =====================================================================
echo.
echo Abriendo navegador en esta computadora...
start "" http://localhost:3000
echo.
echo IMPORTANTE: No cierre esta ventana para mantener el sistema activo.
echo.

%NODE_CMD% server.js
pause
