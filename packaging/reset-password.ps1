<#
.SYNOPSIS
  Lockwood IT support tool: resets a client's CashSaver Ad Builder login password
  without needing to hunt down and hand-edit .env in Notepad.

.DESCRIPTION
  Run this ON the client's PC (in person or over remote support) as Administrator.
  It updates SHARED_PASSWORD (and optionally ADMIN_PASSWORD) in the installed app's
  .env file, then restarts the WeeklyAdBuilder Windows Service so the change takes
  effect immediately.

.PARAMETER NewPassword
  The new login password. If omitted, you'll be prompted for it.

.PARAMETER AlsoResetAdmin
  Also set ADMIN_PASSWORD to the same value (the separate password used only for
  the "remove credit bar" toggle). Omit this if the client has their own distinct
  admin password they still remember and you only need to fix their login password.

.PARAMETER DataDir
  Override the .env location. Defaults to the standard install path used by the
  CashSaver Ad Builder installer.

.EXAMPLE
  .\reset-password.ps1
  (prompts for the new password)

.EXAMPLE
  .\reset-password.ps1 -NewPassword "NewStorePassword1" -AlsoResetAdmin
#>
param(
  [string]$NewPassword,
  [switch]$AlsoResetAdmin,
  [string]$DataDir = (Join-Path $env:ProgramData 'Lockwood IT Services\CashSaver Weekly Ad Builder')
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Warning "Not running as Administrator — restarting the service below will likely fail. Right-click PowerShell and 'Run as administrator', then run this script again."
}

$envPath = Join-Path $DataDir '.env'
if (-not (Test-Path $envPath)) {
  throw "No .env found at $envPath — is CashSaver Ad Builder actually installed on this computer? Pass -DataDir if it's installed somewhere non-standard."
}

if (-not $NewPassword) {
  $NewPassword = Read-Host "New login password (min 6 characters)"
}
if ($NewPassword.Length -lt 6) {
  throw "Password must be at least 6 characters — same rule the installer enforces."
}

# Match the installer's own quoting: escape backslashes/quotes, strip any stray newlines.
function ConvertTo-DotEnvValue([string]$Value) {
  $escaped = $Value -replace '\\', '\\' -replace '"', '\"' -replace "`r|`n", ''
  return '"' + $escaped + '"'
}

$lines = Get-Content -LiteralPath $envPath
$quoted = ConvertTo-DotEnvValue $NewPassword

$updated = $lines | ForEach-Object {
  if ($_ -match '^SHARED_PASSWORD=') {
    "SHARED_PASSWORD=$quoted"
  } elseif ($AlsoResetAdmin -and $_ -match '^ADMIN_PASSWORD=') {
    "ADMIN_PASSWORD=$quoted"
  } else {
    $_
  }
}

Set-Content -LiteralPath $envPath -Value $updated -Encoding UTF8
Write-Output "Updated $envPath"

$service = Get-Service -Name 'weeklyadbuilder.exe' -ErrorAction SilentlyContinue
if ($service) {
  try {
    Write-Output "Restarting the WeeklyAdBuilder service so the new password takes effect..."
    Restart-Service -Name 'weeklyadbuilder.exe' -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Write-Output "Service status: $((Get-Service -Name 'weeklyadbuilder.exe').Status)"
  } catch {
    Write-Warning "Couldn't restart the service (needs Administrator): $($_.Exception.Message)"
    Write-Warning "The .env file IS updated — just restart the service yourself (services.msc, or 'net start weeklyadbuilder.exe' from an admin prompt) for the new password to take effect."
  }
} else {
  Write-Warning "No 'WeeklyAdBuilder' Windows Service found on this computer. If they're running it via start.bat instead, close that window and reopen it for the new password to take effect."
}

Write-Output "Done. New login password is set."
if ($AlsoResetAdmin) { Write-Output "Admin (credit-bar toggle) password was also updated to the same value." }
