# API 文档

- 版本：`v1`
- 开发基础地址：`http://localhost:5000/api/v1`
- 内容类型：除文件上传外均为 `application/json`
- 时间：ISO 8601，例如 `2026-07-11T08:30:00.000Z`
- ID：24 位十六进制 MongoDB ObjectId

> 当前 YOLO、气体与设备数据为模拟数据或标准化输入，仅用于开发和功能演示。API 返回的风险是规则式辅助建议，不代表真实安检结论。

## 1. 身份认证与权限

除健康检查和登录外，请求必须携带：

```http
Authorization: Bearer <JWT>
```

角色：

| 角色 | 能力 |
|---|---|
| `admin` | 全部读取；检测删除/恢复；用户和设备管理；报警处置/重开；操作日志 |
| `inspector` | 读取；创建/更新检测；报警指派和合法处置；设备心跳；模拟和上传 |
| `viewer` | 只读 Dashboard、检测、报警和设备 |

前端菜单不是权限边界；所有写权限由后端中间件执行。未认证返回 401，身份有效但角色不足返回 403。

## 2. 通用响应

普通成功：

```json
{
  "success": true,
  "data": {}
}
```

分页成功：

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不合法",
    "details": [
      { "field": "packageId", "message": "packageId 必填" }
    ]
  }
}
```

生产响应不返回堆栈。常见状态：

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | body/query/params 不合法 |
| 400 | `UPLOAD_ERROR` / `UPLOAD_*` | 文件缺失、类型、内容或大小错误 |
| 401 | `UNAUTHORIZED` | Token 缺失、过期、无效或用户停用 |
| 403 | `FORBIDDEN` | 角色不足 |
| 403 | `SIMULATION_DISABLED` | 环境关闭模拟接口 |
| 404 | `NOT_FOUND` | 资源或路由不存在 |
| 409 | `CONFLICT` | 唯一字段冲突或非法状态转换 |
| 429 | `RATE_LIMITED` | 登录尝试过多 |
| 503 | `TRANSACTION_UNAVAILABLE` | required 模式但 MongoDB 不是副本集 |
| 500 | `INTERNAL_ERROR` | 未预期服务错误 |

## 3. 端点总览

权限列中的“登录”表示三角色均可读。

| 方法 | 路径 | 权限 | 用途 |
|---|---|---|---|
| GET | `/health` | 公开 | 服务与数据库健康 |
| POST | `/auth/login` | 公开 | 登录 |
| GET | `/auth/me` | 登录 | 当前用户 |
| POST | `/auth/logout` | 登录 | 记录退出，客户端清 Token |
| GET | `/inspections` | 登录 | 分页筛选检测 |
| POST | `/inspections` | admin/inspector | 创建并服务端算风险 |
| GET | `/inspections/:id` | 登录 | 检测、报警和日志详情 |
| PATCH | `/inspections/:id` | admin/inspector | 更新允许字段并必要时重算风险 |
| DELETE | `/inspections/:id` | admin | 逻辑删除 |
| PATCH | `/inspections/:id/restore` | admin | 恢复逻辑删除 |
| GET | `/alarms` | 登录 | 分页筛选报警 |
| GET | `/alarms/:id` | 登录 | 报警详情 |
| PATCH | `/alarms/:id/status` | admin/inspector | 合法状态转换 |
| PATCH | `/alarms/:id/assign` | admin/inspector | 指派/取消指派 |
| PATCH | `/alarms/:id/reopen` | admin | 重开终态报警 |
| GET | `/devices` | 登录 | 分页筛选设备 |
| POST | `/devices` | admin | 创建设备 |
| GET | `/devices/:id` | 登录 | 设备详情 |
| PATCH | `/devices/:id` | admin | 更新设备 |
| DELETE | `/devices/:id` | admin | 删除未被引用设备 |
| POST | `/devices/:id/heartbeat` | admin/inspector | 模拟/接收心跳 |
| GET | `/dashboard/summary` | 登录 | 核心卡片与最新数据 |
| GET | `/dashboard/risk-trend` | 登录 | 风险趋势 |
| GET | `/dashboard/gas-statistics` | 登录 | 气体和目标类别统计 |
| GET | `/dashboard/device-status` | 登录 | 有效设备状态 |
| POST | `/simulation/generate` | admin/inspector | 单条合理模拟 |
| POST | `/simulation/batch` | admin/inspector | 1–100 条模拟 |
| POST | `/simulation/device-heartbeat` | admin/inspector | 模拟设备心跳 |
| POST | `/uploads/xray` | admin/inspector | 上传一张图片 |
| GET | `/users` | admin | 用户列表 |
| POST | `/users` | admin | 创建用户 |
| GET | `/users/:id` | admin | 用户详情 |
| PATCH | `/users/:id` | admin | 修改用户/密码 |
| DELETE | `/users/:id` | admin | 停用用户（非物理删除） |
| GET | `/logs` | admin | 操作日志 |

静态图片地址不带 `/api/v1`：`GET http://localhost:5000/uploads/xrays/<filename>`。

## 4. 健康检查

### `GET /health`

公开，无参数。数据库 connected 返回 200；否则返回 503。

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "timestamp": "2026-07-11T08:30:00.000Z",
    "version": "1.0.0"
  }
}
```

不返回 Mongo URI、JWT 密钥或其他敏感配置。

## 5. 认证

### `POST /auth/login`

公开。15 分钟内单个限流维度最多 30 次（具体键由限流库默认策略决定）。`email` 与 `username` 至少一个；两者都给出时优先 email。登录密码请求最少 6 位，实际用户创建策略为至少 8 位并含字母和数字。

```json
{
  "email": "inspector@example.local",
  "password": "由 seed 时设置的密码"
}
```

或：

```json
{
  "username": "inspector",
  "password": "由 seed 时设置的密码"
}
```

成功 200：

```json
{
  "success": true,
  "data": {
    "token": "<JWT>",
    "user": {
      "_id": "66a000000000000000000001",
      "username": "inspector",
      "email": "inspector@example.local",
      "role": "inspector",
      "isActive": true,
      "lastLoginAt": "2026-07-11T08:30:00.000Z"
    }
  }
}
```

特殊错误：400 格式不合法；401 统一提示“邮箱、用户名或密码错误”，不泄露账号是否存在；429 登录过频。

### `GET /auth/me`

登录。返回当前数据库中的 active 用户，不含 `passwordHash`。401 表示 Token 无效/过期或账号已停用。

### `POST /auth/logout`

登录。写入操作日志并返回：

```json
{ "success": true, "data": { "message": "已退出，请在客户端清除 Token" } }
```

本原型没有 Token 吊销表；客户端必须删除 Token。旧 Token 在过期前理论上仍可用，但每次认证会检查用户是否 active。

## 6. 检测记录

### 6.1 `GET /inspections`

登录。查询参数：

| 参数 | 类型/默认 | 说明 |
|---|---|---|
| `page` | 正整数，1 | 页码 |
| `pageSize` | 1–100，10 | 每页数量 |
| `riskLevel` | low/medium/high | 风险筛选 |
| `status` | pending/reviewed/escalated/closed | 复核状态 |
| `packageId` | ≤80 字符 | 不区分大小写的部分搜索 |
| `gasAlarm` | `true`/`false` | 气体报警筛选 |
| `startTime` | ISO 时间 | 检测时间下界 |
| `endTime` | ISO 时间 | 检测时间上界，不得早于 startTime |
| `sortBy` | timestamp/riskScore/createdAt/packageId；默认 timestamp | 排序字段白名单 |
| `sortOrder` | asc/desc；默认 desc | 排序方向 |
| `includeDeleted` | true/false；默认 false | 仅 admin 可用；true 表示列表可包含删除和未删除记录 |

示例：

```http
GET /api/v1/inspections?page=1&pageSize=20&riskLevel=high&gasAlarm=true&sortBy=timestamp&sortOrder=desc
```

返回记录数组和通用 pagination。列表按需 populate 设备与操作员；默认排除 `isDeleted=true`。非 admin 使用 `includeDeleted=true` 返回 403。

### 6.2 `POST /inspections`

admin/inspector。客户端不能提交最终 `riskLevel`、`riskScore`、`riskReasons`、`operatorId` 或删除字段；严格校验会拒绝未知字段。最终风险永远由服务器计算。

完整 body 示例：

```json
{
  "packageId": "PKG-20260711-0001",
  "timestamp": "2026-07-11T08:30:00.000Z",
  "xrayImageUrl": "/uploads/xrays/example.jpg",
  "xrayResult": [
    {
      "className": "lighter",
      "confidence": 0.91,
      "bbox": { "x": 0.22, "y": 0.18, "width": 0.31, "height": 0.42 },
      "modelName": "mock-yolo",
      "modelVersion": "simulation-v1"
    }
  ],
  "gasSensor": {
    "gasType": "combustible",
    "concentration": 85.2,
    "unit": "ppm",
    "alarm": true,
    "trend": "rising",
    "sensorStatus": "online",
    "collectedAt": "2026-07-11T08:29:59.000Z"
  },
  "association": {
    "syncSignal": "PKG-20260711-0001",
    "windowStart": "2026-07-11T08:29:55.000Z",
    "windowEnd": "2026-07-11T08:30:05.000Z",
    "quality": "exact",
    "notes": "模拟时间同步"
  },
  "deviceId": "66a000000000000000000010",
  "source": "simulation",
  "status": "pending"
}
```

字段规则：

- `packageId` 必填、唯一、1–80 字符；
- bbox 的 `x/y/width/height` 均为非负数；接口接受数值，但坐标是像素还是归一化必须由数据源契约统一；
- `confidence` 为 0–1；xrayResult 最多 100 项；
- concentration 非负；trend 为 rising/stable/falling/unknown；sensorStatus 为 online/offline/fault/calibrating；
- `deviceId` 可为 null，但非空时必须存在；
- source 为 manual/simulation/api。

成功 201：

```json
{
  "success": true,
  "data": {
    "inspection": {
      "_id": "66a000000000000000000101",
      "packageId": "PKG-20260711-0001",
      "riskLevel": "high",
      "riskScore": 92,
      "riskReasons": ["检测到疑似打火机，置信度 0.91", "气体传感器触发报警", "视觉与气体证据同时存在"]
    },
    "alarm": {
      "_id": "66a000000000000000000201",
      "level": "high",
      "status": "unconfirmed"
    },
    "transaction": { "used": true, "mode": "mongodb" }
  }
}
```

当前实现为 medium 和 high 都生成 AlarmRecord；只有 high 额外发送 `alarm:high` 实时事件。副本集使用 MongoDB 事务；独立 Mongo + auto 返回 `mode: compensating-fallback`，这不是原子事务。required 且不支持事务返回 503。其他特殊错误：404 设备不存在；409 packageId 重复。

### 6.3 `GET /inspections/:id`

登录。admin 可以读取逻辑删除记录；其他角色对已删除记录得到 404。

返回：

```json
{
  "success": true,
  "data": {
    "inspection": { "packageId": "...", "deviceId": {}, "operatorId": {} },
    "alarm": null,
    "operationLogs": []
  }
}
```

详情 populate 设备、操作员、删除人；关联报警再 populate 指派/确认/处理用户；检测本身的 OperationLog 最多返回最近 100 条。

### 6.4 `PATCH /inspections/:id`

admin/inspector。至少提供一个允许字段：`packageId`、`timestamp`、`xrayImageUrl`、`xrayResult`、`gasSensor`、`association`、`deviceId`、`status`。不能修改 source、operator、risk 或删除字段。

```json
{
  "status": "reviewed",
  "gasSensor": {
    "gasType": "combustible",
    "concentration": 12,
    "unit": "ppm",
    "alarm": false,
    "trend": "falling",
    "sensorStatus": "online",
    "collectedAt": "2026-07-11T08:35:00.000Z"
  }
}
```

修改 xrayResult/gasSensor 时服务端重算风险，并创建/更新报警；若风险降为 low 且报警未终结，系统将其标为 ignored 并留下自动说明。返回 `{ inspection, alarm }`。注意：该更新流程不是“检测 + 报警”多文档事务，属于当前实现限制。错误：404 不存在/已删除/设备不存在；409 唯一冲突。

### 6.5 `DELETE /inspections/:id`

仅 admin。设置 `isDeleted=true`、`deletedAt`、`deletedBy` 并写 OperationLog，不物理删除。成功 200 返回更新后的检测。已删除/不存在返回 404。

### 6.6 `PATCH /inspections/:id/restore`

仅 admin，无 body。清除三个删除字段并写日志。只有已逻辑删除记录可恢复，否则 404。

## 7. 报警

### 7.1 `GET /alarms`

登录。查询：`page`、`pageSize`（最大 100）、`status`、`level`（medium/high）、`startTime`、`endTime`、`assignedTo`。按 createdAt 倒序，populate 检测和处置用户。

```http
GET /api/v1/alarms?status=unconfirmed&level=high&page=1&pageSize=20
```

返回通用分页结构。

### 7.2 `GET /alarms/:id`

登录。返回报警，完整 populate inspectionId，并 populate assignedTo/confirmedBy/handledBy。无效 ID 返回 400；不存在返回 404。

### 7.3 `PATCH /alarms/:id/status`

admin/inspector。

```json
{
  "status": "confirmed",
  "handlingNote": "已通知开包复检"
}
```

目标状态只能是 confirmed/processing/resolved/ignored。允许转换：

```text
unconfirmed -> confirmed -> processing -> resolved
       |             |            |
       +-----------> ignored <-----+
```

更精确地说：unconfirmed 可到 confirmed/ignored；confirmed 可到 processing/ignored；processing 可到 resolved/ignored；resolved/ignored 无普通出边。confirmed 自动记录确认人/时间；resolved/ignored 自动记录处理人/时间。非法转换返回 409。每次成功写日志并发 `alarm:updated`。

### 7.4 `PATCH /alarms/:id/assign`

admin/inspector。

```json
{ "assignedTo": "66a000000000000000000001" }
```

设为 null 可取消指派。被指派用户必须 active 且角色为 admin/inspector，否则返回 404“可指派的处理人员不存在”。成功写日志并发实时更新。

### 7.5 `PATCH /alarms/:id/reopen`

仅 admin，无 body。只有 resolved/ignored 可重开；重开后状态为 confirmed，清除 handledBy/handledAt，并在备注追加“管理员重新打开报警”。其他状态返回 409。

## 8. 设备

### 8.1 `GET /devices`

登录。查询：`page`、`pageSize`、`status`、`deviceType`、`keyword`。keyword 搜索编号、名称和位置。每项增加：

- `effectiveStatus`：若数据库状态 online 但心跳为空/超过阈值，则展示 offline；
- `heartbeatStale`：是否属于上述超时情况。

注意 status 查询筛的是数据库原始状态，不是聚合后的 effectiveStatus。

### 8.2 `POST /devices`

仅 admin。

```json
{
  "deviceCode": "XRAY-01",
  "deviceName": "一号综合安检仪",
  "deviceType": "integrated",
  "location": "一号进站口",
  "status": "offline",
  "metadata": { "vendor": "simulation" }
}
```

deviceType：xray/gas_sensor/integrated/gateway/other；status：online/offline/warning/maintenance。成功 201，deviceCode 自动大写且唯一；重复返回 409。写日志并发 `device:updated`。

### 8.3 `GET /devices/:id`

登录。返回设备及 effectiveStatus/heartbeatStale。不存在 404。

### 8.4 `PATCH /devices/:id`

仅 admin。可部分更新创建字段，至少一个，未知字段被拒绝。成功写日志并发事件。

### 8.5 `DELETE /devices/:id`

仅 admin。当前是物理删除，但若任一 InspectionRecord 引用设备则返回 409，并建议改为 maintenance；不存在 404。成功返回：

```json
{ "success": true, "data": { "id": "...", "deleted": true } }
```

### 8.6 `POST /devices/:id/heartbeat`

admin/inspector，无 body。更新 `lastHeartbeatAt=now`；非 maintenance 设备同时设为 online。写日志、发设备事件并返回 effectiveStatus。

## 9. Dashboard

四个端点均要求登录，并默认排除逻辑删除检测。

### `GET /dashboard/summary`

返回：总检测、今日检测（Asia/Shanghai 日界线）、riskCounts、highRiskCount、未终结报警、气体报警、在线/离线设备、最近 10 条检测、最近 10 条报警和模拟声明。

```json
{
  "success": true,
  "data": {
    "totalInspections": 50,
    "todayInspections": 8,
    "riskCounts": { "high": 4, "medium": 10, "low": 36 },
    "highRiskCount": 4,
    "unhandledAlarms": 9,
    "gasAlarmCount": 3,
    "onlineDevices": 2,
    "offlineDevices": 1,
    "latestInspections": [],
    "latestAlarms": [],
    "simulationNotice": "当前数据可能包含模拟数据，仅用于系统开发和功能演示。"
  }
}
```

未处理包括 unconfirmed/confirmed/processing。设备 online 会根据心跳超时重新计算。

### `GET /dashboard/risk-trend?days=7`

days 在 controller 中转为数字并限制 1–30，非法/空值使用 7。返回仅包含有数据日期的 `{ date, low, medium, high, total }[]` 和 `meta.days`；前端需要补齐无数据日期（如需要连续坐标轴）。

### `GET /dashboard/gas-statistics`

返回：

```json
{
  "success": true,
  "data": {
    "gas": [
      { "gasType": "combustible", "total": 20, "alarms": 3, "averageConcentration": 18.42, "maximumConcentration": 95 }
    ],
    "dangerousTargets": [
      { "className": "lighter", "count": 6, "averageConfidence": 0.841 }
    ]
  }
}
```

### `GET /dashboard/device-status`

返回 `{ counts, devices, offlineAfterSeconds }`。devices 是聚合结果，含 `effectiveStatus`；阈值来自环境变量。

## 10. 模拟接口

均要求 admin/inspector，且 `SIMULATION_ENABLED=true`；否则 403。输出是模拟数据，不得描述成真实设备结果。

### `POST /simulation/generate`

body 可为空，也可提供 `risk: low|medium|high` 和创建检测的任意覆盖字段（所有字段仍经过校验）。服务强制 `source=simulation` 并保证 packageId 唯一。

```json
{ "risk": "high", "deviceId": "66a000000000000000000010" }
```

成功 201，返回 `{ inspection, alarm, transactionUsed }`，写 simulation.generate 日志并发送检测/high 事件。

### `POST /simulation/batch`

```json
{ "count": 10 }
```

count 为 1–100，默认 10。当前实现顺序逐条创建；任一中途失败时，先前已成功记录不会被整个批次回滚，这是当前限制。成功 201 返回结果数组与 `meta.count`。

### `POST /simulation/device-heartbeat`

```json
{ "deviceId": "66a000000000000000000010" }
```

deviceId 可省略；省略时选择 deviceCode 排序第一台设备。没有设备/指定设备不存在返回 404。maintenance 不改为 online。

## 11. 图片上传与访问

### `POST /uploads/xray`

admin/inspector。必须是 `multipart/form-data`，字段名固定为 `image`，最多 1 个文件；不要手工设置 boundary。

```bash
curl -X POST http://localhost:5000/api/v1/uploads/xray \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@sample.png"
```

允许 JPG/JPEG、PNG、WEBP、GIF；默认最大 5 MiB（由 `MAX_UPLOAD_SIZE` 调整）。同时检查 MIME、扩展名和文件魔数；服务端生成 `时间戳-UUID.扩展名`，不使用原文件名作为路径。

成功 201：

```json
{
  "success": true,
  "data": {
    "url": "/uploads/xrays/1752220000000-uuid.png",
    "filename": "1752220000000-uuid.png",
    "size": 183245,
    "mimetype": "image/png"
  }
}
```

错误：`UPLOAD_REQUIRED`、`UPLOAD_TYPE_NOT_ALLOWED`、`UPLOAD_CONTENT_INVALID`、`UPLOAD_PATH_INVALID`、`UPLOAD_READ_FAILED`、`UPLOAD_ERROR`。上传 URL 与检测创建是两个请求；若用户上传后放弃表单，当前实现没有自动清理孤儿文件。

图片读取：

```http
GET /uploads/xrays/<安全文件名>
```

读取目前不要求 JWT；部署时应根据数据敏感级别决定是否改为鉴权下载或短期签名 URL。

## 12. 用户管理

全部仅 admin，普通查询永不返回 passwordHash。

### `GET /users`

查询：`page`、`pageSize`、`role`、`isActive=true|false`、`keyword`（用户名/邮箱）。返回通用分页。

### `POST /users`

```json
{
  "username": "new-inspector",
  "email": "new-inspector@example.local",
  "password": "StrongPass123",
  "role": "inspector",
  "isActive": true
}
```

username 2–40；合法 email；密码 8–128 且至少包含字母和数字；role 三选一。成功 201；email 重复 409。密码先 bcrypt（cost 12）后保存。

### `GET /users/:id`

返回安全用户字段；不存在 404。

### `PATCH /users/:id`

可更新 username/email/password/role/isActive，至少一个。管理员不能修改自己的角色，也不能把自己停用；违反返回 403。修改 password 会重新哈希，不接受 passwordHash。

### `DELETE /users/:id`

把 `isActive` 设为 false，并非物理删除。管理员不能停用自己；重复停用会再次返回当前 inactive 用户，不报冲突。

## 13. 操作日志

### `GET /logs`

仅 admin。查询：

| 参数 | 说明 |
|---|---|
| `page` / `pageSize` | 分页，最大 100 |
| `userId` | 操作用户 ObjectId |
| `resourceType` | 精确类型，如 InspectionRecord |
| `action` | 不区分大小写部分匹配 |
| `resourceId` | 资源 ObjectId |
| `startTime` / `endTime` | createdAt 范围 |

按 createdAt 倒序，populate 用户基本字段。每项可能含 before/after、IP、User-Agent。日志本身当前没有 API 删除/修改端点。

## 14. Socket.IO 实时协议

Socket 地址来自 `VITE_SOCKET_URL`，开发默认 `http://localhost:5000`。握手必须在 auth 中发送 JWT：

```js
io(socketUrl, { auth: { token } })
```

连接错误 `UNAUTHORIZED` 表示 Token 缺失/无效/用户停用。当前事件广播给所有已认证连接：

| 事件 | 触发 | payload |
|---|---|---|
| `inspection:created` | 检测/模拟创建提交后 | InspectionRecord JSON |
| `alarm:high` | 新建 high 检测并生成报警后 | AlarmRecord JSON |
| `alarm:updated` | 状态、指派、重开或证据更新报警 | AlarmRecord JSON |
| `device:updated` | 创建、更新、删除、心跳 | 设备 JSON；删除为 `{ _id, deleted: true }` |

Socket 不是数据真相源。客户端收到事件后可以增量展示或重新拉 REST；断线时 REST 仍可用。当前没有基于角色/站点的 Socket 房间隔离，是未来多站点部署需补充的权限增强。

## 15. curl 完整小示例

登录并查询 high 检测（WSL/bash）：

```bash
TOKEN=$(curl -s http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"inspector@example.local","password":"你的seed密码"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).data.token))")

curl -s 'http://localhost:5000/api/v1/inspections?riskLevel=high&pageSize=10' \
  -H "Authorization: Bearer $TOKEN"
```

PowerShell：

```powershell
$login = Invoke-RestMethod -Method Post `
  -Uri http://localhost:5000/api/v1/auth/login `
  -ContentType 'application/json' `
  -Body (@{ email='inspector@example.local'; password='你的seed密码' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/inspections?riskLevel=high&pageSize=10' -Headers $headers
```

不要把真实密码或 Token 保存到脚本、Git、截图或共享终端历史。

## 16. 当前接口限制

- 真实 YOLO/传感器/安检设备未接入；
- medium 也会生成报警，这是当前实现选择，需求中至少要求 high；
- 更新检测及其报警当前未包进多文档事务；批量模拟也不是整个批次原子操作；
- 静态上传文件当前可直接读取；
- JWT logout 不做服务端吊销；
- risk-trend 的 days 在 controller 简单转换，没有走 Zod query schema；
- 设备列表的 status 筛选针对原始状态，不是心跳修正后的 effectiveStatus；
- Socket 广播给所有已认证角色，未按站点/资源做房间隔离。

这些限制不能被描述为已解决；生产化建议见 `DEPLOYMENT.md`，代码学习说明见 `LEARNING_NOTES.md`。
# 智能检测与气体通信（新增）

完整启动、字段语义和验收流程见 [YOLO_GAS_INTEGRATION.md](./YOLO_GAS_INTEGRATION.md)。新增接口如下，原接口保持兼容：

- `GET /api/v1/detections/status`：无需登录，返回 YOLO、模型加载/计算设备、气体通信和数据库状态。
- `POST /api/v1/detections/image`：`admin/inspector`，multipart 字段为 `image`（真实视觉必填）、`packageId`、`timestamp`、`deviceId`、`visionMode`、`gasMode`、`visionSimulationData`（JSON）、`gasSimulationData`（JSON）。成功后仍返回 `inspection/alarm/transaction`。
- `GET /api/v1/gas/status`：返回 `online/offline/timeout`、最后有效帧时间和通道状态。
- `GET /api/v1/gas/latest`：返回最新气体快照；参考 TCP 协议没有浓度时 `concentration/unit` 为 `null`。
- `POST /api/v1/gas/readings`：`admin/inspector`，供 HTTP 通信适配器推送经过校验的数据。
- `POST /api/v1/gas/clear-alarm`：`admin/inspector`，向在线 TCP 设备发送解除报警命令。

常见新增错误码：`YOLO_SERVICE_OFFLINE`、`YOLO_SERVICE_TIMEOUT`、`YOLO_MODEL_NOT_LOADED`、`GAS_DEVICE_OFFLINE`、`GAS_COMMAND_FAILED`、`DATABASE_UNAVAILABLE`、`DUPLICATE_IMAGE`、`DETECTION_IN_PROGRESS`。
