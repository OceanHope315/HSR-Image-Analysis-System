# 开发进度

## 阶段 0：仓库审计（已完成）

### 修改了什么

- 当前工作区起初为空；初始化本项目的审计和计划文档。
- 对外部 Python 实验目录和立项报告执行只读检查，没有修改或复制原始资产。

### 新增了什么

- `REPOSITORY_AUDIT.md`
- `IMPLEMENTATION_PLAN.md`
- `PROGRESS.md`
- `LEARNING_NOTES.md`
- `API_DOCUMENTATION.md`
- `.gitignore`

### 测试结果

- 确认当前目录初始无 Git、源码、依赖、环境变量和 Web 应用。
- 确认 WSL MongoDB 端口 27017 正在监听，但尚未执行应用层读写验证。
- 确认端口 5173 已被其他进程占用；本项目将使用 5174。
- 确认 Docker 未安装；最终 Docker 配置不能标记为实际运行通过。

### 尚存问题

- 尚未创建应用骨架或安装依赖。
- 尚未验证数据库认证方式和事务拓扑。
- 外部 Python 代码依赖个人绝对路径，只能作为协议/研究参考。

### 下一阶段

- 建立 npm workspace、前后端基线、环境变量示例和健康检查。
- 安装依赖，运行首轮 lint/test/build/start。

## 阶段 1：稳定基线（已完成）

### 修改与新增

- 初始化本地 Git 仓库、`.gitignore`、Node 22 版本提示和 npm workspaces。
- 建立根级 `install:all`、`dev`、`build`、`test`、`lint`、`seed`、`migrate`、`create-admin` 命令。
- 创建前后端环境变量示例；没有创建或覆盖真实 `.env`。
- 建立 Express 健康检查和 Vite 5174 基线，避开原有 5173 服务。

### 验证

- `npm run install:all` 成功。
- 官方 npm 安全审计：0 个已知漏洞。
- 前后端实际启动成功；健康检查 200，前端首页 200 且标题正确。

### 尚存问题与下一阶段

- 本机无 Docker；容器只能在阶段 11 静态验证。
- 继续完成后端分层和数据库业务。

## 阶段 2：后端工程结构（已完成）

### 修改与新增

- 完成 `app.js` / `server.js` 分离，以及 config、middleware、controller、service、repository、route、validator 分层。
- 加入 Pino 请求/错误日志、敏感头脱敏、404、统一异常、CORS、Socket.IO 和关闭处理。

### 验证

- 后端 ESLint 通过；Express app 可由 Supertest 直接导入。
- 实际日志中 Authorization 显示为 `[REDACTED]`。

### 尚存问题与下一阶段

- Windows 强制终止进程不等同 POSIX 信号；SIGINT/SIGTERM 关闭逻辑已实现，目标 Linux/容器仍需部署时复验。
- 继续完善模型、CRUD 和统计。

## 阶段 3：MongoDB 模型、CRUD、筛选与统计（已完成）

### 修改与新增

- 完成 User、InspectionRecord、AlarmRecord、Device、OperationLog 五个模型。
- 完成检测 CRUD、最大 100 条分页、筛选、排序、详情关联、逻辑删除和恢复。
- 完成 Dashboard summary、risk-trend、gas-statistics、device-status 聚合。
- 增加复核建议和多模态同步/关联质量扩展字段。

### 验证

- 独立 `railway_security_test` 集成测试覆盖 CRUD、分页、筛选、详情、更新、冲突、404 和统计。
- 实际开发库 Dashboard 返回真实聚合数量。

### 尚存问题与下一阶段

- 数据量仍是课程演示规模；大规模查询需按真实慢查询继续调优。
- 继续验证索引、事务与数据脚本。

## 阶段 4：索引、关联、事务、迁移、归档与备份（已完成）

### 修改与新增

- 建立需求中的唯一、时间、风险、状态、气体报警和审计复合索引。
- 只在详情/展示查询使用 populate。
- 创建检测与报警支持副本集事务；单机环境采用明确记录日志的补偿式降级。
- 完成 migrate、幂等 seed、create-admin、只读归档预演/只复制归档、backup/restore。

### 验证

- WSL MongoDB 8 实际连接；`hello.setName=null`，确认本机是单机拓扑、不支持事务。
- 实际创建高风险记录时响应 `transactionMode=compensating-fallback`，日志明确警告，没有伪装为事务成功。
- `npm run migrate` 成功；seed 连续执行两次仍保持 60 条基础记录。
- seed 初始分布：low 45、medium 8、high 7；气体报警 7；五种报警状态各 3 条。
- `explain("executionStats")` 实测使用 `riskLevel_1_timestamp_-1`，返回 9 条时检查 9 个 key/文档。
- `mongodump` 实际备份成功到 WSL `/tmp/railway-security-backups/railway-security-20260711-175502`；restore 仅做 Bash 语法检查，未执行真实恢复。
- 归档 plan 实际运行且只读，未删除任何数据。

### 尚存问题与下一阶段

- 副本集事务代码未在当前单机 MongoDB 实跑；Compose 提供 rs0 配置，但本机无 Docker。
- 继续完成认证、权限和审计。

## 阶段 5：认证、权限、校验与日志（已完成）

### 修改与新增

- 完成 bcrypt 哈希、JWT、登录/当前用户/退出说明、Token 失效和登录限流。
- 完成 admin、inspector、viewer RBAC，Zod body/query/params 校验和 400/401/403/404/409/500 响应。
- 完成用户管理、操作日志查询和敏感字段递归清除。

### 验证

- 三角色均可读取；admin/inspector 可新增模拟数据；viewer 写操作实际返回 403。
- 用户响应和 OperationLog 不包含 passwordHash；错误登录不区分用户不存在和密码错误。
- 指定管理员 `admin / admin@163.com` 已通过环境变量创建，密码仅以 bcrypt 哈希保存。

### 尚存问题与下一阶段

- JWT 退出采用前端清除 Token，没有服务端吊销列表；已在 README 标明。
- 继续完成报警与设备闭环。

## 阶段 6：报警与设备（已完成）

### 修改与新增

- 完成报警分页/筛选、指派、确认、处理中、解决、忽略和管理员重开。
- 完成设备 CRUD、引用保护、心跳、有效状态和超时疑似离线。
- 报警和设备关键写操作均写审计日志并发送实时事件。

### 验证

- 实际冒烟按 confirmed → processing → resolved 完成处置。
- 非法终态回退返回 409；viewer 处置返回 403。
- 实际设备心跳成功，Dashboard 使用有效心跳统计状态。

### 尚存问题与下一阶段

- 设备均为模拟设备，不代表真实硬件在线。
- 继续完成模拟适配器和上传。

## 阶段 7：模拟适配器与图片上传（已完成）

### 修改与新增

- 完成独立风险规则、模拟 YOLO、模拟气体和合理概率分布。
- 兼容外部七类模型 taxonomy，预留 Python YOLO HTTP 和 Modbus 网关替换点。
- 完成单条/批量/设备心跳模拟接口。
- 上传采用大小、扩展名、MIME、magic bytes、安全随机文件名和静态目录限制。

### 验证

- 风险单测覆盖无数据、低风险、视觉、气体、融合、离线、极端浓度和非法置信度。
- 伪装 JPG 的可执行内容被拒；真实 PNG 文件头被接受。
- 实际上传 1×1 PNG 后静态访问返回 200。

### 尚存问题与下一阶段

- 未加载 `.pt`、未调用真实模型、未监听真实设备端口。
- 继续完成 React 页面。

## 阶段 8：React 页面与 API 层（已完成）

### 修改与新增

- 完成登录、Dashboard、检测列表/新增/详情、报警、设备、用户、日志和 404 页面。
- 完成统一布局、AuthContext、角色路由、API client、401 清理、URL 筛选状态和错误/空/加载状态。
- 完成 Recharts、图片检测框、响应式 CSS 和全局模拟数据声明。

### 验证

- 前端 ESLint 通过；3 个文件、11 项 Vitest 全通过。
- Vite 构建 647 个模块成功；开发服务器 5174 实际 HTTP 200。
- 指定账号的用户名登录和邮箱登录均通过同一前端 API，返回 admin 且不返回密码哈希。

### 尚存问题与下一阶段

- 未做真实浏览器端到端视觉回归；构建、HTTP 和 API 闭环已验证。
- 继续完成实时通信。

## 阶段 9：Socket.IO 实时更新（已完成）

### 修改与新增

- Socket 握手校验 JWT 和有效用户。
- 实现 `inspection:created`、`alarm:high`、`alarm:updated`、`device:updated`。
- 前端显示连接、重连、断开状态，high 报警提供克制提示并可跳详情；REST/30 秒轮询保留。

### 验证

- 实际 Socket 客户端连接成功。
- 创建 high 记录后实际收到标题匹配包裹编号的 `alarm:high` 事件。

### 尚存问题与下一阶段

- 未进行大并发 Socket 压力测试。
- 进入完整质量门禁。

## 阶段 10：测试、构建与错误修复（已完成）

### 实际结果

- 根命令 `npm run lint`：前后端全部通过。
- 根命令 `npm test`：后端 7 个文件/37 项通过；前端 3 个文件/11 项通过。
- 根命令 `npm run build`：Vite 生产构建通过。
- 官方 npm audit（含开发依赖）：0 个已知漏洞。
- 核心冒烟成功：登录 → 上传 → 创建设备关联 high 记录 → 自动报警 → Socket 事件 → 查询/详情 → 报警处置 → 逻辑删除/查询/恢复 → Dashboard → 操作日志。
- 冒烟结果：风险 high、报警 resolved、图片 200、6 条关键日志；本机明确使用 compensating-fallback。
- CORS 允许来源实际通过，恶意来源返回 403 `CORS_NOT_ALLOWED`。

### 尚存问题与下一阶段

- Docker 和真实副本集路径未在本机运行，不能标记为通过。
- 完成部署与课程文档。

## 阶段 11：Docker、部署与学习文档（已完成）

### 修改与新增

- 完成前后端 Dockerfile、Nginx、四服务 Compose、Mongo rs0 初始化、健康检查和持久卷。
- 完成 README、API_DOCUMENTATION、LEARNING_NOTES、COURSE_CHECKLIST、DEPLOYMENT、BACKUP_AND_RESTORE。
- LEARNING_NOTES 含 28 个主题，每节均有解释、项目文件、关键代码、数据步骤、常见错误、自测题和答案。

### 验证

- Compose YAML 解析成功，包含 mongodb、mongodb-init、backend、frontend。
- Nginx 上传路径使用优先代理，Socket Upgrade 配置完整。
- backup/restore Bash 语法检查通过；backup 已实际运行。

### 尚存问题与下一阶段

- 本机未安装 Docker，因此没有执行 `docker compose build/up`；文档明确标为目标环境待验。
- 执行最终验收与差异检查。

## 阶段 12：最终验收（已完成）

| # | 验收项 | 结果与证据 |
|---:|---|---|
| 1 | 前端能够启动 | ✅ 5174 实际 HTTP 200 |
| 2 | 后端能够启动 | ✅ 5000 health 实际 200 |
| 3 | MongoDB 能够连接 | ✅ WSL MongoDB 8，health 显示 connected |
| 4 | 能够登录 | ✅ 用户名和邮箱两种登录实测 |
| 5 | 三种角色权限生效 | ✅ 集成测试与开发库 200/403 实测 |
| 6 | Dashboard 有数据库统计 | ✅ 实际聚合返回开发库数量 |
| 7 | 能新增模拟检测 | ✅ 表单 API/冒烟成功 |
| 8 | 服务端自动计算风险 | ✅ high 分数与原因由后端生成 |
| 9 | high 自动生成报警 | ✅ 数据库、响应和 Socket 三处确认 |
| 10 | 历史分页和筛选 | ✅ 集成测试及 packageId 冒烟筛选 |
| 11 | 单条详情 | ✅ 返回设备、报警、日志关联 |
| 12 | 处理报警 | ✅ confirmed → processing → resolved 实测 |
| 13 | 管理模拟设备 | ✅ CRUD/心跳/权限测试通过 |
| 14 | 管理员逻辑删除恢复 | ✅ 冒烟实测 |
| 15 | 关键操作日志 | ✅ 冒烟核对 6 条，敏感字段已清除 |
| 16 | 图片上传显示 | ✅ magic bytes 校验和静态 200 |
| 17 | Socket 推送新报警 | ✅ 实际收到 `alarm:high` |
| 18 | seed 可运行 | ✅ 实跑两次，基础记录不重复 |
| 19 | 测试可运行 | ✅ 后端 37 + 前端 11 全通过 |
| 20 | 前端 build 成功 | ✅ 647 modules 构建成功 |
| 21 | README 可指导安装 | ✅ 覆盖 Windows/WSL、Mongo、命令、限制 |
| 22 | 不依赖真实 YOLO/传感器 | ✅ 仅模拟适配器 |
| 23 | 模拟数据明确标识 | ✅ 登录、布局、Dashboard、表单均标识 |
| 24 | 无硬编码密码/密钥 | ✅ 密钥/密码通过环境变量，源码扫描无真实凭据 |
| 25 | 无明显运行时错误 | ✅ lint/test/build/start/smoke 全通过 |

### 最终边界

- 已实测：Node/React/MongoDB、三角色、REST、Socket、上传、seed/migrate/create-admin、备份、测试与构建。
- 静态检查：Docker/Compose/Nginx、restore 脚本（未执行恢复）。
- 未实测：真实 YOLO、真实传感器/安检设备、Docker 运行、副本集事务分支、现场性能和安检准确率。
- 外部 `D:\安检仪\安检仪` 与立项报告保持原样，没有删除、覆盖或复制大模型资产。
