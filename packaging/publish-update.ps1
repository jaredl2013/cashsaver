param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$ReleaseNotes
)

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $appRoot)
$releaseOutput = Join-Path $workspaceRoot 'outputs\release'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is required to publish an update.' }
if (-not (Test-Path (Join-Path $appRoot '.git'))) { throw 'Run this from the GitHub copy of the Cash Saver repository.' }
if (git -C $appRoot status --porcelain) { throw 'Commit or stash existing changes before publishing an update.' }

npm --prefix $appRoot version $Version --no-git-tag-version
& (Join-Path $PSScriptRoot 'build-release.ps1') -Version $Version -ReleaseNotes $ReleaseNotes

$installer = Join-Path $releaseOutput "CashSaver-Weekly-Ad-Builder-Setup-$Version.exe"
$manifestOutput = Join-Path $releaseOutput 'update.json'
$manifestRepoDir = Join-Path $appRoot 'release'
New-Item -ItemType Directory -Path $manifestRepoDir -Force | Out-Null
Copy-Item -LiteralPath $manifestOutput -Destination (Join-Path $manifestRepoDir 'update.json') -Force

git -C $appRoot add package.json package-lock.json release/update.json
git -C $appRoot commit -m "Release v$Version"
git -C $appRoot push
gh release create "v$Version" $installer --repo jaredl2013/cashsaver --title "CashSaver Weekly Ad Builder $Version" --notes $ReleaseNotes

Write-Host "Published v$Version. Installed apps will find it during their next update check."
