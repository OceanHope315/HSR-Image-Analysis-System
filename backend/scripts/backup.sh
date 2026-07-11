#!/usr/bin/env bash
set -euo pipefail

: "${MONGO_URI:?请先设置 MONGO_URI}"
BACKUP_ROOT="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_ROOT%/}/railway-security-${STAMP}"

command -v mongodump >/dev/null 2>&1 || { echo "未找到 mongodump，请安装 MongoDB Database Tools" >&2; exit 1; }
if [[ -e "$TARGET" ]]; then
  echo "备份目录已存在，拒绝覆盖：$TARGET" >&2
  exit 1
fi
mkdir -p "$BACKUP_ROOT"
mongodump --uri="$MONGO_URI" --out="$TARGET"
echo "备份完成：$TARGET"
