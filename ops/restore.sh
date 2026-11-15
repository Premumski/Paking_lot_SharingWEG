#!/usr/bin/env bash
# O-05: restore a backup. Test this once per quarter on a separate server (see README).
# Usage: ops/restore.sh backups/stellplatz_YYYY-MM-DD_HHMM.sql.gz.gpg
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
FILE="${1:?backup file}"
read -r -p "This REPLACES the database ${POSTGRES_DB:-parking}. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || exit 1
docker compose stop app
docker compose exec -T db psql -U "${POSTGRES_USER:-parking}" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB:-parking};" -c "CREATE DATABASE ${POSTGRES_DB:-parking};"
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" "$FILE" | gunzip | docker compose exec -T db psql -U "${POSTGRES_USER:-parking}" -d "${POSTGRES_DB:-parking}" -v ON_ERROR_STOP=1 -q
docker compose start app
echo "restore ok"
