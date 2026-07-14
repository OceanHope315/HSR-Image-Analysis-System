import { dataOf, request } from './client.js';

function appendJson(formData, name, value) {
  if (value !== undefined) formData.append(name, JSON.stringify(value));
}

export const detectionApi = {
  status: async () => dataOf(await request('/detections/status'), {}),

  detectImage: async ({
    packageId,
    timestamp,
    deviceId,
    visionMode,
    gasMode,
    visionSimulationData,
    gasSimulationData,
    image,
  }) => {
    const formData = new FormData();
    formData.append('packageId', packageId);
    formData.append('timestamp', timestamp);
    if (deviceId) formData.append('deviceId', deviceId);
    formData.append('visionMode', visionMode);
    formData.append('gasMode', gasMode);
    appendJson(formData, 'visionSimulationData', visionSimulationData);
    appendJson(formData, 'gasSimulationData', gasSimulationData);
    if (image) formData.append('image', image);

    return dataOf(await request('/detections/image', { method: 'POST', body: formData }), {});
  },

  clearGasAlarm: async () => dataOf(await request('/gas/clear-alarm', { method: 'POST' }), {}),
};
