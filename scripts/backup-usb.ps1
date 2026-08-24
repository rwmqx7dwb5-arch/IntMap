<#
================================================================================
  IntMap · END-OF-WORK USB MIRROR
--------------------------------------------------------------------------------
  The PROCEDURE for CLAUDE.md §11. That section used to carry 114 lines of steps;
  steps written in prose are re-implemented slightly differently every time they
  are followed, and "slightly differently" is how a backup ends up verified by a
  weaker test than the one that was written down. CLAUDE.md now owns WHEN to run
  this and what to report; this file owns HOW, and it is the only implementation.

  WHAT IT DOES
    1. Finds the MASTER working directory — the OneDrive checkout — and refuses to
       mirror anything else. It is never hard-coded: `git rev-parse --git-common-dir`
       names the main repository's .git from any worktree and its parent IS the
       master. (#R282: OneDrive sat fifteen commits behind while rounds merged and
       deployed; a mirror of a temp worktree is not a backup of the master.)
    2. Finds the IntMap backup USB — by its volume label first, and only by
       "there is exactly one writable removable drive" as a fallback, which then
       stamps the label file so the next run is unambiguous.
    3. Mirrors the MASTER's tracked tree (HEAD) onto the USB ROOT, one way.
    4. Verifies by re-walking both sides and comparing SHA-256, not by trusting
       that the copy loop returned without throwing.
    5. Records the timestamp OUTSIDE the repository, and only on success.

  INVARIANTS — every one of these has a reason, and none of them is negotiable:
    · ONE WAY. MASTER → USB. Nothing is ever read from the USB as a work source and
      nothing is copied back.
    · THE SOURCE IS THE MASTER, and it has to BE the merged state first — the script
      runs `master-sync.mjs --check` and skips rather than mirroring a stale master.
    · NEVER GUESS THE DRIVE. Two candidates and no label ⇒ skip, and say so. A
      mirror written to the wrong disk deletes whatever was there.
    · REMOVABLE ONLY. The system drive, OneDrive and network drives are refused
      by DriveType, not by naming them.
    · NOT CONNECTED IS NOT AN ERROR. Exit 0 with status "skipped".
    · THE LEDGER MOVES ONLY ON SUCCESS. A failed run must not look like a done one.
    · EXTRAS ARE DELETED EXPLICITLY. The USB must not keep files the repository no
      longer has — including ones whose names arrived mangled from an older copier.
      The VOLUME's own directories (System Volume Information, $RECYCLE.BIN …) are
      not content and are never touched.

  USAGE
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1              # mirror + verify
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1 -VerifyOnly
      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-usb.ps1 -WhatIf      # plan only, writes nothing

      ⚠ (#R396) NOT `pwsh`. PowerShell 7 is not installed on the machine this repository is
      developed on — `Get-Command pwsh` is a CommandNotFoundException, and neither
      C:\Program Files\PowerShell nor WindowsApps\pwsh.exe exists; $PSVersionTable.PSVersion
      is 5.1.26100.9168. Every line above used to say `pwsh`, so the documented way to run
      the end-of-work backup could not be run at all. Nothing here needs 7: `::new()` has
      been available since 5.0 and no PS7-only syntax is used (measured: RESULT ok, 2,693
      files, zero differences, under Windows PowerShell 5.1).

  EXIT CODES  0 = done or skipped · 1 = failed (mirror or verification)
  The last line of stdout is always machine-readable:  RESULT <status> <detail>
================================================================================
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$VerifyOnly,
  [string]$Label = 'INTMAP-BACKUP',
  [int]$MaxAttempts = 3
)

$ErrorActionPreference = 'Stop'

# ── the MASTER working directory, derived the same way scripts/master-sync.mjs derives it ──
# --git-common-dir names the MAIN repository's .git from any worktree; its parent is the master
# checkout. Hard-coding the path would break the moment the checkout moves; running this from a
# temp worktree and mirroring THAT is the defect #R282 fixed.
$Here = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$common = & git -C $Here rev-parse --path-format=absolute --git-common-dir 2>$null
if ($LASTEXITCODE -ne 0 -or -not $common) { Write-Host 'not inside a git repository'; Write-Host 'RESULT failed no-repo'; exit 1 }
$Repo = (Resolve-Path (Split-Path ($common -replace '/', '\') -Parent)).Path
$IdFile = '.intmap-backup-id.json'
# Directories the VOLUME owns, not the mirror. Matched on the FIRST path segment only, so a
# directory with one of these names inside the repository would still be treated as content.
$VolumeSystem = @('System Volume Information', '$RECYCLE.BIN', 'RECYCLER', '.Trashes', '.Spotlight-V100', 'found.000')
$Ledger = Join-Path $env:USERPROFILE '.claude\projects\C--Users-gyuuk-OneDrive-IntMap\usb-backup-state.json'

function Say($m) { Write-Host $m }
function Result($status, $detail) { Write-Host "RESULT $status $detail"; }

# ── 1. the drive ──────────────────────────────────────────────────────────────
function Get-BackupDrive {
  # DriveType 2 = Removable. This is the guard that keeps the system disk, the
  # OneDrive folder and any mapped network drive out — by kind, not by name.
  $vols = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 2' |
          Where-Object { $_.DeviceID -and $_.Size -gt 0 }
  $cands = @()
  foreach ($v in $vols) {
    $root = ($v.DeviceID + '\')
    $writable = $false
    try {
      $probe = Join-Path $root ('.intmap-write-probe-' + [guid]::NewGuid().ToString('N') + '.tmp')
      [IO.File]::WriteAllText($probe, 'x'); Remove-Item $probe -Force
      $writable = $true
    } catch { $writable = $false }
    if ($writable) {
      $cands += [pscustomobject]@{
        Root    = $root
        VolName = $v.VolumeName
        Labeled = ($v.VolumeName -eq $Label) -or (Test-Path (Join-Path $root $IdFile))
      }
    }
  }
  if ($cands.Count -eq 0) { return $null }
  $labeled = @($cands | Where-Object Labeled)
  if ($labeled.Count -eq 1) { return $labeled[0] }
  if ($labeled.Count -gt 1) {
    throw "AMBIGUOUS: $($labeled.Count) drives claim to be the IntMap backup ($($labeled.Root -join ', ')). Refusing to guess."
  }
  if ($cands.Count -eq 1) {
    # First use: adopt it and stamp it, so no later run has to guess.
    $c = $cands[0]
    if ($PSCmdlet.ShouldProcess($c.Root, 'adopt as the IntMap backup drive')) {
      $stamp = @{ project = 'IntMap'; adoptedAt = (Get-Date).ToString('o'); note = 'written by scripts/backup-usb.ps1; not part of the mirror' }
      $stamp | ConvertTo-Json | Set-Content -Path (Join-Path $c.Root $IdFile) -Encoding utf8
    }
    $c.Labeled = $true
    return $c
  }
  throw "AMBIGUOUS: $($cands.Count) writable removable drives and none is labelled '$Label'. Refusing to guess."
}

# ── 2. what belongs on the USB ────────────────────────────────────────────────
# The tracked tree at HEAD: source, assets, data, configuration, migrations — i.e.
# everything needed to rebuild the site, and nothing that is regenerated (node_modules,
# dist, caches) or is history (.git). git is the authority here so the list cannot
# drift from what the repository actually contains.
function Get-SourceFiles {
  # ⚠ -z, AND THE BYTES. Plain `git ls-files` QUOTES a path with non-ASCII in it and escapes the
  # bytes — «USGS.能登.pdf» comes back as "USGS.\350\203\275\347\231\273.pdf", a C string that
  # Test-Path rejects as an illegal path. -z suppresses the quoting (and separates with NUL instead
  # of newline); reading the raw bytes and decoding UTF-8 keeps the console codepage out of it.
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('intmap-ls-' + [guid]::NewGuid().ToString('N') + '.bin')
  Push-Location $Repo
  try {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.Arguments = '-c core.quotepath=false ls-files -z --cached --full-name'
    $psi.WorkingDirectory = $Repo
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $proc = [Diagnostics.Process]::Start($psi)
    $bytes = New-Object IO.MemoryStream
    $proc.StandardOutput.BaseStream.CopyTo($bytes)
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) { throw 'git ls-files failed' }
    $text = [Text.Encoding]::UTF8.GetString($bytes.ToArray())
    return @($text -split "`0" | Where-Object { $_ -ne '' })
  } finally { Pop-Location; if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } }
}

function Get-UsbFiles($root) {
  # -Force to see hidden/system entries; SilentlyContinue so a directory Windows will not let us
  # enter (System Volume Information) is skipped rather than aborting the run.
  Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $VolumeSystem -notcontains ($_.FullName.Substring($root.Length).TrimStart('\') -split '\\')[0] }
}

function Get-Sha256([string]$path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $fs = [IO.File]::OpenRead($path)
    try { return [BitConverter]::ToString($sha.ComputeHash($fs)).Replace('-', '') } finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
}

# ── 3. mirror ─────────────────────────────────────────────────────────────────
function Invoke-Mirror($drive, $files) {
  $root = $drive.Root
  $want = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $copied = 0; $skipped = 0; $deleted = 0

  foreach ($rel in $files) {
    [void]$want.Add($rel.Replace('/', '\'))
    $src = Join-Path $Repo $rel
    if (-not (Test-Path -LiteralPath $src)) { continue }   # a tracked file deleted in the worktree
    $dst = Join-Path $root ($rel.Replace('/', '\'))
    $dir = Split-Path $dst -Parent
    if (-not (Test-Path -LiteralPath $dir)) { $null = New-Item -ItemType Directory -Path $dir -Force }
    $same = $false
    if (Test-Path -LiteralPath $dst) {
      $a = Get-Item -LiteralPath $src; $b = Get-Item -LiteralPath $dst
      if ($a.Length -eq $b.Length) { $same = ((Get-Sha256 $src) -eq (Get-Sha256 $dst)) }
    }
    if ($same) { $skipped++; continue }
    if ($PSCmdlet.ShouldProcess($dst, 'copy')) { Copy-Item -LiteralPath $src -Destination $dst -Force }
    $copied++
  }

  # …and everything the repository no longer has. Deleted explicitly, by full path,
  # because a name that arrived mangled from an older copier is exactly the kind of
  # leftover a pattern-based sweep misses.
  foreach ($f in Get-UsbFiles $root) {
    $rel = $f.FullName.Substring($root.Length).TrimStart('\')
    if ($rel -eq $IdFile) { continue }
    if ($want.Contains($rel)) { continue }
    if ($PSCmdlet.ShouldProcess($f.FullName, 'delete (not in the repository)')) { Remove-Item -LiteralPath $f.FullName -Force }
    $deleted++
  }
  # prune directories that are now empty, deepest first
  $dirs = Get-ChildItem -LiteralPath $root -Recurse -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $VolumeSystem -notcontains ($_.FullName.Substring($root.Length).TrimStart('\') -split '\\')[0] }
  foreach ($d in ($dirs | Sort-Object { $_.FullName.Length } -Descending)) {
    if (-not (Get-ChildItem -LiteralPath $d.FullName -Force -ErrorAction SilentlyContinue)) {
      if ($PSCmdlet.ShouldProcess($d.FullName, 'remove empty directory')) { Remove-Item -LiteralPath $d.FullName -Force }
    }
  }
  return [pscustomobject]@{ Copied = $copied; Unchanged = $skipped; Deleted = $deleted }
}

# ── 4. verify — re-walk BOTH sides and compare content, not the copy's return ──
function Test-Mirror($drive, $files) {
  $root = $drive.Root
  $problems = @()
  $want = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($rel in $files) {
    $r = $rel.Replace('/', '\')
    $src = Join-Path $Repo $rel
    if (-not (Test-Path -LiteralPath $src)) { continue }
    [void]$want.Add($r)
    $dst = Join-Path $root $r
    if (-not (Test-Path -LiteralPath $dst)) { $problems += "missing on USB: $r"; continue }
    if ((Get-Sha256 $src) -ne (Get-Sha256 $dst)) { $problems += "content differs: $r" }
  }
  foreach ($f in Get-UsbFiles $root) {
    $rel = $f.FullName.Substring($root.Length).TrimStart('\')
    if ($rel -eq $IdFile) { continue }
    if (-not $want.Contains($rel)) { $problems += "extra on USB: $rel" }
  }
  return , $problems
}

# ── 5. the ledger, outside the repository, written only on success ────────────
function Update-Ledger($drive, $stats) {
  $dir = Split-Path $Ledger -Parent
  if (-not (Test-Path -LiteralPath $dir)) { $null = New-Item -ItemType Directory -Path $dir -Force }
  $state = @{
    lastSuccessAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    lastSuccessIso = (Get-Date).ToString('o')
    drive = $drive.Root
    volumeName = $drive.VolName
    files = $stats.Files
    copied = $stats.Copied
    deleted = $stats.Deleted
    verified = 'sha256:zero-difference'
    by = 'scripts/backup-usb.ps1'
  }
  $state | ConvertTo-Json | Set-Content -Path $Ledger -Encoding utf8
}

# ── run ───────────────────────────────────────────────────────────────────────
try {
  $drive = Get-BackupDrive
} catch {
  Say $_.Exception.Message
  Result 'skipped' 'ambiguous-drive'
  exit 0
}
if ($null -eq $drive) {
  Say 'No writable removable drive is connected.'
  Result 'skipped' 'not-connected'
  exit 0
}
Say ("USB: {0} ({1})" -f $drive.Root, ($(if ($drive.VolName) { $drive.VolName } else { 'no label' })))

# ⚠ THE MASTER HAS TO BE THE MERGED STATE. Mirroring a master that is behind origin/main writes
# a backup of work that is already superseded — and does it while reporting success.
& node (Join-Path $Repo 'scripts/master-sync.mjs') --check | Out-Null
if ($LASTEXITCODE -ne 0) {
  Say 'The master copy is not the merged state. Run `npm run master:sync` first (CLAUDE.md §5).'
  Result 'skipped' 'master-not-synced'
  exit 0
}
$files = Get-SourceFiles
Say ("master: {0} · {1} tracked files at HEAD" -f $Repo, $files.Count)

$attempt = 0
while ($true) {
  $attempt++
  if (-not $VerifyOnly) {
    $stats = Invoke-Mirror $drive $files
    Say ("mirror: copied {0} · unchanged {1} · deleted {2}" -f $stats.Copied, $stats.Unchanged, $stats.Deleted)
  } else { $stats = [pscustomobject]@{ Copied = 0; Unchanged = 0; Deleted = 0 } }

  $problems = Test-Mirror $drive $files
  if ($problems.Count -eq 0) {
    Say 'verify: zero differences (SHA-256, both directions)'
    if (-not $VerifyOnly -and -not $WhatIfPreference) {
      Update-Ledger $drive ([pscustomobject]@{ Files = $files.Count; Copied = $stats.Copied; Deleted = $stats.Deleted })
      Say ("ledger: {0}" -f $Ledger)
    }
    Result 'ok' ("{0} files · {1}" -f $files.Count, $drive.Root)
    exit 0
  }

  Say ("verify: {0} difference(s)" -f $problems.Count)
  $problems | Select-Object -First 20 | ForEach-Object { Say ("  - " + $_) }
  if ($VerifyOnly -or $attempt -ge $MaxAttempts) {
    Say 'The ledger has NOT been updated. This is a failed backup, not a slow one.'
    Result 'failed' ("{0} difference(s) after {1} attempt(s)" -f $problems.Count, $attempt)
    exit 1
  }
  Say ("re-syncing (attempt {0} of {1})…" -f ($attempt + 1), $MaxAttempts)
}
