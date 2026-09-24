#!/usr/bin/env bash
# ============================================================================
#  IntMap — a workflow that needs a secret it does not have FAILS. It does not skip green.
# ----------------------------------------------------------------------------
#  Usage (as the first step of a job, with each secret mapped to an env var OF THE SAME NAME):
#
#      - name: Require secrets
#        id: gate
#        env:
#          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
#        run: bash scripts/ci-require-secrets.sh SUPABASE_DB_URL
#
#  ⚠ WHY THIS EXISTS. db-backup.yml used to answer a missing secret with a ::notice:: and exit 0.
#  MEASURED 2026-09-24, run 35975392869: it printed 「DB backup is DORMANT」 and the run was GREEN
#  — every night, since the file was written, while docs/INCIDENT-RESPONSE.md told a reader in the
#  middle of a data-loss incident to 「take the newest backup」. There was none. A green run that
#  did nothing is indistinguishable from a green run that did the job, and the list of runs is the
#  only place anybody looks. So «could not do the job» is red, and says which secret is missing.
#
#  Writes to $GITHUB_OUTPUT (when set):
#    missing=<space-separated names>   (empty when all are present)
#  and prints one ::error:: per missing name. Never prints a value.
#  The fact is measured by tests/backup-and-deploy-as-code-checks.test.mjs, which RUNS the gate
#  step of every workflow that reads a secret, with the secrets empty and with them present.
# ============================================================================
set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "::error::ci-require-secrets.sh was called with no secret names — nothing would be checked"
  exit 2
fi

missing=()
for name in "$@"; do
  # indirect expansion: the variable NAMED by $name. ${!name-} is empty for unset and for "".
  if [ -z "${!name-}" ]; then missing+=("$name"); fi
done

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "missing=${missing[*]:-}" >> "$GITHUB_OUTPUT"
fi

if [ "${#missing[@]}" -gt 0 ]; then
  for name in "${missing[@]}"; do
    echo "::error::repository secret ${name} is not set — this workflow cannot do its job without it (see docs/BACKUP-RESTORE.md → 「一度だけの登録」)"
  done
  exit 1
fi

echo "all ${#} required secret(s) present: $*"
