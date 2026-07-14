import { clearGasAlarm, getGasStatus, readSensor, setLatestGasData } from '../services/sensorAdapterService.js';
import { writeOperationLog } from '../utils/audit.js';

export function gasStatus(_req, res) {
  res.json({ success: true, data: getGasStatus() });
}

export async function latestGasReading(_req, res) {
  res.json({ success: true, data: await readSensor({ mode: 'device' }) });
}

export async function ingestGasReading(req, res) {
  const reading = setLatestGasData(req.validated.body);
  await writeOperationLog(req, { action: 'gas.reading-ingest', resourceType: 'GasCommunication', after: reading });
  res.status(202).json({ success: true, message: '气体数据已接收', data: reading });
}

export async function clearAlarm(req, res) {
  const result = await clearGasAlarm();
  await writeOperationLog(req, { action: 'gas.clear-alarm', resourceType: 'GasCommunication', after: result });
  res.json({ success: true, message: '解除报警命令已发送，等待设备下一次心跳确认', data: result });
}
