import { buildQuery, dataOf, request } from './client.js';

export const alarmApi = {
  list: (params) => request(`/alarms${buildQuery(params)}`),
  get: async (id) => dataOf(await request(`/alarms/${id}`)),
  updateStatus: async (id, input) => dataOf(await request(`/alarms/${id}/status`, { method: 'PATCH', body: input })),
  assign: async (id, assignedTo) => dataOf(await request(`/alarms/${id}/assign`, { method: 'PATCH', body: { assignedTo } })),
  reopen: async (id) => dataOf(await request(`/alarms/${id}/reopen`, { method: 'PATCH' })),
};
