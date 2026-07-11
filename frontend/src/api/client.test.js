import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQuery, request, setToken } from './client.js';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  };
}

describe('统一 API 客户端', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('忽略空查询参数并保留有效筛选', () => {
    expect(buildQuery({ page: 2, status: '', gasAlarm: false, keyword: null })).toBe('?page=2&gasAlarm=false');
  });

  it('把 datetime-local 筛选转换成带时区含义的 ISO 时间', () => {
    const query = new URLSearchParams(buildQuery({ startTime: '2026-07-11T08:30' }).slice(1));
    expect(query.get('startTime')).toBe(new Date('2026-07-11T08:30').toISOString());
  });

  it('自动附加 Bearer Token 并解析统一成功响应', async () => {
    setToken('test-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = await request('/example');
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers.get('Authorization')).toBe('Bearer test-token');
    expect(payload.data.id).toBe(1);
  });

  it('401 响应触发统一会话失效事件', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false, error: { code: 'TOKEN_EXPIRED', message: '登录已失效' } }, 401)));
    const listener = vi.fn();
    window.addEventListener('auth:unauthorized', listener, { once: true });
    await expect(request('/protected')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(listener).toHaveBeenCalledOnce();
  });
});
