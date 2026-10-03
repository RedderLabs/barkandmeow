<#
  Deja Docker listo para Bark & Meow en Windows:
    1. Si Docker Desktop no está instalado, lo instala con winget.
    2. Si el motor no responde, abre Docker Desktop y espera a que arranque.
    3. Levanta los servicios del proyecto (infra/compose.yaml): postgres,
       dragonfly y pepper.

  Uso:  pnpm docker
        powershell -ExecutionPolicy Bypass -File scripts/docker.ps1 [-Espera 180] [-SinServicios]

  La instalación pide permisos de administrador y Docker usa WSL 2: si es la
  primera vez, puede que Windows pida reiniciar. Tras reiniciar, se vuelve a
  ejecutar el script y sigue donde se quedó.
#>
param(
  # Segundos que se espera a que el motor de Docker responda.
  [int]$Espera = 180,
  # Solo instalar y arrancar Docker, sin levantar los servicios del proyecto.
  [switch]$SinServicios
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$escritorio = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
$cliente = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'

function Paso($texto) { Write-Host "-> $texto" -ForegroundColor Cyan }
function Bien($texto) { Write-Host "   $texto" -ForegroundColor Green }
function Fallo($texto) { Write-Host "   $texto" -ForegroundColor Red; exit 1 }

# El docker del PATH o, recién instalado y sin PATH refrescado, el de Docker Desktop.
function RutaDocker {
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (Test-Path $cliente) { return $cliente }
  return $null
}

# ¿Responde el motor? `docker info` falla mientras Docker Desktop arranca.
function MotorVivo {
  $d = RutaDocker
  if (-not $d) { return $false }
  & $d info --format '{{.ServerVersion}}' *> $null
  return $LASTEXITCODE -eq 0
}

# 1. Instalado
Paso 'Docker instalado'
if (-not (Test-Path $escritorio) -and -not (RutaDocker)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Fallo 'No está Docker ni winget. Instala Docker Desktop a mano: https://docs.docker.com/desktop/setup/install/windows-install/'
  }
  Write-Host '   No está. Instalando Docker Desktop con winget (pedirá permisos de administrador)...'
  & winget install --exact --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { Fallo "winget terminó con el código $LASTEXITCODE." }
  if (-not (Test-Path $escritorio)) { Fallo 'La instalación no dejó Docker Desktop donde se esperaba. Reinicia y vuelve a ejecutar el script.' }
  Bien 'Instalado. Si Windows pide reiniciar (WSL 2), reinicia y vuelve a ejecutar el script.'
} else {
  Bien 'Sí.'
}

# 2. Arrancado
Paso 'Motor de Docker'
if (MotorVivo) {
  Bien 'Ya estaba en marcha.'
} else {
  if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    if (-not (Test-Path $escritorio)) { Fallo "No encuentro $escritorio." }
    Write-Host '   Abriendo Docker Desktop...'
    Start-Process -FilePath $escritorio | Out-Null
  } else {
    Write-Host '   Docker Desktop está abierto pero el motor aún no responde; espero.'
  }
  $limite = (Get-Date).AddSeconds($Espera)
  while (-not (MotorVivo)) {
    if ((Get-Date) -gt $limite) {
      Fallo "El motor no respondió en $Espera s. Mira la ventana de Docker Desktop (a veces pide aceptar las condiciones o actualizar WSL: wsl --update)."
    }
    Start-Sleep -Seconds 3
    Write-Host '.' -NoNewline
  }
  Write-Host ''
  Bien 'En marcha.'
}

if ($SinServicios) { exit 0 }

# 3. Servicios del proyecto
Paso 'Servicios de Bark & Meow (postgres, dragonfly, pepper)'
$d = RutaDocker
& $d compose -f (Join-Path $raiz 'infra\compose.yaml') up -d --wait
if ($LASTEXITCODE -ne 0) { Fallo "docker compose terminó con el código $LASTEXITCODE." }
& $d ps --filter 'name=barkandmeow-' --format '   {{.Names}}  {{.Status}}'
Bien 'Listo. La API de desarrollo se arranca aparte: pnpm --filter ./apps/api dev'
