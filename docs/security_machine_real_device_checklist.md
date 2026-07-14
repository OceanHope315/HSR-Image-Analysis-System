# 真实安检仪联调检查清单（2026-08-18）

> 目标：记录真实协议事实。`resMsg0` / `resMsg1` 当前实现仅为开发格式，不代表官方格式。

## Network

- [ ] 安检仪 IP：
- [ ] 电脑 IP：
- [ ] 子网掩码：
- [ ] HTTP 端口：
- [ ] 双方是否同网段、能否互相连通：

## HTTP

- [ ] 实际 URL（含大小写）：
- [ ] Method：
- [ ] Content-Type：
- [ ] 其他 Headers：
- [ ] 鉴权方式（如有）：

## Request

- [ ] 保存一份脱敏后的真实 JSON 层级
- [ ] devID / imgID / imgType / imgTime 的真实值与大小写
- [ ] img0 是否总是存在：
- [ ] img1 是否总是存在：
- [ ] 双视角在一次请求还是两次请求：

## Base64 / Image

- [ ] raw Base64 或 `data:image/...;base64,`：
- [ ] 单图 Base64 字符数：
- [ ] 单图解码后字节数：
- [ ] 图片真实格式：
- [ ] 主/侧视角分辨率：

## Frequency

- [ ] 一件包裹请求次数：
- [ ] 连续包裹峰值请求频率：
- [ ] 失败后是否重试、重试间隔：

## Response

- [ ] 设备允许的最大响应时间：
- [ ] HTTP status 要求：
- [ ] JSON `resCode` 要求：
- [ ] `resMsg0` 精确类型、分隔符和字段顺序：
- [ ] `resMsg1` 精确类型、分隔符和字段顺序：
- [ ] 无目标时的精确值：
- [ ] `errorMsg` 成功/失败时的精确要求：

## Result

- [ ] 设备是否接受 response：
- [ ] 设备端错误码/日志：
- [ ] 本机 `[SecurityMachine]` 日志的总耗时与错误：
- [ ] 需要修改的范围仅限 Config / Request Adapter / Response Adapter：
