#!/usr/bin/env bash
# O-05: daily encrypted database backup to a second location (e.g. Hetzner Storage Box), kept 30 days.
# Install: copy to /opt/stellplatz/ops, then as root:  crontab -e  ->  15 3 * * * /opt/stellplatz/ops/backup.sh
# Needs in /opt/stellplatz/.env:  BACKUP_PASSPHRASE, BACKUP_TARGET (e.g. u123456@u123456.your-storagebox.de)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE missing in .env}"
: "${BACKUP_TARGET:?BACKUP_TARGET missing in .env}"
STAMP=$(date +%Y-%m-%d_%H%M)
FILE="stellplatz_${STAMP}.sql.gz.gpg"
mkdir -p backups
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-parking}" --format=plain --no-owner "${POSTGRES_DB:-parking}" \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "backups/$FILE"
# Copy to the storage box (SSH key auth, port 23 for Hetzner Storage Box)
scp -P 23 -q "backups/$FILE" "${BACKUP_TARGET}:stellplatz/"
# Retention: 30 days locally and remotely
find backups -name 'stellplatz_*.sql.gz.gpg' -mtime +30 -delete
ssh -p 23 "$BACKUP_TARGET" "find stellplatz -name 'stellplatz_*.sql.gz.gpg' -mtime +30 -delete" || true
echo "backup ok: $FILE"
