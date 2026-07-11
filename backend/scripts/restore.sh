#!/usr/bin/env bash
set -euo pipefail

: "${MONGO_URI:?请先设置 MONGO_URI}"
SOURCE="${1:-}"
if [[ -z "$SOURCE" || ! -d "$SOURCE" ]]; then
  echo "用法：bash scripts/restore.sh <备份目录>" >&2
  exit 1
fi
command -v mongorestore >/dev/null 2>&1 || { echo "未找到 mongorestore，请安装 MongoDB Database Tools" >&2; exit 1; }
echo "即将把备份恢复到 MONGO_URI 指向的数据库：$SOURCE"
echo "脚本不会使用 --drop，但同名文档可能发生重复键冲突。"
read -r -p "请输入 RESTORE 继续：" CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "已取消恢复。"
  exit 1
fi
mongorestore --uri="$MONGO_URI" "$SOURCE"
echo "恢复命令执行完成，请检查输出和数据完整性。"
