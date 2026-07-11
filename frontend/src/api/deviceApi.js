import { buildQuery, dataOf, request } from './client.js';

export const deviceApi = {
  list: (params) => request(`/devices${buildQuery(params)}`),
  get: async (id) => dataOf(await request(`/devices/${id}`)),
  create: async (input) => dataOf(await request('/devices', { method: 'POST', body: input })),
  update: async (id, input) => dataOf(await request(`/devices/${id}`, { method: 'PATCH', body: input })),
  remove: (id) => request(`/devices/${id}`, { method: 'DELETE' }),
  heartbeat: async (id) => dataOf(await request(`/devices/${id}/heartbeat`, { method: 'POST' })),
};
