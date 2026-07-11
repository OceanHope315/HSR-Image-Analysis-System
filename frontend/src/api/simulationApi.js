import { dataOf, request } from './client.js';

export const simulationApi = {
  generate: async (overrides = {}) => dataOf(await request('/simulation/generate', { method: 'POST', body: overrides })),
  batch: async (count) => dataOf(await request('/simulation/batch', { method: 'POST', body: { count } })),
  deviceHeartbeat: async (deviceId) => dataOf(await request('/simulation/device-heartbeat', { method: 'POST', body: { deviceId } })),
};

export const uploadApi = {
  async xray(file) {
    const formData = new FormData();
    formData.append('image', file);
    return dataOf(await request('/uploads/xray', { method: 'POST', body: formData }));
  },
};
