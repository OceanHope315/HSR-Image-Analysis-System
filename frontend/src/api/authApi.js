import { dataOf, request } from './client.js';

export const authApi = {
  async login(credentials) {
    return dataOf(await request('/auth/login', { method: 'POST', body: credentials }), {});
  },
  async me() {
    return dataOf(await request('/auth/me'), null);
  },
  async logout() {
    return request('/auth/logout', { method: 'POST' });
  },
};
