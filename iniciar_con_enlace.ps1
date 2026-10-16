$ErrorActionPreference = "SilentlyContinue"

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "       SISTEMA INSTITUCIONAL DE CONTACTOS QS - TEC (MODO COMPARTIR)  " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""

# 1. Asegurar servidor local
Write-Host "1. Verificando servidor Node.js en puerto 3000..." -ForegroundColor Cyan
$serverOk = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 2
    if ($res.status -eq "UP") { $serverOk = $true }
} catch {}

if (-not $serverOk) {
    Write-Host "   Iniciando servidor Node.js..." -ForegroundColor Yellow
    $nodeExe = "C:\Users\wgarita\AppData\Local\Programs\nodejs\node.exe"
    if (-not (Test-Path $nodeExe)) {
        $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    }
    $stdoutLog = "C:\tec-qs-contacts\storage\server.log"
    $stderrLog = "C:\tec-qs-contacts\storage\server_err.log"
    Start-Process -FilePath $nodeExe -ArgumentList "server.js" -WorkingDirectory "C:\tec-qs-contacts" -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden
    
    $retries = 0
    while (-not $serverOk -and $retries -lt 10) {
        Start-Sleep -Seconds 1
        $retries++
        try {
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 2
            if ($res.status -eq "UP") { $serverOk = $true }
        } catch {}
    }
}
Write-Host "   [OK] Servidor local activo." -ForegroundColor Green

# 2. Gestionar tunel Cloudflare con protocolo http2
Write-Host "2. Verificando enlace web seguro..." -ForegroundColor Cyan
$urlFile = "C:\tec-qs-contacts\storage\tunnel_url.txt"
$logFile = "C:\tec-qs-contacts\storage\cloudflared.log"
$cfExe   = "C:\tec-qs-contacts\cloudflared.exe"

$tunnelUrl = $null
if (Test-Path $urlFile) {
    $existing = (Get-Content $urlFile -Raw).Trim()
    if ($existing) {
        try {
            $check = Invoke-RestMethod -Uri "$existing/api/health" -TimeoutSec 3
            if ($check.status -eq "UP") {
                $tunnelUrl = $existing
            }
        } catch {}
    }
}

if (-not $tunnelUrl) {
    Write-Host "   Conectando nuevo enlace seguro institucional (HTTP/2)..." -ForegroundColor Yellow
    Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 600
    
    if (Test-Path $logFile) { Remove-Item $logFile -Force }
    Start-Process -FilePath $cfExe -ArgumentList "tunnel --protocol http2 --url http://localhost:3000 --logfile `"$logFile`"" -WorkingDirectory "C:\tec-qs-contacts" -WindowStyle Hidden

    $attempts = 0
    while (-not $tunnelUrl -and $attempts -lt 20) {
        Start-Sleep -Seconds 1
        $attempts++
        if (Test-Path $logFile) {
            $raw = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
            if ($raw -match 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
            }
        }
    }
    if ($tunnelUrl) {
        Set-Content -Path $urlFile -Value $tunnelUrl -Force
    }
} else {
    Write-Host "   [OK] Enlace web activo y funcionando." -ForegroundColor Green
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
if ($tunnelUrl) {
    Set-Clipboard -Value $tunnelUrl
    Write-Host ">> ENLACE PARA COMPARTIR (Copiado a tu portapapeles):" -ForegroundColor White
    Write-Host "   $tunnelUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host ">> Solo pulsa Ctrl + V para enviarlo por Teams, WhatsApp o Correo." -ForegroundColor Cyan
    Write-Host ">> Tus companeros pueden ingresar desde cualquier navegador." -ForegroundColor Gray
    # Abrir navegador automáticamente
    Start-Process "http://localhost:3000"
} else {
    Write-Host "[ERROR] No se pudo obtener el enlace. Revisa tu conexion a Internet." -ForegroundColor Red
}

Write-Host "Modo de Acceso:" -ForegroundColor White
Write-Host "   Inicio automatico: Usuario (Wilson Garita Gomez)" -ForegroundColor Green
Write-Host "   Correo:            wgarita@itcr.ac.cr (Clave: TecQS2026!)" -ForegroundColor DarkCyan
Write-Host "   Sede / Depto:      Campus Central Cartago / OPI" -ForegroundColor DarkCyan
Write-Host "   (Puede alternar a Administrador en cualquier momento desde el menu)" -ForegroundColor Gray
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""
