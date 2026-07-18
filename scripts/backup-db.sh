#!/usr/bin/env bash
# ============================================================================
#  IntMap — encrypted database backup.
# ----------------------------------------------------------------------------
#  Produces an ENCRYPTED, checksummed logical dump. Used by the dormant
#  .github/workflows/db-backup.yml and runnable by hand. It NEVER writes a
#  plaintext dump to a durable location and NEVER prints secrets.
#
#  Required env:
#    DB_URL          Postgres connection string (SECRET — contains the password).
#    GPG_PASSPHRASE  Symmetric passphrase used to encrypt the dump (SECRET).
#  Optional env:
#    OUT_DIR         Output directory (default: ./backups).
#    DUMP_SCHEMAS    Space-separated schemas to dump (default: "public auth storage").
#
#  Output (in OUT_DIR):
#    intmap-<UTC>.dump.gpg          AES-256 encrypted custom-format dump
#    intmap-<UTC>.dump.gpg.sha256   checksum of the encrypted file
#    intmap-<UTC>.meta.json         non-sensitive metadata (no data, no secrets)
#
#  The encryption key (GPG_PASSPHRASE) is NEVER stored next to the ciphertext —
#  keep it only in your secret store (GitHub Secrets / a password manager).
# ============================================================================
set -euo pipefail

: "${DB_URL:?set DB_URL (Postgres connection string)}"
: "${GPG_PASSPHRASE:?set GPG_PASSPHRASE (encryption passphrase)}"
OUT_DIR="${OUT_DIR:-./backups}"
DUMP_SCHEMAS="${DUMP_SCHEMAS:-public auth storage}"

command -v pg_dump >/dev/null || { echo "pg_dump not found (install postgresql-client)"; exit 1; }
command -v gpg     >/dev/null || { echo "gpg not found (install gnupg)"; exit 1; }

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

echo "[backup] pg_dump (schemas: $DUMP_SCHEMAS) → custom format…"
# -Fc custom format (compressed, flexible restore); no owner/privesc surprises on restore.
pg_dump "$DB_URL" -Fc --no-owner "${SCHEMA_ARGS[@]}" -f "$PLAIN"

echo "[backup] encrypting (AES-256, symmetric)…"
printf '%s' "$GPG_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-fd 0 --symmetric --cipher-algo AES256 -o "$ENC" "$PLAIN"

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
  "cipher": "AES256",
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
