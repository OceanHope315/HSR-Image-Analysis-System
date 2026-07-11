# 学习笔记：一次请求如何从页面走到数据库再回来

这份笔记按实际数据路径阅读：浏览器 URL → React → 统一 API 层 → Express 中间件 → Controller → Service → Repository/Model → MongoDB → JSON → React 状态；Socket.IO 再把增量事件推回页面。

所有示例都来自本项目的软件结构，但模拟 YOLO、模拟气体数据不代表真实安检能力。阅读时建议同时打开对应文件，先沿“新增模拟检测”主线走一遍，再看报警处置。

## 1. 浏览器输入 URL 后发生了什么

### 通俗解释

输入 `http://localhost:5174/inspections` 后，浏览器先向 Vite 开发服务器（生产环境是 Nginx）请求 HTML。HTML 加载 JavaScript，React 接管页面；React Router 根据 `/inspections` 选择历史记录页面。页面再向 `http://localhost:5000/api/v1/inspections` 请求数据。前端路由和后端 API 路由名字相似，但它们是两套路由。

### 项目中的具体文件

- `frontend/index.html`：浏览器第一份 HTML；
- `frontend/src/main.jsx`：React 入口；
- `frontend/src/components/ProtectedRoute.jsx`：登录/角色保护；
- `frontend/src/pages/InspectionsPage.jsx`：历史记录页面；
- `frontend/nginx.conf`：生产环境把未知前端路径回退到 `index.html`。

### 一段关键代码

```jsx
createRoot(document.getElementById('root')).render(<App />)
```

### 数据经过了什么步骤

1. 浏览器取得 `index.html` 和打包后的 JS/CSS；
2. `main.jsx` 创建 React 根节点；
3. Router 匹配 `/inspections`；
4. 保护路由检查当前登录状态；
5. 页面发 API 请求并把 JSON 渲染成表格。

### 常见错误

- 刷新 `/inspections/某个ID` 出现 Nginx 404：没有配置 SPA 回退；
- 把 `5174` 的页面路由误当成 `5000` 的 API；
- 后端正常但页面白屏：应先看浏览器 Network 和 Console，而不是只看 MongoDB。

### 自测问题

为什么直接刷新详情页时，Nginx 需要返回 `index.html`，而不是寻找名为 `inspections/ID` 的磁盘文件？

### 参考答案

因为这个路径由浏览器里的 React Router 解释；服务器只存一份 SPA 入口，没有与每个页面路径一一对应的 HTML 文件。

## 2. React 组件如何渲染

### 通俗解释

组件是“输入数据，返回界面描述”的函数。状态或属性变化时，React 再调用组件，比较新旧虚拟树，只更新真正变化的 DOM。不要在渲染函数里直接发请求或修改状态，否则容易无限重渲染。

### 项目中的具体文件

- `frontend/src/pages/DashboardPage.jsx`：页面组件；
- `frontend/src/components/Badges.jsx`：风险/状态展示组件；
- `frontend/src/components/Layout.jsx`：统一顶栏、侧栏和内容区；
- `frontend/src/components/StateViews.jsx`：加载、错误和空数据状态。

### 一段关键代码

```jsx
function RiskBadge({ level }) {
  return <span className={`badge risk-${level}`}>{level}</span>
}
```

### 数据经过了什么步骤

1. 父组件从 API 得到记录；
2. 通过 props 把 `riskLevel` 传给 `RiskBadge`；
3. 组件返回带颜色类名的 `span`；
4. 风险变化后 React 更新文字和类名。

### 常见错误

- 直接修改 props 或数组，例如 `records.push(...)`；
- 列表缺少稳定 `key`；
- 在 JSX 中访问尚未加载的嵌套字段导致 `undefined` 错误；
- 一个巨大页面组件承担请求、表格、弹窗、格式化全部职责。

### 自测问题

为什么更新数组状态通常写 `setRecords(old => [newRecord, ...old])`，而不是先 `old.unshift(newRecord)`？

### 参考答案

React 依靠新引用判断状态变化；原地修改会破坏不可变数据约定，可能不触发正确渲染，也使调试和回退困难。

## 3. `useState` 和 `useEffect` 的作用

### 通俗解释

`useState` 保存组件跨渲染的数据，例如加载中、筛选条件和列表。`useEffect` 负责渲染后的外部同步，例如请求 API、订阅 Socket、设置定时刷新。Effect 的返回函数用于清理订阅或定时器。

### 项目中的具体文件

- `frontend/src/pages/DashboardPage.jsx`：统计数据与刷新；
- `frontend/src/pages/InspectionsPage.jsx`：筛选、分页和请求；
- `frontend/src/context/RealtimeContext.jsx`：连接与清理 Socket；
- `frontend/src/context/AuthContext.jsx`：恢复登录状态。

### 一段关键代码

```jsx
useEffect(() => {
  loadRecords()
}, [page, filters])
```

### 数据经过了什么步骤

1. 首次渲染显示 loading；
2. Effect 调用 API；
3. Promise 完成后 `setRecords` 和 `setLoading(false)`；
4. 状态更新触发第二次渲染；
5. 页码/筛选依赖变化时重新请求。

### 常见错误

- Effect 依赖漏写，读到旧值；
- 依赖放了每次渲染都会新建的对象，导致无限请求；
- 组件卸载后仍更新状态；
- Socket、`setInterval` 没有清理，产生重复监听。

### 自测问题

如果 Effect 创建了 `setInterval`，为什么必须返回 `() => clearInterval(id)`？

### 参考答案

组件卸载或依赖变化时旧定时器仍会运行；清理可避免重复请求、内存泄漏和卸载后更新状态。

## 4. React Router 如何匹配页面

### 通俗解释

Router 把 URL 路径映射为组件。静态 `/inspections/new` 和动态 `/inspections/:id` 都存在时，路由库按匹配规则选最具体路径。保护路由先判断是否登录和角色，再决定显示页面、跳转登录或显示无权限。

### 项目中的具体文件

- `frontend/src/main.jsx`：路由表；
- `frontend/src/components/ProtectedRoute.jsx`：认证/角色判断；
- `frontend/src/components/Layout.jsx`：嵌套路由的公共外壳；
- `frontend/src/pages/NotFoundPage.jsx`：`*` 页面。

### 一段关键代码

```jsx
<Route element={<ProtectedRoute roles={['admin']} />}>
  <Route path="/users" element={<UsersPage />} />
</Route>
```

### 数据经过了什么步骤

1. Router 读取 `window.location`；
2. `/users` 命中管理员保护分支；
3. `ProtectedRoute` 从 AuthContext 读取用户；
4. admin 渲染用户页，其他角色被拒绝/重定向；
5. 未匹配路径进入 `*`。

### 常见错误

- 只在前端隐藏菜单，后端没有权限控制；
- 登录恢复尚未完成就误跳回 `/login`；
- 用普通 `<a>` 导航导致整个 SPA 重载；
- 动态参数没有 URL 编码或没有校验。

### 自测问题

为什么 viewer 即使手工输入 `/users` 也不能只靠“侧栏没有用户菜单”来保护数据？

### 参考答案

菜单不是安全边界，用户可以直接构造 URL/API 请求；前端保护提升体验，后端仍必须验证 JWT 和 `admin` 角色并返回 403。

## 5. 前端如何发送请求

### 通俗解释

页面不应到处重复 `fetch`。统一 client 负责 baseURL、JSON、Token 和错误解析；业务 API 文件只描述路径和参数；页面关心“我要列表/详情”，不关心每个请求的底层样板。

### 项目中的具体文件

- `frontend/src/api/client.js`：统一请求函数；
- `frontend/src/api/inspectionApi.js`：检测相关调用；
- `frontend/src/api/alarmApi.js`：报警相关调用；
- `frontend/.env.example`：`VITE_API_BASE_URL`。

### 一段关键代码

```js
export const getInspections = (query) =>
  apiClient(`/inspections?${new URLSearchParams(query)}`)
```

### 数据经过了什么步骤

1. 页面整理筛选对象；
2. `inspectionApi` 转成查询字符串；
3. client 拼接 baseURL、附加请求头；
4. 后端返回 JSON；
5. client 解析成功数据或抛出统一错误；
6. 页面分别显示表格或错误状态。

### 常见错误

- 查询参数包含 `undefined`，后端收到字符串 `"undefined"`；
- 写请求忘记 `Content-Type: application/json`；
- 上传 FormData 时手动设置错误的 multipart boundary；
- 只判断网络异常，不判断 HTTP 400/401/500。

### 自测问题

上传图片时为什么通常不应手工写 `Content-Type: multipart/form-data`？

### 参考答案

浏览器会为 FormData 生成含随机 boundary 的完整 Content-Type；手工写一个没有 boundary 的值会让 multer 无法解析。

## 6. Token 如何附加

### 通俗解释

登录成功后前端保存 JWT。统一 client 在受保护请求上加 `Authorization: Bearer <token>`。后端验证签名和过期时间并加载用户。401 表示没有有效身份，403 表示身份有效但权限不足。

### 项目中的具体文件

- `frontend/src/api/client.js`：读取和附加 Token、处理 401；
- `frontend/src/context/AuthContext.jsx`：登录/退出/当前用户；
- `backend/middleware/authMiddleware.js`：验签和角色判断；
- `backend/services/authService.js`：签发 Token。

### 一段关键代码

```js
headers.Authorization = `Bearer ${token}`
```

### 数据经过了什么步骤

1. `/auth/login` 返回 Token；
2. AuthContext 保存 Token 并请求 `/auth/me`；
3. 后续 client 自动带 Bearer 头；
4. 中间件验签，把用户放到 `req.user`；
5. Token 失效时后端返回 401，前端清理登录状态。

### 常见错误

- 把 JWT 密钥写进前端；
- 在日志中打印完整 Token；
- 把 403 当 401，导致已登录用户被无意义退出；
- 认为 JWT 加密了 payload；实际通常只是签名，payload 可被读取。

### 自测问题

`JWT_SECRET` 应放在前端 `.env` 还是后端 `.env`？为什么？

### 参考答案

只能放后端。签名密钥一旦进入 Vite 前端就会被打包给所有浏览器，攻击者可伪造任意 Token。

## 7. Express 如何匹配路由

### 通俗解释

Express 按 HTTP 方法和路径匹配请求。`GET /inspections` 与 `POST /inspections` 路径相同但动作不同。路由文件把认证、角色、校验和 controller 串成一条管道，`app.js` 再统一挂到 `/api/v1`。

### 项目中的具体文件

- `backend/app.js`：中间件顺序与总路由挂载；
- `backend/routes/inspectionRoutes.js`：检测路由；
- `backend/controllers/inspectionController.js`：处理匹配后的请求；
- `backend/middleware/errorMiddleware.js`：最后处理错误。

### 一段关键代码

```js
router.get('/:id', authenticate, validate(schema), getInspection)
```

### 数据经过了什么步骤

1. 请求进入 Express；
2. 通用安全/CORS/JSON/日志中间件运行；
3. `/api/v1/inspections/:id` 命中检测路由；
4. 认证和 Zod 校验通过；
5. controller 调用 service；
6. 未匹配请求进入 404，异常进入统一错误中间件。

### 常见错误

- 把 `/:id` 放在 `/restore` 等静态路径前并被错误匹配；
- controller 忘记返回/交给 next，尝试发送两次响应；
- 错误中间件放在路由之前；
- `app.js` 启动监听端口，导致测试难以导入。

### 自测问题

为什么 `app.js` 应导出 app，而由 `server.js` 调用 `listen`？

### 参考答案

测试可直接把 app 交给 Supertest 而不占真实端口；server 只负责数据库、HTTP/Socket 启动和关闭，职责更清楚。

## 8. middleware 是什么

### 通俗解释

中间件像安检通道上的连续岗位：一个记录请求，一个验证 Token，一个检查角色，一个校验参数。每个岗位可以继续 `next()`、直接返回响应，或把错误交给错误处理器。顺序会改变结果。

### 项目中的具体文件

- `backend/middleware/authMiddleware.js`：认证与 RBAC；
- `backend/middleware/validateMiddleware.js`：Zod 校验；
- `backend/middleware/uploadMiddleware.js`：multer 文件限制；
- `backend/middleware/errorMiddleware.js`：404 与统一异常；
- `backend/app.js`：全局排列顺序。

### 一段关键代码

```js
export const requireRoles = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'FORBIDDEN'))
```

### 数据经过了什么步骤

1. 请求日志生成 request id；
2. JSON/CORS/安全中间件处理协议；
3. `authenticate` 设置 `req.user`；
4. `requireRoles` 判断角色；
5. `validate` 生成可信参数；
6. controller 执行业务；
7. 任意错误统一序列化。

### 常见错误

- 权限中间件排在认证前，`req.user` 不存在；
- 校验只在前端做；
- 捕获错误后既发送响应又调用 `next(error)`；
- 错误中间件遗漏四个参数 `(err, req, res, next)`。

### 自测问题

校验中间件为什么应该在 controller 之前？

### 参考答案

它先拒绝非法输入并提供统一 400，使后续业务层可以依赖已验证的类型和范围，减少重复判断与数据库错误。

## 9. controller、service、repository 分别负责什么

### 通俗解释

Controller 翻译 HTTP（读请求、定状态码）；Service 表达业务规则（算风险、状态流转、事务）；Repository 封装数据库查询。可以把它们理解为“前台接待—业务负责人—档案管理员”。

### 项目中的具体文件

- `backend/controllers/inspectionController.js`：HTTP 输入输出；
- `backend/services/inspectionService.js`：创建检测与报警的业务流程；
- `backend/repositories/inspectionRepository.js`：分页/过滤查询；
- `backend/models/InspectionRecord.js`：数据形状与索引。

### 一段关键代码

```js
const result = await inspectionService.create(req.validated.body, req.user, req)
res.status(201).json({ success: true, data: result })
```

### 数据经过了什么步骤

1. Controller 取得已校验 body 和当前用户；
2. Service 忽略客户端最终风险，调用风险服务重算；
3. Service 通过 Repository/Model 保存检测与必要报警；
4. Service 写审计并发实时事件；
5. Controller 只负责 201 与响应结构。

### 常见错误

- 把复杂聚合、状态机直接写进路由；
- Repository 决定“谁有权限”，造成业务规则散落；
- Service 依赖 `res`，难以单元测试；
- 为每一行查询机械地建立无价值抽象。

### 自测问题

“resolved 报警不能直接退回 unconfirmed”应该主要放在哪一层？

### 参考答案

Service 的状态机，因为这是业务规则；路由/Controller 只接收请求，Model 枚举只能限制值是否合法，不能表达转换是否合法。

## 10. `req.params`、`req.query`、`req.body` 的区别

### 通俗解释

`params` 是路径中的身份，例如 `/inspections/:id`；`query` 是 `?page=2&riskLevel=high` 这类可选筛选；`body` 是 POST/PATCH 发送的主要数据。三者都来自用户，必须校验。

### 项目中的具体文件

- `backend/routes/inspectionRoutes.js`：路径参数；
- `backend/validators/common.js`：ObjectId 与分页基础规则；
- `backend/validators/inspectionValidator.js`：body/query 结构；
- `backend/controllers/inspectionController.js`：读取验证结果。

### 一段关键代码

```js
const { id } = req.validated.params
const { page, pageSize } = req.validated.query
```

### 数据经过了什么步骤

1. URL 中 `:id` 进入 params；
2. 筛选栏序列化到 query；
3. 新增表单 JSON 进入 body；
4. Zod 把字符串页码转换为数字并检查 ObjectId；
5. Controller 只使用验证后的对象。

### 常见错误

- 认为 query 中的 `"false"` 是布尔 false；它原本是字符串；
- 未验证 ObjectId，Mongoose 抛 CastError 变成 500；
- 把密码或 Token 放 query，容易进入访问日志；
- PATCH 接受任意字段，用户篡改 `operatorId` 或最终风险。

### 自测问题

包裹搜索、记录 ID、新增时的气体数组分别应放在哪里？

### 参考答案

包裹搜索放 query，记录 ID 放 params，新增气体数组放 body。

## 11. `async/await` 的工作方式

### 通俗解释

数据库和网络需要等待，但 Node 不应阻塞整个进程。`await` 暂停当前异步函数，事件循环可以继续服务其他请求；Promise 成功后继续，失败则抛错。它不是把异步变成同步，也不能自动处理错误。

### 项目中的具体文件

- `backend/utils/asyncHandler.js`：把异步错误传给 Express；
- `backend/controllers/*.js`：等待 Service；
- `backend/services/inspectionService.js`：等待数据库事务；
- `frontend/src/api/client.js`：等待 fetch 与 JSON。

### 一段关键代码

```js
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)
```

### 数据经过了什么步骤

1. Controller 返回 Promise；
2. 等待 Mongoose 时线程可服务别的请求；
3. 成功得到文档并返回 JSON；
4. 失败 Promise 被 `asyncHandler` 捕获；
5. 错误中间件映射为 400/404/500。

### 常见错误

- `array.forEach(async () => ...)` 不会等待内部任务；
- 忘记 `await`，把 Promise 当数据返回；
- 并行任务本可 `Promise.all` 却串行等待；
- 捕获错误后静默忽略，数据只写了一半。

### 自测问题

为什么事务回调里的保存操作都必须 `await`？

### 参考答案

不等待时回调可能提前结束并提交，尚未完成的写入落在事务之外或错误无法触发回滚，破坏“同时成功/失败”。

## 12. Mongoose Schema 和 Model

### 通俗解释

Schema 描述文档字段、类型、枚举、默认值、引用和索引；Model 是用这个规则操作集合的接口。Schema 类似“表格设计加校验”，Model 类似“可执行的档案柜操作员”，但 MongoDB 本身仍是文档数据库。

### 项目中的具体文件

- `backend/models/User.js`；
- `backend/models/InspectionRecord.js`；
- `backend/models/AlarmRecord.js`；
- `backend/models/Device.js`；
- `backend/models/OperationLog.js`。

### 一段关键代码

```js
const userSchema = new Schema({
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true })
```

### 数据经过了什么步骤

1. Service 构造普通 JS 对象；
2. Model 根据 Schema 转换/校验字段；
3. Mongoose 把文档写入对应集合；
4. 查询默认不选择 `passwordHash`；
5. `timestamps` 自动维护创建和更新时间。

### 常见错误

- 把明文密码字段放入 Schema；
- 只靠 Mongoose 校验 API 请求，得到难懂错误；
- 以为 `unique: true` 是完整验证器；它主要声明唯一索引；
- 修改 Schema 后假设历史文档自动补齐。

### 自测问题

为什么登录查询需要显式选择 `passwordHash`，普通用户查询却不应该返回它？

### 参考答案

登录要用哈希验证密码；字段设置 `select: false` 可减少意外泄露，认证服务在受控位置用 `select('+passwordHash')` 获取。

## 13. MongoDB 文档、集合、数据库

### 通俗解释

一条检测记录是一个 BSON 文档，多条检测记录在集合中，多个集合属于一个数据库。嵌套的 `xrayResult` 和 `gasSensor` 很适合文档表达；用户、设备、报警等有独立生命周期的实体用 ObjectId 引用。

### 项目中的具体文件

- `backend/config/db.js`：连接数据库；
- `backend/models/InspectionRecord.js`：嵌套检测/传感器数组；
- `backend/.env.example`：`MONGO_URI`；
- `backend/scripts/seed.js`：生成多个集合的演示数据。

### 一段关键代码

```js
await mongoose.connect(env.MONGO_URI)
```

### 数据经过了什么步骤

1. `railway_security` 是数据库；
2. Mongoose Model 映射到诸如 `inspectionrecords` 的集合；
3. 每次检测保存为一份文档；
4. `deviceId` 保存另一集合文档的 ObjectId；
5. Dashboard 聚合在数据库内部处理集合。

### 常见错误

- 连到了同一服务器上的错误数据库名；
- 测试误用开发/生产 URI；
- 认为 MongoDB “无 Schema”所以可随便写字段；
- 把大型图片二进制直接塞入普通检测文档，本项目只保存 URL。

### 自测问题

为什么检测框适合嵌在 InspectionRecord，而设备适合独立集合并引用？

### 参考答案

检测框只属于某次检测且通常一起读写；设备会被多次检测共享并独立更新状态，独立集合避免重复和不一致。

## 14. CRUD

### 通俗解释

CRUD 是 Create（创建）、Read（读取）、Update（更新）、Delete（删除）。HTTP 常映射为 POST、GET、PATCH、DELETE。本项目的“Delete”默认不是物理删除，而是标记逻辑删除。

### 项目中的具体文件

- `backend/routes/inspectionRoutes.js`：五个基本端点与恢复；
- `backend/controllers/inspectionController.js`；
- `backend/services/inspectionService.js`；
- `backend/repositories/inspectionRepository.js`；
- `frontend/src/api/inspectionApi.js`。

### 一段关键代码

```js
await InspectionRecord.findByIdAndUpdate(id, update, {
  new: true, runValidators: true
})
```

### 数据经过了什么步骤

1. POST 校验并创建记录；
2. GET 列表/详情读取；
3. PATCH 只允许白名单字段并记录 before/after；
4. DELETE 设置删除标志、时间和用户；
5. admin restore 清除逻辑删除字段。

### 常见错误

- PATCH 把整个 body 直接传给数据库，出现批量赋值漏洞；
- 更新未加 `runValidators`；
- 删除后列表仍出现，因为默认过滤遗漏；
- 重复 `packageId` 没有转成 409。

### 自测问题

为什么 PATCH 比 PUT 更适合“只更新当前处理状态”？

### 参考答案

PATCH 表示部分更新；PUT 通常表示用完整表示替换资源，遗漏字段可能被清空。

## 15. 分页中的 `skip` 和 `limit`

### 通俗解释

`limit` 决定本页最多取几条，`skip` 跳过前面页的数据。第 3 页、每页 10 条时，跳过 `(3-1)×10=20` 条，再取 10 条。必须配稳定排序，否则新增数据时页面可能重复或遗漏。

### 项目中的具体文件

- `backend/utils/query.js`：分页/排序辅助；
- `backend/validators/common.js`：页码和最大 pageSize；
- `backend/repositories/inspectionRepository.js`：列表查询；
- `frontend/src/components/Pagination.jsx`：翻页 UI。

### 一段关键代码

```js
const skip = (page - 1) * pageSize
query.sort(sort).skip(skip).limit(pageSize)
```

### 数据经过了什么步骤

1. URL 恢复 `page`、`pageSize` 与筛选；
2. Zod 把它们转为正整数并限制最大值；
3. Repository 用同一 filter 查询总数和当前页；
4. 返回 `totalPages = ceil(total/pageSize)`；
5. 页面显示页码并把条件写回 URL。

### 常见错误

- page 从 0 还是 1 开始不一致；
- 不限制 pageSize，用户一次取几十万条；
- 数据查询和 count 使用不同 filter；
- 深页码的 skip 越来越慢却未评估游标分页。

### 自测问题

`page=4&pageSize=25` 的 skip 是多少？

### 参考答案

`(4 - 1) × 25 = 75`，跳过 75 条后最多读取 25 条。

## 16. `aggregate`

### 通俗解释

聚合管道让 MongoDB 在服务器端完成筛选、拆数组、分组、计数和排序，避免把全部记录传给 Node 再统计。每一阶段把上一步结果变成下一步输入，像流水线。

### 项目中的具体文件

- `backend/controllers/dashboardController.js`；
- `backend/routes/dashboardRoutes.js`；
- `backend/models/InspectionRecord.js`；
- `frontend/src/api/dashboardApi.js`；
- `frontend/src/pages/DashboardPage.jsx`。

### 一段关键代码

```js
await InspectionRecord.aggregate([
  { $match: { isDeleted: false } },
  { $group: { _id: '$riskLevel', count: { $sum: 1 } } }
])
```

### 数据经过了什么步骤

1. `$match` 先排除逻辑删除并限定日期；
2. `$unwind` 可拆开检测目标或气体数组；
3. `$group` 按风险/日期/类别计数；
4. `$sort` 排列趋势；
5. Controller 把结果整理为前端图表结构。

### 常见错误

- 忘记 `$match: { isDeleted: false }`；
- 一开始就 `$unwind` 巨大数组，扩大中间结果；
- 日期按 UTC 分组但界面按 Asia/Shanghai 理解；
- 用 `$facet` 后误读嵌套输出。

### 自测问题

为什么通常把选择性高的 `$match` 放在管道前面？

### 参考答案

它尽早减少后续阶段处理的文档数，并可能利用索引，降低 CPU、内存和磁盘工作量。

## 17. `index`

### 通俗解释

索引像书的目录，让数据库少翻文档。比如“high 风险按时间倒序”适合 `{ riskLevel: 1, timestamp: -1 }`。但每次写入也要更新目录，索引会占磁盘和降低写入速度，不能越多越好。

### 项目中的具体文件

- `backend/models/InspectionRecord.js`：时间、风险、状态、包裹、气体报警索引；
- `backend/models/AlarmRecord.js`：状态 + 创建时间；
- `backend/models/Device.js`：唯一 deviceCode；
- `backend/models/User.js`：唯一 email；
- `backend/scripts/migrate.js`：迁移/索引准备。

### 一段关键代码

```js
inspectionSchema.index({ riskLevel: 1, timestamp: -1 })
```

### 数据经过了什么步骤

1. 查询筛选 high 并按 timestamp 倒序；
2. 优化器比较可用索引；
3. 合适时走 `IXSCAN`，再取目标文档；
4. explain 显示扫描文档数和返回数；
5. 写入时 MongoDB 同时维护索引项。

### 常见错误

- 单字段索引和复合索引重复；
- 复合索引字段顺序与查询不匹配；
- 在低基数字段上单独建索引却没有时间等组合；
- 只看“用了索引”，不看 `totalKeysExamined/totalDocsExamined`。

### 自测问题

如何检查 high 风险时间排序查询是否受益于索引？写成本是什么？

### 参考答案

在 `mongosh` 对同形查询调用 `.explain('executionStats')`，关注 winningPlan、IXSCAN、nReturned 与扫描量；成本是额外磁盘/内存，以及每次插入更新都要维护索引。

## 18. ObjectId 和 `populate`

### 通俗解释

ObjectId 是 MongoDB 常用主键。检测文档只保存 `deviceId`、`operatorId`，需要展示设备名称或操作员用户名时，Mongoose 的 populate 再查询被引用文档并合并结果。它方便但不是免费的 JOIN。

### 项目中的具体文件

- `backend/models/InspectionRecord.js`：`deviceId`、`operatorId` 引用；
- `backend/models/AlarmRecord.js`：检测和用户引用；
- `backend/models/OperationLog.js`：用户引用；
- `backend/repositories/inspectionRepository.js`：详情按需 populate；
- `backend/validators/common.js`：ObjectId 格式校验。

### 一段关键代码

```js
InspectionRecord.findById(id)
  .populate('deviceId', 'deviceCode deviceName status')
```

### 数据经过了什么步骤

1. 检测保存设备 `_id`；
2. 列表通常只取必要字段，避免全面 populate；
3. 详情需要展示时 populate 指定引用；
4. `select` 只拿名称/状态，不拿敏感字段；
5. 引用不存在时返回 null，页面需容错。

### 常见错误

- 无效 ID 未校验导致 CastError；
- 所有列表无差别多层 populate，查询变慢；
- populate 用户时意外带出 passwordHash；
- 删除被引用文档后没有处理悬空引用。

### 自测问题

为什么 Dashboard 计数通常不需要 populate？

### 参考答案

计数/分组只需本集合字段；populate 会增加额外查询与传输，却不改变统计结果。

## 19. `transaction`

### 通俗解释

创建 medium/high 检测时要同时保存检测和报警。事务像把两次写入装进一个封袋：全部成功才提交，任何一步失败都回滚，避免有检测无报警。MongoDB 事务要求副本集或分片集群。

### 项目中的具体文件

- `backend/services/inspectionService.js`：会话与事务；
- `backend/config/db.js` / `backend/config/env.js`：连接与 `TRANSACTION_MODE`；
- `backend/models/InspectionRecord.js`；
- `backend/models/AlarmRecord.js`；
- `docker-compose.yml`：开发用单节点 `rs0`。

### 一段关键代码

```js
await session.withTransaction(async () => {
  await InspectionRecord.create([record], { session })
  await AlarmRecord.create([alarm], { session })
})
```

### 数据经过了什么步骤

1. Service 开启 session；
2. 在同一 session 保存检测；
3. medium/high 时保存关联报警；
4. 任一步异常触发回滚；
5. 提交后才发 Socket 事件；
6. 独立 Mongo 开发环境明确记录并执行补偿式降级。

### 常见错误

- 使用独立 mongod 却声称事务成功；
- 某次 Model 写入漏传 session；
- 提交前发送实时消息，回滚后页面看到幽灵数据；
- 捕获异常但不重新抛出，事务误提交。

### 自测问题

为什么 `TRANSACTION_MODE=auto` 的补偿式降级不能叫原子事务？

### 参考答案

两次普通写入之间存在失败窗口；代码可尝试删除第一条补偿，但进程崩溃或补偿失败仍可能不一致，数据库没有提供同时提交保证。

## 20. 逻辑删除

### 通俗解释

逻辑删除不移除文档，而设置 `isDeleted=true`、删除时间和删除人。普通查询自动排除它，管理员可查看和恢复，OperationLog 保存 before/after。它支持课程审计，但不是无限保存策略。

### 项目中的具体文件

- `backend/models/InspectionRecord.js`：删除字段和索引；
- `backend/services/inspectionService.js`：删除/恢复规则；
- `backend/repositories/inspectionRepository.js`：默认过滤；
- `backend/utils/audit.js`：操作日志；
- `backend/scripts/archive.js`：只做 dry-run 归档计划。

### 一段关键代码

```js
record.isDeleted = true
record.deletedAt = new Date()
record.deletedBy = actor._id
```

### 数据经过了什么步骤

1. admin 发 DELETE；
2. Service 读取删除前快照；
3. 更新三个逻辑删除字段；
4. 写 OperationLog；
5. 默认列表看不到该记录；
6. admin `includeDeleted=true` 后可恢复。

### 常见错误

- 某个 Dashboard 聚合忘记排除已删除；
- viewer 可以传 `includeDeleted=true`；
- 删除关联报警但没有定义一致策略；
- 逻辑删除代替备份，数据库损坏时仍全部丢失。

### 自测问题

逻辑删除和备份解决的是同一个问题吗？

### 参考答案

不是。逻辑删除便于业务恢复误操作，但仍在同一数据库；备份用于数据库损坏、服务器故障等灾难恢复。

## 21. JWT

### 通俗解释

JWT 是服务器签名的身份凭证，包含用户 ID、角色和过期时间等声明。服务器验证签名后相信它未被篡改。JWT 通常不加密内容；登出采用前端清除 Token，本原型没有服务端吊销列表。

### 项目中的具体文件

- `backend/services/authService.js`：签发；
- `backend/middleware/authMiddleware.js`：验证；
- `backend/config/env.js`：强制安全密钥；
- `frontend/src/context/AuthContext.jsx`：保存和清除；
- `frontend/src/api/client.js`：401 行为。

### 一段关键代码

```js
jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
  expiresIn: env.JWT_EXPIRES_IN
})
```

### 数据经过了什么步骤

1. 用户提交邮箱/用户名和密码；
2. 密码验证成功后签发短期 Token；
3. 浏览器在请求头携带；
4. 服务器验签/过期并查 active 用户；
5. 退出清除本地 Token；
6. 过期请求返回 401。

### 常见错误

- 代码提供默认 JWT secret；
- Token 永不过期；
- 把敏感信息放 payload；
- 只信 Token 中角色，不检查用户是否被停用；
- 把 logout 当成服务器已吊销所有已签 Token。

### 自测问题

为什么修改密码或停用账号后，认证中间件仍应查询当前用户状态？

### 参考答案

旧 Token 的 payload 在到期前不会自行改变；查询当前用户可及时拒绝已停用/不存在的账号，并使用当前角色。

## 22. bcrypt

### 通俗解释

bcrypt 把密码与随机 salt 做慢哈希。数据库只存 `passwordHash`；登录时比较输入和哈希，不解密原密码。故意“慢”能提高暴力破解成本。即便是演示账号也不应硬编码明文密码。

### 项目中的具体文件

- `backend/services/authService.js`：密码比较；
- `backend/models/User.js`：`passwordHash` 默认不查询；
- `backend/scripts/seed.js`：用环境变量提供演示密码并哈希；
- `backend/scripts/createAdmin.js`：创建管理员；
- `backend/validators/authValidator.js`：基础密码强度。

### 一段关键代码

```js
const passwordHash = await bcrypt.hash(password, 12)
const valid = await bcrypt.compare(password, user.passwordHash)
```

### 数据经过了什么步骤

1. 创建用户时验证密码长度/结构；
2. bcrypt 生成 salt 和哈希；
3. 只保存哈希；
4. 登录时 compare；
5. 成功才签 JWT，响应永不含哈希。

### 常见错误

- 保存明文或可逆加密密码；
- 每次登录重新 hash 输入再直接比较字符串（salt 不同）；
- cost 太低容易破解，太高阻塞服务；
- seed 在代码/README 放固定默认密码；
- 日志打印 body 泄露密码。

### 自测问题

为什么相同密码两次 `bcrypt.hash` 的结果通常不同，但都能 compare 成功？

### 参考答案

每次使用随机 salt，salt 包含在最终哈希字符串中；compare 读取对应 salt 重新计算，所以不同哈希都能验证同一密码。

## 23. multer

### 通俗解释

multer 解析 `multipart/form-data` 文件上传。项目限制大小和常见图片格式，生成服务器控制的安全文件名，并把上传目录静态暴露。文件扩展名、原始文件名和 MIME 都是不可信输入。

### 项目中的具体文件

- `backend/middleware/uploadMiddleware.js`：存储、类型、大小和文件名；
- `backend/routes/uploadRoutes.js`：`POST /uploads/xray`；
- `backend/app.js`：安全静态访问；
- `frontend/src/pages/NewInspectionPage.jsx`：FormData 与预览；
- `backend/.env.example`：上传目录/上限。

### 一段关键代码

```js
const safeName = `${crypto.randomUUID()}${allowedExtension}`
```

### 数据经过了什么步骤

1. 浏览器把 `xray` 文件放进 FormData；
2. multer 在业务 controller 前检查大小/类型；
3. 服务端生成不可穿越路径的文件名；
4. 保存到 `uploads/xrays`；
5. 返回相对访问 URL；
6. 表单把 URL 随检测记录提交。

### 常见错误

- 使用用户原文件名拼路径，出现 `../` 穿越或覆盖；
- 只看扩展名，允许伪装可执行文件；
- multer 错误未映射为清楚的 400/413；
- 上传成功但后续表单失败，形成孤儿文件；
- 反向代理大小限制小于后端。

### 自测问题

为什么生成 UUID 文件名比“去掉原文件名中的斜杠”更稳妥？

### 参考答案

服务器完全掌控名称，避免特殊字符、Unicode、重名、保留设备名和遗漏的路径技巧；原名最多作为经过处理的元数据，而不作为磁盘路径。

## 24. WebSocket 和普通 HTTP 的区别

### 通俗解释

REST 是浏览器发一次请求、服务器回一次响应；Socket.IO 建立长连接，服务器可主动推送新检测和报警。实时连接断开时，REST 列表仍然可用，所以 Socket 是增量体验而不是唯一数据来源。

### 项目中的具体文件

- `backend/server.js`：在 HTTP server 上初始化 Socket.IO；
- `backend/utils/socket.js`：统一发事件；
- `frontend/src/context/RealtimeContext.jsx`：连接状态、重连与事件；
- `frontend/src/pages/DashboardPage.jsx`：收到事件后刷新；
- `frontend/nginx.conf`：Upgrade 反向代理。

### 一段关键代码

```js
io.emit('alarm:high', alarmPayload)
```

### 数据经过了什么步骤

1. 页面建立带身份的 Socket.IO 连接；
2. 后端验证连接并标记 connected；
3. 事务提交后发 `inspection:created`，high 另发 `alarm:high`；
4. Context 分发事件，Dashboard 刷新/提示；
5. 网络异常显示重连/断开；
6. 用户仍可用 REST 手动刷新。

### 常见错误

- 把未提交数据库的数据提前推送；
- 重连后重复注册 listener；
- Nginx 忘记 Upgrade/Connection 头；
- 认为 Socket 消息到达就等于永久保存；
- 无限制向所有用户广播敏感详情。

### 自测问题

如果 high 报警 Socket 消息丢失，用户如何仍能找到报警？

### 参考答案

报警已先保存 MongoDB，页面可通过 REST 报警列表和 Dashboard 重新查询；实时事件只负责及时通知。

## 25. 单元测试和集成测试

### 通俗解释

单元测试隔离一个规则，例如风险评分或状态转换；集成测试把路由、中间件、服务和测试数据库串起来，例如登录后创建记录并检查报警。前者定位快，后者更接近真实闭环，两者互补。

### 项目中的具体文件

- `backend/tests/unit/riskService.test.js`；
- `backend/tests/unit/alarmService.test.js`；
- `backend/tests/unit/simulationService.test.js`；
- `backend/tests/integration/*.test.js`；
- `frontend/src/utils/formatters.test.js`；
- `backend/package.json` / `frontend/package.json`：Vitest 命令。

### 一段关键代码

```js
const response = await request(app)
  .get('/api/v1/inspections')
  .set('Authorization', `Bearer ${token}`)
expect(response.status).toBe(200)
```

### 数据经过了什么步骤

1. 测试启动隔离 MongoDB；
2. 插入本测试需要的用户/设备；
3. Supertest 不占端口直接请求 app；
4. 断言 HTTP 响应与数据库副作用；
5. 每个测试清理集合；
6. 所有测试后关闭连接/内存服务。

### 常见错误

- 测试 URI 指向开发或生产库并清理真实数据；
- 只断言 200，不断言报警/日志副作用；
- 共享数据造成测试顺序依赖；
- 用随机数据却不固定/约束，测试偶发失败；
- 把“写了测试文件”说成“测试已运行通过”。

### 自测问题

风险服务的“非法置信度”为什么适合单元测试，而“high 创建报警”适合集成测试？

### 参考答案

前者是纯输入输出规则，可快速隔离；后者跨校验、认证、事务、两个模型和 HTTP 响应，需要集成验证。

## 26. Docker

### 通俗解释

Docker 镜像把运行时、依赖和应用打包；容器是镜像的一次运行。Compose 描述前端、后端和 MongoDB 如何联网、持久化与等待健康。数据库和上传必须放卷中，否则替换容器会丢数据。

### 项目中的具体文件

- `backend/Dockerfile`：Node 22 生产镜像；
- `frontend/Dockerfile`：Vite 多阶段构建 + Nginx；
- `frontend/nginx.conf`：SPA/API/Socket 代理；
- `docker-compose.yml`：四个服务（含副本集初始化）；
- `.dockerignore`：排除环境变量、依赖、权重和运行数据；
- `DEPLOYMENT.md`：上线步骤。

### 一段关键代码

```yaml
MONGO_URI: mongodb://mongodb:27017/railway_security?replicaSet=rs0
```

### 数据经过了什么步骤

1. 前端 builder 安装依赖并生成 `dist`；
2. Nginx 镜像只复制静态产物；
3. 后端镜像安装生产依赖并以非 root 用户运行；
4. Compose 初始化 MongoDB `rs0`；
5. 后端等数据库初始化后启动；
6. 前端通过内部服务名代理 API/Socket。

### 常见错误

- 把 `.env` 或模型权重复制进镜像；
- 前端在构建时写 `http://backend:5000`，但浏览器无法解析容器内部主机名；
- 数据库存容器层而非卷；
- 执行 `docker compose down -v` 误删数据；
- 没实际构建却声称 Docker 已通过。

### 自测问题

为什么前端构建参数使用 `/api/v1`，而后端连接 MongoDB 使用 `mongodb` 主机名？

### 参考答案

前端代码在用户浏览器运行，应请求浏览器可访问的同源 `/api/v1`；后端在 Compose 网络内运行，可解析服务名 `mongodb`。

## 27. YOLO 模拟适配器未来如何替换成真实模型

### 通俗解释

适配器把“系统需要什么结果”与“结果怎样产生”隔开。现在模拟器返回类别、置信度、框和模型版本；未来 Python YOLO 服务只要遵守同一契约，风险服务和页面无需重写。替换不是把 `.pt` 随便放进 Node 进程。

### 项目中的具体文件

- `backend/services/yoloAdapterService.js`：当前模拟契约；
- `backend/services/simulationService.js`：生成合理分布；
- `backend/services/riskService.js`：消费标准结果；
- `backend/models/InspectionRecord.js`：持久化字段；
- 外部 `D:\安检仪\安检仪`：只读实验资产，未接入本系统。

### 一段关键代码

```js
// 未来仍返回同形数据
return [{ className, confidence, bbox, modelName, modelVersion }]
```

### 数据经过了什么步骤

1. 后端获得图片 URL/受控文件路径；
2. 真实适配器以超时和鉴权调用独立 Python 服务；
3. 校验模型返回的类别、0~1 置信度和坐标；
4. 转换为项目统一 DTO；
5. 风险服务计算并保存模型版本；
6. 模型离线时写“数据不足”，交人工复核。

### 常见错误

- 直接信任模型返回的任意类别/坐标；
- 混淆像素坐标、归一化坐标和 `xyxy`/`xywh`；
- 无超时重试导致请求挂死或重复推理；
- 模型失败被当成“没有危险物”；
- 未经真实数据验证就声称具备安检准确率。

### 自测问题

真实 YOLO 服务超时后，系统应该返回 low 吗？

### 参考答案

不应该。缺少视觉证据不等于安全；应记录适配器/数据状态和“视觉数据不足”原因，根据其他证据给辅助结果，并要求人工复核。

## 28. 传感器模拟适配器未来如何替换成通信接口

### 通俗解释

传感器适配器把 Modbus/TCP、串口、供应商帧等底层协议转换成统一业务字段。当前数据按低概率报警、浓度和趋势一致的规则生成；真实接入必须解决字节流、CRC、单位、校准、时间同步和离线，不只是把随机数换成 socket 读数。

### 项目中的具体文件

- `backend/services/sensorAdapterService.js`：统一气体数据接口；
- `backend/services/simulationService.js`：模拟关联分布；
- `backend/models/InspectionRecord.js`：gasSensor 子文档；
- `backend/services/riskService.js`：报警、趋势、状态融合；
- `D:\安检仪\安检仪` 外部气体实验脚本：只读参考，协议尚未现场验证。

### 一段关键代码

```js
return {
  gasType, concentration, unit, alarm,
  trend, sensorStatus, collectedAt
}
```

### 数据经过了什么步骤

1. 设备网关读取完整帧并验证长度/CRC；
2. 按配置映射通道、单位和量程；
3. 加上设备时间、接收时间和校准元数据；
4. 用包裹 ID 或受控时间窗口与图像关联；
5. 适配为统一 gasSensor；
6. 风险服务融合，断线/超量程标为数据不足；
7. 原始帧与操作日志按合规要求留痕。

### 常见错误

- TCP 一次 `data` 事件被误认为恰好一帧，忽略粘包/分包；
- CRC 范围、字节序、符号位或单位错误；
- 把报警等级直接捏造成浓度；
- 设备和服务器时钟漂移，关联错包；
- 传感器 offline 被当作 alarm=false；
- 没有校准和故障注入就用于安全结论。

### 自测问题

真实协议只提供“通道报警等级”，能否直接填写精确 ppm 浓度？

### 参考答案

不能。没有寄存器定义、量程和校准关系就不能推导精确浓度；应保留原始等级/状态，浓度标为缺失，并在风险原因中说明数据限制。

## 推荐代码阅读顺序

1. `frontend/src/main.jsx`：先看页面入口；
2. `frontend/src/context/AuthContext.jsx`：理解登录状态；
3. `frontend/src/api/client.js`：理解请求和 Token；
4. `backend/app.js`：看请求进入后端后的总路线；
5. `backend/routes/inspectionRoutes.js`：选一条核心路由；
6. `backend/middleware/authMiddleware.js` 与 `validateMiddleware.js`；
7. `backend/controllers/inspectionController.js`；
8. `backend/services/inspectionService.js`；
9. `backend/services/riskService.js` 与 `config/riskRules.js`；
10. `backend/models/InspectionRecord.js` 与 `AlarmRecord.js`；
11. `backend/repositories/inspectionRepository.js`；
12. `backend/tests/integration` 中对应测试；
13. `frontend/src/pages/InspectionsPage.jsx` 和详情页；
14. `frontend/src/context/RealtimeContext.jsx`；
15. 最后看 `server.js`、Docker 和部署文档。

建议每读完一层回答三件事：这一层收到什么、保证什么、交给下一层什么。能沿一次 high 模拟检测说清“校验—风险—事务—报警—日志—Socket—页面”，就掌握了本项目最重要的主线。
