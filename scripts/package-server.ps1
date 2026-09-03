#Requires -Version 5.1
<#
  Build the server release artifact.

  Produces dist\GradeInsite-Server-<version>.zip, which is what gets attached to
  a GitHub release alongside the desktop installer. Whoever sets up the school
  server downloads it, unzips it, and double-clicks one file.

  The desktop app is not built here -- `npm run tauri build` in apps\desktop
  makes its .msi and .exe, and Tauri already does that job well.
#>
[CmdletBinding()]
param(
  # Defaults to the version in apps\desktop\package.json.
  [string] $Version,
  [string] $OutputDir
)

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

if (-not $Version) {
  $Version = (Get-Content (Join-Path $repo 'apps\desktop\package.json') -Raw | ConvertFrom-Json).version
}
if (-not $OutputDir) { $OutputDir = Join-Path $repo 'dist' }

$stage = Join-Path $OutputDir "GradeInsite-Server-$Version"
$zip   = "$stage.zip"

Write-Host "==> Building the student portal" -ForegroundColor Cyan
Push-Location (Join-Path $repo 'apps\web')
try {
  if (-not (Test-Path 'node_modules')) { & npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed' } }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'The web build failed' }
} finally { Pop-Location }

Write-Host "==> Assembling $stage" -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $zip)   { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# The built portal.
Copy-Item (Join-Path $repo 'apps\web\dist') -Destination (Join-Path $stage 'web') -Recurse

# The API. config.local.php is a real credential and must never be packaged --
# the installer writes a fresh one on the machine it runs on.
$api = Join-Path $stage 'api'
New-Item -ItemType Directory -Path $api -Force | Out-Null
Get-ChildItem (Join-Path $repo 'apps\api') -File -Force |
  Where-Object { $_.Name -ne 'config.local.php' } |
  Copy-Item -Destination $api -Force

if (Test-Path (Join-Path $api 'config.local.php')) {
  throw 'config.local.php reached the package. Refusing to build a release with a live password in it.'
}

# Only the server's migrations; the SQLite ones are compiled into the desktop app.
$db = Join-Path $stage 'db'
New-Item -ItemType Directory -Path $db -Force | Out-Null
Copy-Item (Join-Path $repo 'db\migrations\*_mysql_*.sql') -Destination $db -Force

Copy-Item (Join-Path $here 'setup-server.ps1') -Destination $stage -Force
Copy-Item (Join-Path $here 'Setup GradeInsite Server.bat') -Destination $stage -Force

$readme = @"
GradeInsite -- school server
============================

This installs the student portal and the API onto the one computer that acts as
the school's server. Instructors do not need it; they install the desktop app.

Before you start, this computer needs two things:

  * XAMPP, with Apache and PHP only. Untick MySQL/MariaDB and phpMyAdmin
    during its install -- GradeInsite uses MySQL 8.4 and the two would fight
    over port 3306.       https://www.apachefriends.org

  * MySQL 8.4 Community Server, on the default port 3306.
    https://dev.mysql.com/downloads/mysql/

Then:

  1. Right-click "Setup GradeInsite Server.bat" and choose Open, or just
     double-click it. Say yes to the administrator prompt.
  2. Type the MySQL root password when it asks. It is needed once, to create
     the database and the limited account the API uses.
  3. Write down the address it prints at the end.

Students open that address in a browser on the school wi-fi. Instructors type
it into the desktop app under "Where is the server?" on the sign-in screen.

The first instructor to choose "Create an account" gets in without approval.
After that, an instructor who already has an account approves each new one.

Running this again with a newer release upgrades the server. It keeps the
database and the password it wrote the first time.

Version $Version
"@
[System.IO.File]::WriteAllText((Join-Path $stage 'README.txt'), $readme, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "==> Compressing" -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host ""
Write-Host "  $zip  ($size MB)" -ForegroundColor Green
Write-Host ""
