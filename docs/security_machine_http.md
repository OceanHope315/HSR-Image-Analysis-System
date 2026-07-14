# 安检仪 HTTP 图片接入（开发阶段）

当前边界链路：

```text
Device JSON -> SecurityMachineRequestAdapter -> UnifiedImageInput
            -> existing YOLO / persistence / Socket.IO / UI
            -> SecurityMachineProtocolAdapter -> device response
```

`resMsg0` / `resMsg1` 当前是开发用对象数组，真实格式必须按
[`security_machine_real_device_checklist.md`](./security_machine_real_device_checklist.md) 联调后确认。

## 配置

```env
HOST=0.0.0.0
PORT=5000
IMAGE_SOURCE=both # local | security_machine | both
LOCAL_IMAGE_DIR=incoming/xrays
LOCAL_IMAGE_POLL_MS=1000
SECURITY_MACHINE_ROUTE=/imageAnalysis/imgInfo
IMAGE_UPLOAD_LIMIT_MB=20
SECURITY_MACHINE_IMAGE_LIMIT_MB=10
SECURITY_MACHINE_DEBUG=false
```

`HOST` 默认 `0.0.0.0`，后端会显式监听全部 IPv4 网络接口；`PORT` 继续沿用原有环境变量逻辑，默认 `5000`。安检仪配置中的目标地址应填写电脑的实际局域网 IP 和该端口。

`local` / `both` 会轮询 `backend/incoming/xrays`。文件连续两次扫描大小和修改时间不变后才进入处理，原文件不会被删除。现有页面手动选图上传保持可用。

`security_machine` / `both` 开放：

```http
POST /imageAnalysis/imgInfo
Content-Type: application/json
```

调试模式只保存移除 Base64 后的 metadata、响应和错误：

```env
SECURITY_MACHINE_DEBUG=true
SECURITY_MACHINE_DEBUG_DIR=debug/security-machine
```

## 启动与模拟

PowerShell 本地文件夹模式：

```powershell
$env:IMAGE_SOURCE='local'
npm run dev:backend
```

把 JPG/PNG/BMP/WebP/GIF 放入 `backend/incoming/xrays`。前端仍用 `npm run dev:frontend`。

安检仪模式：

```powershell
$env:IMAGE_SOURCE='security_machine'
npm run dev:backend
npm run dev:frontend
```

另一个终端发送主视角；第二个图片参数可选：

```powershell
npm run simulator -- .\main.jpg
npm run simulator -- .\main.jpg .\side.jpg
npm run simulator -- .\main.jpg --data-uri
```
