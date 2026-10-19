$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $Root
Write-Host "Al-Syed Jalal AI V76 - Windows deployment setup" -ForegroundColor Cyan
function Has($cmd){ return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }
function Ensure-WingetPackage($id,$name){
  if(-not (Has 'winget')) { throw "winget is required. Install App Installer from Microsoft Store, then rerun." }
  if(-not (Has $name)){ Write-Host "Installing $id..."; winget install --id $id --exact --accept-package-agreements --accept-source-agreements }
}
if(-not (Has 'node')) { Ensure-WingetPackage 'OpenJS.NodeJS.LTS' 'node' }
if(-not (Has 'docker')) {
  if(Has 'winget'){ Write-Host 'Docker Desktop not found; attempting automatic Docker Desktop installation...' -ForegroundColor Yellow; winget install --id Docker.DockerDesktop --exact --accept-package-agreements --accept-source-agreements; Write-Host 'Docker Desktop installation completed. If Windows requests a reboot, reboot and rerun this script.' -ForegroundColor Yellow }
  $docker = Has 'docker'
} else { $docker=$true }
if(-not (Test-Path '.env')) {
  Copy-Item '.env.deploy.example' '.env'
  $db=Read-Host 'PostgreSQL password (strong password)'; $auth=Read-Host 'AUTH_SECRET (32+ random chars; leave blank to generate)'; $csrf=Read-Host 'CSRF_SECRET (32+ random chars; leave blank to generate)'; $admin=Read-Host 'Admin password'
  if([string]::IsNullOrWhiteSpace($auth)){ $b=[byte[]]::new(48); [Security.Cryptography.RandomNumberGenerator]::Fill($b); $auth=[Convert]::ToBase64String($b) }
  if([string]::IsNullOrWhiteSpace($csrf)){ $b=[byte[]]::new(48); [Security.Cryptography.RandomNumberGenerator]::Fill($b); $csrf=[Convert]::ToBase64String($b) }
  (Get-Content '.env') -replace '^POSTGRES_PASSWORD=.*',"POSTGRES_PASSWORD=$db" -replace '^AUTH_SECRET=.*',"AUTH_SECRET=$auth" -replace '^CSRF_SECRET=.*',"CSRF_SECRET=$csrf" -replace '^SEED_ADMIN_PASSWORD=.*',"SEED_ADMIN_PASSWORD=$admin" | Set-Content '.env'
}
if($docker -and (docker info 2>$null)){ Write-Host 'Starting PostgreSQL + API + web with Docker Compose...' -ForegroundColor Green; docker compose up --build -d; docker compose exec -T api node scripts/migrate.mjs; docker compose exec -T api node scripts/seed.mjs } else {
  if(-not (Has 'psql')) { Write-Host 'PostgreSQL client/server not found. Install PostgreSQL 16, ensure psql is on PATH, then rerun.' -ForegroundColor Yellow; exit 2 }
  $envFile=Get-Content '.env' | Where-Object {$_ -match '^[A-Z_]+='}; foreach($line in $envFile){$p=$line.Split('=',2); [Environment]::SetEnvironmentVariable($p[0],$p[1])}
  Write-Host 'Direct PostgreSQL mode: DATABASE_URL must point at your running PostgreSQL.'
  if(-not $env:DATABASE_URL){$env:DATABASE_URL="postgresql://$env:POSTGRES_USER`:$env:POSTGRES_PASSWORD@127.0.0.1:5432/$env:POSTGRES_DB"}
  Push-Location backend; npm install --omit=dev; node scripts/migrate.mjs; node scripts/seed.mjs; Pop-Location
  Start-Process powershell -ArgumentList '-NoProfile','-Command',"cd '$Root/backend'; node server.mjs" -WindowStyle Minimized
}
Write-Host 'Waiting for API...' -ForegroundColor Cyan
for($i=0;$i -lt 30;$i++){ try{$r=Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing; if($r.StatusCode -eq 200){break}}catch{} Start-Sleep 2 }
try{ Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing | Out-Null; Write-Host 'API health: PASS' -ForegroundColor Green }catch{ throw 'API did not become healthy.' }
Write-Host 'Deployment ready: http://127.0.0.1:8080 (Docker web) / API http://127.0.0.1:8787' -ForegroundColor Green
