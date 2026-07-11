# MongoDB 备份与恢复

> 备份/恢复脚本位于 `backend/scripts/backup.sh` 和 `backend/scripts/restore.sh`。脚本只针对 MongoDB；`backend/uploads` 中的图片需要单独备份。恢复会改写目标数据库，必须先确认目标 URI 和备份目录，并优先在隔离测试库演练。

## 1. 工具与安全边界

需要 MongoDB Database Tools（`mongodump`、`mongorestore`）。检查版本：

```bash
mongodump --version
mongorestore --version
```

Windows 用户推荐在 WSL 中运行脚本：

```powershell
wsl bash -lc "mongodump --version && mongorestore --version"
```

安全规则：

- 不把含账号密码的 URI 写进 Git、聊天记录或脚本；通过当前终端环境变量/Secret 注入。
- 不从不可信来源恢复备份。
- 不对生产库使用 `--drop`，除非已经审批、已有可验证备份且明确了解影响。
- 不在自动测试中执行真实恢复。
- 恢复前暂停会写入目标库的应用，或使用新的隔离数据库名。
- 数据库备份不包含上传图片；数据库和图片快照应记录同一时间点。

## 2. 创建备份

### 2.1 WSL / Linux

从项目根目录执行：

```bash
export MONGO_URI='mongodb://127.0.0.1:27017/railway_security'
export BACKUP_DIR="$HOME/railway-security-backups"
bash backend/scripts/backup.sh
```

脚本应当：

1. 检查 `MONGO_URI` 与 `mongodump`；
2. 使用日期时间创建新的子目录；
3. 在目标已存在时拒绝静默覆盖；
4. 调用 `mongodump` 并让错误状态向上传递；
5. 打印实际输出目录，便于后续校验。

若脚本最终采用不同的可选变量名，以脚本开头的帮助和检查逻辑为准；`MONGO_URI` 是必需变量。

### 2.2 Docker Compose

Compose 容器可以直接访问内部主机名。推荐把输出写到主机挂载目录，而不是留在临时容器层。简洁做法是在安装了 Database Tools 的主机/WSL 中使用映射端口；对于 Compose 单节点副本集，管理命令也可从 MongoDB 容器执行：

```powershell
New-Item -ItemType Directory -Force .\local-backups | Out-Null
docker compose exec mongodb mongodump --uri="mongodb://localhost:27017/railway_security?directConnection=true" --archive --gzip > .\local-backups\railway-security.archive.gz
```

PowerShell 的原生程序重定向在旧版本可能改变二进制内容。优先使用 PowerShell 7.4+；更稳妥的办法是在 WSL 中执行或使用目录格式备份。不要将 `local-backups` 提交到 Git。

### 2.3 同步备份上传图片

停止写入或进入维护窗口后，将 `backend/uploads`（或 Docker 的 `backend_uploads` 卷）复制到同一备份批次目录，并生成清单：

```bash
find backend/uploads -type f -print0 | sort -z | xargs -0 sha256sum > uploads.sha256
```

Windows 可使用 PowerShell：

```powershell
Get-ChildItem backend\uploads -File -Recurse | Get-FileHash -Algorithm SHA256 | Export-Csv uploads-sha256.csv -NoTypeInformation
```

## 3. 校验备份

至少检查：

- `mongodump` 退出码为 0，目录/归档非空；
- 包含 `users`、`inspectionrecords`、`alarmrecords`、`devices`、`operationlogs` 等预期集合（实际集合名以 MongoDB 为准）；
- 保存备份时间、应用版本、MongoDB 版本、源数据库名和文件校验和；
- 定期在隔离数据库恢复，核对集合与记录数量；只有通过恢复演练的文件才能称为“可用备份”。

示例校验和：

```bash
sha256sum railway-security.archive.gz > railway-security.archive.gz.sha256
sha256sum -c railway-security.archive.gz.sha256
```

## 4. 恢复到隔离环境（推荐流程）

最安全的办法是启动一个隔离 MongoDB 实例（例如本机 27018），让它使用与备份相同的数据库名。当前脚本保留 dump 中记录的命名空间，不负责把 `railway_security.*` 自动改名；只改 URI 末尾数据库名并不能保证完成命名空间改写。

```bash
export MONGO_URI='mongodb://127.0.0.1:27018/railway_security'
export BACKUP_PATH="$HOME/railway-security-backups/20260711T120000Z"
bash backend/scripts/restore.sh "$BACKUP_PATH"
```

恢复脚本必须显示目标和来源，并要求二次确认。若需要非交互自动化，应另外设计有审批和短期凭据的发布流水线，不要绕过本脚本确认。

若必须在同一服务器恢复为不同数据库名，请先明确源/目标命名空间并手工使用 Database Tools 的映射参数，例如：

```bash
mongorestore --uri='mongodb://127.0.0.1:27017' \
  --nsFrom='railway_security.*' \
  --nsTo='railway_security_restore_test.*' \
  "$BACKUP_PATH/railway_security"
```

这条命令不带 `--drop`，但仍会写目标库；执行前同样要人工复核源目录和两个 namespace。正式恢复优先使用脚本的二次确认流程，命名空间映射属于高级手工演练。

恢复后验证：

```bash
mongosh "$MONGO_URI" --quiet --eval 'db.getCollectionNames().sort()'
mongosh "$MONGO_URI" --quiet --eval 'db.inspectionrecords.countDocuments({})'
mongosh "$MONGO_URI" --quiet --eval 'db.alarmrecords.countDocuments({})'
```

然后临时让后端连接测试库，执行登录、列表、详情、Dashboard、报警处置与图片访问冒烟测试。确认完成后再制定生产恢复窗口。

## 5. 生产恢复检查表

1. 明确事故范围：误删、集合损坏、服务器故障还是凭据泄漏。
2. 记录目标恢复点、备份校验和和审批人。
3. 停止应用写入，保留现场日志与当前损坏库快照。
4. 验证目标 `MONGO_URI`，再次确认数据库名和集群。
5. 优先恢复到新数据库，再通过配置切换；能避免原地覆盖就不要原地覆盖。
6. 若确需覆盖，理解 `mongorestore --drop` 会先删除目标集合；执行前必须另有备份。
7. 恢复数据库和同批次上传文件，检查引用 URL 是否存在。
8. 运行迁移、索引同步（按项目脚本策略）与核心业务冒烟测试。
9. 恢复服务，持续观察 4xx/5xx、数据库日志与业务数量。
10. 记录恢复耗时、数据缺口和改进项。

## 6. 保留策略示例

课程演示环境可采用“每日 7 份、每周 4 份、每月 6 份”的分层保留策略；真实环境应根据数据分级、学校制度和恢复点目标确定。备份至少保留一份异机/离线副本，并加密传输和存储。

仓库的归档命令 `npm run archive:plan` 只应生成候选计划或 dry-run，不应自动删除真实记录。归档不等于备份：归档为了减少在线数据量，备份为了灾难恢复。

## 7. 常见问题

- **`mongodump: command not found`**：安装 MongoDB Database Tools；仅安装 `mongosh` 不一定包含备份工具。
- **`Transaction numbers are only allowed...`**：目标是独立 MongoDB，不是副本集；这影响应用事务，与 `mongodump` 本身不同。
- **认证失败**：确认 URI 的用户名、密码、`authSource` 和特殊字符 URL 编码，不要在日志中打印完整 URI。
- **恢复后没有数据**：常见原因是备份的数据库名与目标命名空间不一致。先查看备份目录结构和脚本实际参数，禁止盲目追加 `--drop`。
- **图片 404**：MongoDB 只保存 URL/元数据，必须恢复同批次上传目录并确认挂载路径。
- **Compose 主机名无法解析**：`mongodb` 是容器网络内部名称；从主机执行请用容器内命令或 `directConnection=true` 的本机映射端口。
