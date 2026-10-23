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
#    BACKUP_PRIVATE_KEY_FILE=/path/to/private.asc ./scripts/restore-test.sh <encrypted.dump.gpg> <TARGET_DB_URL>
#
#  The backup is encrypted TO a public key (scripts/backup-db.sh), so decrypting it takes the matching PRIVATE
#  key — held only by the operator, never in the repository or in GitHub. It is imported into a throwaway
#  keyring (removed on exit) and never into the operator's own. If the key is protected by a passphrase, give it
#  as BACKUP_PRIVATE_KEY_PASSPHRASE (optional; an unprotected key needs nothing).
#  ⚠ A backup made BEFORE this change (a symmetric, passphrase-encrypted .dump.gpg; the artifacts are kept 7
#  days) cannot be opened with a key — it needs the old passphrase, i.e. `gpg --decrypt` by hand.
#
#  Exit code 0 = restore verified; non-zero = failed (fail closed).
# ============================================================================
set -euo pipefail

ENC="${1:?usage: restore-test.sh <encrypted.dump.gpg> <TARGET_DB_URL>}"
TARGET="${2:?usage: restore-test.sh <encrypted.dump.gpg> <TARGET_DB_URL>}"
: "${BACKUP_PRIVATE_KEY_FILE:?set BACKUP_PRIVATE_KEY_FILE (the private key the dump was encrypted to; it is held by the operator, not by the repository)}"
[ -s "$BACKUP_PRIVATE_KEY_FILE" ] || { echo "no private key at $BACKUP_PRIVATE_KEY_FILE"; exit 1; }

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
# the throwaway keyring lives inside TMP: the private key goes away with the plaintext, on every exit path
GNUPGHOME="$TMP/gnupg"; export GNUPGHOME; mkdir "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
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
gpg --batch --quiet --import "$BACKUP_PRIVATE_KEY_FILE" 2>/dev/null \
  || { echo "could not import $BACKUP_PRIVATE_KEY_FILE as a private key"; exit 1; }
# --pinentry-mode loopback lets --passphrase-fd answer a protected key without a pinentry window; an
# unprotected key never asks. The passphrase goes in on a pipe, never as an argument.
printf '%s' "${BACKUP_PRIVATE_KEY_PASSPHRASE:-}" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
  -o "$PLAIN" -d "$ENC"

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
