param(
  [string]$Version = '',
  [string]$ReleaseNotes = 'Maintenance and usability improvements.',
  [string]$ReleaseBaseUrl = 'https://github.com/jaredl2013/cashsaver/releases/download'
)

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $appRoot)
$outputDir = Join-Path $workspaceRoot 'outputs\release'
$stageDir = Join-Path $workspaceRoot 'work\release-stage'
$package = Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = [string]$package.version }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must use x.y.z format, for example 1.0.1.' }

$isccCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
)
$iscc = $isccCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 is not installed. Install it, then run this script again.' }

if (-not (Test-Path (Join-Path $appRoot 'node_modules'))) {
  npm --prefix $appRoot ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'npm could not prepare the production dependencies.' }
}

if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir,$outputDir -Force | Out-Null

$files = @('server.js','db.js','index.html','install-service.js','uninstall-service.js','package.json','package-lock.json','README.md')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $appRoot $file) -Destination $stageDir -Force }
Copy-Item -LiteralPath (Join-Path $appRoot 'public') -Destination (Join-Path $stageDir 'public') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $appRoot 'node_modules') -Destination (Join-Path $stageDir 'node_modules') -Recurse -Force

$nodePath = (& node -p 'process.execPath').Trim()
if (-not (Test-Path $nodePath)) { throw 'Could not locate the Node.js runtime.' }
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $stageDir 'node.exe') -Force

$stagedPackagePath = Join-Path $stageDir 'package.json'
$stagedPackage = Get-Content $stagedPackagePath -Raw | ConvertFrom-Json
$stagedPackage.version = $Version
$stagedPackage | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $stagedPackagePath -Encoding utf8

$issPath = Join-Path $PSScriptRoot 'CashSaver.iss'
& $iscc "/DMyAppVersion=$Version" "/DStageDir=$stageDir" "/DOutputDir=$outputDir" $issPath
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE." }

$installerName = "CashSaver-Weekly-Ad-Builder-Setup-$Version.exe"
$installerPath = Join-Path $outputDir $installerName
if (-not (Test-Path $installerPath)) { throw "Installer was not created: $installerPath" }
$hash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  version = $Version
  downloadUrl = "$ReleaseBaseUrl/v$Version/$installerName"
  sha256 = $hash
  releaseNotes = $ReleaseNotes
  publishedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$manifestPath = Join-Path $outputDir 'update.json'
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Host "Installer: $installerPath"
Write-Host "Manifest:  $manifestPath"
Write-Host "SHA-256:   $hash"
