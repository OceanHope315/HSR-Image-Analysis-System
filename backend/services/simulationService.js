import crypto from 'node:crypto';
import { createMockYoloResult } from './yoloAdapterService.js';
import { createMockSensorData } from './sensorAdapterService.js';

export function chooseSimulationRisk(random = Math.random) {
  const value = random();
  if (value < 0.72) return 'low';
  if (value < 0.93) return 'medium';
  return 'high';
}

export function generateSimulationRecord(options = {}) {
  const random = options.random ?? Math.random;
  const desiredRisk = options.risk ?? chooseSimulationRisk(random);
  const timestamp = options.timestamp ? new Date(options.timestamp) : new Date();
  const simultaneousEvidence = desiredRisk === 'high' && random() < 0.65;
  const xrayRisk = desiredRisk === 'low' ? 'low' : desiredRisk;
  const sensorRisk = simultaneousEvidence ? 'high' : desiredRisk === 'medium' && random() < 0.2 ? 'medium' : 'low';

  return {
    packageId: options.packageId ?? `SIM-${timestamp.toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    timestamp,
    xrayImageUrl: options.xrayImageUrl ?? null,
    xrayResult: options.xrayResult ?? createMockYoloResult({ risk: xrayRisk, random }),
    gasSensor: options.gasSensor ?? createMockSensorData({ risk: sensorRisk, random, now: timestamp }),
    deviceId: options.deviceId ?? null,
    source: 'simulation',
    status: 'pending',
  };
}

export function generateSimulationBatch(count, options = {}) {
  return Array.from({ length: count }, (_, index) => generateSimulationRecord({
    ...options,
    timestamp: new Date(Date.now() - index * 60_000),
  }));
}
