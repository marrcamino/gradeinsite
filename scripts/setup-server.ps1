#Requires -Version 5.1
<#
  GradeInsite — school server setup.

  Puts the student portal and the API into XAMPP's htdocs, creates the MySQL
  database and the account the API connects as, and leaves Apache serving on
  the school network.

  It is safe to run again. That is the whole point of the migration
  bookkeeping below: 001_mysql_server_schema.sql opens with DROP TABLE, so a
  second blind run would destroy every grade in the school. Nothing is applied
  twice, and an existing config.local.php is read rather than overwritten, so
  running this against a later release upgrades the server instead of wiping it.

  XAMPP and MySQL are found, never installed. Bundling them would add most of a
  gigabyte to the download and put their redistribution terms on this project.
#>
[CmdletBinding()]
param(
  # Where XAMPP is, if it is somewhere unusual.
  [string] $XamppRoot,
  # The MySQL client, if it is not on PATH or in Program Files.
  [string] $MysqlExe,
  # The MySQL root password. Prompted for if not given.
  [string] $RootPassword,
  # The folder under htdocs, and so the last part of the address students type.
  [string] $SiteName = 'gradeinsite',
  # Leave Apache to the XAMPP control panel instead of running it as a service.
  [switch] $NoService,
  # Do not open port 80 to the local network.
  [switch] $NoFirewall
)

$ErrorActionPreference = 'Stop'

# --- Saying what is happening ----------------------------------------------

function Write-Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Write-Info($text) { Write-Host "    $text" -ForegroundColor Gray }
function Write-Warn2($text){ Write-Host "    $text" -ForegroundColor Yellow }

function Fail($text, $how) {
  Write-Host ""
  Write-Host "  $text" -ForegroundColor Red
  if ($how) { Write-Host ""; foreach ($line in $how) { Write-Host "  $line" -ForegroundColor Yellow } }
  Write-Host ""
  exit 1
}

# --- Finding the payload ----------------------------------------------------
#
# This script runs from two places: unzipped beside the files it installs, and
# from scripts/ in a checkout, where the same files are still build output.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-Payload {
  $release = [PSCustomObject]@{
    Web        = Join-Path $here 'web'
    Api        = Join-Path $here 'api'
    Migrations = Join-Path $here 'db'
  }
  if ((Test-Path $release.Web) -and (Test-Path $release.Api)) { return $release }

  $repo = Split-Path -Parent $here
  $checkout = [PSCustomObject]@{
    Web        = Join-Path $repo 'apps\web\dist'
    Api        = Join-Path $repo 'apps\api'
    Migrations = Join-Path $repo 'db\migrations'
  }
  if (Test-Path $checkout.Api) {
    if (-not (Test-Path $checkout.Web)) {
      Fail "The student portal has not been built yet." @(
        "Build it first, then run this again:",
        "",
        "    cd apps\web",
        "    npm install",
        "    npm run build"
      )
    }
    return $checkout
  }

  Fail "Cannot find the files to install." @(
    "Run this from the unzipped GradeInsite-Server folder, or from scripts\ in a checkout."
  )
}

$payload = Resolve-Payload

# --- XAMPP ------------------------------------------------------------------

function Find-Xampp {
  $candidates = @()
  if ($XamppRoot) { $candidates += $XamppRoot }
  $candidates += @('C:\xampp', 'D:\xampp', 'E:\xampp')

  foreach ($root in $candidates) {
    if (-not $root) { continue }
    $httpd = Join-Path $root 'apache\bin\httpd.exe'
    $php   = Join-Path $root 'php\php.exe'
    if ((Test-Path $httpd) -and (Test-Path $php)) { return $root }
  }
  return $null
}

Write-Step "Looking for XAMPP"
$xampp = Find-Xampp
if (-not $xampp) {
  Fail "XAMPP is not installed, or not where this expected to find it." @(
    "Download it from https://www.apachefriends.org and install it to C:\xampp.",
    "",
    "In the installer, tick Apache and PHP only.",
    "Untick MySQL/MariaDB and phpMyAdmin -- GradeInsite uses MySQL 8.4,",
    "and XAMPP's own database would fight it for port 3306.",
    "",
    "If XAMPP is on another drive, pass it:  -XamppRoot D:\xampp"
  )
}
$httpd = Join-Path $xampp 'apache\bin\httpd.exe'
$php   = Join-Path $xampp 'php\php.exe'
Write-Ok "XAMPP at $xampp"

# The API talks to MySQL through PDO and measures names with mb_strlen. Both
# ship enabled in XAMPP, but a hand-edited php.ini is a confusing failure much
# later, so it is worth ten seconds here.
$modules = & $php -m 2>$null
foreach ($needed in @('pdo_mysql', 'mbstring')) {
  if ($modules -notcontains $needed) {
    Fail "PHP is missing the $needed extension." @(
      "Open $xampp\php\php.ini, remove the ; in front of this line, and save:",
      "",
      "    extension=$needed",
      "",
      "Then run this again."
    )
  }
}
Write-Ok "PHP has pdo_mysql and mbstring"

# --- MySQL ------------------------------------------------------------------

function Find-Mysql {
  if ($MysqlExe -and (Test-Path $MysqlExe)) { return $MysqlExe }

  $onPath = Get-Command mysql.exe -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }

  $roots = @("$env:ProgramFiles\MySQL", "${env:ProgramFiles(x86)}\MySQL")
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    $found = Get-ChildItem -Path $root -Filter 'mysql.exe' -Recurse -ErrorAction SilentlyContinue |
             Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

Write-Step "Looking for MySQL"
$mysql = Find-Mysql
if (-not $mysql) {
  Fail "The MySQL client was not found." @(
    "Install MySQL 8.4 Community Server from https://dev.mysql.com/downloads/mysql/",
    "and let it run on the default port 3306.",
    "",
    "If it is already installed somewhere unusual, pass it:",
    "  -MysqlExe `"C:\path\to\bin\mysql.exe`""
  )
}
Write-Ok "MySQL client at $mysql"

$listening = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $listening) {
  # A stopped service is the usual reason, and starting it is something this
  # can just do rather than send someone to services.msc for.
  $svc = Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($svc -and $svc.Status -ne 'Running') {
    Write-Info "Starting the $($svc.Name) service..."
    Start-Service $svc.Name
    Start-Sleep -Seconds 3
    $listening = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue
  }
}
if (-not $listening) {
  Fail "Nothing is answering on port 3306." @(
    "Start the MySQL service and run this again."
  )
}
Write-Ok "MySQL is answering on port 3306"

# --- Talking to MySQL -------------------------------------------------------
#
# Credentials go in a temporary defaults file, never on the command line: an
# argument is visible to anything that can list processes, and this runs on a
# machine students share a network with.

$cnf = $null

function New-MysqlDefaultsFile($user, $password) {
  $path = [System.IO.Path]::GetTempFileName()
  $text = "[client]`r`nhost=127.0.0.1`r`nport=3306`r`nuser=$user`r`npassword=`"$password`"`r`n"
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
  return $path
}

function Invoke-MysqlQuery($sql) {
  $out = & $mysql "--defaults-extra-file=$cnf" --default-character-set=utf8mb4 --batch --skip-column-names -e $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "MySQL refused the query: $out" }
  return $out
}

function Invoke-MysqlFile($file) {
  # Redirected through cmd so the file's bytes reach MySQL as they are on disk.
  # Piping it through PowerShell re-encodes it, and these files have em dashes
  # in their comments.
  $line = '"{0}" "--defaults-extra-file={1}" --default-character-set=utf8mb4 < "{2}"' -f $mysql, $cnf, $file
  $out = & cmd /c $line 2>&1
  if ($LASTEXITCODE -ne 0) { throw "MySQL refused $([System.IO.Path]::GetFileName($file)): $out" }
}

function New-Password {
  # Letters and digits only: this value is written into a PHP single-quoted
  # string and a MySQL one, and neither should need escaping.
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 24)
}

Write-Step "Signing in to MySQL as root"
if (-not $RootPassword) {
  Write-Info "Needed once, to create the database and the account the API uses."
  $secure = Read-Host -Prompt "    MySQL root password" -AsSecureString
  $RootPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$cnf = New-MysqlDefaultsFile 'root' $RootPassword
try {
  Invoke-MysqlQuery 'SELECT 1' | Out-Null
} catch {
  Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  Fail "MySQL would not accept that root password." @("Check it and run this again.")
}
Write-Ok "Connected"

try {
  # --- The database ---------------------------------------------------------

  Write-Step "Setting up the database"

  $dbExists = (Invoke-MysqlQuery "SHOW DATABASES LIKE 'gradeinsite'") -contains 'gradeinsite'

  $applied = @()
  if ($dbExists) {
    # An empty result also means a database from before the bookkeeping table
    # existed. Either way, what is listed is what has already run.
    try { $applied = @(Invoke-MysqlQuery "SELECT filename FROM gradeinsite.schema_migrations") } catch { $applied = @() }
    Write-Info "The database is already here; $($applied.Count) migration(s) applied."
  } else {
    Write-Info "No database yet -- creating it."
  }

  # The API's own MySQL account. On an upgrade the password already in
  # config.local.php is kept, so a working server is not locked out of itself.
  $siteRoot  = Join-Path (Join-Path $xampp 'htdocs') $SiteName
  $configPhp = Join-Path $siteRoot 'api\config.local.php'

  $appPassword = $null
  if (Test-Path $configPhp) {
    $existing = Get-Content $configPhp -Raw
    if ($existing -match "'password'\s*=>\s*'([^']*)'") {
      $appPassword = $Matches[1]
      Write-Info "Reusing the API password already in config.local.php."
    }
  }
  $freshPassword = $false
  if (-not $appPassword) {
    $appPassword = New-Password
    $freshPassword = $true
  }

  $migrations = Get-ChildItem -Path $payload.Migrations -Filter '*_mysql_*.sql' | Sort-Object Name
  if ($migrations.Count -eq 0) { Fail "No MySQL migrations found in $($payload.Migrations)." }

  foreach ($file in $migrations) {
    if ($applied -contains $file.Name) {
      Write-Info "already applied  $($file.Name)"
      continue
    }

    # 002 ships with CHANGE_ME where the password goes, and must stay that way
    # on disk -- the desktop app checksums these files whole. The substitution
    # happens on a copy, in the temp folder, deleted below.
    $toRun = $file.FullName
    $temp  = $null
    if ((Get-Content $file.FullName -Raw) -match 'CHANGE_ME') {
      $temp = Join-Path ([System.IO.Path]::GetTempPath()) $file.Name
      $substituted = (Get-Content $file.FullName -Raw) -replace 'CHANGE_ME', $appPassword
      # WriteAllText with an encoding that emits no BOM. Set-Content -Encoding
      # UTF8 writes one on PowerShell 5.1, and those three bytes reach mysql
      # ahead of the first statement, which it rejects.
      [System.IO.File]::WriteAllText($temp, $substituted, (New-Object System.Text.UTF8Encoding($false)))
      $toRun = $temp
    }

    try {
      Invoke-MysqlFile $toRun
      # 001 records itself; 002 does not. Recording every file here makes the
      # two consistent without editing either of them.
      Invoke-MysqlQuery "INSERT IGNORE INTO gradeinsite.schema_migrations (filename) VALUES ('$($file.Name)')" | Out-Null
      Write-Ok "applied  $($file.Name)"
    } finally {
      if ($temp) { Remove-Item $temp -Force -ErrorAction SilentlyContinue }
    }
  }

  # The account may predate this run with a password nobody kept. Resetting it
  # is the only way back to a config file that works.
  if ($freshPassword) {
    Invoke-MysqlQuery "ALTER USER IF EXISTS 'gradeinsite'@'localhost' IDENTIFIED BY '$appPassword'" | Out-Null
  }
  Write-Ok "Database ready"

} finally {
  Remove-Item $cnf -Force -ErrorAction SilentlyContinue
}

# --- The files --------------------------------------------------------------

Write-Step "Copying the app into htdocs"

New-Item -ItemType Directory -Path $siteRoot -Force | Out-Null
$apiRoot = Join-Path $siteRoot 'api'
New-Item -ItemType Directory -Path $apiRoot -Force | Out-Null

# Vite gives every build's assets new hashed names, so old ones would pile up
# release after release. Nothing else under the site root is generated, so this
# is the only folder it is safe to clear.
$assets = Join-Path $siteRoot 'assets'
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }

Copy-Item -Path (Join-Path $payload.Web '*') -Destination $siteRoot -Recurse -Force
Write-Ok "Student portal  -> $siteRoot"

# config.local.php holds the password and is written below, never copied: a
# checkout does not have one, and an installed server's copy must survive.
Get-ChildItem -Path $payload.Api -File |
  Where-Object { $_.Name -ne 'config.local.php' } |
  Copy-Item -Destination $apiRoot -Force
$htaccess = Join-Path $payload.Api '.htaccess'
if (Test-Path $htaccess) { Copy-Item $htaccess -Destination $apiRoot -Force }
Write-Ok "API             -> $apiRoot"

if (-not (Test-Path $configPhp)) {
  $config = @"
<?php
// Written by the GradeInsite server setup. The password below belongs to the
// limited MySQL account the API connects as -- it can read and write rows and
// nothing else. Keep this file out of any repository.

return [
    'host'     => '127.0.0.1',
    'port'     => 3306,
    'database' => 'gradeinsite',
    'username' => 'gradeinsite',
    'password' => '$appPassword',
    'charset'  => 'utf8mb4',
];
"@
  [System.IO.File]::WriteAllText($configPhp, $config, (New-Object System.Text.UTF8Encoding($false)))
  Write-Ok "Wrote api\config.local.php"
} else {
  Write-Info "Kept the existing api\config.local.php"
}

# --- Apache -----------------------------------------------------------------

Write-Step "Starting Apache"

$service = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue

if (-not $service -and -not $NoService) {
  # A school server should come back on its own after a power cut, which the
  # XAMPP control panel cannot do -- it needs somebody logged in to click it.
  Write-Info "Registering Apache as a Windows service so it starts on boot..."
  & $httpd -k install -n 'Apache2.4' | Out-Null
  $service = Get-Service -Name 'Apache2.4' -ErrorAction SilentlyContinue
}

if ($service) {
  if ($service.Status -eq 'Running') { Restart-Service 'Apache2.4' } else { Start-Service 'Apache2.4' }
  Set-Service -Name 'Apache2.4' -StartupType Automatic
  Write-Ok "Apache is running as a service, and will start with Windows"
} else {
  Write-Warn2 "Apache is not a service. Start it from the XAMPP control panel."
}

# --- The network ------------------------------------------------------------

if (-not $NoFirewall) {
  Write-Step "Opening port 80 to the school network"
  $ruleName = 'GradeInsite (Apache 80)'
  # Private and domain only. This is a school LAN, not the internet.
  & netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
  & netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=80 profile=private,domain | Out-Null
  Write-Ok "Windows Firewall will let students reach the server"
}

# --- Does it work? ----------------------------------------------------------

Write-Step "Checking the server answers"

$healthUrl = "http://localhost/$SiteName/api/health.php"
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 15
  if ($health.ok) {
    Write-Ok "health.php reports every table present on MySQL $($health.server)"
  } else {
    Write-Warn2 "health.php answered, but these tables are missing: $($health.missing -join ', ')"
  }
} catch {
  Fail "The server did not answer at $healthUrl" @(
    "Apache may not have started. Open the XAMPP control panel and look at its log.",
    "The most common cause is something else already using port 80 -- Skype or IIS."
  )
}

# --- Where it is ------------------------------------------------------------

$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "  GradeInsite is installed." -ForegroundColor Green
Write-Host ""
Write-Host "  Students open this in a browser on the school wi-fi:" -ForegroundColor White
foreach ($ip in $addresses) { Write-Host "      http://$ip/$SiteName/" -ForegroundColor Cyan }
Write-Host ""
Write-Host "  Instructors type the same address into the desktop app," -ForegroundColor White
Write-Host "  under 'Where is the server?' on the sign-in screen:" -ForegroundColor White
foreach ($ip in $addresses) { Write-Host "      $ip   folder: $SiteName/" -ForegroundColor Cyan }
Write-Host ""
Write-Host "  The first instructor to choose 'Create an account' in the desktop" -ForegroundColor White
Write-Host "  app gets in without approval. After that, an instructor who already" -ForegroundColor White
Write-Host "  has an account has to approve each new one." -ForegroundColor White
Write-Host ""

if ($addresses.Count -gt 1) {
  Write-Warn2 "This computer has more than one address. Use the one on the school network."
  Write-Host ""
}
