# 实施计划

项目目标：交付“铁路安检判图辅助决策系统”的可运行软件原型和核心业务闭环。所有 YOLO、气体与设备数据均为模拟或标准接口输入，不代表真实安检能力。

## 阶段 0：审计当前仓库

- [x] 检查当前工作区和 Git 状态
- [x] 检查外部 Python/YOLO/气体实验资产
- [x] 只读解析立项报告
- [x] 核对 Node、npm、WSL、MongoDB、Docker 与端口
- [x] 记录已有/缺失功能、需保留/新增文件和风险
- [x] 创建计划、进度、学习笔记与 API 文档入口

## 阶段 1：稳定基线

- [x] 初始化本地 Git 仓库与忽略规则
- [x] 建立 npm workspace 和统一开发命令
- [x] 创建前后端最小可启动骨架
- [x] 创建安全的前后端 `.env.example`
- [x] 完成健康检查、基础 404 和错误响应
- [x] 安装依赖并验证基线 lint/build/test/start

## 阶段 2：后端工程结构

- [x] 分离 app 与 server
- [x] 建立 config、middleware、controller、service、repository、route、validator 分层
- [x] 配置结构化日志、请求日志和异步错误处理
- [x] 实现数据库连接与优雅关闭
- [x] 初始化 Socket.IO 事件出口

## 阶段 3：MongoDB 模型、CRUD、分页、筛选与统计

- [x] 完成 User、InspectionRecord、AlarmRecord、Device、OperationLog 模型
- [x] 建立字段校验、引用关系和有价值的索引
- [x] 完成检测记录 CRUD、逻辑删除、恢复
- [x] 完成分页、筛选、排序和统一响应
- [x] 使用 aggregate 完成 Dashboard 统计

## 阶段 4：索引、关联、事务、迁移、归档与备份

- [x] 按展示需要使用 populate
- [x] 创建检测与报警使用副本集事务
- [x] 单机开发环境提供有日志的补偿式安全降级
- [x] 实现幂等 seed、migrate、create-admin
- [x] 提供只生成归档/导出计划、不自动删数据的归档脚本
- [x] 提供安全 backup/restore 脚本和文档

## 阶段 5：认证、权限、校验与日志

- [x] 实现 bcrypt 密码哈希和 JWT 登录/当前用户/退出说明
- [x] 实现 admin、inspector、viewer 角色权限
- [x] 使用 Zod 统一校验 body/query/params
- [x] 实现标准错误码和 HTTP 状态码
- [x] 对关键写操作记录 OperationLog
- [x] 完成用户管理和操作日志查询

## 阶段 6：报警与设备

- [x] 实现报警分页、筛选、指派、合法状态流转和管理员重开
- [x] 实现设备 CRUD、心跳和疑似离线判断
- [x] 完成对应操作日志和实时事件

## 阶段 7：模拟适配器与图片上传

- [x] 实现可配置风险融合规则及解释性原因/复核建议
- [x] 实现模拟 YOLO 适配器
- [x] 实现模拟传感器适配器并预留 Modbus 替换点
- [x] 实现单条/批量/心跳模拟接口
- [x] 实现受限、安全文件名的 X 光图片上传与静态访问

## 阶段 8：React 页面和 API 层

- [x] 完成统一 API client、Token、401 与错误处理
- [x] 完成 AuthContext、受保护路由和角色路由
- [x] 完成登录、统一布局、Dashboard、404
- [x] 完成历史记录、筛选分页、URL 状态、逻辑删除/恢复
- [x] 完成检测详情、图片检测框、关联报警和日志
- [x] 完成新增模拟检测表单与上传预览
- [x] 完成报警、设备、用户、日志页面
- [x] 完成响应式基础适配和模拟数据声明

## 阶段 9：Socket.IO 实时更新

- [x] 鉴权 Socket.IO 连接
- [x] 推送检测、high 报警、报警状态和设备状态事件
- [x] 前端显示连接/重连/断开状态
- [x] Dashboard 自动刷新并对 high 风险显示克制提示
- [x] 保留 REST 降级路径

## 阶段 10：测试、构建与修复

- [x] 后端风险、校验、权限、状态机、模拟数据单元测试
- [x] 后端认证、CRUD、筛选、删除恢复、报警、角色和统计集成测试
- [x] 使用隔离测试数据库并清理
- [x] 前端核心工具测试
- [x] 分别运行 lint、test、build
- [x] 实际启动前后端并执行核心业务冒烟测试
- [x] 检查敏感信息、路径、循环依赖与运行日志

## 阶段 11：Docker、部署与学习文档

- [x] 完成前后端 Dockerfile、Nginx、Compose、dockerignore
- [x] 完成 DEPLOYMENT、BACKUP_AND_RESTORE
- [x] 完成 API_DOCUMENTATION
- [x] 完成 LEARNING_NOTES 的 28 个课程主题
- [x] 完成 COURSE_CHECKLIST
- [x] 完善 README 新手启动、架构与限制

## 阶段 12：最终验收

- [x] 按 25 条验收标准逐项实际验证
- [x] 更新 PROGRESS 和计划复选框
- [x] 检查 Git 状态和全部变更范围
- [x] 区分“已实测”“静态检查”“受环境限制未实测”
- [x] 输出最终功能、文件、API、页面、权限、测试和学习顺序报告

> 验收边界：Docker 因本机未安装只能做 YAML/配置静态校验，副本集事务代码未在本机实跑；本机单机 MongoDB 已实际验证明确的补偿式降级。详见 `PROGRESS.md`。
