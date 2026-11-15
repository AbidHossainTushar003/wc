#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DB_NAME:?Set DB_NAME in the private backup environment file}"
: "${MYSQL_CNF:?Set MYSQL_CNF to a private MySQL client option file}"
: "${BACKUP_DIR:?Set BACKUP_DIR to a directory outside public_html}"
: "${HOME:?The hosting account home directory is required}"

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "DB_NAME contains unsupported characters." >&2
    exit 2
fi
if [[ ! -r "$MYSQL_CNF" ]]; then
    echo "MySQL client option file is missing or unreadable." >&2
    exit 2
fi

home_real="$(realpath -e -- "$HOME")"
backup_real="$(realpath -m -- "$BACKUP_DIR")"
cnf_real="$(realpath -e -- "$MYSQL_CNF")"
case "$backup_real" in
    "$home_real"/public_html|"$home_real"/public_html/*)
        echo "BACKUP_DIR must be outside public_html." >&2
        exit 2
        ;;
esac
case "$cnf_real" in
    "$home_real"/public_html|"$home_real"/public_html/*)
        echo "MYSQL_CNF must be outside public_html." >&2
        exit 2
        ;;
esac
chmod 600 -- "$cnf_real"
mkdir -p -- "$BACKUP_DIR"
chmod 700 -- "$BACKUP_DIR"
backup_real="$(realpath -e -- "$BACKUP_DIR")"
case "$backup_real" in
    "$home_real"/public_html|"$home_real"/public_html/*)
        echo "BACKUP_DIR must be outside public_html." >&2
        exit 2
        ;;
esac
backup_file="$(mktemp "$BACKUP_DIR/${DB_NAME}-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.sql.gz")"
chmod 600 -- "$backup_file"
trap 'rm -f -- "$backup_file"' ERR

mysqldump --defaults-extra-file="$MYSQL_CNF" --single-transaction --quick --hex-blob "$DB_NAME" |
    gzip -c > "$backup_file"
gzip -t -- "$backup_file"
test -s "$backup_file"
chmod 600 -- "$backup_file"
trap - ERR

printf 'Integrity-checked backup created; restore verification is still required: %s\n' "$backup_file"
