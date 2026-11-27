<#
================================================================================
  IntMap · USB EXTRAS (what the mirror cannot restore)
--------------------------------------------------------------------------------
  scripts/backup-usb.ps1 mirrors the tracked tree onto the USB ROOT. This script keeps
  what that mirror does not carry in the USB folder `extras\` — a folder the mirror
  NEVER deletes (backup-usb.ps1 $NotMirrored; tests/usb-extras-backup-checks.test.mjs).

    extras\memory\                    the agent memory store, plain (secret-looking files are NOT copied here)
    extras\config\claude\ , codex\    settings.json / settings.local.json / config.toml / AGENTS.md / skills
                                      (~/.codex/auth.json is a login token: never copied)
    extras\secrets\credentials.tar.gpg   CLAUDE.local.md + any file the scan flagged, ENCRYPTED
    extras\db\intmap-<UTC>.dump.gpg      pg_dump of production, ENCRYPTED  (+ .sha256)
    extras\supabase-secret-names.txt     NAMES of the production secrets, never values
    extras\MANIFEST.json              what this run did and what it skipped, and why

  THE PASSPHRASE IS THE OWNER'S, TYPED BY THE OWNER (AGENTS.md §7). It is read hidden from the
  console, or one line from stdin with -PassphraseFromStdin. It is never a parameter, never
  written to a file, never printed. With no way to ask (stdin redirected, no flag) every encrypted
  step is SKIPPED and says so — nothing sensitive is ever written in plain text instead.
  Plaintext intermediates live only in %TEMP% and are removed in `finally`.

  USAGE
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-extras.ps1
      ... -Status                   is the encrypted part stale? (no passphrase; RESULT stale|ok)
      ... -SkipEncrypted            only the plain parts + the secret NAMES
      ... -SelfTest -PassphraseFromStdin   encrypt→decrypt a dummy file and compare (no USB needed)

  Decrypt (docs/BACKUP-RESTORE.md):  gpg --decrypt <file>.gpg > <out>
  The last stdout line is  RESULT <status> <detail>   (ok | partial | skipped | failed)
================================================================================
#>
[CmdletBinding()]
param(
  [string]$Label = 'INTMAP-BACKUP',
  [string]$Project = 'vpekfwdpurzejrrmacac',
  [switch]$SkipEncrypted,
  [switch]$PassphraseFromStdin,
  [switch]$SelfTest,
  [switch]$Status,
  [int]$StaleDays = 14,
  [int]$KeepDumps = 3
)
$ErrorActionPreference = 'Stop'

$Here = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$common = & git -C $Here rev-parse --path-format=absolute --git-common-dir 2>$null
if ($LASTEXITCODE -ne 0 -or -not $common) { Write-Host 'RESULT failed no-repo'; exit 1 }
$Repo = (Resolve-Path (Split-Path ($common -replace '/', '\') -Parent)).Path
$IdFile = '.intmap-backup-id.json'
$Ledger = Join-Path $env:USERPROFILE '.claude\projects\C--Users-gyuuk-OneDrive-IntMap\usb-extras-state.json'
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('intmap-extras-' + [guid]::NewGuid().ToString('N'))
function Say($m) { Write-Host $m }

# Patterns that mean "this file holds a credential". A hit moves the file from the plain copy to the encrypted bundle.
# Shapes, not values: Cloudflare cfut_, ArcGIS AAPT, GitHub/OpenAI/Supabase tokens, JWTs, private keys, AWS ids.
$SecretShapes = @(
  'cfut_[A-Za-z0-9]{20,}', 'AAPT[A-Za-z0-9_\-\.]{40,}', 'gh[pousr]_[A-Za-z0-9]{30,}', 'sk-[A-Za-z0-9_\-]{20,}',
  'sb[ps]_[A-Za-z0-9]{20,}', 'eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.', '-----BEGIN [A-Z ]*PRIVATE KEY',
  'AKIA[0-9A-Z]{16}', '(?i)\b(password|passwd|パスワード)\b\s*[:=：]\s*`?[^\s`]{8,}'
)
function Test-HasSecret([string]$path) {
  try { $t = [IO.File]::ReadAllText($path) } catch { return $false }
  foreach ($p in $SecretShapes) { if ($t -match $p) { return $true } }
  return $false
}

# ── gpg (Git for Windows ships it; it is not on the PowerShell PATH) ─────────────────────────
function Get-Gpg {
  $c = Get-Command gpg -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @('C:\Program Files\Git\usr\bin\gpg.exe', 'C:\Program Files (x86)\Git\usr\bin\gpg.exe')) { if (Test-Path $p) { return $p } }
  return $null
}

# ── the passphrase: hidden console prompt, or one stdin line; otherwise no way to ask ────────
function Read-Passphrase {
  if ($PassphraseFromStdin) {
    $l = [Console]::In.ReadLine()
    if ([string]::IsNullOrEmpty($l)) { return $null }
    return $l
  }
  if ([Console]::IsInputRedirected -or -not [Environment]::UserInteractive) { return $null }
  $a = Read-Host 'Backup passphrase (hidden)' -AsSecureString
  $b = Read-Host 'Again' -AsSecureString
  $pa = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
  $pb = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
  if ([string]::IsNullOrEmpty($pa) -or $pa -cne $pb) { throw 'passphrases are empty or differ' }
  return $pa
}

# gpg --symmetric AES256, passphrase on stdin (fd 0) so it appears in no argument list and no file.
function Invoke-Gpg([string]$gpg, [string]$pass, [string[]]$gpgArgs) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $gpg
  $psi.Arguments = (@('--batch', '--yes', '--no-tty', '--pinentry-mode', 'loopback', '--passphrase-fd', '0') + $gpgArgs | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardError = $true; $psi.RedirectStandardOutput = $true
  $p = [Diagnostics.Process]::Start($psi)
  $p.StandardInput.Write($pass + "`n"); $p.StandardInput.Close()
  $err = $p.StandardError.ReadToEnd(); $null = $p.StandardOutput.ReadToEnd(); $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw ('gpg failed: ' + ($err -replace '\s+', ' ').Trim()) }
}
function Protect-File($gpg, $pass, $in, $out) {
  Invoke-Gpg $gpg $pass @('--symmetric', '--cipher-algo', 'AES256', '--s2k-mode', '3', '--s2k-digest-algo', 'SHA512', '--s2k-count', '65011712', '-o', $out, $in)
}
function Unprotect-File($gpg, $pass, $in, $out) { Invoke-Gpg $gpg $pass @('--decrypt', '-o', $out, $in) }
function Get-Sha256([string]$path) {
  $sha = [Security.Cryptography.SHA256]::Create(); $fs = [IO.File]::OpenRead($path)
  try { return [BitConverter]::ToString($sha.ComputeHash($fs)).Replace('-', '').ToLower() } finally { $fs.Dispose(); $sha.Dispose() }
}

$null = New-Item -ItemType Directory -Path $Tmp -Force
try {
  # ── status: is the ENCRYPTED part stale? Needs no passphrase and no USB; agents report this at the end of work. ──
  # Stale = never done, older than -StaleDays, or CLAUDE.local.md changed since (SHA-256 recorded at the last encrypted run).
  if ($Status) {
    $st = $null; if (Test-Path $Ledger) { $st = Get-Content -Raw $Ledger | ConvertFrom-Json }
    $local = Join-Path $Repo 'CLAUDE.local.md'
    $cur = $null; if (Test-Path $local) { $cur = Get-Sha256 $local }
    $reasons = @()
    if (-not $st -or -not $st.credentialsAt) { $reasons += 'credentials never encrypted' }
    else {
      $age = [int]((Get-Date) - [datetime]$st.credentialsAt).TotalDays
      if ($age -gt $StaleDays) { $reasons += "credentials $age days old" }
      if ($cur -and $st.credentialsSha256 -ne $cur) { $reasons += 'CLAUDE.local.md changed since the last encrypted copy' }
    }
    if (-not $st -or -not $st.dbAt) { $reasons += 'DB dump never taken' }
    else { $age = [int]((Get-Date) - [datetime]$st.dbAt).TotalDays; if ($age -gt $StaleDays) { $reasons += "DB dump $age days old" } }
    if ($reasons.Count) { Say ('encrypted extras are stale: ' + ($reasons -join '; ') + ' -> run scripts/backup-extras.ps1 in a terminal and type the passphrase'); Write-Host ('RESULT stale ' + ($reasons -join '; ')); exit 0 }
    Write-Host 'RESULT ok encrypted-extras-fresh'; exit 0
  }

  # ── self test: encrypt → decrypt a dummy and compare. Needs no USB and touches no real data. ──
  if ($SelfTest) {
    $gpg = Get-Gpg; if (-not $gpg) { Say 'gpg not found'; Write-Host 'RESULT failed no-gpg'; exit 1 }
    $pass = Read-Passphrase; if (-not $pass) { Say 'no passphrase supplied'; Write-Host 'RESULT skipped no-passphrase'; exit 0 }
    $plain = Join-Path $Tmp 'dummy.txt'; $enc = Join-Path $Tmp 'dummy.txt.gpg'; $back = Join-Path $Tmp 'dummy.out'
    [IO.File]::WriteAllText($plain, ('dummy-' + [guid]::NewGuid().ToString('N') + "`nnot a real credential`n"))
    Protect-File $gpg $pass $plain $enc
    if ((Get-Content -Raw $enc) -match 'not a real credential') { throw 'ciphertext contains the plaintext' }
    Unprotect-File $gpg $pass $enc $back
    if ((Get-Sha256 $plain) -ne (Get-Sha256 $back)) { Write-Host 'RESULT failed roundtrip-mismatch'; exit 1 }
    Say 'self test: encrypt -> decrypt matches'
    Write-Host 'RESULT ok selftest'; exit 0
  }

  # ── the drive: same rule as backup-usb.ps1, never guessed ──
  $vols = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 2' | Where-Object { $_.DeviceID -and $_.Size -gt 0 })
  $cands = @($vols | Where-Object { ($_.VolumeName -eq $Label) -or (Test-Path (Join-Path ($_.DeviceID + '\') $IdFile)) })
  if ($cands.Count -eq 0) { Say 'The IntMap backup USB is not connected.'; Write-Host 'RESULT skipped not-connected'; exit 0 }
  if ($cands.Count -gt 1) { Say 'More than one drive claims to be the IntMap backup; refusing to guess.'; Write-Host 'RESULT skipped ambiguous-drive'; exit 0 }
  $Root = $cands[0].DeviceID + '\'
  $Ex = Join-Path $Root 'extras'
  $null = New-Item -ItemType Directory -Path $Ex -Force
  Say "USB: $Root  -> $Ex"
  $manifest = [ordered]@{ project = 'IntMap'; at = (Get-Date).ToString('o'); parts = [ordered]@{}; excluded = @() }
  $failed = @(); $skipped = @()
  function Part($name, $status, $detail) { $manifest.parts[$name] = "$status $detail".Trim(); Say ("  {0,-14} {1} {2}" -f $name, $status, $detail) }

  # ── passphrase (only if an encrypted step can run) ──
  $gpg = Get-Gpg; $pass = $null; $why = $null
  if ($SkipEncrypted) { $why = '-SkipEncrypted' }
  elseif (-not $gpg) { $why = 'gpg-not-found' }
  else { try { $pass = Read-Passphrase } catch { $why = $_.Exception.Message } ; if (-not $pass -and -not $why) { $why = 'no-way-to-ask-for-the-passphrase (non-interactive)' } }

  # ── 1. memory + settings (plain, secret-shaped files diverted) ──
  $flagged = New-Object Collections.Generic.List[string]   # absolute paths for the encrypted bundle
  $excludedNames = New-Object Collections.Generic.List[string]
  function Copy-Scanned([string]$srcDir, [string]$dstDir, [string[]]$exclude) {
    $n = 0
    foreach ($f in Get-ChildItem -LiteralPath $srcDir -Recurse -File -Force -ErrorAction SilentlyContinue) {
      $rel = $f.FullName.Substring($srcDir.Length).TrimStart('\')
      if ($exclude -contains $f.Name) { $excludedNames.Add($f.FullName); continue }
      if (Test-HasSecret $f.FullName) { $flagged.Add($f.FullName); continue }
      $dst = Join-Path $dstDir $rel
      $null = New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force
      Copy-Item -LiteralPath $f.FullName -Destination $dst -Force; $n++
    }
    return $n
  }
  try {
    $memDir = (& node (Join-Path $Repo 'scripts\agent-memory.mjs') --path).Trim()
    $memCopyRoot = Join-Path $Ex 'memory'
    if (Test-Path $memCopyRoot) { Remove-Item -LiteralPath $memCopyRoot -Recurse -Force }   # a snapshot, not an accumulation
    $n = Copy-Scanned $memDir $memCopyRoot @()
    Part 'memory' 'ok' "$n files"
  } catch { Part 'memory' 'failed' $_.Exception.Message; $failed += 'memory' }
  try {
    $cfgRoot = Join-Path $Ex 'config'
    if (Test-Path $cfgRoot) { Remove-Item -LiteralPath $cfgRoot -Recurse -Force }
    $n = 0
    foreach ($f in @('settings.json', 'settings.local.json', 'launch.json')) {
      $p = Join-Path $env:USERPROFILE ".claude\$f"
      if (Test-Path $p) {
        if (Test-HasSecret $p) { $flagged.Add($p) } else { $null = New-Item -ItemType Directory -Path "$cfgRoot\claude" -Force; Copy-Item $p "$cfgRoot\claude\$f" -Force; $n++ }
      }
    }
    foreach ($f in @('config.toml', 'AGENTS.md')) {
      $p = Join-Path $env:USERPROFILE ".codex\$f"
      if (Test-Path $p) {
        if (Test-HasSecret $p) { $flagged.Add($p) } else { $null = New-Item -ItemType Directory -Path "$cfgRoot\codex" -Force; Copy-Item $p "$cfgRoot\codex\$f" -Force; $n++ }
      }
    }
    $skills = Join-Path $env:USERPROFILE '.codex\skills'
    if (Test-Path $skills) { $n += Copy-Scanned $skills "$cfgRoot\codex\skills" @() }
    $auth = Join-Path $env:USERPROFILE '.codex\auth.json'
    if (Test-Path $auth) { $excludedNames.Add($auth) }   # a login token: re-login, do not archive
    Part 'config' 'ok' "$n files"
  } catch { Part 'config' 'failed' $_.Exception.Message; $failed += 'config' }

  # ── 2. credentials bundle (encrypted) ──
  $local = Join-Path $Repo 'CLAUDE.local.md'
  if ($pass) {
    try {
      $stage = Join-Path $Tmp 'bundle'; $null = New-Item -ItemType Directory -Path $stage
      $count = 0
      if (Test-Path $local) { Copy-Item $local (Join-Path $stage 'CLAUDE.local.md'); $count++ }
      $i = 0; foreach ($f in $flagged) { $i++; $d = Join-Path $stage ("flagged-$i"); $null = New-Item -ItemType Directory $d; Copy-Item -LiteralPath $f (Join-Path $d (Split-Path $f -Leaf)); Set-Content (Join-Path $d 'ORIGIN.txt') $f -Encoding utf8; $count++ }
      if ($count -eq 0) { Part 'credentials' 'skipped' 'nothing to bundle' } else {
        $tar = Join-Path $Tmp 'credentials.tar'
        & tar.exe -cf $tar -C $stage . ; if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
        $dstDir = Join-Path $Ex 'secrets'; $null = New-Item -ItemType Directory -Path $dstDir -Force
        $out = Join-Path $dstDir 'credentials.tar.gpg'
        Protect-File $gpg $pass $tar $out
        Part 'credentials' 'ok' "$count file(s) encrypted"
        $credHash = if (Test-Path $local) { Get-Sha256 $local } else { $null }; $credAt = (Get-Date).ToString('o')
      }
    } catch { Part 'credentials' 'failed' $_.Exception.Message; $failed += 'credentials' }
  } else {
    Part 'credentials' 'skipped' $why; $skipped += 'credentials'
    if ($flagged.Count) { Say ("  NOTE: {0} secret-shaped file(s) were left out of the plain copy (not backed up this run)." -f $flagged.Count) }
  }

  # ── 3. DB dump (encrypted) ──
  $dbWhy = $null
  if (-not $pass) { $dbWhy = $why }
  else {
    $pgd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if (-not $pgd) { $dbWhy = 'pg_dump-not-installed (scoop install postgresql)' }
    elseif (-not $env:SUPABASE_ACCESS_TOKEN -and -not [Console]::IsInputRedirected -and [Environment]::UserInteractive) {
      # typed hidden by the owner, kept in this process's environment only (never written, never printed)
      $t = Read-Host 'Supabase access token (hidden; sbp_...)' -AsSecureString
      $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($t))
      if (-not $env:SUPABASE_ACCESS_TOKEN) { $dbWhy = 'SUPABASE_ACCESS_TOKEN-not-given' }
    }
    elseif (-not $env:SUPABASE_ACCESS_TOKEN) { $dbWhy = 'SUPABASE_ACCESS_TOKEN-not-set (needed by scripts/db-login-url.mjs)' }
  }
  if ($dbWhy) { Part 'db' 'skipped' $dbWhy; $skipped += 'db' } else {
    try {
      $urlFile = Join-Path $Tmp 'dburl.txt'; $envFile = Join-Path $Tmp 'ghenv.txt'
      $env:DB_URL_FILE = $urlFile; $env:GITHUB_ENV = $envFile
      & node (Join-Path $Repo 'scripts\db-login-url.mjs') | Out-Null
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path $urlFile)) { throw 'db-login-url.mjs failed' }
      $role = $null; if (Test-Path $envFile) { $m = Select-String -Path $envFile -Pattern '^PG_DUMP_ROLE=(.+)$'; if ($m) { $role = $m.Matches[0].Groups[1].Value } }
      $plainDump = Join-Path $Tmp 'intmap.dump'
      $args2 = @((Get-Content -Raw $urlFile).Trim(), '-Fc', '--no-owner', '-n', 'public', '-n', 'auth', '-n', 'storage', '-f', $plainDump)
      if ($role) { $args2 += @('--role', $role) }
      & $pgd.Source @args2; if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
      $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
      $dbDir = Join-Path $Ex 'db'; $null = New-Item -ItemType Directory -Path $dbDir -Force
      $encDump = Join-Path $dbDir "intmap-$stamp.dump.gpg"
      Protect-File $gpg $pass $plainDump $encDump
      Set-Content (Join-Path $dbDir "intmap-$stamp.dump.gpg.sha256") ((Get-Sha256 $encDump) + '  ' + (Split-Path $encDump -Leaf)) -Encoding ascii
      $old = @(Get-ChildItem $dbDir -Filter 'intmap-*.dump.gpg' | Sort-Object Name -Descending | Select-Object -Skip $KeepDumps)
      foreach ($o in $old) { Remove-Item $o.FullName -Force; Remove-Item ($o.FullName + '.sha256') -Force -ErrorAction SilentlyContinue }
      $dbAt = (Get-Date).ToString('o')
      Part 'db' 'ok' ("{0:N1} MB encrypted" -f ((Get-Item $encDump).Length / 1MB))
    } catch { Part 'db' 'failed' $_.Exception.Message; $failed += 'db' }
    finally { Remove-Item Env:\DB_URL_FILE, Env:\GITHUB_ENV -ErrorAction SilentlyContinue }
  }

  # ── 4. secret NAMES only ──
  try {
    $raw = & supabase secrets list --project-ref $Project -o json 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'supabase secrets list failed (is the CLI logged in?)' }
    $names = @(($raw -join "`n" | ConvertFrom-Json) | ForEach-Object { $_.name } | Sort-Object)
    if ($names.Count -eq 0) { throw 'no secrets returned' }
    $hdr = ('# NAMES of the production Supabase secrets (project ' + $Project + ') as of ' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + '. Values are NOT stored: re-create each with: supabase secrets set NAME=VALUE')
    Set-Content (Join-Path $Ex 'supabase-secret-names.txt') (@($hdr) + $names) -Encoding utf8
    Part 'secret-names' 'ok' "$($names.Count) names"
  } catch { Part 'secret-names' 'failed' $_.Exception.Message; $failed += 'secret-names' }

  $manifest.excluded = @($excludedNames | ForEach-Object { Split-Path $_ -Leaf })
  $manifest.skipped = $skipped; $manifest.failed = $failed
  $manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Ex 'MANIFEST.json') -Encoding utf8

  if ($failed.Count) { Write-Host ("RESULT failed " + ($failed -join ',')); exit 1 }
  # The ledger moves only when nothing failed; a skipped encrypted step is recorded so it cannot look done.
  $dir = Split-Path $Ledger -Parent; if (-not (Test-Path $dir)) { $null = New-Item -ItemType Directory -Path $dir -Force }
  # the encrypted timestamps/hash carry over from the previous run unless THIS run did that step
  $prev = $null; if (Test-Path $Ledger) { $prev = Get-Content -Raw $Ledger | ConvertFrom-Json }
  $state = [ordered]@{ lastRunAt = (Get-Date).ToString('o'); drive = $Root; parts = $manifest.parts; skipped = $skipped; by = 'scripts/backup-extras.ps1'
    credentialsAt = $(if ($credAt) { $credAt } elseif ($prev) { $prev.credentialsAt }); credentialsSha256 = $(if ($credAt) { $credHash } elseif ($prev) { $prev.credentialsSha256 })
    dbAt = $(if ($dbAt) { $dbAt } elseif ($prev) { $prev.dbAt }) }
  $state | ConvertTo-Json -Depth 4 | Set-Content $Ledger -Encoding utf8
  if ($skipped.Count) { Write-Host ("RESULT partial skipped: " + ($skipped -join ',') + " ($why$dbWhy)"); exit 0 }
  Write-Host "RESULT ok $Root"; exit 0
} finally {
  $pass = $null
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
