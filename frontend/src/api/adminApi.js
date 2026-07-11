import { buildQuery, dataOf, request } from './client.js';

export const userApi = {
  list: (params) => request(`/users${buildQuery(params)}`),
  get: async (id) => dataOf(await request(`/users/${id}`)),
  create: async (input) => dataOf(await request('/users', { method: 'POST', body: input })),
  update: async (id, input) => dataOf(await request(`/users/${id}`, { method: 'PATCH', body: input })),
  remove: (id) => request(`/users/${id}`, { method: 'DELETE' }),
};

export const logApi = {
  list: (params) => request(`/logs${buildQuery(params)}`),
};
