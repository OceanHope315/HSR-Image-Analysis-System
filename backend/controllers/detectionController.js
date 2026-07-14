import mongoose from 'mongoose';
import { runSmartDetection } from '../services/smartDetectionService.js';
import { getGasStatus } from '../services/sensorAdapterService.js';
import { getYoloStatus } from '../services/yoloAdapterService.js';
import { writeOperationLog } from '../utils/audit.js';
import { emitEvent } from '../utils/socket.js';

const databaseStates = ['offline', 'online', 'connecting', 'disconnecting'];

export async function integrationStatus(_req, res) {
  const yolo = await getYoloStatus();
  const gas = getGasStatus();
  res.json({
    success: true,
    data: {
      yolo,
      gas,
      database: {
        status: databaseStates[mongoose.connection.readyState] ?? 'unknown',
        connected: mongoose.connection.readyState === 1,
      },
      timestamp: new Date().toISOString(),
    },
  });
}

export async function detectImage(req, res) {
  const result = await runSmartDetection(req.validated.body, req.file, req.user._id);
  req.uploadCommitted = true;
  await writeOperationLog(req, {
    action: 'detection.smart-create',
    resourceType: 'InspectionRecord',
    resourceId: result.inspection._id,
    after: result.inspection.toObject(),
  });
  emitEvent('inspection:created', result.inspection.toJSON());
  if (result.alarm?.level === 'high') emitEvent('alarm:high', result.alarm.toJSON());
  res.status(201).json({
    success: true,
    message: '智能检测已完成并保存',
    data: {
      inspection: result.inspection,
      alarm: result.alarm,
      transaction: { used: result.transactionUsed, mode: result.transactionUsed ? 'mongodb' : 'compensating-fallback' },
    },
  });
}
