#!/usr/bin/env bash
# ============================================================================
#  IntMap — encrypted database backup.
# ----------------------------------------------------------------------------
#  Produces an ENCRYPTED, checksummed logical dump. Used by
#  .github/workflows/db-backup.yml and runnable by hand. It NEVER writes a
#  plaintext dump to a durable location and NEVER prints secrets.
#
#  ⚠ PUBLIC-KEY ENCRYPTION, NOT A PASSPHRASE. The artifact is uploaded to a PUBLIC repository, where anyone
#  with a GitHub account can download it for the 7 days it is kept. A passphrase kept as a repository secret
#  is a key the run itself holds — and the run executes repository code. So the dump is encrypted TO a public
#  key that is tracked in the repository (scripts/backup-public-key.asc): everything this script and the
#  runner can see is enough to WRITE a backup, and nothing here can READ one. The matching private key lives
#  only with the operator (docs/BACKUP-RESTORE.md); scripts/restore-test.sh is where it is used.
#
#  Required env:
#    DB_URL                  Postgres connection string (SECRET — contains the password).
#  Optional env:
#    BACKUP_PUBLIC_KEY_FILE  The recipient's public key (default: backup-public-key.asc beside this script).
#    OUT_DIR                 Output directory (default: ./backups).
#    DUMP_SCHEMAS            Space-separated schemas to dump (default: "public auth storage").
#
#  Output (in OUT_DIR):
#    intmap-<UTC>.dump.gpg          OpenPGP-encrypted (to the recipient's public key) custom-format dump
#    intmap-<UTC>.dump.gpg.sha256   checksum of the encrypted file
#    intmap-<UTC>.meta.json         non-sensitive metadata (no data, no secrets; names the recipient key)
# ============================================================================
set -euo pipefail

# DB_URL_FILE: the short-lived URL scripts/db-login-url.mjs wrote (kept out of the log and the environment)
if [ -z "${DB_URL:-}" ] && [ -n "${DB_URL_FILE:-}" ] && [ -s "$DB_URL_FILE" ]; then DB_URL="$(cat "$DB_URL_FILE")"; fi
: "${DB_URL:?set DB_URL (Postgres connection string)}"
BACKUP_PUBLIC_KEY_FILE="${BACKUP_PUBLIC_KEY_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-public-key.asc}"
[ -s "$BACKUP_PUBLIC_KEY_FILE" ] || { echo "no recipient public key at $BACKUP_PUBLIC_KEY_FILE (set BACKUP_PUBLIC_KEY_FILE) — refusing to write an unencrypted backup"; exit 1; }
OUT_DIR="${OUT_DIR:-./backups}"
DUMP_SCHEMAS="${DUMP_SCHEMAS:-public auth storage}"

command -v pg_dump >/dev/null || { echo "pg_dump not found (install postgresql-client)"; exit 1; }
command -v gpg     >/dev/null || { echo "gpg not found (install gnupg)"; exit 1; }

# A throwaway keyring: gpg reads the recipient from the key FILE (--recipient-file), so nothing is imported and
# nothing here touches the operator's own keyring. It goes away with the run — and so does a plaintext dump a failed
# encryption left behind — whatever the exit path.
GNUPGHOME="$(mktemp -d)"; export GNUPGHOME; chmod 700 "$GNUPGHOME"
cleanup() {
  gpgconf --kill gpg-agent >/dev/null 2>&1 || true
  rm -rf "$GNUPGHOME"
  if [ -n "${PLAIN:-}" ] && [ -f "$PLAIN" ]; then if command -v shred >/dev/null; then shred -u "$PLAIN"; else rm -f "$PLAIN"; fi; fi
}
trap cleanup EXIT

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$OUT_DIR/intmap-$STAMP"
PLAIN="$BASE.dump"          # transient plaintext — shredded below
ENC="$BASE.dump.gpg"
META="$BASE.meta.json"

# Build the -n schema flags.
SCHEMA_ARGS=()
for s in $DUMP_SCHEMAS; do SCHEMA_ARGS+=( -n "$s" ); done

# The recipient's primary-key fingerprint, read from the file itself — recorded in the metadata so a reader
# can tell WHICH key a backup needs without opening it. Read before the dump: a file that holds no key must
# fail before any plaintext exists.
RECIPIENT_FPR="$(gpg --batch --with-colons --show-keys "$BACKUP_PUBLIC_KEY_FILE" | awk -F: '$1=="fpr"{print $10; exit}' || true)"
[ -n "$RECIPIENT_FPR" ] || { echo "$BACKUP_PUBLIC_KEY_FILE holds no OpenPGP public key — refusing to write an unencrypted backup"; exit 1; }

echo "[backup] pg_dump (schemas: $DUMP_SCHEMAS) → custom format…"
# -Fc custom format (compressed, flexible restore); no owner/privesc surprises on restore.
# PG_DUMP_ROLE: a login that is only a door (the Supabase CLI's short-lived role) switches to the role that
# can read every dumped schema, as the CLI itself does (scripts/db-login-url.mjs sets it).
ROLE_ARGS=(); [ -n "${PG_DUMP_ROLE:-}" ] && ROLE_ARGS=(--role "$PG_DUMP_ROLE")
pg_dump "$DB_URL" -Fc --no-owner "${ROLE_ARGS[@]}" "${SCHEMA_ARGS[@]}" -f "$PLAIN"

echo "[backup] encrypting (OpenPGP, recipient key $RECIPIENT_FPR)…"
# --trust-model always: the key arrives as a file, not from a keyring with a web of trust to consult — the
# repository's tracked copy IS the trust decision. No passphrase exists on this side: it cannot decrypt.
gpg --batch --yes --trust-model always --cipher-algo AES256 \
  --recipient-file "$BACKUP_PUBLIC_KEY_FILE" --encrypt -o "$ENC" "$PLAIN"

echo "[backup] checksum…"
sha256 "$ENC" > "$ENC.sha256"

PLAIN_BYTES=$(wc -c < "$PLAIN" | tr -d ' ')
ENC_BYTES=$(wc -c < "$ENC" | tr -d ' ')
SHA=$(cut -d' ' -f1 < "$ENC.sha256")
PGVER=$(pg_dump --version | head -1)
# Latest migration filename = the schema version this backup corresponds to.
MIGHEAD=$(ls -1 supabase/migrations/*.sql 2>/dev/null | sort | tail -1 | xargs -r basename || echo "unknown")

cat > "$META" <<JSON
{
  "created_utc": "$STAMP",
  "schemas": "$DUMP_SCHEMAS",
  "encrypted_file": "$(basename "$ENC")",
  "sha256": "$SHA",
  "plaintext_bytes": $PLAIN_BYTES,
  "encrypted_bytes": $ENC_BYTES,
  "pg_dump_version": "$PGVER",
  "migration_head": "$MIGHEAD",
  "cipher": "OpenPGP public-key (session cipher AES256)",
  "recipient_fingerprint": "$RECIPIENT_FPR",
  "format": "pg_dump custom (-Fc)"
}
JSON

echo "[backup] shredding plaintext…"
if command -v shred >/dev/null; then shred -u "$PLAIN"; else rm -f "$PLAIN"; fi

echo "[backup] DONE:"
echo "  $ENC ($ENC_BYTES bytes)"
echo "  $ENC.sha256"
echo "  $META"
echo "  migration_head=$MIGHEAD"
