import { InspectionRecord } from '../models/InspectionRecord.js';
import { processUnifiedImageInput } from './unifiedImageInputService.js';

const inFlightRequests = new Map();

function requestKey(input) {
  return `security_machine:${input.deviceId}:${input.imageId}`.slice(0, 320);
}

function persistedResult(inspection, input, duplicate = true) {
  return {
    inspection,
    alarm: null,
    transactionUsed: false,
    imageId: input.imageId,
    deviceId: input.deviceId,
    source: 'security_machine',
    views: inspection.imageViews ?? [],
    duplicate,
  };
}

export async function processSecurityMachineInput(input, dependencies = {}) {
  const key = requestKey(input);
  const existingRequest = inFlightRequests.get(key);
  if (existingRequest) return { ...(await existingRequest), duplicate: true };

  const findExisting = dependencies.findExisting
    ?? ((imageInputKey) => InspectionRecord.findOne({ imageInputKey }));
  const processInput = dependencies.processInput ?? processUnifiedImageInput;
  const work = (async () => {
    const existing = await findExisting(key);
    if (existing) return persistedResult(existing, input);
    try {
      const result = await processInput({ ...input, gasMode: 'device' }, dependencies);
      return { ...result, duplicate: false };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await findExisting(key);
      if (!duplicate) throw error;
      return persistedResult(duplicate, input);
    }
  })();

  inFlightRequests.set(key, work);
  try {
    return await work;
  } finally {
    if (inFlightRequests.get(key) === work) inFlightRequests.delete(key);
  }
}

export function clearSecurityMachineInFlightRequests() {
  inFlightRequests.clear();
}
