# 课程内容落实清单

更新时间：2026-07-11
项目定位：铁路安检辅助决策**模拟软件原型**，不代表真实安检能力。

## 状态说明

- **已在原项目存在**：开始本次 Web 开发前，外部 `D:\安检仪\安检仪` 实验目录已有；该目录保持只读，没有把权重、数据集和训练产物复制进 Web 仓库。
- **本次新增**：本次在 `D:\判图系统` 中实现或形成文档/配置。是否“实际测试通过”必须以 `PROGRESS.md` 最后一次命令结果为准。
- **尚未实现**：当前原型明确没有完成，不能在答辩或报告中声称已具备。
- **可选增强项**：超出核心闭环、适合后续迭代。

## 一、已在原项目存在

| 课程/实验内容 | 原有形态 | 本次处理 |
|---|---|---|
| YOLO 训练与推理实验 | Python、Ultralytics、OpenCV 脚本 | 只读审计，未直接嵌入 Node |
| X 光目标标签/数据处理 | 大量 YOLO 标签、数据拆分与转换脚本 | 不复制大体积数据，不声称数据许可或效果 |
| 目标类别实验 | 工具、刀具、压力容器、剪刀、充电宝、瓶子、打火机等 | 作为未来类别映射参考 |
| 气体通信实验 | TCP Socket、类 Modbus 帧模拟与解析 | 只作为协议研究参考，未连接真实硬件 |
| YOLO 权重/训练产物 | `.pt` 和 runs 目录 | 排除 Docker/Git 上下文，不宣称在 Web 系统验证 |
| 多模态项目立项内容 | DOCX 立项报告 | 只读提取业务目标与研究边界 |

原项目没有 React、Express、MongoDB、认证、REST API 或可部署 Web 页面，所以这些均属于本次新增，而不是“原有功能升级”。

## 二、本次新增

### 1. 工程与架构

| 内容 | 状态 | 主要位置 |
|---|---|---|
| npm workspaces 与根统一命令 | 本次新增 | `package.json` |
| 前后端分离 | 本次新增 | `frontend/`、`backend/` |
| app/server 分离 | 本次新增 | `backend/app.js`、`backend/server.js` |
| controller/service/repository 分层 | 本次新增 | `backend/controllers`、`services`、`repositories` |
| 环境变量集中校验 | 本次新增 | `backend/config/env.js`、三个 `.env.example` |
| 结构化日志与 HTTP 日志 | 本次新增 | `backend/config/logger.js`、`app.js` |
| 404、统一错误、异步异常 | 本次新增 | `backend/middleware/errorMiddleware.js`、`utils/asyncHandler.js` |
| 优雅关闭与未处理异常 | 本次新增 | `backend/server.js` |
| 健康检查 | 本次新增 | `GET /api/v1/health` |

### 2. MongoDB 课程内容

| 内容 | 状态 | 落地说明 |
|---|---|---|
| 五个 Mongoose 模型 | 本次新增 | User、InspectionRecord、AlarmRecord、Device、OperationLog |
| 嵌套文档 | 本次新增 | bbox、xrayResult、gasSensor、association |
| ObjectId 与 ref | 本次新增 | 检测→用户/设备；报警→检测/用户；日志→用户 |
| 按需 populate | 本次新增 | 列表只补必要字段，详情补关联信息 |
| 检测 CRUD | 本次新增 | GET/POST/GET one/PATCH/DELETE |
| 分页 `skip`/`limit` | 本次新增 | page、pageSize 最大 100、统一 pagination |
| 筛选与排序 | 本次新增 | 风险、状态、包裹、气体、时间、白名单排序 |
| aggregate 聚合 | 本次新增 | summary、趋势、气体、危险类别、设备状态 |
| 索引 | 本次新增 | 时间、风险+时间、状态+时间、气体+时间、唯一字段等 |
| explain 与写成本讲解 | 本次新增 | README 和 LEARNING_NOTES 第 17 节 |
| 创建检测/报警事务 | 本次新增 | 副本集事务；单机明确补偿降级 |
| 事务能力检测 | 本次新增 | `TRANSACTION_MODE=auto|required|off` |
| 逻辑删除与恢复 | 本次新增 | admin 删除/恢复，默认排除 |
| before/after 审计 | 本次新增 | OperationLog |
| 幂等 seed | 本次新增 | 角色、设备、≥50 模拟检测和报警 |
| 迁移与索引准备 | 本次新增 | `npm run migrate` |
| 安全创建管理员 | 本次新增 | `npm run create-admin`，密码来自环境变量 |
| 归档 dry-run | 本次新增 | `npm run archive:plan --workspace backend`，不自动删数据 |
| mongodump/mongorestore 脚本 | 本次新增 | `backend/scripts/backup.sh`、`restore.sh` |
| 备份恢复说明 | 本次新增 | `BACKUP_AND_RESTORE.md` |

### 3. 业务、认证与安全

| 内容 | 状态 | 落地说明 |
|---|---|---|
| 可解释风险评分 | 本次新增 | 独立规则配置 + riskService |
| 视觉类别/置信度/数量融合 | 本次新增 | 服务端计算 |
| 气体报警/浓度/趋势/状态融合 | 本次新增 | 服务端计算 |
| 多证据协同加分 | 本次新增 | 视觉 + 气体原因 |
| 传感器故障/数据不足 | 本次新增 | 不直接视为绝对安全 |
| bcrypt 密码哈希 | 本次新增 | cost 12，hash 默认不返回 |
| JWT 登录、me、logout 说明 | 本次新增 | HS256、过期、active 用户检查 |
| 三角色 RBAC | 本次新增 | admin/inspector/viewer 后端权限 |
| Zod body/query/params 校验 | 本次新增 | 枚举、时间、ObjectId、范围、分页 |
| 401/403/404/409/500 区分 | 本次新增 | 标准错误结构 |
| 登录限流 | 本次新增 | 15 分钟 30 次 |
| 关键写操作日志 | 本次新增 | 用户、检测、报警、设备、模拟、上传、登录退出 |
| 敏感字段保护 | 本次新增 | passwordHash select false / JSON 删除 |
| 无硬编码 JWT/演示密码 | 本次新增 | 环境变量，启动时检查 |

### 4. 报警、设备、模拟与上传

| 内容 | 状态 | 落地说明 |
|---|---|---|
| medium/high 自动报警 | 本次新增 | 创建检测时关联 AlarmRecord |
| 报警分页和筛选 | 本次新增 | 状态、等级、时间、指派人 |
| 报警合法状态机 | 本次新增 | 确认→处理中→解决；多阶段可忽略 |
| 报警指派与备注 | 本次新增 | active admin/inspector |
| admin 重开终态报警 | 本次新增 | resolved/ignored → confirmed |
| 设备 CRUD | 本次新增 | 被检测引用的设备拒绝物理删除 |
| 心跳与疑似离线 | 本次新增 | effectiveStatus + 环境阈值 |
| 模拟 YOLO 适配器 | 本次新增 | 标准检测数组，不加载真实模型 |
| 模拟传感器适配器 | 本次新增 | 浓度/报警/趋势基本一致 |
| 单条与批量模拟 | 本次新增 | low 为主，medium 次之，high 少量 |
| 模拟设备心跳 | 本次新增 | 不依赖硬件 |
| 图片上传 | 本次新增 | multer、单文件、大小/扩展/MIME/魔数检查 |
| 安全文件名与路径检查 | 本次新增 | 时间戳 + UUID，防路径穿越 |

### 5. 前端课程内容

| 内容 | 状态 | 主要位置 |
|---|---|---|
| React + Vite 应用 | 本次新增 | `frontend/src` |
| React Router | 本次新增 | 登录、Dashboard、检测、报警、设备、用户、日志、404 |
| 统一布局与响应式基础 | 本次新增 | `components/Layout.jsx`、CSS |
| AuthContext | 本次新增 | 登录恢复、退出、角色 |
| 统一 API client | 本次新增 | baseURL、Token、错误、401 |
| 按业务拆分 API | 本次新增 | `frontend/src/api/*.js` |
| Dashboard 容错统计 | 本次新增 | 独立请求、加载/错误/空状态 |
| 历史分页筛选与 URL 同步 | 本次新增 | InspectionsPage |
| 检测详情与框叠加 | 本次新增 | InspectionDetailPage、ImageOverlay |
| 新增模拟检测表单 | 本次新增 | 服务端最终风险、上传预览、防重复提交 |
| 报警处置页面 | 本次新增 | 合法状态动作与备注 |
| 设备管理 | 本次新增 | 角色化操作、心跳 |
| 用户和操作日志管理 | 本次新增 | admin 路由 |
| 模拟数据显著声明 | 本次新增 | 布局/Dashboard/表单 |
| high 风险克制提示 | 本次新增 | 实时 Context/页面提示 |

### 6. 实时、测试、文档和部署

| 内容 | 状态 | 落地说明 |
|---|---|---|
| Socket.IO JWT 握手 | 本次新增 | active 用户验证 |
| 四类实时事件 | 本次新增 | inspection:created、alarm:high、alarm:updated、device:updated |
| 连接/重连/断开显示 | 本次新增 | RealtimeContext |
| REST 降级 | 本次新增 | 页面仍可重新请求 |
| 风险/状态机/模拟等单元测试 | 本次新增 | 与后端集成测试合计 37 个，本机 Vitest 通过 |
| 登录/CRUD/角色/统计集成测试 | 本次新增 | 使用隔离数据库，计入上述后端 37 个通过结果 |
| 隔离测试数据库 | 本次新增 | mongodb-memory-server / TEST_MONGO_URI |
| 前端工具测试 | 本次新增 | 本机 Vitest 11 个通过 |
| ESLint 与 build 命令 | 本次新增 | 本机根 lint 与 Vite build 通过 |
| 新手 README | 本次新增 | 架构、启动、限制、排障 |
| 完整 API 文档 | 本次新增 | `API_DOCUMENTATION.md` |
| 28 主题学习笔记 | 本次新增 | `LEARNING_NOTES.md` |
| Dockerfile/Compose/Nginx | 本次新增 | 当前开发机无 Docker，仅静态校对，未实跑 |
| 部署/备份文档 | 本次新增 | `DEPLOYMENT.md`、`BACKUP_AND_RESTORE.md` |

## 三、尚未实现

| 内容 | 为什么尚未实现/当前边界 |
|---|---|
| 真实 YOLO 推理 | 未部署 Python HTTP 服务，未完成模型接口、现场数据评估和安全认证 |
| 真实气体传感器 | 未连接 Modbus/串口/设备网关，协议、单位、CRC、校准尚未现场验证 |
| 真实 X 光安检仪 | 不依赖真实设备；无厂商 SDK、采集卡和数据授权 |
| 真实多模态时间同步验证 | association 只预留结构，模拟数据不能证明现场对包准确率 |
| 自动替代人工判图 | 明确不属于项目目标，也不应实现为无人审核安全决策 |
| 生产级模型指标 | 没有可声称的真实 precision/recall、漏报率、域外检测或公平性结果 |
| 多节点生产 MongoDB | Compose 仅开发用单节点副本集；未部署三节点、认证和故障切换 |
| 当前机器 Docker 实跑 | 本机未安装 Docker，不能声称 compose build/up 已通过 |
| 公网/收费云部署 | 按要求未购买或部署收费服务 |
| HTTPS 和正式域名 | 文档提供方案，未申请证书/域名 |
| 服务端 JWT 吊销/刷新 | logout 为客户端清除，尚无 refresh token/denylist |
| 上传文件鉴权存储 | 当前静态 URL 可读，尚无私有对象存储/签名下载 |
| 多站点 Socket 房间隔离 | 当前向所有已认证连接广播 |
| 整批模拟原子事务 | 当前逐条创建；批次中途失败不会整体回滚 |
| 更新检测与报警事务 | 创建流程有事务，更新证据后的报警同步尚未包成事务 |
| 自动清理孤儿上传 | 上传成功、表单放弃时文件可能暂时无记录引用 |
| 自动物理归档/删除 | 有意只提供 dry-run，避免误删真实数据 |

## 四、可选增强项

| 增强 | 学习价值/收益 |
|---|---|
| OpenAPI 3.1 自动生成 | 让文档、校验和接口测试更一致 |
| 游标分页 | 改善百万级数据深分页和实时插入稳定性 |
| MongoDB change streams | 在副本集上减少手工事件触发遗漏，但仍需权限设计 |
| Socket.IO 按站点/角色房间 | 避免无关用户收到事件，支持多站点 |
| Refresh Token + 吊销 | 更完整的会话安全与设备管理 |
| CSP、CSRF 策略和安全扫描 | 提升生产 Web 安全基线 |
| 私有图片服务/短期签名 URL | 保护可能敏感的 X 光图像 |
| 孤儿文件定期对账 | 安全回收未被数据库引用的上传，先 dry-run |
| 三节点 MongoDB 与故障演练 | 验证事务、主从切换和恢复目标 |
| Prometheus/Grafana/OpenTelemetry | 请求、数据库、Socket 与业务指标可观测性 |
| 消息队列 | 将耗时真实推理从 HTTP 请求解耦，支持重试/幂等 |
| Python YOLO 契约测试 | 固定类别、坐标、版本、超时和错误语义 |
| Modbus 协议测试向量 | 验证粘包/分包、CRC、字节序、超量程和断线 |
| 模型/规则版本化 | 每条记录可追溯当时模型与阈值，支持回放比较 |
| 专业人员标注与双人复核 | 建立可评估数据，而不是把模拟分布当真实性能 |
| 无障碍与更完整移动端 | 键盘导航、对比度、读屏和小屏表格体验 |
| E2E 浏览器测试 | 用 Playwright 覆盖登录到报警处置完整闭环 |
| CI/CD | 每次提交自动 lint/test/build/镜像扫描，但不自动恢复真实库 |

## 答辩时的准确表述

可以说：“我们实现了从模拟多模态数据接入、服务端风险融合、MongoDB 存储、报警处置、审计、统计到实时页面更新的软件闭环，并为真实适配器预留了契约。”

不要说：“系统已经能识别真实违禁品”“气体浓度来自真实设备”“Docker 已在本机验证通过”“单机 MongoDB 降级等同于事务”或“已经可无人值守替代安检员”。
