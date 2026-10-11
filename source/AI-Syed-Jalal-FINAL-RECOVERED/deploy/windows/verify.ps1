$ErrorActionPreference='Stop'; Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
Write-Host 'Running deployment verification...' -ForegroundColor Cyan
Invoke-WebRequest http://127.0.0.1:8787/api/health -UseBasicParsing | Out-Null
Invoke-WebRequest http://127.0.0.1:8787/api/ready -UseBasicParsing | Out-Null
Push-Location backend
npm run audit:current
$env:E2E_PASSWORD = if($env:E2E_PASSWORD){$env:E2E_PASSWORD}else{Read-Host 'E2E admin password'}
npm run e2e:runtime
Pop-Location
if($env:RUN_BROWSER_E2E -eq '1'){ node tests/browser-e2e.mjs http://127.0.0.1:8080/ }
if($env:RUN_AI_E2E -eq '1'){ Push-Location backend; npm run e2e:ai; Pop-Location }
Write-Host 'Deployment verification completed.' -ForegroundColor Green
