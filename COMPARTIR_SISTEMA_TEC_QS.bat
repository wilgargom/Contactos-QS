@echo off
title Sistema Institucional de Contactos QS - TEC (Modo Compartir)
color 0A
cd /d "%~dp0"

echo =====================================================================
echo    INSTITUTO TECNOLOGICO DE COSTA RICA (TEC)
echo    Sistema de Contactos QS - Modo Compartir con Enlace Web
echo    (No requiere permisos de Administrador ni tocar el Firewall)
echo =====================================================================
echo.

:: 1. Iniciar servidor Node.js en segundo plano si no esta corriendo
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_con_enlace.ps1"

pause
