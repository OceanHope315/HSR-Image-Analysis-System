import { buildQuery, dataOf, request } from './client.js';

export const inspectionApi = {
  list: (params) => request(`/inspections${buildQuery(params)}`),
  get: (id) => request(`/inspections/${id}`),
  create: async (input) => dataOf(await request('/inspections', { method: 'POST', body: input })),
  update: async (id, input) => dataOf(await request(`/inspections/${id}`, { method: 'PATCH', body: input })),
  remove: (id) => request(`/inspections/${id}`, { method: 'DELETE' }),
  restore: (id) => request(`/inspections/${id}/restore`, { method: 'PATCH' }),
};
