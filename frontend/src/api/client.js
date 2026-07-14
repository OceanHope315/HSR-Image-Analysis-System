const configuredBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const API_BASE_URL = configuredBase.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details = [], response = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.response = response;
  }
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === '' || value === undefined || value === null) return;
    if (['startTime', 'endTime'].includes(key)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        query.set(key, date.toISOString());
        return;
      }
    }
    query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

export async function request(path, options = {}) {
  const { body, headers, ...rest } = options;
  const isFormData = body instanceof FormData;
  const requestHeaders = new Headers(headers || {});
  requestHeaders.set('Accept', 'application/json');
  if (!isFormData && body !== undefined) requestHeaders.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined || isFormData ? body : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('无法连接服务器，请检查后端服务和网络连接。', { code: 'NETWORK_ERROR' });
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok || payload?.success === false) {
    const error = payload?.error || {};
    throw new ApiError(error.message || `请求失败（${response.status}）`, {
      status: response.status,
      code: error.code || 'REQUEST_FAILED',
      details: error.details || [],
      response: payload,
    });
  }
  return payload;
}

export function dataOf(payload, fallback = null) {
  return payload?.data ?? fallback;
}
