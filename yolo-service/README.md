# YOLO 推理服务

本目录提供独立 FastAPI 服务：`GET /health` 检查模型状态，`POST /predict` 的表单字段 `image` 接收 jpg/jpeg/png/bmp/webp，标注图由 `/outputs/...` 提供。上传临时文件会在请求结束后清理。

## Windows 启动

```powershell
cd yolo-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# 将训练权重复制为 models\best.pt，或编辑 .env 中的 YOLO_MODEL_PATH
uvicorn app:app --host 127.0.0.1 --port 8000
```

服务启动时只加载一次模型。安装的 PyTorch 支持 CUDA 且 GPU 可用时自动使用 CUDA，否则自动使用 CPU。可访问 `http://127.0.0.1:8000/health` 验证状态，接口文档位于 `/docs`。
