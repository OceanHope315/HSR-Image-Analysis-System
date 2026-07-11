import { dataOf, request } from './client.js';

export const dashboardApi = {
  summary: async () => dataOf(await request('/dashboard/summary'), {}),
  riskTrend: async (days = 7) => dataOf(await request(`/dashboard/risk-trend?days=${days}`), []),
  gasStatistics: async () => dataOf(await request('/dashboard/gas-statistics'), {}),
  deviceStatus: async () => dataOf(await request('/dashboard/device-status'), {}),
};
