@echo off
title Habilitar Puerto 3000 en Firewall de Windows - TEC QS
color 0B
echo =====================================================================
echo    INSTITUTO TECNOLOGICO DE COSTA RICA (TEC)
echo    Configuracion de Firewall para Servidor Web QS (Puerto 3000)
echo =====================================================================
echo.

:: Verificar y solicitar elevacion como Administrador si es necesario
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Solicitando permisos de Administrador para configurar Firewall...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo Permisos de Administrador concedidos.
echo Configurando regla en el Firewall de Windows...
echo.

netsh advfirewall firewall delete rule name="Sistema TEC QS Contactos (Puerto 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Sistema TEC QS Contactos (Puerto 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1

if %errorlevel% equ 0 (
    color 0A
    echo =====================================================================
    echo [EXITO] Puerto 3000 TCP habilitado correctamente en el Firewall.
    echo.
    echo Ahora cualquier equipo en la red del TEC podra ingresar.
    echo Enlaces para acceder:
    powershell -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254*' }; foreach ($ip in $ips) { Write-Host ('   -> Red (' + $ip.InterfaceAlias + '): http://' + $ip.IPAddress + ':3000') -ForegroundColor Green }"
    echo =====================================================================
) else (
    color 0C
    echo [ERROR] No se pudo configurar la regla de firewall.
)

echo.
pause
