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
    1. Finds the IntMap backup USB — by its volume label first, and only by
       "there is exactly one writable removable drive" as a fallback, which then
       stamps the label file so the next run is unambiguous.
    2. Mirrors the repository's tracked tree (HEAD) onto the USB ROOT, one way.
    3. Verifies by re-walking both sides and comparing SHA-256, not by trusting
       that the copy loop returned without throwing.
    4. Records the timestamp OUTSIDE the repository, and only on success.

  INVARIANTS — every one of these has a reason, and none of them is negotiable:
    · ONE WAY. PC → USB. Nothing is ever read from the USB as a work source and
      nothing is copied back.
    · NEVER GUESS THE DRIVE. Two candidates and no label ⇒ skip, and say so. A
      mirror written to the wrong disk deletes whatever was there.
    · REMOVABLE ONLY. The system drive, OneDrive and network drives are refused
      by DriveType, not by naming them.
    · NOT CONNECTED IS NOT AN ERROR. Exit 0 with status "skipped".
    · THE LEDGER MOVES ONLY ON SUCCESS. A failed run must not look like a done one.
    · EXTRAS ARE DELETED EXPLICITLY. The USB must not keep files the repository no
      longer has — including ones whose names arrived mangled from an older copier.

  USAGE
      pwsh -File scripts/backup-usb.ps1            # mirror + verify
      pwsh -File scripts/backup-usb.ps1 -VerifyOnly
      pwsh -File scripts/backup-usb.ps1 -WhatIf    # plan only, writes nothing

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
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$IdFile = '.intmap-backup-id.json'
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
  Push-Location $Repo
  try {
    $out = & git ls-files --cached --full-name
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed' }
    return @($out | Where-Object { $_ -ne '' })
  } finally { Pop-Location }
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
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
    $rel = $f.FullName.Substring($root.Length).TrimStart('\')
    if ($rel -eq $IdFile) { continue }
    if ($want.Contains($rel)) { continue }
    if ($PSCmdlet.ShouldProcess($f.FullName, 'delete (not in the repository)')) { Remove-Item -LiteralPath $f.FullName -Force }
    $deleted++
  }
  # prune directories that are now empty, deepest first
  foreach ($d in (Get-ChildItem -LiteralPath $root -Recurse -Directory -Force | Sort-Object { $_.FullName.Length } -Descending)) {
    if (-not (Get-ChildItem -LiteralPath $d.FullName -Force)) {
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
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
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

$files = Get-SourceFiles
Say ("repository: {0} tracked files at HEAD" -f $files.Count)

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
