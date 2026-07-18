#!/usr/bin/env bash
# ============================================================================
#  IntMap — restore TEST (verify a backup actually restores). §10.
# ----------------------------------------------------------------------------
#  Decrypts + checksum-verifies an encrypted dump and restores it into an
#  ISOLATED target database, then checks the structure and RLS survived. It is
#  a *drill*, not a production recovery.
#
#  SAFETY: refuses any target that is not local (127.0.0.1 / localhost) unless
#  you explicitly set ALLOW_NONLOCAL=1. NEVER point it at production.
#
#  Usage:
#    GPG_PASSPHRASE=... ./scripts/restore-test.sh <encrypted.dump.gpg> <TARGET_DB_URL>
#
#  Exit code 0 = restore verified; non-zero = failed (fail closed).
# ============================================================================
set -euo pipefail

ENC="${1:?usage: restore-test.sh <encrypted.dump.gpg> <TARGET_DB_URL>}"
TARGET="${2:?usage: restore-test.sh <encrypted.dump.gpg> <TARGET_DB_URL>}"
: "${GPG_PASSPHRASE:?set GPG_PASSPHRASE (the passphrase the dump was encrypted with)}"

command -v pg_restore >/dev/null || { echo "pg_restore not found"; exit 1; }
command -v psql       >/dev/null || { echo "psql not found"; exit 1; }
command -v gpg        >/dev/null || { echo "gpg not found"; exit 1; }

# ── Safety guard: only local targets unless explicitly overridden ────────────
case "$TARGET" in
  *"@127.0.0.1"*|*"@localhost"*|*"127.0.0.1:"*|*"localhost:"*|*"@/"*) : ;;
  *) if [ "${ALLOW_NONLOCAL:-0}" != "1" ]; then
       echo "REFUSING: target does not look local and ALLOW_NONLOCAL != 1."
       echo "Restore tests must run against an isolated/local database, never production."
       exit 2
     fi ;;
esac

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PLAIN="$TMP/restore.dump"

# ── 1. Verify checksum if present ────────────────────────────────────────────
if [ -f "$ENC.sha256" ]; then
  echo "[restore-test] verifying checksum…"
  want=$(cut -d' ' -f1 < "$ENC.sha256")
  got=$(sha256 "$ENC" | cut -d' ' -f1)
  if [ "$want" != "$got" ]; then echo "CHECKSUM MISMATCH — backup is corrupt."; exit 1; fi
  echo "  checksum OK"
fi

# ── 2. Decrypt ───────────────────────────────────────────────────────────────
echo "[restore-test] decrypting…"
printf '%s' "$GPG_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-fd 0 -o "$PLAIN" -d "$ENC"

# ── 3. Restore (continue on non-fatal errors; the verification below is the gate) ──
echo "[restore-test] restoring into isolated target…"
pg_restore --no-owner --no-privileges -d "$TARGET" "$PLAIN" || \
  echo "[restore-test] pg_restore reported non-fatal warnings (verifying below)…"

# ── 4. Verify structure + RLS survived ───────────────────────────────────────
echo "[restore-test] verifying restored database…"
fail=0
check() { # <description> <sql returning a single value> <expected-nonempty|>0>
  local desc="$1" sql="$2" mode="$3" val
  val=$(psql "$TARGET" -tAc "$sql" 2>/dev/null | tr -d '[:space:]')
  case "$mode" in
    ">0") if [ -n "$val" ] && [ "$val" -gt 0 ] 2>/dev/null; then echo "  PASS: $desc ($val)"; else echo "  FAIL: $desc (got '$val')"; fail=1; fi ;;
    "t")  if [ "$val" = "t" ]; then echo "  PASS: $desc"; else echo "  FAIL: $desc (got '$val')"; fail=1; fi ;;
  esac
}

check "profiles table has rows"            "select count(*) from public.profiles;" ">0"
check "community_posts table has rows"     "select count(*) from public.community_posts;" ">0"
check "RLS enabled on profiles"            "select relrowsecurity from pg_class where oid='public.profiles'::regclass;" "t"
check "RLS enabled on ai_usage"            "select relrowsecurity from pg_class where oid='public.ai_usage'::regclass;" "t"
check "is_admin() function restored"       "select count(*) from pg_proc where proname='is_admin';" ">0"
check "at least one RLS policy restored"   "select count(*) from pg_policies where schemaname='public';" ">0"

if [ "$fail" -ne 0 ]; then echo "[restore-test] RESULT: FAIL"; exit 1; fi
echo "[restore-test] RESULT: PASS — the backup restores to a working, RLS-protected schema."
