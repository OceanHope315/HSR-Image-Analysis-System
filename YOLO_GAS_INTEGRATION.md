# YOLO 与气体通信接入指南

本次接入保留原有模拟、历史、统计、分页和报警流程。浏览器只访问 Express；Express 调用本地 Python YOLO 服务，并从后台 TCP 长连接读取气体报警终端的最新有效帧。

```text
React :5174 -> Express :5000 -> FastAPI/YOLO :8000
                         -> 气体终端或 gas_simulator.py :502 (TCP)
                         -> MongoDB :27017
```

## 1. 配置

后端配置位于 `backend/.env`。未配置时，本机开发默认连接 `http://127.0.0.1:8000` 和 `127.0.0.1:502`。新增配置均已写入 `backend/.env.example`。

Python 服务先复制 `yolo-service/.env.example` 为 `yolo-service/.env`。模型可以放到 `yolo-service/models/best.pt`，也可以直接配置现有模型的绝对路径：

```env
YOLO_MODEL_PATH=D:/安检仪/安检仪/runs/detect/train6/weights/best.pt
YOLO_MAX_UPLOAD_MB=5
```

路径推荐使用 `/`，可避免 Windows 反斜杠转义问题。模型权重不应提交到 Git。

气体参考程序只上报通道连接位和 0～3 级报警，不包含实际浓度。因此通信模式的浓度会显示“设备未提供”；系统不会用 `0 ppm` 伪造测量值。默认只展示 Ch1/Ch2，更多通道可设置 `GAS_CHANNEL_COUNT`（最大 8）。

## 2. PowerShell 启动顺序

### MongoDB

已安装为 Windows 服务时：

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

也可以按本机 MongoDB 安装目录直接运行 `mongod --dbpath <数据目录>`。

### Python YOLO 服务

```powershell
Set-Location 'D:\判图系统\yolo-service'
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env -ErrorAction Ignore
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

然后编辑 `.env` 的 `YOLO_MODEL_PATH`。如果系统 Python 已装 Ultralytics，也仍建议使用独立虚拟环境，避免依赖漂移。

### 气体模拟器（没有真实设备时）

另开一个终端：

```powershell
python 'D:\安检仪\安检仪\gas_simulator.py'
```

模拟器是 TCP 服务端；判图后端是客户端。模拟器每 3 秒发送一次 26 字节状态帧。若 502 端口被占用，请同时修改模拟器端口和后端 `GAS_TCP_PORT`。

### Express 与 React

```powershell
Set-Location 'D:\判图系统'
npm run dev:backend
```

再开一个终端：

```powershell
Set-Location 'D:\判图系统'
npm run dev:frontend
```

浏览器打开 `http://localhost:5174`，进入“开始检测”，选择视觉和气体来源后操作。

## 3. Windows CMD 启动

```bat
cd /d D:\判图系统\yolo-service
python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

另开窗口：

```bat
cd /d D:\判图系统
npm run dev:backend
```

再开窗口：

```bat
cd /d D:\判图系统
npm run dev:frontend
```

## 4. 服务检查

PowerShell：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:5000/api/v1/health
Invoke-RestMethod http://127.0.0.1:5000/api/v1/detections/status
Invoke-RestMethod http://127.0.0.1:5000/api/v1/gas/status
```

YOLO 健康结果应为 `status=online` 且 `modelLoaded=true`。气体模拟器启动后，最迟一个心跳周期内气体状态应变为 `online`。

## 5. 第一次检测

1. 登录后进入“开始智能检测”。
2. 上传 JPG、PNG、BMP 或 WebP 图片；真实 YOLO 模式必须上传。
3. 选择“YOLO 真实检测”或“视觉模拟数据”。
4. 选择“TCP 通信数据”或“气体模拟数据”。模拟模式可输入浓度、单位和报警，也可随机生成。
5. 点击“开始智能检测”，观察上传、推理、气体读取、风险融合和保存进度。
6. 完成后进入详情页，核对原图/标注图、目标框、气体通道、风险原因和来源状态。
7. 返回历史记录和总览，确认记录、统计及关联报警已刷新。
8. TCP 在线时可在网页点击“解除气体报警”；系统发送参考程序的 12 字节命令，并等待下一帧确认。

## 6. 接口

| 方法 | 地址 | 用途 |
|---|---|---|
| GET | `/api/v1/detections/status` | YOLO、模型设备、气体与数据库状态 |
| POST | `/api/v1/detections/image` | multipart 智能检测、风险融合并保存 |
| GET | `/api/v1/gas/status` | TCP/HTTP 气体通信状态 |
| GET | `/api/v1/gas/latest` | 最新有效气体快照；超时会明确标记 |
| POST | `/api/v1/gas/readings` | 可选 HTTP 通信程序推送最新读数（需登录） |
| POST | `/api/v1/gas/clear-alarm` | 发送解除报警命令（需登录） |

原 `/api/v1/inspections`、`/api/v1/simulation` 和 `/api/v1/uploads/xray` 均保留。

## 7. 验收组合

- 全模拟：Python 和 TCP 均可不启动；选择两种模拟来源后应正常入库。
- 真实 YOLO + 模拟气体：模型在线，上传图片，气体选模拟。
- 真实 YOLO + TCP 气体：同时启动模型和 `gas_simulator.py`，页面应显示 Ch1/Ch2。
- YOLO 离线：真实模式给出明确错误；切到视觉模拟后可继续。
- 气体超时：检测仍可完成，但记录显示数据不完整；也可切到气体模拟。
- 空目标：`xrayResult=[]`，系统继续依据气体判断。
- MongoDB 离线：后端保持运行，健康状态显示降级，保存请求返回 `DATABASE_UNAVAILABLE`。

## 8. 常见问题

- `YOLO_MODEL_NOT_LOADED`：检查 `.env` 模型路径、权重权限和 Ultralytics 版本。
- `YOLO_SERVICE_OFFLINE`：检查 8000 端口、Python 终端日志和 `YOLO_SERVICE_URL`。
- `GAS_DEVICE_OFFLINE`：确认模拟器/设备是 TCP 服务端、后端是客户端，并检查 502 端口与防火墙。
- 气体一直 `timeout`：默认 10 秒未收到有效 CRC 帧即超时；检查协议帧头 `FA 01 03 14` 和 CRC 小端顺序。
- 图片无法显示：检查 Express `/uploads/xrays`、FastAPI `/outputs` 以及对应进程是否仍在运行。
- `DUPLICATE_IMAGE`：默认 15 秒内阻止同图重复点击，可通过 `DETECTION_DUPLICATE_WINDOW_SECONDS` 调整。

系统输出始终是辅助判断，不能替代安检人员、现场规程或设备法定校验。
