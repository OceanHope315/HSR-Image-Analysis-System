import { buildQuery, request } from './client.js';

export const logApi = {
  list: (params) => request(`/logs${buildQuery(params)}`),
};
